const INGREDIENTS = [
  'Alface', 'Amendoim', 'Arroz', 'Atum', 'Batata', 'Cacau', 'Camarão', 'Cana-de-açúcar',
  'Carne', 'Caviar', 'Favo de mel', 'Leite', 'Manjericão', 'Milho', 'Morango', 'Ovo',
  'Pimenta', 'Queijo', 'Tomate', 'Trigo', 'Trufa'
];

const OCR_MODULE = new URL('../assets/vendor/tesseract/tesseract.esm.min.js', import.meta.url).href;
const OCR_WORKER = new URL('../assets/vendor/tesseract/worker.min.js', import.meta.url).href;
const OCR_CORE = new URL('../assets/vendor/tesseract/tesseract-core-lstm.wasm.js', import.meta.url).href;
const OCR_LANG = new URL('../assets/vendor/tesseract/', import.meta.url).href;

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    image.src = url;
  });
}

function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function normalizedTemplate(image, size = 40) {
  const canvas = canvasFor(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.min((size - 2) / image.naturalWidth, (size - 2) / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return { size, data: context.getImageData(0, 0, size, size).data };
}

function resizeTemplate(template, size) {
  const canvas = canvasFor(size, size), context = canvas.getContext('2d');
  const source = canvasFor(template.size, template.size), sourceContext = source.getContext('2d');
  const pixels = sourceContext.createImageData(template.size, template.size);
  pixels.data.set(template.data); sourceContext.putImageData(pixels, 0, 0);
  context.drawImage(source, 0, 0, size, size);
  return { size, data: context.getImageData(0, 0, size, size).data };
}

function comparePatch(target, targetWidth, left, top, patch, backgroundCache) {
  let error = 0, sampleCount = 0, sourceLight = 0, referenceLight = 0;
  const size = patch.size, source = target.data, reference = patch.data;
  const key = `${left},${top},${size}`;
  let background = backgroundCache.get(key);
  if (!background) {
    background = [];
    for (let y = 3; y < size - 3; y += 2) {
      const neutral = [];
      for (let x = 3; x < size - 3; x += 2) {
        const i = ((top + y) * targetWidth + left + x) * 4;
        const r = source[i], g = source[i + 1], b = source[i + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) < 12 && Math.max(r, g, b) < 90) neutral.push((r + g + b) / 3);
      }
      neutral.sort((a, b) => a - b);
      background[y] = neutral.length ? neutral[Math.floor(neutral.length / 2)] : 0;
    }
    backgroundCache.set(key, background);
  }
  for (let y = 3; y < size - 3; y += 2) {
    for (let x = 3; x < size - 3; x += 2) {
      const pi = (y * size + x) * 4, alpha = reference[pi + 3] / 255;
      sampleCount++;
      const si = ((top + y) * targetWidth + left + x) * 4;
      const sr = source[si], sg = source[si + 1], sb = source[si + 2];
      // Composite over the tile's neutral gradient, including transparent pixels:
      // a smaller sprite must not match just a fragment of another ingredient.
      const back = background[y] * (1 - alpha);
      const tr = reference[pi] * alpha + back, tg = reference[pi + 1] * alpha + back, tb = reference[pi + 2] * alpha + back;
      error += Math.abs(sr - tr) + Math.abs(sg - tg) + Math.abs(sb - tb);
      sourceLight += sr + sg + sb;
      referenceLight += tr + tg + tb;
    }
  }
  if (!sampleCount || sourceLight < referenceLight * 0.45 || sourceLight > referenceLight * 2.2) return 0;
  return 1 - error / (sampleCount * 3 * 255);
}

async function loadTemplates(assetBase) {
  return Promise.all(INGREDIENTS.map(async (ingredient) => {
    const image = new Image();
    image.src = `${assetBase}${encodeURIComponent(ingredient)}.png`;
    await image.decode();
    return { ingredient, ...normalizedTemplate(image) };
  }));
}

function numericLines(words) {
  const candidates = words.filter((word) => /\d/.test(word.text) || word.text.trim() === '/')
    .sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2) || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  for (const word of candidates) {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find((item) => Math.abs(item.centerY - centerY) <= Math.max(4, Math.min(item.height, word.bbox.y1 - word.bbox.y0) * 0.45));
    if (!line) { line = { centerY, height: word.bbox.y1 - word.bbox.y0, words: [] }; lines.push(line); }
    line.words.push(word);
  }
  return lines.flatMap((line) => {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const groups = [];
    for (const word of line.words) {
      let group = groups.at(-1);
      if (!group || word.bbox.x0 - group.x1 > line.height * 0.45) {
        group = { text: '', confidence: 0, count: 0, x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1 };
        groups.push(group);
      }
      group.text += word.text.replace(/\s/g, '');
      group.confidence += word.confidence ?? 60; group.count++;
      group.x0 = Math.min(group.x0, word.bbox.x0); group.x1 = Math.max(group.x1, word.bbox.x1);
      group.y0 = Math.min(group.y0, word.bbox.y0); group.y1 = Math.max(group.y1, word.bbox.y1);
    }
    return groups.filter((group) => /^\d{1,7}\/\d{1,7}$/.test(group.text)).map((group) => ({
      ...group,
      confidence: group.confidence / group.count,
      quantity: Number(group.text.split('/')[0])
    }));
  });
}

function mergeQuantities(quantities, extra, tolerance) {
  for (const quantity of extra) {
    const cx = (quantity.x0 + quantity.x1) / 2, cy = (quantity.y0 + quantity.y1) / 2;
    if (!quantities.some((known) => Math.abs((known.x0 + known.x1) / 2 - cx) < tolerance * 1.5 && Math.abs((known.y0 + known.y1) / 2 - cy) < tolerance)) quantities.push(quantity);
  }
}

function iconAboveQuantity(target, targetWidth, targetHeight, quantity, templates) {
  const lineHeight = quantity.lineHeight || quantity.y1 - quantity.y0;
  const size = Math.round(lineHeight * 4.8);
  if (size < 24 || size > 140) return null;
  const xCenter = (quantity.x0 + quantity.x1) / 2;
  const patches = [0.75, 0.85, 0.95, 1.05, 1.15].map((scale) => Math.round(size * scale));
  const perIngredient = [];
  const backgroundCache = new Map();
  for (const template of templates) {
    let bestForIngredient = null;
    for (const patchSize of patches) {
      const patch = resizeTemplate(template, patchSize);
      // Inventory quantities sit directly below their ingredient art. Shop
      // buy buttons put a separate 0/10 limit much farther below the icon.
      const minGap = -lineHeight * 0.2, maxGap = lineHeight * 1.1;
      for (let gap = minGap; gap <= maxGap; gap += Math.max(3, lineHeight * 0.22)) {
        const top = Math.round(quantity.y0 - gap - patchSize);
        for (const shift of [-size * 0.12, 0, size * 0.12]) {
          const left = Math.round(xCenter - patchSize / 2 + shift);
          if (left < 0 || top < 0 || left + patchSize > targetWidth || top + patchSize > targetHeight) continue;
          const score = comparePatch(target, targetWidth, left, top, patch, backgroundCache);
          if (!bestForIngredient || score > bestForIngredient.score) bestForIngredient = { ingredient: template.ingredient, score, x: left, y: top, size: patchSize };
        }
      }
    }
    if (bestForIngredient) perIngredient.push(bestForIngredient);
  }
  perIngredient.sort((a, b) => b.score - a.score);
  const best = perIngredient[0];
  if (!best || best.score < 0.8) return null;
  return { ...best, margin: best.score - (perIngredient[1]?.score ?? 0), alternatives: perIngredient.slice(0, 3).map(({ ingredient, score }) => ({ ingredient, score })) };
}

/** Read stock from an inventory screenshot. Image processing and OCR stay in this browser. */
export async function readStockImage(file, { onProgress, ingredientAssets } = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new TypeError('Selecione um arquivo de imagem.');
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('A leitura de estoque exige um navegador.');
  if (file.size > 15 * 1024 * 1024) throw new Error('A imagem excede o limite de 15 MB.');
  const image = await imageFromFile(file);
  const sourcePixels = image.naturalWidth * image.naturalHeight;
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(4_000_000 / sourcePixels));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = canvasFor(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const target = context.getImageData(0, 0, canvas.width, canvas.height);
  const assetBase = ingredientAssets || new URL('../assets/ingredients/', import.meta.url).href;
  onProgress?.('Carregando reconhecedores de ingredientes…');
  const templates = await loadTemplates(assetBase);
  onProgress?.('Lendo quantidades da captura…');
  const { default: Tesseract } = await import(OCR_MODULE);
  let worker;
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: OCR_WORKER,
      corePath: OCR_CORE,
      langPath: OCR_LANG,
      gzip: true,
      logger: (event) => {
        if (event.status === 'recognizing text') onProgress?.('Reconhecendo quantidades…');
      }
    });
    await worker.setParameters({ tessedit_char_whitelist: '0123456789/', tessedit_pageseg_mode: '11' });
    const { data } = await worker.recognize(canvas);
    const quantities = numericLines(data.words || []);
    // A sparse pass can miss short expressions such as 1/1. Re-read detected
    // text rows with enlarged, high-contrast glyphs, retaining the original
    // readings when a second pass disagrees. Positions come from OCR, not slots.
    const rows = [];
    for (const quantity of quantities) {
      const center = (quantity.y0 + quantity.y1) / 2;
      const height = quantity.y1 - quantity.y0;
      if (!rows.some((row) => Math.abs(row.center - center) < height)) rows.push({ center, height });
    }
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    for (const row of rows.slice(0, 8)) {
      const top = Math.max(0, Math.floor(row.center - row.height));
      const height = Math.min(canvas.height - top, Math.ceil(row.height * 2));
      const strip = canvasFor(canvas.width, height);
      const stripContext = strip.getContext('2d');
      stripContext.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
      const pixels = stripContext.getImageData(0, 0, strip.width, strip.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 170 ? 0 : 255;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      }
      stripContext.putImageData(pixels, 0, 0);
      const textScale = Math.max(3, Math.min(6, Math.round(51 / row.height)));
      const enlarged = canvasFor(strip.width * textScale, strip.height * textScale);
      const enlargedContext = enlarged.getContext('2d');
      enlargedContext.imageSmoothingEnabled = false;
      enlargedContext.drawImage(strip, 0, 0, enlarged.width, enlarged.height);
      const { data: refined } = await worker.recognize(enlarged);
      const extra = numericLines((refined.words || []).map((word) => ({ ...word, bbox: {
        x0: word.bbox.x0 / textScale, x1: word.bbox.x1 / textScale,
        y0: word.bbox.y0 / textScale + top, y1: word.bbox.y1 / textScale + top
      } })));
      mergeQuantities(quantities, extra, row.height);
    }
    const heights = quantities.map((quantity) => quantity.y1 - quantity.y0).sort((a, b) => a - b);
    const typicalHeight = heights[Math.floor(heights.length / 2)];
    quantities.forEach((quantity) => { quantity.lineHeight = Math.min(quantity.y1 - quantity.y0, typicalHeight); });
    const items = [], warnings = [];
    for (const quantity of quantities) {
      const icon = iconAboveQuantity(target, canvas.width, canvas.height, quantity, templates);
      if (!icon) continue;
      const confidence = Math.max(0, Math.min(1, (quantity.confidence / 100) * icon.score));
      if (confidence < 0.48 || icon.margin < 0.025) continue;
      const existing = items.find((item) => item.ingredient === icon.ingredient);
      if (existing) {
        warnings.push(`Encontrei mais de uma quantidade para ${icon.ingredient}; revise a captura.`);
        continue;
      }
      items.push({ ingredient: icon.ingredient, quantity: quantity.quantity, confidence });
    }
    if (!items.length) warnings.push('Nenhuma quantidade de estoque reconhecível foi encontrada. Use uma captura nítida da tela de estoque.');
    else warnings.push('Ingredientes não identificados não serão importados.');
    return { items, warnings };
  } finally {
    await worker?.terminate();
  }
}

export const stockReaderInternals = { numericLines, mergeQuantities };
