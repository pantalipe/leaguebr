import { prepareRecipes, calculateRecipe, filterRecipes } from './recipe-engine.js';

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
let recipes = [];
let ingredientUnits = {};

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function readStock() {
  const stock = {};
  const errors = [];
  for (const input of document.querySelectorAll('[data-ingredient]')) {
    const text = input.value.trim();
    const valid = input.validity.valid && (text === '' || /^\d+$/.test(text) && Number.isSafeInteger(Number(text)));
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) errors.push(`${input.dataset.ingredient}: informe uma quantidade inteira, não negativa e sem separadores.`);
    else stock[input.dataset.ingredient] = text === '' ? 0 : Number(text);
  }
  return { stock, errors };
}
function recipeCard(recipe, availability) {
  const card = node('article', undefined, 'panel dish-card');
  card.append(node('p', recipe.raridade, 'dish-rarity'), node('h3', recipe.nome));
  card.append(node('p', availability.maxPortions ? `Até ${number(availability.maxPortions)} preparo(s)` : 'Faltam ingredientes', `dish-availability${availability.maxPortions ? '' : ' unavailable'}`));
  card.append(node('h4', 'Ingredientes para 1 preparo'));
  const costs = node('ul', undefined, 'dish-costs');
  for (const [ingredient, quantity] of Object.entries(recipe.requirements)) {
    const item = node('li'); item.append(node('span', ingredient), node('strong', `× ${number(quantity)}`)); costs.append(item);
  }
  card.append(costs);
  if (availability.missing.length) card.append(node('p', `Para 1 preparo, faltam: ${availability.missing.map((item) => `${number(item.missing)} ${item.ingredient}`).join(' · ')}.`, 'dish-missing'));
  if (recipe.tipo_efeito) card.append(node('p', `${recipe.tipo_efeito}${recipe.porcentagem ? `: +${number(recipe.porcentagem * 100)}%` : ''}`, 'dish-effect'));
  if (recipe.emblema_do_heroi !== undefined) card.append(node('p', `Emblema do herói: ${number(recipe.emblema_do_heroi)}`, 'dish-emblems'));
  return card;
}
function render() {
  const { stock, errors } = readStock();
  const errorBox = $('#stock-errors'); errorBox.replaceChildren(); errorBox.hidden = !errors.length;
  if (errors.length) {
    const list = node('ul'); errors.forEach((error) => list.append(node('li', error))); errorBox.append(list);
  }
  const filtered = filterRecipes(recipes, { query: $('#recipe-search').value, ingredient: $('#ingredient-filter').value, type: $('#type-filter').value, rarity: $('#rarity-filter').value });
  const options = errors.length ? [] : filtered.map((recipe) => ({ recipe, availability: calculateRecipe(recipe, stock) }));
  const visible = $('#possible-only').checked ? options.filter((option) => option.availability.maxPortions > 0) : options;
  for (const group of document.querySelectorAll('.recipe-group')) {
    const isSuggested = group.dataset.type === $('#day-suggestion').value;
    group.classList.toggle('suggested', isSuggested);
    group.querySelector('.suggestion-label').hidden = !isSuggested;
    const dishes = visible.filter((option) => option.recipe.tipo === group.dataset.type);
    group.querySelector('.recipe-count').textContent = `${dishes.length} receita(s)`;
    const grid = group.querySelector('.recipe-grid'); grid.replaceChildren();
    dishes.forEach(({ recipe, availability }) => grid.append(recipeCard(recipe, availability)));
    if (!dishes.length) {
      const message = errors.length ? 'Corrija as quantidades para consultar os pratos.' : $('#type-filter').value && $('#type-filter').value !== group.dataset.type ? 'Outra categoria está selecionada no filtro de tipo.' : $('#possible-only').checked ? 'Nenhum prato disponível com este estoque e estes filtros. Informe os ingredientes acima ou desmarque “Mostrar só o que posso preparar” para consultar o catálogo.' : 'Nenhuma receita corresponde aos filtros nesta categoria.';
      grid.append(node('p', message, 'recipe-empty'));
    }
  }
  $('#recipe-status').textContent = errors.length ? 'Confira as quantidades destacadas no inventário.' : `${visible.length} receita(s) exibida(s) · ${recipes.length} no catálogo. Cada prato é calculado separadamente.`;
}
async function loadJSON(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path.split('/').at(-1)}.`);
  return response.json();
}
async function init() {
  try {
    const [rawRecipes, units] = await Promise.all([loadJSON('../data/receitas.json'), loadJSON('../data/ingredientes.json')]);
    ingredientUnits = units; recipes = prepareRecipes(rawRecipes, units);
    const names = Object.keys(units).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    names.forEach((ingredient, index) => {
      const label = node('label', ingredient);
      const input = node('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.inputMode = 'numeric'; input.placeholder = '0'; input.dataset.ingredient = ingredient; input.id = `ingredient-${index}`; input.setAttribute('aria-label', `Quantidade de ${ingredient}`);
      const help = node('small', `Consumo-base: ${number(ingredientUnits[ingredient])} item(ns)`); help.id = `unit-${index}`; input.setAttribute('aria-describedby', help.id);
      label.append(input, help); $('#stock-inputs').append(label);
      const option = node('option', ingredient); option.value = ingredient; $('#ingredient-filter').append(option);
    });
    [...new Set(recipes.map((recipe) => recipe.raridade))].forEach((rarity) => { const option = node('option', rarity); option.value = rarity; $('#rarity-filter').append(option); });
    const suggestion = { 2: 'Entrada', 3: 'Prato Principal', 4: 'Sobremesa' }[new Date().getDay()];
    if (suggestion) $('#day-suggestion').value = suggestion;
    $('#recipe-tools').hidden = false;
    $('#recipe-tools').addEventListener('input', render);
    $('#recipe-tools').addEventListener('change', render);
    $('#clear-stock').addEventListener('click', () => { document.querySelectorAll('[data-ingredient]').forEach((input) => { input.value = ''; }); render(); });
    render();
  } catch (error) { $('#recipe-status').textContent = `Não foi possível carregar a ferramenta. ${error.message}`; }
}
init();
