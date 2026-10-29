// Run against a local static server with PORTAL_TEST_URL and Playwright on NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';
const roster = [
  { id: 'risk', nickname: 'Risk', promotion: 'gold', history: [{ date: '2025-01-01', stage: 1000 }] },
  { id: 'mat', nickname: 'Matrella', promotion: 'silver', history: [{ date: '2025-01-01', stage: 900 }] },
  { id: 'leaver', nickname: 'Leaving', promotion: 'bronze', history: [{ date: '2025-01-01', stage: 800 }] },
  { id: 'returning', nickname: 'Returning', active: false, leftAt: '2025-01-01', promotion: 'gold', history: [{ date: '2025-01-01', stage: 700 }] },
];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/data/members.json', route => route.fulfill({ json: roster }));
      await page.goto(`${base}/atualizar.html`);
      await page.locator('#update-form').waitFor({ state: 'visible' });
      await page.locator('#ranking-date').fill('2025-01-02');
      await page.getByText('Colar uma lista pronta', { exact: true }).click();
      await page.getByRole('textbox', { name: 'Nickname do novo membro 1', exact: true }).fill('Newbie');
      await page.getByLabel('Nova promoção de Matrella', { exact: true }).selectOption('mithril');
      await page.getByRole('checkbox', { name: 'Leaving saiu da guild', exact: true }).check();

      async function paste(text) {
        await page.locator('#ranking-text').fill(text);
        await page.getByRole('button', { name: 'Usar esta lista', exact: true }).click();
      }
      await paste('Risk - 1090 - Black Mythril\nMatrella: 994\nNewbie | 100 | Dark Nox\nLeaving - 820 - Gold');
      assert.equal(await page.getByLabel('Nova promoção de Risk', { exact: true }).inputValue(), 'black-mithril');
      assert.equal(await page.getByLabel('Nova promoção de Matrella', { exact: true }).inputValue(), 'mithril');
      assert.equal(await page.getByLabel('Promoção do novo membro 1', { exact: true }).inputValue(), 'dark-nox');
      assert.equal(await page.getByLabel('Novo estágio de Leaving', { exact: true }).isDisabled(), true);
      assert.equal(await page.getByLabel('Nova promoção de Leaving', { exact: true }).isDisabled(), true);

      await paste('Risk - 1100 - Unknown\nMatrella: 1000');
      assert.match(await page.locator('#errors').innerText(), /promoção desconhecida/);
      assert.equal(await page.getByLabel('Novo estágio de Risk', { exact: true }).inputValue(), '1090');
      assert.equal(await page.getByLabel('Novo estágio de Matrella', { exact: true }).inputValue(), '994');
      await paste('Risk: 1091\nMatrella: 994\nNewbie: 100');
      assert.equal(await page.getByLabel('Nova promoção de Risk', { exact: true }).inputValue(), 'black-mithril');
      assert.equal(await page.getByLabel('Promoção do novo membro 1', { exact: true }).inputValue(), 'dark-nox');

      await page.getByRole('button', { name: 'Conferir atualização →', exact: true }).click();
      await page.locator('#preview').waitFor({ state: 'visible' });
      assert.match(await page.locator('#preview-body').innerText(), /Gold → Black Mythril/);
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar members.json ↓', exact: true }).click();
      const download = await downloaded;
      const members = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(members.find(member => member.id === 'risk').promotion, 'black-mithril');
      assert.equal(members.find(member => member.id === 'mat').promotion, 'mithril');
      assert.equal(members.find(member => member.nickname === 'Newbie').promotion, 'dark-nox');
      assert.equal(members.find(member => member.id === 'leaver').promotion, 'bronze');
      assert.equal(members.find(member => member.id === 'leaver').active, false);

      await page.getByRole('button', { name: 'Voltar e corrigir', exact: true }).click();
      await paste('Risk - 1091 - Sem promoção');
      assert.equal(await page.getByLabel('Nova promoção de Risk', { exact: true }).inputValue(), '__clear__');
      assert.equal(await page.locator('[data-promotion-member-id="risk"] + img').isVisible(), false);
      await page.getByRole('textbox', { name: 'Nickname do novo membro 1', exact: true }).fill('Returning');
      await paste('Returning - 710 - Sem promoção');
      assert.equal(await page.getByLabel('Promoção do novo membro 1', { exact: true }).inputValue(), '__clear__');
      await page.getByRole('button', { name: 'Conferir atualização →', exact: true }).click();
      await page.locator('#preview').waitFor({ state: 'visible' });
      const returnedDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar members.json ↓', exact: true }).click();
      const returned = JSON.parse(await fs.readFile(await (await returnedDownload).path(), 'utf8'));
      assert.equal(returned.find(member => member.id === 'returning').promotion, undefined);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ranking import, preview and download at ${width}px`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
