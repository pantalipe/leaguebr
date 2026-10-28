function fail(message) {
  throw new Error(message);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validate(preparedRecipe, stock, offers) {
  if (!preparedRecipe || typeof preparedRecipe !== "object" || !preparedRecipe.requirements || typeof preparedRecipe.requirements !== "object" || Array.isArray(preparedRecipe.requirements)) fail("Receita preparada inválida.");
  if (Object.keys(preparedRecipe.requirements).length === 0) fail("A receita preparada deve ter ingredientes.");
  if (!stock || typeof stock !== "object" || Array.isArray(stock)) fail("O estoque deve ser um objeto.");
  if (!Array.isArray(offers)) fail("As ofertas devem ser um array.");
  for (const [ingredient, available] of Object.entries(stock)) {
    if (!Number.isSafeInteger(available) || available < 0) fail(`Quantidade inválida no estoque para ${ingredient}.`);
  }
  for (const [ingredient, required] of Object.entries(preparedRecipe.requirements)) {
    if (!ingredient.trim() || !isPositiveSafeInteger(required)) fail(`Requisito inválido para ${ingredient}.`);
  }
  const byProduct = new Map();
  for (const offer of offers) {
    if (!offer || typeof offer !== "object" || Array.isArray(offer) || typeof offer.ingredient !== "string" || !offer.ingredient.trim() || typeof offer.costIngredient !== "string" || !offer.costIngredient.trim() || !isPositiveSafeInteger(offer.quantity) || !isPositiveSafeInteger(offer.cost) || !Number.isSafeInteger(offer.remaining) || offer.remaining < 0) fail("Oferta de troca inválida.");
    if (byProduct.has(offer.ingredient)) fail(`Oferta duplicada para ${offer.ingredient}.`);
    byProduct.set(offer.ingredient, offer);
  }
  for (const offer of offers) {
    if (byProduct.has(offer.costIngredient)) fail("Trocas encadeadas não são aceitas.");
  }
  return byProduct;
}

function planFor(portions, requirements, stock, byProduct) {
  const purchases = [];
  let totalCostsByCurrency = new Map();
  for (const [ingredient, required] of Object.entries(requirements)) {
    const totalRequired = required * portions;
    if (!Number.isSafeInteger(totalRequired)) return null;
    const shortage = Math.max(0, totalRequired - (stock[ingredient] ?? 0));
    if (!shortage) continue;
    const offer = byProduct.get(ingredient);
    if (!offer) return null;
    const count = Math.ceil(shortage / offer.quantity);
    if (!Number.isSafeInteger(count) || count > offer.remaining) return null;
    const quantity = count * offer.quantity;
    const totalCost = count * offer.cost;
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(totalCost) || !Number.isSafeInteger((stock[ingredient] ?? 0) + quantity)) return null;
    purchases.push({ ingredient, count, quantity, costIngredient: offer.costIngredient, totalCost });
    totalCostsByCurrency.set(offer.costIngredient, (totalCostsByCurrency.get(offer.costIngredient) ?? 0) + totalCost);
    if (!Number.isSafeInteger(totalCostsByCurrency.get(offer.costIngredient))) return null;
  }
  for (const [currency, cost] of totalCostsByCurrency) {
    const required = requirements[currency] ? requirements[currency] * portions : 0;
    if (!Number.isSafeInteger(required) || cost + required > (stock[currency] ?? 0)) return null;
  }
  return purchases;
}

/** Calculate the maximum portions possible after buying ingredients from fixed shop offers.
 * Offers are independent swaps: each buys `quantity` units for `cost` units of `costIngredient`.
 * The supplied stock and offers are read only; this function never advances purchases or stock.
 */
export function calculateRecipeWithTrades(preparedRecipe, stock, offers) {
  const byProduct = validate(preparedRecipe, stock, offers);
  for (const offer of offers) {
    if (Object.hasOwn(preparedRecipe.requirements, offer.costIngredient) && byProduct.has(offer.costIngredient)) fail("Trocas encadeadas não são aceitas.");
  }
  let upper = Number.MAX_SAFE_INTEGER;
  for (const [ingredient, required] of Object.entries(preparedRecipe.requirements)) {
    let supply = stock[ingredient] ?? 0;
    const offer = byProduct.get(ingredient);
    if (offer) supply = Math.min(Number.MAX_SAFE_INTEGER, supply + Math.min(Number.MAX_SAFE_INTEGER - supply, offer.quantity * offer.remaining));
    upper = Math.min(upper, Math.floor(supply / required));
  }
  let low = 0;
  let high = upper;
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    if (planFor(middle, preparedRecipe.requirements, stock, byProduct)) low = middle;
    else high = middle - 1;
  }
  const purchases = planFor(low, preparedRecipe.requirements, stock, byProduct) ?? [];
  const effectiveStock = { ...stock };
  for (const purchase of purchases) effectiveStock[purchase.ingredient] = (effectiveStock[purchase.ingredient] ?? 0) + purchase.quantity;
  for (const purchase of purchases) effectiveStock[purchase.costIngredient] = (effectiveStock[purchase.costIngredient] ?? 0) - purchase.totalCost;
  const missing = Object.entries(preparedRecipe.requirements).map(([ingredient, required]) => {
    const available = effectiveStock[ingredient] ?? 0;
    return { ingredient, required, available, missing: Math.max(0, required - available) };
  }).filter((item) => item.missing > 0);
  return { maxPortions: low, missing, purchases };
}
