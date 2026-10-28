// Real OCR integration check. STOCK_SCREENSHOT is required; SHOP_SCREENSHOT is optional.
// Run with NODE_PATH set to the Codex runtime's Playwright modules.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';
const stockPath = process.env.STOCK_SCREENSHOT;
const shopPath = process.env.SHOP_SCREENSHOT;
if (!stockPath) {
  console.log('SKIP: set STOCK_SCREENSHOT to a stock screenshot (optional SHOP_SCREENSHOT).');
  process.exit(0);
}
const expected = { Trigo: 348, Carne: 32, Alface: 28, Leite: 273, Ovo: 3, Queijo: 1 };

async function variant(page, bytes, scale, scramble = false) {
  const base64 = await page.evaluate(async ({ imageData, scale, scramble }) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${imageData}`;
    await image.decode();
    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const context = source.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    if (scramble) {
      const cells = [[85,633,77,106],[193,633,77,106],[300,633,77,106],[407,633,77,106],[85,751,77,105],[193,751,77,105]];
      const pixels = cells.map(([x,y,w,h]) => context.getImageData(x,y,w,h));
      [1,0,3,2,4,5].forEach((sourceIndex, slot) => context.putImageData(pixels[sourceIndex], cells[slot][0], cells[slot][1]));
    }
    const output = document.createElement('canvas');
    output.width = Math.round(source.width * scale);
    output.height = Math.round(source.height * scale);
    output.getContext('2d').drawImage(source, 0, 0, output.width, output.height);
    return output.toDataURL('image/png').split(',')[1];
  }, { imageData: bytes.toString('base64'), scale, scramble });
  return Buffer.from(base64, 'base64');
}

(async () => {
  const stock = await fs.readFile(path.resolve(stockPath));
  const shop = shopPath ? await fs.readFile(path.resolve(shopPath)) : null;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const external = [];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
      external.push(url.href);
      return route.abort();
    });
    async function open() {
      await page.goto(`${base}/receitas.html`);
      await page.locator('#recipe-tools').waitFor({ state: 'visible' });
      await page.locator('#pantry summary').click();
    }
    async function upload(name, bytes, mimeType) {
      await page.locator('#stock-print').setInputFiles({ name, mimeType, buffer: bytes });
    }
    async function expectItems() {
      await page.locator('#stock-print-preview').waitFor({ state: 'visible', timeout: 120000 });
      const checkboxCount = await page.locator('#stock-print-items input[type=checkbox]').count();
      if (checkboxCount !== 6) {
        const diagnostic = await page.locator('#stock-print-items').evaluate(root => ({
          text: root.innerText,
          inputs: [...root.querySelectorAll('input')].map(input => ({ type: input.type, ariaLabel: input.getAttribute('aria-label'), value: input.value, checked: input.checked })),
          html: root.innerHTML,
        }));
        console.log(`Stock preview DOM diagnostic: ${JSON.stringify(diagnostic)}`);
      }
      assert.equal(checkboxCount, 6, `expected six selectable rows; found ${checkboxCount}: ${await page.locator('#stock-print-items').innerText()}`);
      for (const [name, amount] of Object.entries(expected)) {
        assert.equal(await page.getByLabel(`Quantidade reconhecida de ${name}`).inputValue(), String(amount), name);
        assert.equal(await page.getByLabel(`Usar ${name}`).isChecked(), true, `${name} selected`);
      }
    }
    async function expectAccurateSubset() {
      await page.locator('#stock-print-preview').waitFor({ state: 'visible', timeout: 120000 });
      const items = await page.locator('#stock-print-items .stock-print-row').evaluateAll(rows => rows.map(row => ({
        ingredient: row.querySelector('[data-print-ingredient]')?.dataset.printIngredient,
        quantity: row.querySelector('[data-print-ingredient]')?.value,
        selected: row.querySelector('input[type="checkbox"]')?.checked,
      })));
      assert.ok(items.length > 0, 'resized screenshot should recognize a nonempty subset');
      for (const item of items) {
        assert.ok(Object.hasOwn(expected, item.ingredient), `unknown ingredient ${item.ingredient}`);
        assert.equal(item.quantity, String(expected[item.ingredient]), `${item.ingredient} quantity`);
        assert.equal(item.selected, true, `${item.ingredient} selected by default`);
      }
      if (items.length < Object.keys(expected).length) {
        assert.match(await page.locator('#stock-print-status').innerText(), /não serão importados/i, 'partial recognition should warn that missing ingredients will not be imported');
      }
    }
    const caseFailures = [];
    async function checkItems(caseName) {
      try { await expectItems(); }
      catch (error) { caseFailures.push(`${caseName}: ${error.message}`); }
    }
    await open();
    console.log('OCR case: original');
    await upload(path.basename(stockPath), stock, 'image/jpeg');
    await page.locator('#stock-print-preview').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('[aria-labelledby=stock-import-title]').screenshot({ path: '.qa/stock-reader-real-mobile.png' });
    await checkItems('original screenshot');

    const scrambled = await variant(page, stock, 1, true);
    await fs.writeFile('.qa/stock-reader-scrambled.png', scrambled);
    await open();
    console.log('OCR case: scrambled inventory cells');
    await upload('stock-scrambled.png', scrambled, 'image/png');
    await page.locator('#stock-print-preview').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('[aria-labelledby=stock-import-title]').screenshot({ path: '.qa/stock-reader-scrambled-mobile.png' });
    await checkItems('scrambled screenshot');
    const resized = await variant(page, stock, 0.75, false);
    await fs.writeFile('.qa/stock-reader-resized.png', resized);
    await open();
    console.log('OCR case: resized to 75%');
    await upload('stock-resized.png', resized, 'image/png');
    await page.locator('#stock-print-preview').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('[aria-labelledby=stock-import-title]').screenshot({ path: '.qa/stock-reader-resized-mobile.png' });
    await expectAccurateSubset();

    if (shop) {
      await open();
      console.log('OCR case: shop screen rejection');
      await upload(path.basename(shopPath), shop, 'image/jpeg');
      await page.locator('#stock-print-status').getByText('Nenhum estoque reconhecido com segurança', { exact: false }).waitFor({ timeout: 120000 });
      assert.equal(await page.locator('#stock-print-preview').isVisible(), false, 'shop screen is not a stock print');
      assert.equal(await page.locator('#stock-print-items').innerText(), '');
    }
    assert.deepEqual(external, [], 'runtime should load without external requests');
    assert.deepEqual(errors, []);
    assert.deepEqual(caseFailures, [], caseFailures.join('\n'));
    console.log(`Real OCR browser QA passed: all six expected items on original and scrambled screenshots; resized screenshot returned an accurate subset${shop ? '; shop screen rejected' : ''}; no external requests.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
