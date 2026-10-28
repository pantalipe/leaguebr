import { stockReaderInternals } from './stock-reader.js?v=shop-20261028';

const OCR_MODULE = new URL('../assets/vendor/tesseract/tesseract.esm.min.js', import.meta.url).href;
const OCR_WORKER = new URL('../assets/vendor/tesseract/worker.min.js', import.meta.url).href;
const OCR_CORE = new URL('../assets/vendor/tesseract/tesseract-core-lstm.wasm.js', import.meta.url).href;
const OCR_LANG = new URL('../assets/vendor/tesseract/', import.meta.url).href;

const INGREDIENTS = [
  'Alface', 'Amendoim', 'Arroz', 'Atum', 'Batata', 'Cacau', 'Camarão', 'Cana-de-açúcar',
  'Carne', 'Caviar', 'Favo de mel', 'Leite', 'Manjericão', 'Milho', 'Morango', 'Ovo',
  'Pimenta', 'Queijo', 'Tomate', 'Trigo', 'Trufa'
];
const BAR_INGREDIENTS = new Set(['Alface', 'Carne', 'Trigo', 'Leite', 'Ovo']);

function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    image.src = url;
  });
}

function clean(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return row[b.length];
}

function closestIngredient(text) {
  const value = clean(text);
  if (!value) return null;
  let best = null;
  for (const ingredient of INGREDIENTS) {
    const expected = clean(ingredient), distance = editDistance(value, expected);
    const score = Math.max(0, 1 - distance / Math.max(value.length, expected.length));
    if (!best || score > best.score) best = { ingredient, score };
  }
  return best;
}

function groupNumericWords(words) {
  const candidates = words.filter((word) => /\d/.test(word.text) || /[|Il/]/.test(word.text))
    .map((word) => ({ ...word, text: word.text.replace(/[|Iil]/g, '1').replace(/[oO]/g, '0').replace(/[^\d/]/g, '') }))
    .filter((word) => word.text)
    .sort((a, b) => centerY(a) - centerY(b) || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  for (const word of candidates) {
    const h = height(word), cy = centerY(word);
    let line = lines.find((item) => Math.abs(item.cy - cy) <= Math.max(4, Math.min(item.height, h) * 0.55));
    if (!line) { line = { cy, height: h, words: [] }; lines.push(line); }
    line.words.push(word);
  }
  return lines.flatMap((line) => {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const groups = [];
    for (const word of line.words) {
      let group = groups.at(-1);
      if (!group || word.bbox.x0 - group.x1 > line.height * 0.5) {
        group = { text: '', x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1, confidence: 0, n: 0 };
        groups.push(group);
      }
      group.text += word.text;
      group.x0 = Math.min(group.x0, word.bbox.x0); group.x1 = Math.max(group.x1, word.bbox.x1);
      group.y0 = Math.min(group.y0, word.bbox.y0); group.y1 = Math.max(group.y1, word.bbox.y1);
      group.confidence += word.confidence ?? 60; group.n++;
    }
    return groups.map((group) => ({ ...group, confidence: group.confidence / group.n }));
  });
}

function bounds(item) { return item.bbox || item; }
function height(item) { const box = bounds(item); return box.y1 - box.y0; }
function centerY(item) { const box = bounds(item); return (box.y0 + box.y1) / 2; }
function centerX(item) { const box = bounds(item); return (box.x0 + box.x1) / 2; }

function counterCells(target, width, heightPixels, row) {
  if (!Number.isFinite(row)) return [];
  for (const offset of [-14, -12, -10, -8, -4]) {
    const y = Math.round(row + offset);
    if (y < 0 || y >= heightPixels) continue;
    const cells = [];
    let start = null;
    for (let x = 0; x <= width; x++) {
      const i = (y * width + x) * 4;
      const dark = x < width && Math.max(target.data[i], target.data[i + 1], target.data[i + 2]) < 45;
      if (dark && start === null) start = x;
      if (!dark && start !== null) {
        if (x - start >= 45 && x - start <= width * 0.25) cells.push({ left: start, right: x, width: x - start });
        start = null;
      }
    }
    if (cells.length >= 3) {
      return cells.map((cell) => {
        const isDark = (cy) => {
          if (cy < 0 || cy >= heightPixels) return false;
          const i = (cy * width + cell.left + 2) * 4;
          return Math.max(target.data[i], target.data[i + 1], target.data[i + 2]) < 45;
        };
        let top = y, bottom = y;
        while (top > y - 40 && isDark(top - 1)) top--;
        while (bottom < y + 40 && isDark(bottom + 1)) bottom++;
        return { ...cell, top, bottom, cy: (top + bottom) / 2 };
      });
    }
  }
  return [];
}

function bestIconNear(target, width, heightPixels, x, y, templates, { minX, maxX, maxY = 10, minY = -10, sizes = [18, 22, 26, 30, 36, 42], background = 'visible' }) {
  const matches = [];
  const backgroundCache = new Map();
  for (const size of sizes) {
    const patches = templates.map((template) => ({ template, patch: stockReaderInternals.resizeTemplate(template, size) }));
    for (let dy = minY; dy <= maxY; dy += Math.max(3, Math.round(size * 0.18))) {
      const top = Math.round(y - size / 2 + dy);
      for (let dx = minX; dx <= maxX; dx += Math.max(3, Math.round(size * 0.16))) {
        const left = Math.round(x + dx - size / 2);
        if (left < 0 || top < 0 || left + size > width || top + size > heightPixels) continue;
        for (const { template, patch } of patches) {
          let score;
          if (background === 'neutral') {
            score = stockReaderInternals.comparePatch(target, width, left, top, patch, backgroundCache);
          } else {
            let error = 0, samples = 0;
            for (let py = 2; py < size - 2; py++) {
              const edgeLeft = ((top + py) * width + left + 1) * 4;
              const edgeRight = ((top + py) * width + left + size - 2) * 4;
              for (let px = 2; px < size - 2; px++) {
                const pi = (py * size + px) * 4, alpha = patch.data[pi + 3] / 255;
                if (background !== 'button' && alpha < 0.72) continue;
                const ti = ((top + py) * width + left + px) * 4;
                for (let channel = 0; channel < 3; channel++) {
                  const bg = (target.data[edgeLeft + channel] + target.data[edgeRight + channel]) / 2;
                  const expected = background === 'button' ? patch.data[pi + channel] * alpha + bg * (1 - alpha) : patch.data[pi + channel];
                  error += Math.abs(target.data[ti + channel] - expected);
                }
                samples++;
              }
            }
            score = samples ? 1 - error / (samples * 3 * 255) : 0;
          }
          matches.push({ ingredient: template.ingredient, score, left, top, size });
        }
      }
    }
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0], runnerUp = matches.find((match) => match.ingredient !== best?.ingredient);
  if (!best || best.score < 0.52) return null;
  return { ...best, margin: best.score - (runnerUp?.score ?? 0) };
}

function groupOfferLimits(words) {
  const hits = groupNumericWords(words).filter((group) => /^\d{1,4}\/\d{1,4}$/.test(group.text));
  return hits.map((hit) => ({ ...hit, purchased: Number(hit.text.split('/')[0]), limit: Number(hit.text.split('/')[1]) }));
}

async function readDigits(worker, canvas, box, padding = 4, mode = '7') {
  const left = Math.max(0, Math.floor(box.x0 - padding)), top = Math.max(0, Math.floor(box.y0 - padding));
  const right = Math.min(canvas.width, Math.ceil(box.x1 + padding)), bottom = Math.min(canvas.height, Math.ceil(box.y1 + padding));
  if (right <= left || bottom <= top) return '';
  const crop = canvasFor((right - left) * 4, (bottom - top) * 4), context = crop.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: mode });
  const { data } = await worker.recognize(crop);
  const raw = (data.text || '').replace(/\D/g, '');
  if (raw && Number(raw) > 0) return raw;
  // Isolate white glyphs on yellow buttons instead of widening the crop to
  // include the currency icon, which OCR may mistake for an extra digit.
  const pixels = context.getImageData(0, 0, crop.width, crop.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 170 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  const { data: contrast } = await worker.recognize(crop);
  return (contrast.text || '').replace(/\D/g, '');
}

async function readTopbarNumbers(worker, canvas, y) {
  const top = Math.max(0, Math.floor(y - 24)), bottom = Math.min(canvas.height, Math.ceil(y + 24)), scale = 3;
  const crop = canvasFor(canvas.width * scale, (bottom - top) * scale), context = crop.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, 0, top, canvas.width, bottom - top, 0, 0, crop.width, crop.height);
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '11' });
  const { data } = await worker.recognize(crop);
  return (data.words || []).filter((word) => /^\d{1,7}$/.test(word.text)).map((word) => ({
    text: word.text, confidence: word.confidence ?? 55,
    x0: word.bbox.x0 / scale, x1: word.bbox.x1 / scale,
    y0: word.bbox.y0 / scale + top, y1: word.bbox.y1 / scale + top
  }));
}

/** Read the visible shop offers and top-bar ingredient amounts entirely in this browser. */
export async function readShopImage(file, { onProgress, ingredientAssets } = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new TypeError('Selecione um arquivo de imagem.');
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('A leitura da loja exige um navegador.');
  if (file.size > 15 * 1024 * 1024) throw new Error('A imagem excede o limite de 15 MB.');
  const image = await imageFromFile(file), sourcePixels = image.naturalWidth * image.naturalHeight;
  const scale = Math.min(1, 578 / image.naturalWidth, 2048 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(4_000_000 / sourcePixels));
  const width = Math.max(1, Math.round(image.naturalWidth * scale)), heightPixels = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = canvasFor(width, heightPixels), context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, width, heightPixels);
  const target = context.getImageData(0, 0, width, heightPixels);
  const base = ingredientAssets || new URL('../assets/ingredients/', import.meta.url).href;
  onProgress?.('Carregando reconhecedores de ingredientes…');
  const templates = await stockReaderInternals.loadTemplates(base);
  const barTemplates = templates.filter((template) => BAR_INGREDIENTS.has(template.ingredient));
  const { default: Tesseract } = await import(OCR_MODULE);
  let worker;
  try {
    worker = await Tesseract.createWorker('eng', 1, { workerPath: OCR_WORKER, corePath: OCR_CORE, langPath: OCR_LANG, gzip: true,
      logger: (event) => { if (event.status === 'recognizing text') onProgress?.('Lendo textos e números da loja…'); } });
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas), words = data.words || [];
    const numbers = groupNumericWords(words), items = [], offers = [], warnings = [];
    const topRow = numbers.filter((number) => /^\d{1,7}$/.test(number.text) && centerY(number) < heightPixels * 0.25)
      .map((number) => centerY(number)).sort((a, b) => a - b)[0];
    const refinedTopbar = topRow == null ? [] : await readTopbarNumbers(worker, canvas, topRow);
    const cells = counterCells(target, width, heightPixels, topRow);
    if (cells.length) {
      // OCR each dark counter independently so a neighboring icon cannot become
      // an extra digit. Cells are detected from pixels; their ingredient order
      // is determined by matching the icon, never by the slot number.
      for (const cell of cells) {
        const box = { x0: cell.left + cell.width * 0.38, x1: cell.right - 2, y0: cell.top + 2, y1: cell.bottom - 2 };
        const inside = (item) => { const b = bounds(item); return b.x0 >= box.x0 && b.x1 <= cell.right && b.y0 >= cell.top && b.y1 <= cell.bottom; };
        const localNumbers = [...groupNumericWords(words.filter((word) => /^\d{1,7}$/.test(word.text) && inside(word))), ...refinedTopbar.filter(inside)];
        const native = localNumbers.sort((a, b) => b.confidence - a.confidence)[0];
        let quantity = native && native.confidence >= 30 ? native.text : await readDigits(worker, canvas, box, 0);
        if (quantity.length >= 3) {
          // Dense counters form one isolated word. Re-reading with word
          // segmentation avoids contextual row OCR confusing a final 8 with 6.
          const word = await readDigits(worker, canvas, box, 0, '8');
          if (/^\d{3,7}$/.test(word) && word.length === quantity.length) quantity = word;
        }
        if (!/^\d{1,7}$/.test(quantity)) continue;
        const icon = bestIconNear(target, width, heightPixels, cell.left + cell.width * 0.22, cell.cy, barTemplates,
          { minX: -5, maxX: 5, minY: -4, maxY: 4, sizes: [16, 18, 20, 22, 24] });
        if (!icon || icon.margin < 0.005 || items.some((item) => item.ingredient === icon.ingredient)) continue;
        items.push({ ingredient: icon.ingredient, quantity: Number(quantity), confidence: icon.score * 0.75 });
      }
    } else {
      const topbarNumbers = numbers.filter((number) => /^\d{1,7}$/.test(number.text) && centerY(number) < heightPixels * 0.25 && Math.abs(centerY(number) - topRow) < 28);
      // Read any other short token on that OCR row too: the final `3` can look like a symbol at native resolution.
      const topbarTokens = words.filter((word) => topRow != null && Math.abs(centerY(word) - topRow) < 24 && !topbarNumbers.some((number) => Math.abs(centerX(number) - centerX(word)) < 12))
        .map((word) => ({ text: word.text, x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1, confidence: word.confidence ?? 50 }));
      await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
      const topCandidates = [...refinedTopbar];
      for (const original of topbarNumbers) {
        const match = topCandidates.find((item) => Math.abs(centerX(item) - centerX(original)) < 32);
        if (!match) topCandidates.push(original);
        else {
          if (match.text.length < original.text.length) match.text = original.text;
          match.confidence = Math.max(match.confidence, original.confidence);
        }
      }
      const rightmostNumber = Math.max(0, ...topCandidates.map((item) => item.x1));
      const trailingIcon = topbarTokens.filter((item) => item.x0 > rightmostNumber + 10 && item.x0 < width * 0.9)
        .sort((a, b) => a.x0 - b.x0)[0];
      if (trailingIcon) {
        const numberBox = { x0: trailingIcon.x1 + 8, x1: Math.min(width, trailingIcon.x1 + 58), y0: topRow - 10, y1: topRow + 10 };
        const trailingValue = await readDigits(worker, canvas, numberBox, 0);
        if (trailingValue) topCandidates.push({ text: trailingValue, x0: numberBox.x0, x1: numberBox.x1, y0: numberBox.y0, y1: numberBox.y1, confidence: 75, iconX: centerX(trailingIcon) });
        await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
      }

      // Top-bar amounts are recognized from their OCR position and the ingredient icon immediately to their left.
      for (const number of topCandidates) {
        const icon = bestIconNear(target, width, heightPixels, number.iconX ?? centerX(number), (number.y0 + number.y1) / 2, barTemplates,
          number.iconX == null
            ? { minX: -62, maxX: -42, minY: -3, maxY: 3, sizes: [16, 18, 20, 22, 24] }
            : { minX: -5, maxX: 5, minY: -4, maxY: 4, sizes: [16, 18, 20, 22, 24] });
        if (!icon || icon.margin < 0.005) continue;
        const confidence = Math.min(1, Math.max(0, number.confidence / 100 * icon.score));
        if (confidence < 0.28) continue;
        if (items.some((item) => item.ingredient === icon.ingredient)) {
          warnings.push(`Encontrei mais de uma quantidade para ${icon.ingredient}; revise a captura.`); continue;
        }
        items.push({ ingredient: icon.ingredient, quantity: Number(number.text), confidence });
      }
    }

    const labels = words.map((word) => ({ word, match: closestIngredient(word.text) }))
      .filter(({ word, match }) => match?.score >= 0.62 && height({ bbox: word.bbox }) >= 7);
    const seenLabels = [];
    for (const { word, match } of labels) {
      if (seenLabels.some((label) => label.ingredient === match.ingredient && Math.abs(label.y - centerY(word)) < 18 && Math.abs(label.x - centerX(word)) < 90)) continue;
      seenLabels.push({ ingredient: match.ingredient, x: centerX(word), y: centerY(word), score: match.score, word });
    }
    const limits = groupOfferLimits(words);
    for (const limit of limits) {
      // Match each product independently of its slot and of title OCR. Pixel
      // lettering can be unreadable even when the product artwork is clear.
      const unit = height(limit) / 13;
      const product = bestIconNear(target, width, heightPixels, centerX(limit), limit.y0 - 100 * unit, templates,
        { minX: -8 * unit, maxX: 8 * unit, minY: -10 * unit, maxY: 10 * unit,
          sizes: [48, 52, 56, 60, 64, 68].map((size) => Math.max(16, Math.round(size * unit))), background: 'neutral' });
      const textLabel = seenLabels.filter((label) => Math.abs(label.x - centerX(limit)) < 65 * unit && limit.y0 > label.y && limit.y0 - label.y < 180 * unit)
        .sort((a, b) => b.score - a.score)[0];
      const label = product && product.score >= 0.85 && product.margin >= 0.02
        ? { ingredient: product.ingredient, x: Math.floor(centerX(limit)), y: limit.y0 - 145 * unit, score: product.score, word: { confidence: 85 } }
        : textLabel;
      if (!label) continue;
      // The yellow price button sits between the product art and the limit label. Find its number by x and vertical span.
      const priceY = label.y + (limit.y0 - label.y) * 0.68;
      const priceDigits = await readDigits(worker, canvas, { x0: label.x - 2, x1: label.x + 50, y0: priceY - 15, y1: priceY + 15 }, 0);
      if (!/^\d{1,5}$/.test(priceDigits)) continue;
      const priceNumber = { text: priceDigits, x0: label.x + 8, y0: label.y + 38, y1: limit.y0 - 5, confidence: 70 };
      await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
      const costIcon = bestIconNear(target, width, heightPixels, label.x - 31, priceY, barTemplates,
        { minX: -8, maxX: 8, minY: -6, maxY: 8, sizes: [24, 26, 28, 30, 32, 34, 36, 38], background: 'button' });
      if (!costIcon || costIcon.margin < 0.005) continue;
      const confidence = Math.max(0, Math.min(1, (label.score * (label.word.confidence ?? 65) / 100 + priceNumber.confidence / 100 + limit.confidence / 100 + costIcon.score) / 4));
      offers.push({ ingredient: label.ingredient, costIngredient: costIcon.ingredient, cost: Number(priceNumber.text), purchased: limit.purchased, limit: limit.limit, confidence });
    }
    if (!items.length) warnings.push('Não encontrei quantidades reconhecíveis na barra superior.');
    else if (cells.length > items.length) warnings.push('Algumas quantidades da barra superior não foram reconhecidas; confira o estoque antes de aplicar.');
    if (!offers.length) warnings.push('Não encontrei ofertas reconhecíveis na captura da loja.');
    else if (offers.length < limits.length) warnings.push('Algumas ofertas não tiveram produto, preço ou ingrediente de custo reconhecido; revise antes de importar.');
    return { items, offers, warnings };
  } finally {
    await worker?.terminate();
  }
}

export const shopReaderInternals = { clean, closestIngredient, groupNumericWords, groupOfferLimits, bestIconNear };
