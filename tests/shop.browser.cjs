// Run against a local HTTP server with Playwright on NODE_PATH. The shop reader
// and recipe data are deterministic so this covers preview, stock application,
// trade simulation, and cancellation without calling OCR services.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';

const recognized = {
  items: [
    { ingredient: 'Alface', quantity: 28 },
    { ingredient: 'Carne', quantity: 32 },
    { ingredient: 'Trigo', quantity: 348 },
    { ingredient: 'Leite', quantity: 273 },
    { ingredient: 'Ovo', quantity: 3 },
  ],
  offers: [
    { ingredient: 'Camarão', costIngredient: 'Leite', cost: 50, purchased: 0, limit: 10 },
    { ingredient: 'Arroz', costIngredient: 'Carne', cost: 10, purchased: 0, limit: 10 },
  ],
  warnings: [],
};
const recipes = [
  { id: 1, nome: 'Camarão com arroz', raridade: 'Comum', tipo: 'Entrada', ingredientes: ['Camarão', 'Arroz'] },
  { id: 2, nome: 'Camarão, arroz e leite', raridade: 'Comum', tipo: 'Entrada', ingredientes: ['Camarão', 'Arroz', 'Leite'] },
];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-28T12:00:00-03:00'])); }
        static now() { return new NativeDate('2026-10-28T12:00:00-03:00').valueOf(); }
      }
      window.Date = FixedDate;
    });
    await page.route('**/js/shop-reader.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `export async function readShopImage(file) {
        if (file.name === 'unreadable.png') throw new Error('Não foi possível reconhecer a loja.');
        if (file.name === 'slow.png') await new Promise(resolve => setTimeout(resolve, 500));
        return ${JSON.stringify(recognized)};
      }`,
    }));
    await page.route('**/data/receitas.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(recipes) }));

    await page.goto(`${base}/receitas.html`);
    await page.locator('#recipe-tools').waitFor({ state: 'visible' });
    await page.locator('#pantry summary').click();
    await page.locator('#stock-inputs [data-ingredient="Ovo"]').fill('88');
    await page.locator('#stock-inputs [data-ingredient="Queijo"]').fill('4');

    await page.locator('#shop-print').setInputFiles({ name: 'loja.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#shop-preview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#shop-stock-items .stock-print-row').count(), 5);
    assert.equal(await page.locator('#shop-offer-items .shop-offer-row').count(), 2);
    const shrimpOffer = page.locator('#shop-offer-items .shop-offer-row').nth(0);
    assert.equal(await shrimpOffer.getByLabel('Produto recebido').inputValue(), 'Camarão');
    assert.equal(await shrimpOffer.getByLabel('Ingrediente para pagamento').inputValue(), 'Leite');
    assert.equal(await shrimpOffer.getByLabel('Custo por troca').inputValue(), '50');
    assert.equal(await shrimpOffer.getByLabel('Trocas usadas pela equipe').inputValue(), '0');
    assert.equal(await shrimpOffer.getByLabel('Limite total de trocas').inputValue(), '10');
    assert.match(await shrimpOffer.innerText(), /Recebe 10 Camarão por troca/);
    await page.locator('.site-header').evaluate(header => { header.dataset.screenshotPosition = header.style.position; header.style.position = 'static'; });
    await page.locator('#shop-preview').screenshot({ path: '.qa/shopimport.png' });
    await page.locator('.site-header').evaluate(header => { header.style.position = header.dataset.screenshotPosition; delete header.dataset.screenshotPosition; });

    await page.getByLabel('Importar estoque de Ovo').uncheck();
    await page.getByRole('button', { name: 'Usar estoque e ofertas' }).click();
    for (const [ingredient, amount] of Object.entries({ Alface: '28', Carne: '32', Trigo: '348', Leite: '273' })) {
      assert.equal(await page.locator(`#stock-inputs [data-ingredient="${ingredient}"]`).inputValue(), amount, `${ingredient} imported`);
    }
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Ovo"]').inputValue(), '88', 'unchecked recognized stock is preserved');
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Queijo"]').inputValue(), '4', 'unseen stock is preserved');
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Camarão"]').inputValue(), '', 'shop product is not added to real stock');
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Arroz"]').inputValue(), '', 'shop product is not added to real stock');
    assert.equal(await page.locator('#simulate-shop').getAttribute('aria-pressed'), 'true', 'simulation starts enabled after apply');
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2);

    const entreeCards = page.locator('#recipe-groups [data-type="Entrada"] .dish-card');
    assert.equal(await entreeCards.count(), 2);
    assert.match(await entreeCards.nth(0).innerText(), /Após trocas: até 3 preparo\(s\)/);
    await entreeCards.nth(0).locator('details summary').click();
    assert.match(await entreeCards.nth(0).innerText(), /3 troca\(s\): pagar 150 Leite para receber 30 Camarão/);
    assert.match(await entreeCards.nth(0).innerText(), /3 troca\(s\): pagar 30 Carne para receber 30 Arroz/);
    assert.match(await entreeCards.nth(1).innerText(), /Após trocas: até 2 preparo\(s\)/, 'recipe milk consumption is reserved against the same stock');

    await page.getByRole('button', { name: 'Mostrar só o que posso preparar' }).click();
    assert.equal(await page.locator('#recipe-groups [data-type="Entrada"] .dish-card').count(), 2, 'possible-only includes trade-enabled recipes');
    await page.locator('#simulate-shop').click();
    assert.equal(await page.locator('#recipe-groups [data-type="Entrada"] .dish-card').count(), 0, 'disabling simulation returns possible-only to real stock');
    await page.getByRole('button', { name: 'Mostrar só o que posso preparar' }).click();
    await page.locator('#simulate-shop').click();

    // A new invalid offer draft must not partially replace the confirmed shop snapshot.
    await page.locator('#shop-print').setInputFiles({ name: 'loja.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#shop-preview').waitFor({ state: 'visible' });
    await page.getByLabel('Trocas usadas pela equipe').first().fill('11');
    await page.getByRole('button', { name: 'Usar estoque e ofertas' }).click();
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Leite"]').inputValue(), '273', 'invalid offers leave imported stock untouched');
    assert.equal(await page.locator('#simulate-shop').getAttribute('aria-pressed'), 'true', 'invalid offers leave confirmed simulation untouched');
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2, 'invalid offers leave confirmed summary untouched');

    // Exhausting both team offers is valid input and makes the recipes unavailable.
    await page.locator('#shop-preview').waitFor({ state: 'visible' });
    for (const input of await page.getByLabel('Trocas usadas pela equipe').all()) await input.fill('10');
    await page.getByRole('button', { name: 'Usar estoque e ofertas' }).click();
    assert.equal(await page.locator('#simulate-shop').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2);
    assert.match(await page.locator('#shop-summary').innerText(), /até 0 troca\(s\) restantes/);
    await page.getByRole('button', { name: 'Mostrar só o que posso preparar' }).click();
    assert.equal(await page.locator('#recipe-groups [data-type="Entrada"] .dish-card').count(), 0, 'exhausted offers do not create recipe availability');
    await page.getByRole('button', { name: 'Mostrar só o que posso preparar' }).click();
    await page.locator('#clear-shop').click();
    assert.equal(await page.locator('#simulate-shop').isDisabled(), true, 'clearing offers disables simulation');
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Leite"]').inputValue(), '273', 'clearing offers preserves real stock');
    assert.equal(await page.locator('#shop-summary').isVisible(), false);

    // Restore the original offers before exercising failed and cancelled reads.
    await page.locator('#manual-shop').click();
    await page.locator('#shop-preview').waitFor({ state: 'visible' });
    await page.locator('#add-shop-offer').click();
    await page.getByLabel('Produto recebido').nth(0).selectOption('Camarão');
    await page.getByLabel('Ingrediente para pagamento').nth(0).selectOption('Leite');
    await page.getByLabel('Custo por troca').nth(0).fill('50');
    await page.getByLabel('Trocas usadas pela equipe').nth(0).fill('0');
    await page.getByLabel('Limite total de trocas').nth(0).fill('10');
    await page.getByLabel('Produto recebido').nth(1).selectOption('Arroz');
    await page.getByLabel('Ingrediente para pagamento').nth(1).selectOption('Carne');
    await page.getByLabel('Custo por troca').nth(1).fill('10');
    await page.getByLabel('Trocas usadas pela equipe').nth(1).fill('0');
    await page.getByLabel('Limite total de trocas').nth(1).fill('10');
    await page.getByRole('button', { name: 'Usar estoque e ofertas' }).click();
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2);

    // Failed and cancelled reads discard only their draft and preserve applied state.
    await page.locator('#shop-print').setInputFiles({ name: 'unreadable.png', mimeType: 'image/png', buffer: Buffer.from('bad image') });
    await page.getByText(/Não foi possível ler a loja/).waitFor();
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Carne"]').inputValue(), '32');
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2);
    await page.locator('#shop-print').setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#shop-print-status').getByText('Lendo estoque e ofertas da loja').waitFor();
    await page.locator('#cancel-shop').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#shop-preview').isVisible(), false, 'cancel prevents a late preview from returning');
    assert.equal(await page.locator('#stock-inputs [data-ingredient="Leite"]').inputValue(), '273');
    assert.equal(await page.locator('#shop-summary').locator('p').count(), 2);

    await page.locator('#manual-shop').click();
    await page.locator('#shop-preview').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'shop UI fits a 320px viewport');
    assert.deepEqual(errors, []);
    console.log('Shop browser QA passed: deterministic preview, selective stock import, trade plans, reserved recipe currency, invalid drafts, failed/cancelled reads, and 320px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
