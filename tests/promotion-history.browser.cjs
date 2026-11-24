// Run against a local static server with Playwright on NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/index.html`);
      const risk = page.locator('.member-card').filter({ has: page.getByText('Risk', { exact: true }) });
      await risk.locator('summary').click();
      const timeline = risk.getByRole('list', { name: 'Histórico de estágios e promoções de Risk' });
      assert.equal(await timeline.locator('.history-promotion').count(), 3);
      for (const [date, promotion] of [['19/10/2026', 'Infinaut'], ['28/10/2026', 'Cyclos'], ['23/11/2026', 'Ancient Canine']]) {
        const row = timeline.getByRole('listitem').filter({ hasText: date });
        assert.match(await row.innerText(), new RegExp(promotion));
        assert.equal(await row.locator('.promotion-badge img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      }
      assert.match(await risk.innerText(), /A conquista pode ter ocorrido antes/);
      assert.equal(await page.locator('#status').innerText(), '');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await risk.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      if (width !== 320) await risk.screenshot({ path: `.qa/promotion-history-${width}.png` });
    }

    const fixture = [{
      id: 'risk', nickname: 'Risk', promotion: 'gold',
      history: [{ date: '2025-01-01', stage: 1000 }],
      promotionHistory: [{ date: '2025-01-01', promotion: 'gold' }],
    }];
    let data = fixture;
    await page.route('**/data/members.json', route => route.fulfill({ json: data }));
    await page.goto(`${base}/atualizar.html`);
    await page.locator('#update-form').waitFor({ state: 'visible' });
    await page.getByLabel('Quando os estágios e promoções foram conferidos?').fill('2025-01-02');
    await page.getByLabel('Nova promoção de Risk', { exact: true }).selectOption('mithril');
    await page.getByRole('button', { name: 'Conferir atualização →', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar members.json ↓', exact: true }).click();
    data = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
    assert.deepEqual(data[0].history, fixture[0].history);
    assert.deepEqual(data[0].promotionHistory, [
      { date: '2025-01-01', promotion: 'gold' },
      { date: '2025-01-02', promotion: 'mithril' },
    ]);
    await page.goto(`${base}/index.html`);
    await page.locator('.member-card summary').click();
    const timeline = page.getByRole('list', { name: 'Histórico de estágios e promoções de Risk' });
    const promotionOnly = timeline.getByRole('listitem').filter({ hasText: '02/01/2025' });
    assert.match(await promotionOnly.innerText(), /Promoção: Mithril/);
    assert.doesNotMatch(await promotionOnly.innerText(), /Estágio/);

    data = [{ ...fixture[0], promotion: undefined, promotionHistory: [
      ...fixture[0].promotionHistory,
      { date: '2025-01-02', promotion: 'mithril' },
      { date: '2025-01-02', promotion: null },
      { date: '2025-02-30', promotion: 'silver' },
    ] }];
    await page.reload();
    await page.locator('.member-card summary').click();
    assert.equal(await page.locator('.history li').count(), 2);
    assert.match(await page.locator('.history li').last().innerText(), /Promoção removida/);
    assert.match(await page.locator('.history-warning').innerText(), /registros de promoção inválidos/);

    data = fixture.map(({ promotionHistory, ...member }) => member);
    await page.reload();
    await page.locator('.member-card summary').click();
    assert.match(await page.locator('.history').innerText(), /A promoção atual ainda não tem data registrada/);
    assert.equal(await page.locator('.history-promotion').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS promotion timeline, historical crests, mobile layout, promotion-only download/render, clears, invalid rows and legacy dates.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
