import test from 'node:test';
import assert from 'node:assert/strict';
import { stockReaderInternals } from '../js/stock-reader.js';

const { numericLines, mergeQuantities } = stockReaderInternals;
const word = (text, x0, y0 = 100, confidence = 95, width = 18, height = 20) => ({
  text, confidence, bbox: { x0, x1: x0 + width, y0, y1: y0 + height }
});

test('extracts held amount from a slash-separated quantity and cost', () => {
  const results = numericLines([word('348/100', 80)]);
  assert.equal(results.length, 1);
  assert.equal(results[0].quantity, 348);
  assert.equal(results[0].text, '348/100');
});

test('joins OCR words into a slash pair while preserving their original row', () => {
  const results = numericLines([word('32', 80), word('/', 102, 101, 90, 7), word('10', 112, 100, 92, 17)]);
  assert.equal(results.length, 1);
  assert.equal(results[0].quantity, 32);
});

test('keeps standalone shop prices separate from a later slash pair', () => {
  const results = numericLines([word('50', 80), word('0/10', 80, 150)]);
  assert.equal(results.length, 1);
  assert.equal(results[0].quantity, 0);
  assert.equal(results[0].y0, 150);
});

test('row retries add missing quantities without replacing an earlier reading', () => {
  const original = [{ x0: 30, x1: 65, y0: 100, y1: 117, quantity: 28 }];
  mergeQuantities(original, [
    { x0: 31, x1: 66, y0: 101, y1: 118, quantity: 26 },
    { x0: 200, x1: 230, y0: 100, y1: 117, quantity: 1 },
    { x0: 30, x1: 65, y0: 200, y1: 217, quantity: 3 }
  ], 17);
  assert.deepEqual(original.map(({ quantity }) => quantity), [28, 1, 3]);
});

test('parses quantities without depending on screenshot ingredient order', () => {
  const results = numericLines([
    word('28/20', 300, 200), word('348/100', 80, 100), word('273/50', 380, 200), word('32/10', 180, 100)
  ]);
  assert.deepEqual(results.map((item) => item.quantity), [348, 32, 28, 273]);
});
