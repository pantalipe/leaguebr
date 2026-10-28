import test from 'node:test';
import assert from 'node:assert/strict';
import { shopReaderInternals } from '../js/shop-reader.js';

test('ingredient text matching ignores Portuguese accents and OCR punctuation', () => {
  assert.equal(shopReaderInternals.closestIngredient('Camarao').ingredient, 'Camarão');
  assert.equal(shopReaderInternals.closestIngredient('Arroz,').ingredient, 'Arroz');
  assert.equal(shopReaderInternals.clean('Cana-de-açúcar'), 'canadeacucar');
});

test('shop limits preserve both values from OCR words on the same row', () => {
  const words = [
    { text: '0/10', confidence: 92, bbox: { x0: 80, x1: 110, y0: 200, y1: 212 } },
    { text: '50', confidence: 90, bbox: { x0: 90, x1: 106, y0: 180, y1: 192 } }
  ];
  const [limit] = shopReaderInternals.groupOfferLimits(words);
  assert.deepEqual([limit.purchased, limit.limit], [0, 10]);
  assert.equal(shopReaderInternals.groupOfferLimits(words).length, 1);
});

test('separate numerator and denominator OCR boxes are grouped by nearby geometry', () => {
  const words = [
    { text: '0', confidence: 88, bbox: { x0: 100, x1: 105, y0: 300, y1: 310 } },
    { text: '/', confidence: 87, bbox: { x0: 107, x1: 110, y0: 300, y1: 310 } },
    { text: '10', confidence: 86, bbox: { x0: 112, x1: 122, y0: 300, y1: 310 } }
  ];
  const [limit] = shopReaderInternals.groupOfferLimits(words);
  assert.deepEqual([limit.purchased, limit.limit], [0, 10]);
});
