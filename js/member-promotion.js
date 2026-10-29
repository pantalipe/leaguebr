import { PROMOTIONS } from './promotions.js';

const TEMPLATE_SIZE = 48;
const CREST_X_FRACTIONS = [0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30];
const CREST_Y_FRACTIONS = [0.08, 0.09, 0.10, 0.11, 0.12];
const MIN_SCORE = 0.40;
const MIN_MARGIN = 0.035;

function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadTemplates() {
  return Promise.all(PROMOTIONS.map(async promotion => {
    const image = new Image();
    image.src = new URL(`../${promotion.image}`, import.meta.url).href;
    await image.decode();
    const canvas = canvasFor(TEMPLATE_SIZE, TEMPLATE_SIZE);
    const context = canvas.getContext('2d');
    const scale = Math.min((TEMPLATE_SIZE - 2) / image.naturalWidth, (TEMPLATE_SIZE - 2) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (TEMPLATE_SIZE - width) / 2, (TEMPLATE_SIZE - height) / 2, width, height);
    return { id: promotion.id, data: context.getImageData(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE).data };
  }));
}

/** Compare the icon's foreground color pattern, ignoring global brightness and background tint. */
function correlateIcon(target, cx, cy, size, template) {
  const { data, width, height } = target;
  const values = [[], [], []], reference = [[], [], []];
  for (let y = 2; y < TEMPLATE_SIZE - 2; y += 2) {
    for (let x = 2; x < TEMPLATE_SIZE - 2; x += 2) {
      const templateIndex = (y * TEMPLATE_SIZE + x) * 4;
      const alpha = template.data[templateIndex + 3] / 255;
      if (alpha < 0.4) continue;
      const sourceX = Math.round(cx + (x / (TEMPLATE_SIZE - 1) - 0.5) * size);
      const sourceY = Math.round(cy + (y / (TEMPLATE_SIZE - 1) - 0.5) * size);
      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
      const sourceIndex = (sourceY * width + sourceX) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const background = [66, 48, 37][channel];
        values[channel].push(data[sourceIndex + channel]);
        reference[channel].push(template.data[templateIndex + channel] * alpha + background * (1 - alpha));
      }
    }
  }
  if (values[0].length < 30) return 0;
  let covariance = 0, valueVariance = 0, referenceVariance = 0;
  for (let channel = 0; channel < 3; channel++) {
    const valueMean = values[channel].reduce((sum, value) => sum + value, 0) / values[channel].length;
    const referenceMean = reference[channel].reduce((sum, value) => sum + value, 0) / reference[channel].length;
    for (let index = 0; index < values[channel].length; index++) {
      const valueDelta = values[channel][index] - valueMean;
      const referenceDelta = reference[channel][index] - referenceMean;
      covariance += valueDelta * referenceDelta;
      valueVariance += valueDelta * valueDelta;
      referenceVariance += referenceDelta * referenceDelta;
    }
  }
  const denominator = Math.sqrt(valueVariance * referenceVariance);
  return denominator ? Math.max(0, covariance / denominator) : 0;
}

function rankPromotions(target, panel, templates) {
  if (!target?.data || !target.width || !target.height || !panel?.width || !panel?.height) return null;
  const candidates = [];
  for (const template of templates) {
    let score = 0;
    for (const xFraction of CREST_X_FRACTIONS) {
      for (const yFraction of CREST_Y_FRACTIONS) {
        const cx = panel.left + panel.width * xFraction;
        const cy = panel.top + panel.height * yFraction;
        for (const sizeFraction of [0.16, 0.17, 0.18, 0.19]) {
          score = Math.max(score, correlateIcon(target, cx, cy, panel.width * sizeFraction, template));
        }
      }
    }
    candidates.push({ id: template.id, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const margin = best ? best.score - (candidates[1]?.score ?? 0) : 0;
  if (best && best.score >= MIN_SCORE && margin >= MIN_MARGIN) return { id: best.id, score: best.score, margin };
  return null;
}

export async function createPromotionMatcher() {
  const templates = await loadTemplates();
  return (target, panel) => rankPromotions(target, panel, templates);
}
