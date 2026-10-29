import test from 'node:test';
import assert from 'node:assert/strict';
import { memberReaderInternals, readMemberImages } from '../js/member-reader.js';

const { normalizeNickname, locateMemberPanel, matchMember, chooseMemberMatch } = memberReaderInternals;

function imageData(width, height, color = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

function drawRect(image, left, top, right, bottom, color = [145, 115, 80, 255], thickness = 3) {
  const { width, data } = image;
  const put = (x, y) => data.set(color, (y * width + x) * 4);
  for (let t = 0; t < thickness; t++) {
    for (let x = left; x <= right; x++) { put(x, top + t); put(x, bottom - t); }
    for (let y = top; y <= bottom; y++) { put(left + t, y); put(right - t, y); }
  }
}

test('locates a scaled warm-framed profile panel among a larger outer dialog', () => {
  const pixels = imageData(578, 1280);
  drawRect(pixels, 52, 448, 526, 1138, [115, 88, 65, 255], 3);
  drawRect(pixels, 112, 437, 465, 935);
  const panel = locateMemberPanel(pixels);
  assert.ok(panel);
  assert.ok(Math.abs(panel.left - 112) <= 2);
  assert.ok(Math.abs(panel.right - 465) <= 2);
  assert.ok(Math.abs(panel.top - 437) <= 2);
  assert.ok(Math.abs(panel.bottom - 935) <= 2);
});

test('normalizes accents and punctuation for member matching without guessing ambiguity', () => {
  assert.equal(normalizeNickname('  KÜ '), 'ku');
  assert.equal(matchMember('KÜ', [{ id: 'ku', nickname: 'kü' }]).member.id, 'ku');
  assert.deepEqual(matchMember('Risk', [{ id: 'r1', nickname: 'Risk' }, { id: 'r2', nickname: 'RISK' }]), { member: null, ambiguous: true });
  assert.deepEqual(matchMember('Nobody', []), { member: null, ambiguous: false });
});

test('requires adequate OCR confidence before associating an exact roster nickname', () => {
  const members = [{ id: 'm1', nickname: 'Pantalipe' }];
  assert.equal(chooseMemberMatch('Pantalipe', 44.9, members).member, null);
  assert.equal(chooseMemberMatch('Pantalipe', 45, members).member.id, 'm1');
  assert.equal(chooseMemberMatch('Pantalipe', NaN, members).uncertain, true);
  assert.deepEqual(chooseMemberMatch('Risk', 95, [
    { id: 'a', nickname: 'Risk' }, { id: 'b', nickname: 'RISK' },
  ]), { member: null, ambiguous: true, uncertain: false });
});

test('keeps explicit error rows for invalid, oversized, and over-limit files without starting OCR', async () => {
  const invalid = { name: 'notes.txt', type: 'text/plain', size: 20 };
  const oversized = { name: 'huge.png', type: 'image/png', size: 15 * 1024 * 1024 + 1 };
  const batch = [...Array.from({ length: 10 }, () => invalid), oversized, ...Array.from({ length: 10 }, () => invalid), invalid];
  const results = await readMemberImages(batch);
  assert.equal(results.length, 22);
  assert.ok(results.slice(0, 10).every(result => result.error === 'O arquivo não é uma imagem.'));
  assert.equal(results[10].error, 'A imagem excede o limite de 15 MB.');
  assert.ok(results.slice(11, 20).every(result => result.error === 'O arquivo não é uma imagem.'));
  assert.match(results[20].error, /Limite de 20 imagens/);
  assert.match(results[21].error, /Limite de 20 imagens/);
});
