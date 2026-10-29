// Binary glyphs sampled from the verified Fase/Nível rows in the supplied examples.
// Keep only the font shapes, never player information or screenshot pixels.
const GLYPHS = {
  0: ['001111100','011111100','111111111','111000011','111000011','111000111','111000111','111000011','111000011','111000111','111000011','111000011','011111110','011111100'],
  1: ['001100','001110','111100','111100','001100','001100','001100','001100','001100','001100','001110','001100','111111','111111'],
  2: ['0001111100','0011111110','1111011111','1110000111','0000000111','0000001111','0000111100','0000111000','0011110000','0011100000','0111100000','1111000000','0111111111','0111111111'],
  3: ['011111100','011111100','111111111','110000111','000000011','000111111','000111110','000111111','000000111','000000111','110000111','110000111','011111110','011111100'],
  4: ['00000001100','00000111100','00000111100','00011111100','00111101100','01110001100','11110001100','11100111100','11111111111','11111111111','00000001100','00000001100','00000001100'],
  5: ['111111111','111111111','111111111','111000000','111000000','111111110','111111110','111111111','000000011','000000011','111000011','111000011','001111110','001111110'],
  6: ['000001000','000111100','001111110','011100000','111100000','111111100','111111110','111111111','111000011','111000011','111000011','111000011','111111111','001111100'],
  7: ['010010010','111111111','111111111','000000011','000000011','000001111','000001110','000001110','000001110','000011100','000011000','000011000','000011000','000011000'],
  8: ['0011111100','1111111110','1110000110','1110000110','1111001110','1111111110','1111111110','1110000110','1110000110','1110000110','1110000110','1111111110','0011111000','0011111000'],
  9: ['011111100','011111100','111111111','110000111','110000111','110000111','111000111','111111111','011111111','000000111','000001111','000001100','011111000','011110000'],
};

/** Decode the game's touching/italic digits as a whole line; reject weak or ambiguous fits. */
export function readPixelStage({ data, width, height }) {
  const ink = (x, y) => Math.min(data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]) >= 160;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(x, y)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const w = right - left + 1, h = bottom - top + 1;
  if (h < 7 || w < 3 || w > h * 8) return null;
  const paths = Array.from({ length: w + 1 }, () => []);
  paths[0] = [{ text: '', cost: 0 }];
  function add(x, candidate) {
    const same = paths[x].find(path => path.text === candidate.text);
    if (same && same.cost <= candidate.cost) return;
    paths[x] = [...paths[x].filter(path => path !== same), candidate].sort((a, b) => a.cost - b.cost).slice(0, 5);
  }
  for (let x = 0; x < w; x++) {
    if (!paths[x].length) continue;
    if (Array.from({ length: h }, (_, y) => ink(left + x, top + y)).every(value => !value)) {
      for (const path of paths[x]) add(x + 1, path);
    }
    for (const [digit, rows] of Object.entries(GLYPHS)) {
      const expected = rows[0].length * h / rows.length;
      for (let size = Math.max(3, Math.round(expected) - 1); size <= Math.round(expected) + 1; size++) {
        if (x + size > w) continue;
        let cost = 0;
        for (let y = 0; y < h; y++) for (let dx = 0; dx < size; dx++) {
          const reference = rows[Math.min(rows.length - 1, Math.floor(y * rows.length / h))][Math.min(rows[0].length - 1, Math.floor(dx * rows[0].length / size))] === '1';
          if (reference !== ink(left + x + dx, top + y)) cost++;
        }
        for (const path of paths[x]) if (path.text.length < 7) add(x + size, { text: path.text + digit, cost: path.cost + cost });
      }
    }
  }
  const [best, next] = paths[w].filter(path => path.text);
  if (!best || best.cost / (w * h) > 0.16 || (next && (next.cost - best.cost) / (w * h) < 0.012)) return null;
  return Number(best.text);
}
