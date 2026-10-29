// Real local OCR: set MEMBER_SCREENSHOT_DIR to the folder containing the four example JPGs.
// Repeats the four real screenshots five times to exercise a 20-file batch, not 20 distinct members.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:8000';
const directory = process.env.MEMBER_SCREENSHOT_DIR;
if (!directory) { console.log('SKIP: set MEMBER_SCREENSHOT_DIR for the real 20-image OCR batch.'); process.exit(0); }
const examples = [
  { suffix: '84438.jpg', nickname: 'pantalipe', stage: 819 },
  { suffix: '84436.jpg', nickname: 'Matrella', stage: 1039 },
  { suffix: '84453.jpg', nickname: 'kü', stage: 1099 },
  { suffix: '84452.jpg', nickname: 'abyssx', stage: 905 },
];
(async () => {
  const names = await fs.readdir(directory);
  const files = await Promise.all(examples.map(async example => {
    const name = names.find(name => name.endsWith(example.suffix));
    assert.ok(name, `Missing ${example.suffix}`);
    return { name, base64: (await fs.readFile(path.join(directory, name))).toString('base64') };
  }));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().startsWith('BATCH:')) console.log(message.text()); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', 'blob:'].includes(url.hostname) || url.protocol === 'blob:') return route.continue();
      external.push(url.href); return route.abort();
    });
    await page.goto(`${base}/atualizar.html`);
    const started = Date.now();
    const results = await page.evaluate(async ({ files, examples }) => {
      const { readMemberImages } = await import('./js/member-reader.js');
      const batch = Array.from({ length: 20 }, (_, index) => {
        const source = files[index % files.length];
        return new File([Uint8Array.from(atob(source.base64), c => c.charCodeAt(0))], `${index + 1}-${source.name}`, { type: 'image/jpeg' });
      });
      return readMemberImages(batch, { members: examples.map((example, index) => ({ id: `member-${index}`, nickname: example.nickname })),
        onProgress: progress => console.log(`BATCH:${JSON.stringify(progress)}`) });
    }, { files, examples });
    assert.equal(results.length, 20);
    results.forEach((result, index) => {
      assert.equal(result.stage, examples[index % 4].stage, `${result.fileName}: ${JSON.stringify(result)}`);
      assert.equal(result.promotion, ['winterfrost', 'infinaut', 'infinaut', 'dark-nox'][index % 4], JSON.stringify(result));
      // An uncertain nickname must remain editable; never associate it to the wrong member.
      assert.ok(result.memberId === null || result.memberId === `member-${index % 4}`, JSON.stringify(result));
    });
    console.log(JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), originals: results.slice(0, 4), count: results.length }));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    const variants = await page.evaluate(async ({ files, examples }) => {
      const { readMemberImages } = await import('./js/member-reader.js');
      const batch = [];
      for (const source of files) {
        const image = new Image(); image.src = `data:image/jpeg;base64,${source.base64}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * 0.75); canvas.height = Math.round(image.height * 0.75);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        batch.push(new File([blob], `small-${source.name}`, { type: 'image/png' }));
      }
      batch.splice(1, 0, new File(['invalid'], 'broken.jpg', { type: 'image/jpeg' }));
      return readMemberImages(batch, { members: examples.map((example, index) => ({ id: `member-${index}`, nickname: example.nickname })) });
    }, { files, examples });
    assert.equal(variants.length, 5);
    assert.ok(variants[1].error);
    variants.filter((_, index) => index !== 1).forEach((result, index) => {
      assert.ok(result.stage === null || result.stage === examples[index].stage, JSON.stringify(result));
      assert.ok(result.promotion === null || result.promotion === ['winterfrost', 'infinaut', 'infinaut', 'dark-nox'][index], JSON.stringify(result));
    });
    console.log('PASS resized images never apply incorrect stages/promotions; corrupt image isolated');
    console.log('PASS real OCR for 20 images (4 originals repeated 5 times), local assets only');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
