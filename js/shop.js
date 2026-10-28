import { calculateRecipeWithTrades } from './trade-engine.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, text) => {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
};

/** Review shop snapshots locally before exposing offers to the recipe calculator. */
export function configureShop(units, { onApply, onToggle }) {
  let request = 0;
  let offers = [];
  const names = Object.keys(units).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  function ingredientSelect(value, label) {
    const select = el('select'); select.setAttribute('aria-label', label);
    select.append(new Option('Selecione', ''));
    names.forEach((name) => select.append(new Option(name, name)));
    select.value = value || '';
    return select;
  }
  function numberInput(value, label, min) {
    const input = el('input'); input.type = 'number'; input.min = String(min); input.step = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.inputMode = 'numeric';
    input.value = value === undefined ? '' : String(value);
    input.setAttribute('aria-label', label); input.required = true;
    return input;
  }
  function field(label, input) {
    const container = el('label', label); container.append(input); return container;
  }
  function offerRow(offer = {}) {
    const row = el('div'); row.className = 'shop-offer-row';
    const chosen = el('input'); chosen.type = 'checkbox'; chosen.checked = true; chosen.setAttribute('aria-label', 'Usar oferta');
    const use = field('Usar esta oferta', chosen); use.className = 'shop-use';
    const product = ingredientSelect(offer.ingredient, 'Produto recebido'); product.dataset.offer = 'ingredient';
    const currency = ingredientSelect(offer.costIngredient, 'Ingrediente para pagamento'); currency.dataset.offer = 'costIngredient';
    const cost = numberInput(offer.cost, 'Custo por troca', 1); cost.dataset.offer = 'cost';
    const purchased = numberInput(offer.purchased ?? 0, 'Trocas usadas pela equipe', 0); purchased.dataset.offer = 'purchased';
    const limit = numberInput(offer.limit, 'Limite total de trocas', 0); limit.dataset.offer = 'limit';
    const yieldLabel = el('p'); yieldLabel.className = 'recipe-help';
    const updateYield = () => { yieldLabel.textContent = product.value ? `Recebe ${units[product.value]} ${product.value} por troca.` : 'Escolha o produto para conferir a quantidade recebida.'; };
    product.addEventListener('change', updateYield); updateYield();
    const remove = el('button', 'Remover oferta'); remove.type = 'button'; remove.className = 'button secondary'; remove.addEventListener('click', () => row.remove());
    row.append(use, field('Produto', product), field('Pagar com', currency), field('Custo por troca', cost), field('Já usadas pela equipe', purchased), field('Limite da equipe', limit), yieldLabel, remove);
    $('#shop-offer-items').append(row);
  }
  function stockRow(item) {
    const row = el('div'); row.className = 'stock-print-row';
    const label = el('label'); const check = el('input'); check.type = 'checkbox'; check.checked = true; check.setAttribute('aria-label', `Importar estoque de ${item.ingredient}`);
    const image = el('img'); image.src = `./assets/ingredients/${encodeURIComponent(item.ingredient)}.png`; image.alt = '';
    const input = numberInput(item.quantity, `Estoque da loja de ${item.ingredient}`, 0); input.dataset.shopIngredient = item.ingredient;
    label.append(check, image, el('span', item.ingredient)); row.append(label, input); $('#shop-stock-items').append(row);
  }
  function discard(message = 'Leitura da loja descartada. Estoque e ofertas anteriores foram mantidos.') {
    request++;
    $('#shop-preview').hidden = true; $('#cancel-shop').hidden = true;
    $('#shop-stock-items').replaceChildren(); $('#shop-offer-items').replaceChildren();
    $('#shop-print').value = ''; $('#shop-print-status').textContent = message;
  }
  function validInput(input) {
    const valid = input.tagName === 'SELECT' ? Boolean(input.value) : /^\d+$/.test(input.value) && input.validity.valid && Number.isSafeInteger(Number(input.value));
    input.setAttribute('aria-invalid', String(!valid)); return valid;
  }
  $('#shop-print').addEventListener('change', async (event) => {
    const token = ++request;
    $('#shop-preview').hidden = true;
    $('#shop-stock-items').replaceChildren(); $('#shop-offer-items').replaceChildren();
    const file = event.target.files[0]; if (!file) return;
    $('#cancel-shop').hidden = false;
    const status = $('#shop-print-status');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { status.textContent = 'Escolha uma imagem PNG, JPG ou WebP de até 15 MB.'; return; }
    status.textContent = 'Lendo estoque e ofertas da loja…';
    event.target.disabled = true; $('#stock-print').disabled = true;
    try {
      const { readShopImage } = await import('./shop-reader.js');
      if (token !== request) return;
      const result = await readShopImage(file, { onProgress: (message) => { if (token === request) status.textContent = String(message); } });
      if (token !== request) return;
      const seen = new Set();
      const items = (result.items || []).filter((item) => {
        if (!Object.hasOwn(units, item.ingredient) || seen.has(item.ingredient) || !Number.isSafeInteger(item.quantity) || item.quantity < 0) return false;
        seen.add(item.ingredient); return true;
      });
      items.forEach(stockRow);
      (result.offers || []).forEach(offerRow);
      $('#shop-preview').hidden = !items.length && !result.offers?.length;
      status.textContent = `${items.length} estoque(s) e ${result.offers?.length || 0} oferta(s) reconhecido(s). Confira antes de aplicar. ${(result.warnings || []).join(' ')}`;
    } catch (error) {
      if (token === request) status.textContent = `Não foi possível ler a loja. ${error.message} Você pode informar as ofertas manualmente.`;
    } finally { event.target.disabled = false; $('#stock-print').disabled = false; }
  });
  $('#cancel-shop').addEventListener('click', () => discard());
  $('#manual-shop').addEventListener('click', () => {
    discard('Edite as ofertas do mesmo terreno e confira os limites compartilhados antes de aplicar.');
    $('#shop-preview').hidden = false; $('#cancel-shop').hidden = false;
    if (offers.length) offers.forEach(offerRow); else offerRow();
  });
  $('#add-shop-offer').addEventListener('click', () => offerRow());
  $('#apply-shop').addEventListener('click', () => {
    let valid = true;
    const selectedStock = [...$('#shop-stock-items').children].filter((row) => row.querySelector('[type="checkbox"]').checked);
    const stock = selectedStock.map((row) => { const input = row.querySelector('[data-shop-ingredient]'); if (!validInput(input)) valid = false; return { ingredient: input.dataset.shopIngredient, quantity: Number(input.value) }; });
    const draft = [];
    for (const row of $('#shop-offer-items').children) {
      if (!row.querySelector('[type="checkbox"]').checked) continue;
      const inputs = [...row.querySelectorAll('[data-offer]')];
      inputs.forEach((input) => { if (!validInput(input)) valid = false; });
      const value = Object.fromEntries(inputs.map((input) => [input.dataset.offer, input.tagName === 'SELECT' ? input.value : Number(input.value)]));
      if (value.purchased > value.limit) { row.querySelector('[data-offer="purchased"]').setAttribute('aria-invalid', 'true'); valid = false; }
      draft.push({ ...value, quantity: units[value.ingredient], remaining: value.limit - value.purchased });
    }
    const status = $('#shop-print-status');
    if (!valid) { status.textContent = 'Corrija os campos destacados. Use inteiros não negativos, custo positivo e trocas usadas menores ou iguais ao limite.'; return; }
    if (!stock.length && !draft.length) { status.textContent = 'Marque pelo menos um estoque ou oferta para aplicar.'; return; }
    try { calculateRecipeWithTrades({ requirements: { [names[0]]: 1 } }, {}, draft); }
    catch (error) { status.textContent = error.message; return; }
    offers = draft;
    onApply({ items: stock, offers });
    $('#shop-summary').replaceChildren();
    for (const offer of offers) $('#shop-summary').append(el('p', `${offer.quantity} ${offer.ingredient} por ${offer.cost} ${offer.costIngredient} · até ${offer.remaining} troca(s) restantes para a equipe.`));
    $('#shop-summary').hidden = !offers.length;
    $('#simulate-shop').disabled = !offers.length;
    $('#clear-shop').hidden = !offers.length;
    $('#simulate-shop').setAttribute('aria-pressed', String(offers.length > 0));
    discard(`${stock.length} estoque(s) atualizado(s) e ${offers.length} oferta(s) confirmada(s). Produtos da loja não foram adicionados ao estoque real.`);
  });
  $('#simulate-shop').addEventListener('click', () => {
    const active = $('#simulate-shop').getAttribute('aria-pressed') !== 'true';
    $('#simulate-shop').setAttribute('aria-pressed', String(active)); onToggle(active);
  });
  $('#clear-shop').addEventListener('click', () => {
    discard('Ofertas removidas. O estoque real foi mantido.'); offers = [];
    $('#shop-summary').replaceChildren(); $('#shop-summary').hidden = true;
    $('#simulate-shop').disabled = true; $('#simulate-shop').setAttribute('aria-pressed', 'false'); $('#clear-shop').hidden = true;
    onApply({ items: [], offers: [] });
  });
}
