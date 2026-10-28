// Run against a local HTTP server with Playwright on NODE_PATH.
// The stock reader is routed to deterministic module responses so these checks
// exercise only the page's upload, review, and stock-update behavior.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';

const recognized = [
  { ingredient: 'Trigo', quantity: 120, confidence: 0.98 },
  { ingredient: 'Ovo', quantity: 4, confidence: 0.91 },
  { ingredient: 'Leite', quantity: 2, confidence: 0.84 },
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
    let response = { items: recognized, warnings: [] };
    await page.route('**/js/stock-reader.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `export async function readStockImage(file, { onProgress } = {}) {
        if (onProgress) onProgress(0.5);
        if (file.name === 'unreadable.png') throw new Error('Não foi possível reconhecer os itens desta imagem.');
        if (file.name === 'slow.png') await new Promise(resolve => setTimeout(resolve, 500));
        return ${JSON.stringify(response)};
      }`,
    }));

    await page.goto(`${base}/receitas.html`);
    await page.locator('#recipe-tools').waitFor({ state: 'visible' });
    await page.locator('#recipe-groups .recipe-group').first().waitFor();
    assert.equal(await page.locator('#recipe-groups .recipe-group').count(), 3, 'all categories stay visible');

    // Wednesday suggests main dishes automatically; an explicit type filter
    // continues to win over the day suggestion, and clearing restores source order.
    assert.equal(await page.locator('#recipe-groups .recipe-group').first().getAttribute('data-type'), 'Prato Principal');
    await page.locator('#recipe-groups .recipe-group-heading').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.qa/recipes-categories-mobile.png' });
    await page.getByRole('button', { name: 'Terça · Aperitivos', exact: true }).click();
    assert.equal(await page.locator('#recipe-groups .recipe-group').first().getAttribute('data-type'), 'Entrada');
    assert.equal(await page.locator('#recipe-groups .recipe-group').count(), 3, 'manual day keeps all categories visible');
    await page.getByRole('button', { name: 'Sobremesas', exact: true }).click();
    assert.equal(await page.locator('#recipe-groups .recipe-group').first().getAttribute('data-type'), 'Sobremesa');
    assert.equal(await page.locator('#recipe-groups .recipe-group').count(), 3, 'manual type keeps all categories visible');
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    assert.deepEqual(await page.locator('#recipe-groups .recipe-group').evaluateAll(groups => groups.map(group => group.dataset.type)), ['Entrada', 'Prato Principal', 'Sobremesa']);

    await page.locator('#pantry summary').click();
    await page.locator('#stock-print').setInputFiles({ name: 'estoque.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#stock-print-preview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stock-print-items [type="checkbox"]').count(), recognized.length);
    assert.equal(await page.getByLabel('Quantidade reconhecida de Trigo').inputValue(), '120');
    await page.locator('.stock-import').screenshot({ path: '.qa/recipes-import-mobile.png' });

    // Only selected detections are imported, with edited amounts, while prior
    // pantry values for ingredients absent from the image remain available.
    const wheatUse = page.getByLabel('Usar Trigo');
    const eggUse = page.getByLabel('Usar Ovo');
    const milkUse = page.getByLabel('Usar Leite');
    await eggUse.uncheck();
    await page.getByLabel('Quantidade reconhecida de Trigo').fill('150');
    // Existing stock values are seeded through their labels below.
    const existingRice = page.locator('#stock-inputs input[data-ingredient="Arroz"]');
    if (await existingRice.count()) await existingRice.fill('77');
    await wheatUse.check();
    await milkUse.check();
    await page.getByRole('button', { name: 'Aplicar ao estoque' }).click();
    assert.equal(await page.locator('#stock-inputs input[data-ingredient="Trigo"]').inputValue(), '150');
    assert.equal(await page.locator('#stock-inputs input[data-ingredient="Ovo"]').inputValue(), '');
    assert.equal(await page.locator('#stock-inputs input[data-ingredient="Leite"]').inputValue(), '2');
    if (await existingRice.count()) assert.equal(await existingRice.inputValue(), '77');

    // Invalid editable quantities must block stock mutation and keep the preview.
    await page.locator('#stock-print').setInputFiles({ name: 'estoque.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#stock-print-preview').waitFor({ state: 'visible' });
    await page.getByLabel('Quantidade reconhecida de Trigo').fill('-3');
    await page.getByRole('button', { name: 'Aplicar ao estoque' }).click();
    assert.equal(await page.locator('#stock-inputs input[data-ingredient="Trigo"]').inputValue(), '150');
    assert.equal(await page.locator('#stock-print-preview').isVisible(), true);

    // A failed image read clears prior detections; cancelling while a read is
    // pending also prevents a late completion from restoring stale results.
    await page.locator('#stock-print').setInputFiles({ name: 'unreadable.png', mimeType: 'image/png', buffer: Buffer.from('bad image') });
    await page.locator('#stock-print-status').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stock-print-preview').isVisible(), false);
    assert.equal(await page.locator('#stock-print-items').innerText(), '');
    await page.locator('#stock-print').setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: Buffer.from('fake image') });
    await page.locator('#stock-print-status').waitFor({ state: 'visible' });
    await page.locator('#cancel-print').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#stock-print-preview').isVisible(), false);
    assert.equal(await page.locator('#stock-print-items').innerText(), '');

    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('Recipes browser QA passed: Wednesday/type ordering, selective stock import, edited quantities, invalid input, unreadable images, cancellation, and narrow viewport.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
