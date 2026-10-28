import { prepareRecipes, calculateRecipe, filterRecipes } from './recipe-engine.js';

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const ingredientGroups = [
  { title: 'Regulares', names: ['Ovo', 'Trigo', 'Alface', 'Carne', 'Leite'] },
  { title: 'Ingredientes de chef', names: ['Batata', 'Tomate', 'Camarão', 'Arroz', 'Amendoim', 'Milho', 'Morango', 'Cana-de-açúcar'] },
  { title: 'Especiais', names: ['Manjericão', 'Cacau', 'Caviar', 'Queijo', 'Pimenta', 'Favo de mel', 'Trufa', 'Atum'] }
];
let recipes = [];
const filters = { ingredients: new Set(), type: '', rarity: '', day: '', possibleOnly: false };
const categoryOrder = ['Entrada', 'Prato Principal', 'Sobremesa'];
let printRequest = 0;

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function assetImage(path, alt = '', className = '') {
  const image = node('img', undefined, className);
  image.src = `./assets/${path}`; image.alt = alt;
  image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('error', () => { image.hidden = true; }, { once: true });
  return image;
}
function ingredientImage(name, decorative = true) {
  return assetImage(`ingredients/${encodeURIComponent(name)}.png`, decorative ? '' : name);
}
function pressed(button, active) {
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('active', active);
}
function addPill(container, text, value, facet, imagePath) {
  const button = node('button', undefined, 'filter-pill');
  button.type = 'button'; button.dataset.facet = facet; button.dataset.value = value;
  button.setAttribute('aria-label', text);
  if (imagePath) button.append(assetImage(imagePath));
  button.append(node('span', text));
  pressed(button, filters[facet] === value);
  $(container).append(button);
}
function readStock() {
  const stock = {};
  const errors = [];
  let hasStock = false;
  for (const input of document.querySelectorAll('[data-ingredient]')) {
    const text = input.value.trim();
    if (text !== '') hasStock = true;
    const valid = input.validity.valid && (text === '' || /^\d+$/.test(text) && Number.isSafeInteger(Number(text)));
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) errors.push(`${input.dataset.ingredient}: informe uma quantidade inteira, não negativa e sem separadores.`);
    else stock[input.dataset.ingredient] = text === '' ? 0 : Number(text);
  }
  return { stock, errors, hasStock };
}
function recipeCard(recipe, availability, hasStock) {
  const card = node('article', undefined, 'panel dish-card');
  const visual = node('div', undefined, 'dish-visual');
  visual.append(assetImage(`recipes/recipe-${recipe.id}.png`, recipe.nome, 'dish-image'));
  const identity = node('div');
  identity.append(node('p', recipe.raridade, 'dish-rarity'), node('h3', recipe.nome));
  visual.append(identity); card.append(visual);
  if (hasStock) card.append(node('p', availability.maxPortions ? `Até ${number(availability.maxPortions)} preparo(s)` : 'Faltam ingredientes', `dish-availability${availability.maxPortions ? '' : ' unavailable'}`));
  const icons = node('div', undefined, 'dish-ingredient-icons');
  for (const [ingredient, quantity] of Object.entries(recipe.requirements)) {
    const chip = node('span', undefined, 'ingredient-chip');
    chip.title = `${ingredient}: ${number(quantity)} itens para 1 preparo`;
    chip.append(ingredientImage(ingredient, false), node('span', `× ${number(quantity)}`)); icons.append(chip);
  }
  card.append(icons);
  const details = node('details', undefined, 'dish-details');
  details.append(node('summary', 'Ingredientes e efeitos'), node('h4', 'Ingredientes para 1 preparo'));
  const costs = node('ul', undefined, 'dish-costs');
  for (const [ingredient, quantity] of Object.entries(recipe.requirements)) {
    const item = node('li'); item.append(node('span', ingredient), node('strong', `× ${number(quantity)}`)); costs.append(item);
  }
  details.append(costs);
  if (hasStock && availability.missing.length) details.append(node('p', `Para 1 preparo, faltam: ${availability.missing.map((item) => `${number(item.missing)} ${item.ingredient}`).join(' · ')}.`, 'dish-missing'));
  if (recipe.tipo_efeito) details.append(node('p', `${recipe.tipo_efeito}${recipe.porcentagem ? `: +${number(recipe.porcentagem * 100)}%` : ''}`, 'dish-effect'));
  if (recipe.emblema_do_heroi !== undefined) details.append(node('p', `Emblema do herói: ${number(recipe.emblema_do_heroi)}`, 'dish-emblems'));
  card.append(details);
  return card;
}
function render() {
  const priority = filters.type || filters.day;
  const groups = [...document.querySelectorAll('.recipe-group')];
  groups.sort((a, b) => Number(b.dataset.type === priority) - Number(a.dataset.type === priority) || categoryOrder.indexOf(a.dataset.type) - categoryOrder.indexOf(b.dataset.type));
  const groupContainer = $('#recipe-groups');
  if (groups.some((group, index) => groupContainer.children[index] !== group)) groupContainer.append(...groups);
  const { stock, errors, hasStock } = readStock();
  const errorBox = $('#stock-errors'); errorBox.replaceChildren(); errorBox.hidden = !errors.length;
  if (errors.length) {
    const list = node('ul'); errors.forEach((error) => list.append(node('li', error))); errorBox.append(list);
  }
  document.querySelectorAll('[data-filter-ingredient]').forEach((button) => pressed(button, filters.ingredients.has(button.dataset.filterIngredient)));
  document.querySelectorAll('[data-facet]').forEach((button) => pressed(button, filters[button.dataset.facet] === button.dataset.value));
  pressed($('#possible-only'), filters.possibleOnly);
  const filtered = filterRecipes(recipes, { query: $('#recipe-search').value, ingredients: [...filters.ingredients], type: filters.type, rarity: filters.rarity });
  const options = errors.length ? [] : filtered.map((recipe) => ({ recipe, availability: calculateRecipe(recipe, stock) }));
  const visible = filters.possibleOnly ? options.filter((option) => option.availability.maxPortions > 0) : options;
  for (const group of document.querySelectorAll('.recipe-group')) {
    const isSuggested = group.dataset.type === filters.day;
    group.classList.toggle('suggested', isSuggested);
    group.querySelector('.suggestion-label').hidden = !isSuggested;
    const dishes = visible.filter((option) => option.recipe.tipo === group.dataset.type);
    group.querySelector('.recipe-count').textContent = `${dishes.length} receita(s)`;
    const grid = group.querySelector('.recipe-grid'); grid.replaceChildren();
    dishes.forEach(({ recipe, availability }) => grid.append(recipeCard(recipe, availability, hasStock)));
    if (!dishes.length) {
      const message = errors.length ? 'Corrija as quantidades no estoque para consultar os pratos.' : filters.type && filters.type !== group.dataset.type ? 'Outra categoria está selecionada no filtro de tipo.' : filters.possibleOnly ? 'Nenhum prato disponível com este estoque e estes filtros. Abra “Calcular com meu estoque” ou desative o filtro de pratos disponíveis.' : 'Nenhuma receita contém todos os ingredientes e filtros selecionados.';
      grid.append(node('p', message, 'recipe-empty'));
    }
  }
  $('#recipe-status').textContent = errors.length ? 'Confira as quantidades destacadas no estoque.' : `${visible.length} receita(s) exibida(s) · ${recipes.length} no catálogo.${hasStock ? ' Cada prato é calculado separadamente.' : ''}`;
}
function discardPrint(message = 'Leitura descartada. Seu estoque foi mantido.') {
  printRequest++;
  $('#stock-print-preview').hidden = true;
  $('#stock-print-items').replaceChildren();
  $('#stock-print').value = '';
  $('#cancel-print').hidden = true;
  $('#stock-print-status').textContent = message;
}
function configurePrintImport(units) {
  $('#stock-print').addEventListener('change', async (event) => {
    const request = ++printRequest;
    $('#stock-print-preview').hidden = true;
    $('#stock-print-items').replaceChildren();
    const file = event.target.files[0];
    $('#cancel-print').hidden = !file;
    if (!file) return;
    const status = $('#stock-print-status');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      status.textContent = 'Escolha uma imagem PNG, JPG ou WebP de até 15 MB.';
      return;
    }
    status.textContent = 'Preparando leitura do print…';
    event.target.disabled = true;
    try {
      const { readStockImage } = await import('./stock-reader.js');
      if (request !== printRequest) return;
      const result = await readStockImage(file, { onProgress: (message) => {
        if (request === printRequest) status.textContent = String(message);
      } });
      if (request !== printRequest) return;
      const seen = new Set();
      const items = result.items.filter((item) => {
        if (!Object.hasOwn(units, item.ingredient) || seen.has(item.ingredient) || !Number.isSafeInteger(item.quantity) || item.quantity < 0) return false;
        seen.add(item.ingredient); return true;
      });
      for (const item of items) {
        const row = node('div', undefined, 'stock-print-row');
        const label = node('label');
        const use = node('input'); use.type = 'checkbox'; use.checked = true;
        use.setAttribute('aria-label', `Usar ${item.ingredient}`);
        label.append(use, ingredientImage(item.ingredient), node('span', item.ingredient));
        const quantity = node('input'); quantity.type = 'number'; quantity.min = '0'; quantity.step = '1'; quantity.max = String(Number.MAX_SAFE_INTEGER); quantity.inputMode = 'numeric'; quantity.value = String(item.quantity); quantity.dataset.printIngredient = item.ingredient;
        quantity.setAttribute('aria-label', `Quantidade reconhecida de ${item.ingredient}`);
        row.append(label, quantity); $('#stock-print-items').append(row);
      }
      $('#stock-print-preview').hidden = !items.length;
      const warnings = (result.warnings || []).join(' ');
      status.textContent = items.length ? `${items.length} ingrediente(s) reconhecido(s). Confira os ícones e números antes de aplicar. ${warnings}` : `Nenhum estoque reconhecido com segurança. Use a tela de ingredientes com números como 348/100, ou preencha manualmente. ${warnings}`;
    } catch (error) {
      if (request === printRequest) status.textContent = `Não foi possível ler o print. ${error.message} Seu estoque foi mantido; você pode preencher manualmente.`;
    } finally {
      event.target.disabled = false;
    }
  });
  $('#cancel-print').addEventListener('click', () => discardPrint());
  $('#apply-print').addEventListener('click', () => {
    const selected = [...$('#stock-print-items').children].filter((row) => row.querySelector('[type="checkbox"]').checked);
    let valid = true;
    for (const row of selected) {
      const input = row.querySelector('[data-print-ingredient]');
      const okay = /^\d+$/.test(input.value) && input.validity.valid && Number.isSafeInteger(Number(input.value));
      input.setAttribute('aria-invalid', String(!okay));
      if (!okay) valid = false;
    }
    if (!valid || !selected.length) {
      $('#stock-print-status').textContent = !valid ? 'Corrija as quantidades destacadas: use inteiros não negativos, sem separadores.' : 'Marque pelo menos um ingrediente para aplicar.';
      return;
    }
    for (const row of selected) {
      const source = row.querySelector('[data-print-ingredient]');
      const target = [...document.querySelectorAll('[data-ingredient]')].find((input) => input.dataset.ingredient === source.dataset.printIngredient);
      if (target) target.value = source.value;
    }
    discardPrint(`${selected.length} ingrediente(s) aplicado(s). Itens não selecionados e ausentes no print foram mantidos.`);
    render();
  });
}
function configureControls(units) {
  const names = Object.keys(units);
  const groups = [...ingredientGroups];
  const known = new Set(groups.flatMap((group) => group.names));
  const extra = names.filter((name) => !known.has(name));
  if (extra.length) groups.push({ title: 'Outros', names: extra });
  for (const group of groups) {
    const section = node('section', undefined, 'ingredient-filter-group');
    section.append(node('h3', group.title));
    const buttons = node('div', undefined, 'ingredient-buttons');
    for (const ingredient of group.names.filter((name) => Object.hasOwn(units, name))) {
      const button = node('button', undefined, 'ingredient-toggle');
      button.type = 'button'; button.dataset.filterIngredient = ingredient; pressed(button, false);
      button.setAttribute('aria-label', ingredient);
      button.append(ingredientImage(ingredient), node('span', ingredient)); buttons.append(button);
    }
    section.append(buttons); $('#ingredient-filters').append(section);
  }
  names.sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((ingredient, index) => {
    const label = node('label'); label.append(ingredientImage(ingredient), node('span', ingredient));
    const input = node('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.inputMode = 'numeric'; input.placeholder = '0'; input.dataset.ingredient = ingredient; input.id = `ingredient-${index}`; input.setAttribute('aria-label', `Quantidade de ${ingredient}`);
    const help = node('small', `Consumo-base: ${number(units[ingredient])} item(ns)`); help.id = `unit-${index}`; input.setAttribute('aria-describedby', help.id);
    label.append(input, help); $('#stock-inputs').append(label);
  });
  addPill('#type-filters', 'Todos os tipos', '', 'type');
  for (const [type, title] of [['Entrada', 'Aperitivos'], ['Prato Principal', 'Pratos principais'], ['Sobremesa', 'Sobremesas']]) {
    const example = recipes.find((recipe) => recipe.tipo === type);
    addPill('#type-filters', title, type, 'type', example ? `recipes/recipe-${example.id}.png` : undefined);
  }
  addPill('#rarity-filters', 'Todas as raridades', '', 'rarity');
  [...new Set(recipes.map((recipe) => recipe.raridade))].forEach((rarity) => addPill('#rarity-filters', rarity, rarity, 'rarity'));
  for (const [value, label] of [['', 'Sem destaque'], ['Entrada', 'Terça · Aperitivos'], ['Prato Principal', 'Quarta · Pratos principais'], ['Sobremesa', 'Quinta · Sobremesas']]) addPill('#day-filters', label, value, 'day');
  $('#recipe-tools').addEventListener('click', (event) => {
    const ingredient = event.target.closest('button[data-filter-ingredient]');
    const facet = event.target.closest('button[data-facet]');
    if (ingredient) {
      const name = ingredient.dataset.filterIngredient;
      if (filters.ingredients.has(name)) filters.ingredients.delete(name); else filters.ingredients.add(name);
      render();
    } else if (facet) {
      const name = facet.dataset.facet;
      filters[name] = filters[name] === facet.dataset.value ? '' : facet.dataset.value;
      render();
    }
  });
  $('#recipe-search').addEventListener('input', render);
  $('#stock-inputs').addEventListener('input', render);
  $('#clear-stock').addEventListener('click', () => { discardPrint('Estoque limpo.'); document.querySelectorAll('[data-ingredient]').forEach((input) => { input.value = ''; }); render(); });
  $('#clear-filters').addEventListener('click', () => {
    filters.ingredients.clear(); filters.type = ''; filters.rarity = ''; filters.day = ''; filters.possibleOnly = false;
    $('#recipe-search').value = ''; render();
  });
  $('#possible-only').addEventListener('click', () => {
    filters.possibleOnly = !filters.possibleOnly;
    if (filters.possibleOnly && !readStock().hasStock) {
      $('#pantry').open = true;
      $('#stock-inputs input').focus();
    }
    render();
  });
}
async function loadJSON(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path.split('/').at(-1)}.`);
  return response.json();
}
async function init() {
  try {
    const [rawRecipes, units] = await Promise.all([loadJSON('../data/receitas.json'), loadJSON('../data/ingredientes.json')]);
    recipes = prepareRecipes(rawRecipes, units);
    filters.day = { 2: 'Entrada', 3: 'Prato Principal', 4: 'Sobremesa' }[new Date().getDay()] || '';
    configureControls(units);
    configurePrintImport(units);
    $('#recipe-tools').hidden = false; render();
  } catch (error) { $('#recipe-status').textContent = `Não foi possível carregar a ferramenta. ${error.message}`; }
}
init();
