const RECIPE_TYPES = new Set(["Entrada", "Prato Principal", "Sobremesa"]);

function fail(message) {
  throw new Error(message);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalize(value) {
  return String(value ?? "").trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function prepareRecipes(recipes, units) {
  if (!Array.isArray(recipes)) fail("A lista de receitas deve ser um array.");
  if (!units || typeof units !== "object" || Array.isArray(units)) fail("As unidades dos ingredientes devem ser um objeto.");

  for (const [ingredient, amount] of Object.entries(units)) {
    if (!ingredient.trim() || !isPositiveSafeInteger(amount)) fail(`Unidade inválida para o ingrediente \"${ingredient}\".`);
  }

  const ids = new Set();
  return recipes.map((recipe, index) => {
    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) fail(`Receita inválida na posição ${index + 1}.`);
    const { id, nome, raridade, tipo, ingredientes } = recipe;
    if (!isPositiveSafeInteger(id)) fail(`ID inválido na receita ${index + 1}.`);
    if (ids.has(id)) fail(`ID de receita duplicado: ${id}.`);
    ids.add(id);
    if (typeof nome !== "string" || !nome.trim()) fail(`Nome inválido na receita ${id}.`);
    if (typeof raridade !== "string" || !raridade.trim()) fail(`Raridade inválida na receita ${id}.`);
    if (!RECIPE_TYPES.has(tipo)) fail(`Tipo inválido na receita ${id}.`);
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) fail(`Ingredientes inválidos na receita ${id}.`);

    const counts = new Map();
    for (const ingredient of ingredientes) {
      if (typeof ingredient !== "string" || !Object.hasOwn(units, ingredient)) fail(`Ingrediente desconhecido na receita ${id}: ${String(ingredient)}.`);
      counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
    }
    const requirements = {};
    for (const [ingredient, count] of counts) {
      const amount = count * units[ingredient];
      if (!Number.isSafeInteger(amount)) fail(`Custo inválido para ${ingredient} na receita ${id}.`);
      requirements[ingredient] = amount;
    }
    if (recipe.porcentagem !== undefined && (typeof recipe.porcentagem !== "number" || !Number.isFinite(recipe.porcentagem) || recipe.porcentagem < 0)) fail(`Porcentagem inválida na receita ${id}.`);
    if (recipe.emblema_do_heroi !== undefined && (!Number.isSafeInteger(recipe.emblema_do_heroi) || recipe.emblema_do_heroi < 0)) fail(`Emblema inválido na receita ${id}.`);
    return { ...recipe, requirements };
  });
}

export function calculateRecipe(preparedRecipe, stock) {
  if (!preparedRecipe || typeof preparedRecipe !== "object" || !preparedRecipe.requirements || typeof preparedRecipe.requirements !== "object") fail("Receita preparada inválida.");
  if (!stock || typeof stock !== "object" || Array.isArray(stock)) fail("O estoque deve ser um objeto.");
  for (const [ingredient, available] of Object.entries(stock)) {
    if (!Number.isSafeInteger(available) || available < 0) fail(`Quantidade inválida no estoque para ${ingredient}.`);
  }
  const missing = Object.entries(preparedRecipe.requirements).map(([ingredient, required]) => {
    const available = stock[ingredient] ?? 0;
    return { ingredient, required, available, missing: Math.max(0, required - available) };
  }).filter((item) => item.missing > 0);
  const maxPortions = Object.entries(preparedRecipe.requirements).reduce((maximum, [ingredient, required]) => {
    return Math.min(maximum, Math.floor((stock[ingredient] ?? 0) / required));
  }, Number.MAX_SAFE_INTEGER);
  return { maxPortions, missing };
}

export function filterRecipes(preparedRecipes, { query = "", ingredient = "", ingredients = [], type = "", rarity = "" } = {}) {
  if (!Array.isArray(preparedRecipes)) fail("A lista de receitas deve ser um array.");
  const normalizedQuery = normalize(query);
  const selectedIngredients = [...new Set([ingredient, ...ingredients].filter(Boolean))];
  return preparedRecipes.filter((recipe) => {
    const hasIngredients = selectedIngredients.every((item) => recipe.ingredientes.includes(item));
    const matchesText = !normalizedQuery || normalize(recipe.nome).includes(normalizedQuery) || recipe.ingredientes.some((item) => normalize(item).includes(normalizedQuery));
    return matchesText && hasIngredients && (!type || recipe.tipo === type) && (!rarity || recipe.raridade === rarity);
  });
}
