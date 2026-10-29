// UI batch regression with deterministic reader output; real OCR is tested separately.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';
const roster = Array.from({ length: 20 }, (_, index) => ({
  id: `member-${index}`, nickname: `Member ${index}`, promotion: 'gold',
  history: [{ date: '2025-01-01', stage: 100 + index }],
}));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=', 'base64');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/members.json', route => route.fulfill({ json: [...roster, { id: 'returning', nickname: 'Returning', active: false, promotion: 'silver', leftAt: '2025-01-01', history: [{ date: '2025-01-01', stage: 50 }] }] }));
    await page.route('**/js/member-reader.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export async function readMemberImages(files, {onProgress}) {
        onProgress('Lendo lote…');
        return files.map((file, index) => ({fileName: file.name, memberId: index < 19 ? 'member-' + index : null,
          nickname: index < 19 ? 'Member ' + index : '', stage: index < 19 ? 200 + index : null,
          promotion: index === 0 ? 'mithril' : null, warnings: index === 19 ? ['Imagem ilegível'] : []}));
      }` }));
    await page.goto(`${base}/atualizar.html`);
    await page.locator('#update-form').waitFor({ state: 'visible' });
    await page.getByText('Importar prints dos membros', { exact: true }).click();
    const files = Array.from({ length: 21 }, (_, index) => ({ name: `member-${index}.png`, mimeType: 'image/png', buffer: png }));
    await page.locator('#member-images').setInputFiles(files);
    await page.getByRole('button', { name: 'Ler imagens', exact: true }).click();
    assert.match(await page.locator('#errors').innerText(), /1 a 20/);
    await page.locator('#member-images').setInputFiles(files.slice(0, 20));
    await page.getByRole('button', { name: 'Ler imagens', exact: true }).click();
    await page.locator('#member-image-review').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.member-image-result').count(), 20);
    assert.equal(await page.locator('#member-image-results input:checked').count(), 19);
    await page.getByLabel('Membro da imagem 2', { exact: true }).selectOption('member-0');
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    assert.match(await page.locator('#errors').innerText(), /repetido/);
    assert.equal(await page.getByLabel('Novo estágio de Member 0', { exact: true }).inputValue(), '');
    await page.getByLabel('Membro da imagem 2', { exact: true }).selectOption('member-1');
    await page.getByLabel('Membro da imagem 20', { exact: true }).selectOption('member-19');
    await page.getByLabel('Estágio da imagem 20', { exact: true }).fill('219');
    await page.getByLabel('Usar imagem 20', { exact: true }).check();
    await page.getByRole('checkbox', { name: 'Member 0 saiu da guild', exact: true }).check();
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar dados, entradas e saídas', exact: true }).click();
    assert.match(await page.locator('#errors').innerText(), /marcado como saída/);
    await page.getByRole('checkbox', { name: 'Member 0 saiu da guild', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar dados, entradas e saídas', exact: true }).click();
    assert.equal(await page.getByLabel('Novo estágio de Member 0', { exact: true }).inputValue(), '200');
    assert.equal(await page.getByLabel('Novo estágio de Member 19', { exact: true }).inputValue(), '219');
    assert.equal(await page.getByLabel('Nova promoção de Member 0', { exact: true }).inputValue(), 'mithril');
    assert.equal(await page.getByLabel('Nova promoção de Member 19', { exact: true }).inputValue(), '');

    // A new member replaces a missing member only after declaring a complete roster and reviewing it.
    await page.getByLabel('Membro da imagem 20', { exact: true }).selectOption('__new__');
    await page.getByLabel('Nick se for novo membro da imagem 20', { exact: true }).fill('Newbie');
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    assert.match(await page.locator('#errors').innerText(), /mais de 20/);
    await page.getByLabel('Este lote contém todos os membros atuais da guild', { exact: true }).check();
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    assert.match(await page.locator('#member-roster-summary').innerText(), /Entradas: Newbie/);
    assert.match(await page.locator('#member-roster-summary').innerText(), /Saídas sugeridas: Member 19/);
    assert.equal(await page.getByRole('checkbox', { name: 'Member 19 saiu da guild', exact: true }).isChecked(), false);
    await page.getByRole('button', { name: 'Confirmar dados, entradas e saídas', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Member 19 saiu da guild', exact: true }).isChecked(), true);
    assert.equal(await page.locator('[data-new-name]').inputValue(), 'Newbie');
    await page.locator('#ranking-date').fill('2025-01-02');
    await page.getByRole('button', { name: 'Conferir atualização →', exact: true }).click();
    await page.locator('#preview').waitFor({ state: 'visible' });
    assert.match(await page.locator('#preview-body').innerText(), /Entrou na guild/);
    assert.match(await page.locator('#preview-body').innerText(), /Saiu da guild/);

    // Replacing that draft with an archived member recovers its history, preserving the promotion.
    await page.getByRole('button', { name: 'Voltar e corrigir', exact: true }).click();
    await page.getByLabel('Membro da imagem 20', { exact: true }).selectOption('returning');
    await page.getByRole('button', { name: 'Usar resultados selecionados', exact: true }).click();
    assert.match(await page.locator('#member-roster-summary').innerText(), /Retornos: Returning/);
    await page.getByRole('button', { name: 'Confirmar dados, entradas e saídas', exact: true }).click();
    assert.equal(await page.locator('[data-new-name]').inputValue(), 'Returning');
    await page.getByRole('button', { name: 'Conferir atualização →', exact: true }).click();
    await page.locator('#preview').waitFor({ state: 'visible' });
    assert.match(await page.locator('#preview-body').innerText(), /Voltou à guild · Promoção: Silver/);
    await page.locator('#member-images').setInputFiles(files.slice(0, 1));
    assert.equal(await page.getByLabel('Este lote contém todos os membros atuais da guild', { exact: true }).isChecked(), false);
    assert.equal(await page.locator('#member-image-review').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS 20-row image review, corrections, duplicate guards, complete-roster entries/exits/returns and 20-member limit');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
