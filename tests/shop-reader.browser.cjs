// Real shop OCR integration check. SHOP_SCREENSHOT is optional; without it the
// test reports a clear skip. Set NODE_PATH to the bundled Playwright modules.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';
const imagePath = process.env.SHOP_SCREENSHOT || '.qa/shop-original.jpg';
const expectedStock = { Alface: '28', Carne: '32', Trigo: '348', Leite: '273', Ovo: '3' };
const expectedOffers = [
  { ingredient: 'Camarão', costIngredient: 'Leite', cost: '50' },
  { ingredient: 'Arroz', costIngredient: 'Carne', cost: '10' },
];

async function reorderedImage(page, bytes) {
  const base64 = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const scaleX = canvas.width / 578;
    const scaleY = canvas.height / 1280;
    const cells = [40, 142, 244, 345, 447].map(x => [x, 204, 90, 32]);
    const pixels = cells.map(([x, y, width, height]) => context.getImageData(
      Math.round(x * scaleX), Math.round(y * scaleY), Math.round(width * scaleX), Math.round(height * scaleY),
    ));
    [2, 0, 4, 1, 3].forEach((sourceIndex, slot) => {
      const [x, y] = cells[slot];
      context.putImageData(pixels[sourceIndex], Math.round(x * scaleX), Math.round(y * scaleY));
    });
    const cardCells = [[16, 294, 145, 194], [171, 294, 145, 194]];
    const cards = cardCells.map(([x, y, width, height]) => context.getImageData(
      Math.round(x * scaleX), Math.round(y * scaleY), Math.round(width * scaleX), Math.round(height * scaleY),
    ));
    cardCells.forEach(([x, y], slot) => context.putImageData(cards[1 - slot], Math.round(x * scaleX), Math.round(y * scaleY)));
    return canvas.toDataURL('image/png').split(',')[1];
  }, bytes.toString('base64'));
  return Buffer.from(base64, 'base64');
}

async function inspectPreview(page, caseName) {
  await page.locator('#shop-preview').waitFor({ state: 'visible', timeout: 120000 });
  const rows = page.locator('#shop-stock-items .stock-print-row');
  assert.equal(await rows.count(), 5, `${caseName}: expected exactly five shop stock rows; got ${await rows.count()} (${await page.locator('#shop-stock-items').innerText()})`);
  for (const [ingredient, quantity] of Object.entries(expectedStock)) {
    assert.equal(await page.getByLabel(`Estoque da loja de ${ingredient}`).inputValue(), quantity, `${caseName}: ${ingredient}`);
  }
  const offers = await page.locator('#shop-offer-items .shop-offer-row').evaluateAll(elements => elements.map(row => ({
    ingredient: row.querySelector('[aria-label="Produto recebido"]')?.value,
    costIngredient: row.querySelector('[aria-label="Ingrediente para pagamento"]')?.value,
    cost: row.querySelector('[aria-label="Custo por troca"]')?.value,
    purchased: row.querySelector('[aria-label="Trocas usadas pela equipe"]')?.value,
    limit: row.querySelector('[aria-label="Limite total de trocas"]')?.value,
    yieldText: row.innerText,
  })));
  assert.equal(offers.length, 2, `${caseName}: expected exactly two offers; got ${JSON.stringify(offers)}`);
  for (const expected of expectedOffers) {
    const actual = offers.find(offer => offer.ingredient === expected.ingredient);
    assert.ok(actual, `${caseName}: missing ${expected.ingredient} offer; saw ${JSON.stringify(offers)}`);
    assert.equal(actual.costIngredient, expected.costIngredient, `${caseName}: ${expected.ingredient} currency`);
    assert.equal(actual.cost, expected.cost, `${caseName}: ${expected.ingredient} cost`);
    assert.equal(actual.purchased, '0', `${caseName}: ${expected.ingredient} used count`);
    assert.equal(actual.limit, '10', `${caseName}: ${expected.ingredient} limit`);
    assert.match(actual.yieldText, new RegExp(`Recebe 10 ${expected.ingredient} por troca`), `${caseName}: ${expected.ingredient} yield`);
  }
}

async function importAndVerify(page, fileName, bytes, caseName, baselineStock = '', screenshotPath) {
  await page.locator('#shop-print').setInputFiles({ name: fileName, mimeType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg', buffer: bytes });
  await inspectPreview(page, caseName);
  assert.equal(await page.locator('#stock-inputs [data-ingredient="Alface"]').inputValue(), baselineStock, `${caseName}: preview does not change real stock`);
  assert.equal(await page.locator('#stock-inputs [data-ingredient="Camarão"]').inputValue(), '', `${caseName}: shop product is not real stock`);
  if (screenshotPath) await page.locator('#shop-preview').screenshot({ path: screenshotPath });
  await page.getByRole('button', { name: 'Usar estoque e ofertas' }).click();
  for (const [ingredient, quantity] of Object.entries(expectedStock)) {
    assert.equal(await page.locator(`#stock-inputs [data-ingredient="${ingredient}"]`).inputValue(), quantity, `${caseName}: applied ${ingredient}`);
  }
  assert.equal(await page.locator('#stock-inputs [data-ingredient="Queijo"]').inputValue(), '1', `${caseName}: absent ingredient remains unchanged`);
  assert.equal(await page.locator('#stock-inputs [data-ingredient="Camarão"]').inputValue(), '', `${caseName}: shop shrimp remains simulation-only`);
  assert.equal(await page.locator('#stock-inputs [data-ingredient="Arroz"]').inputValue(), '', `${caseName}: shop rice remains simulation-only`);
  assert.equal(await page.locator('#simulate-shop').getAttribute('aria-pressed'), 'true', `${caseName}: shop simulation enabled`);
  assert.equal(await page.locator('#shop-summary p').count(), 2, `${caseName}: confirmed offer summary`);
}

(async () => {
  let original;
  try { original = await fs.readFile(path.resolve(imagePath)); }
  catch { console.log(`SKIP: set SHOP_SCREENSHOT or provide ${imagePath} to run real shop OCR checks.`); return; }

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const external = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
      external.push(url.href);
      return route.abort();
    });
    await page.goto(`${base}/receitas.html`);
    await page.locator('#recipe-tools').waitFor({ state: 'visible' });
    await page.locator('#pantry summary').click();
    await page.locator('#stock-inputs [data-ingredient="Queijo"]').fill('1');

    await importAndVerify(page, path.basename(imagePath), original, 'original shop screenshot', '', '.qa/shop-reader-original-preview.png');

    const reordered = await reorderedImage(page, original);
    await fs.writeFile('.qa/shop-reordered.png', reordered);
    await importAndVerify(page, 'shop-reordered.png', reordered, 'reordered shop screenshot', '28', '.qa/shop-reader-reordered-preview.png');

    assert.deepEqual(external, [], 'the test page should make no external requests');
    assert.deepEqual(errors, [], 'the page should have no uncaught errors');
    console.log('Shop reader browser QA passed: original and reordered screenshot recognize five stock values and both offers; imported stock and simulation remain separate.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
