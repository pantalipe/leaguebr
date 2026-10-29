import { readPixelStage } from './member-digits.js';
import { createPromotionMatcher } from './member-promotion.js';

const OCR_MODULE = new URL('../assets/vendor/tesseract/tesseract.esm.min.js', import.meta.url).href;
const OCR_WORKER = new URL('../assets/vendor/tesseract/worker.min.js', import.meta.url).href;
const OCR_CORE = new URL('../assets/vendor/tesseract/tesseract-core-lstm.wasm.js', import.meta.url).href;
const OCR_LANG = new URL('../assets/vendor/tesseract/', import.meta.url).href;
const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;

function normalizeNickname(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, '');
}

function warmBorderPixel(data, index) {
  const r = data[index], g = data[index + 1], b = data[index + 2];
  return r > 70 && g > 35 && r > g * 1.06 && g > b * 1.06 && r - b > 22;
}

function rowRuns(imageData) {
  const { data, width, height } = imageData;
  const rows = [];
  const minX = Math.floor(width * 0.08), maxX = Math.ceil(width * 0.92);
  for (let y = Math.floor(height * 0.18); y < height * 0.82; y++) {
    let start = -1, last = -1, best = null;
    for (let x = minX; x < maxX; x++) {
      if (warmBorderPixel(data, (y * width + x) * 4)) {
        if (start < 0) start = x;
        last = x;
      } else if (start >= 0 && x - last > 3) {
        const length = last - start + 1;
        if (!best || length > best.length) best = { left: start, right: last, length };
        start = -1;
      }
    }
    if (start >= 0) {
      const length = last - start + 1;
      if (!best || length > best.length) best = { left: start, right: last, length };
    }
    if (best && best.length >= width * 0.48 && best.length <= width * 0.76) rows.push({ y, ...best });
  }
  return rows;
}

/** Locate the modal by pairing its long, warm-toned top and bottom frame strokes. */
function locateMemberPanel(imageData) {
  if (!imageData?.data || !imageData.width || !imageData.height) return null;
  const { width, height } = imageData;
  const rows = rowRuns(imageData);
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    const top = rows[i];
    for (let j = i + 1; j < rows.length; j++) {
      const bottom = rows[j], gap = bottom.y - top.y;
      if (gap > height * 0.54) break;
      if (gap < height * 0.25) continue;
      const widthDelta = Math.abs(top.length - bottom.length) / Math.max(top.length, bottom.length);
      const align = Math.abs(top.left - bottom.left) + Math.abs(top.right - bottom.right);
      if (widthDelta > 0.24 || align > width * 0.12) continue;
      const score = top.length + bottom.length - align * 0.6 - widthDelta * width;
      if (!best || score > best.score) best = { top, bottom, score };
    }
  }
  if (!best) return null;
  const left = Math.min(best.top.left, best.bottom.left), right = Math.max(best.top.right, best.bottom.right);
  return { left, top: best.top.y, right, bottom: best.bottom.y, width: right - left + 1, height: best.bottom.y - best.top.y + 1 };
}

function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    image.src = url;
  });
}

function matchMember(nickname, members = []) {
  const key = normalizeNickname(nickname);
  if (!key) return { member: null, ambiguous: false };
  const matches = members.filter(member => normalizeNickname(member?.nickname) === key);
  return { member: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

function chooseMemberMatch(nickname, confidence, members = []) {
  if (!Number.isFinite(confidence) || confidence < 45) return { member: null, ambiguous: false, uncertain: true };
  return { ...matchMember(nickname, members), uncertain: false };
}

function region(canvas, x, y, width, height, scale = 3) {
  const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
  const right = Math.min(canvas.width, Math.ceil(x + width)), bottom = Math.min(canvas.height, Math.ceil(y + height));
  const crop = canvasFor(Math.max(1, (right - left) * scale), Math.max(1, (bottom - top) * scale));
  const context = crop.getContext('2d'); context.imageSmoothingEnabled = false;
  context.drawImage(canvas, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
  return crop;
}

async function recognizeStage(worker, canvas, panel, stageCenterY, uiScale) {
  const area = region(canvas, panel.left + panel.width * 0.48, stageCenterY - 20 * uiScale, panel.width * 0.42, 40 * uiScale, 1);
  const areaContext = area.getContext('2d', { willReadFrequently: true });
  const pixels = areaContext.getImageData(0, 0, area.width, area.height), data = pixels.data;
  const pixelStage = readPixelStage(pixels);
  if (pixelStage !== null) return pixelStage;
  let left = area.width, top = area.height, right = -1, bottom = -1;
  for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
    const i = (y * area.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const ink = Math.min(r, g, b) >= 185 && Math.max(r, g, b) - Math.min(r, g, b) < 85;
    const value = ink ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    if (ink) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  if (right < left || bottom - top < 5) return null;
  areaContext.putImageData(pixels, 0, 0);
  const padding = Math.max(10, Math.round(12 * uiScale));
  const tight = region(area, left - padding, top - padding, right - left + 1 + padding * 2, bottom - top + 1 + padding * 2, 4);
  const reads = [];
  for (const mode of ['7', '13']) {
    await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: '0123456789' });
    const { data: recognized } = await worker.recognize(tight);
    reads.push(String(recognized.text ?? '').replace(/\D/g, ''));
  }
  if (!reads[0] || reads[0] !== reads[1] || !Number.isSafeInteger(Number(reads[0]))) return null;
  return Number(reads[0]);
}

async function recognizePanel(worker, canvas, panel) {
  const w = panel.width, h = panel.height, left = panel.left, top = panel.top;
  // The nickname is left-aligned beside the crest; stop before the separate
  // decorative crown/icon to avoid appending it to longer names.
  const nameCrop = region(canvas, left + w * 0.34, top + h * 0.055, w * 0.35, h * 0.125, 4);
  await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' });
  const nameResult = await worker.recognize(nameCrop);
  const rawName = String(nameResult.data.text ?? '').replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, ' ');
  const nickConfidence = nameResult.data.confidence ?? 0;

  // The game keeps the Fase row at a fixed logical offset from the frame;
  // the self-profile modal is taller because it includes the leave button.
  const uiScale = w / 353;
  const stageCenterY = top + 393 * uiScale;
  const stage = await recognizeStage(worker, canvas, panel, stageCenterY, uiScale);
  return { rawName, nickConfidence, stage };
}

function errorResult(file, message) {
  return { fileName: file?.name ?? '', nickname: '', memberId: null, stage: null, promotion: null, warnings: [message], error: message };
}

/** OCR guild profile screenshots locally, with one Tesseract worker reused for a sequential batch. */
export async function readMemberImages(files, { members = [], onProgress } = {}) {
  const list = Array.from(files ?? []);
  if (!list.length) return [];
  const results = new Array(list.length);
  let worker, templates;
  try {
    const eligible = list.some((file, index) => index < MAX_FILES && file?.type?.startsWith('image/') && file.size <= MAX_BYTES);
    if (eligible) {
      onProgress?.({ index: 0, total: Math.min(list.length, MAX_FILES), message: 'Carregando reconhecedor local…' });
      const { default: Tesseract } = await import(OCR_MODULE);
      worker = await Tesseract.createWorker('eng', 1, { workerPath: OCR_WORKER, corePath: OCR_CORE, langPath: OCR_LANG, gzip: true });
      templates = await createPromotionMatcher();
    }
    for (let index = 0; index < list.length; index++) {
      const file = list[index];
      if (index >= MAX_FILES) { results[index] = errorResult(file, `Limite de ${MAX_FILES} imagens por lote.`); continue; }
      if (!file || !file.type?.startsWith('image/')) { results[index] = errorResult(file, 'O arquivo não é uma imagem.'); continue; }
      if (file.size > MAX_BYTES) { results[index] = errorResult(file, 'A imagem excede o limite de 15 MB.'); continue; }
      onProgress?.({ index, total: Math.min(list.length, MAX_FILES), message: `Lendo ${file.name || `imagem ${index + 1}`}…` });
      let image;
      try {
        image = await loadImage(file);
        const sw = image.width || image.naturalWidth, sh = image.height || image.naturalHeight;
        if (!sw || !sh) throw new Error('A imagem não possui dimensões válidas.');
        const scale = Math.min(1, 2048 / Math.max(sw, sh), Math.sqrt(4_000_000 / (sw * sh)));
        const canvas = canvasFor(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const panel = locateMemberPanel(pixels);
        if (!panel) { results[index] = errorResult(file, 'Não encontrei o painel de perfil. Use uma captura completa e nítida.'); continue; }
        const recognized = await recognizePanel(worker, canvas, panel);
        const warnings = [];
        const matched = chooseMemberMatch(recognized.rawName, recognized.nickConfidence, members);
        if (matched.uncertain || !recognized.rawName) warnings.push('Nickname incerto; confira antes de associar um membro.');
        else if (matched.ambiguous) warnings.push('Há mais de um membro com esse nickname; confira a associação.');
        else if (!matched.member) warnings.push('Nickname não encontrado na lista de membros; confira a associação.');
        if (recognized.stage === null) warnings.push('Não consegui ler o estágio; confira o valor.');
        const icon = templates(pixels, panel);
        if (!icon) warnings.push('Promoção incerta; confira o emblema.');
        results[index] = {
          fileName: file.name ?? '', nickname: matched.member?.nickname ?? recognized.rawName,
          memberId: matched.member?.id ?? null, stage: recognized.stage,
          promotion: icon?.id ?? null, warnings,
        };
      } catch (error) {
        results[index] = errorResult(file, error?.message || 'Não foi possível ler a imagem.');
      } finally {
        image?.close?.();
      }
    }
  } catch (error) {
    const message = error?.message || 'O reconhecedor local não pôde ser iniciado.';
    for (let index = 0; index < list.length; index++) results[index] ??= errorResult(list[index], message);
  } finally {
    await worker?.terminate();
  }
  return results;
}

export const memberReaderInternals = { normalizeNickname, rowRuns, locateMemberPanel, matchMember, chooseMemberMatch };
