import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/trade-engine.js", import.meta.url), "utf8");
const { calculateRecipeWithTrades } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const recipe = (requirements) => ({ requirements });

test("buys only the shortages and preserves the input snapshot", () => {
  const stock = { Leite: 273, Carne: 32 };
  const offers = [
    { ingredient: "Camarão", quantity: 2, costIngredient: "Leite", cost: 50, remaining: 10 },
    { ingredient: "Arroz", quantity: 3, costIngredient: "Carne", cost: 10, remaining: 10 },
  ];
  const beforeStock = structuredClone(stock);
  const beforeOffers = structuredClone(offers);
  const result = calculateRecipeWithTrades(recipe({ Leite: 10, Carne: 2, Camarão: 2, Arroz: 3 }), stock, offers);
  assert.equal(result.maxPortions, 2);
  assert.deepEqual(result.purchases, [
    { ingredient: "Camarão", count: 2, quantity: 4, costIngredient: "Leite", totalCost: 100 },
    { ingredient: "Arroz", count: 2, quantity: 6, costIngredient: "Carne", totalCost: 20 },
  ]);
  assert.deepEqual(stock, beforeStock);
  assert.deepEqual(offers, beforeOffers);
});

test("aggregates costs in a shared currency and reserves recipe consumption", () => {
  const offers = [
    { ingredient: "A", quantity: 1, costIngredient: "Coin", cost: 6, remaining: 10 },
    { ingredient: "B", quantity: 1, costIngredient: "Coin", cost: 5, remaining: 10 },
  ];
  assert.equal(calculateRecipeWithTrades(recipe({ A: 1, B: 1 }), { Coin: 10 }, offers).maxPortions, 0);
  const result = calculateRecipeWithTrades(recipe({ A: 1, Coin: 1 }), { Coin: 6 }, [offers[0]]);
  assert.equal(result.maxPortions, 0);
  assert.deepEqual(result.purchases, []);
});

test("uses recipe inventory unit yields for the confirmed shop trades", () => {
  const offers = [
    { ingredient: "Camarão", quantity: 10, costIngredient: "Leite", cost: 50, remaining: 10 },
    { ingredient: "Arroz", quantity: 10, costIngredient: "Carne", cost: 10, remaining: 10 },
  ];
  const stock = { Leite: 273, Carne: 32 };
  const result = calculateRecipeWithTrades(recipe({ Camarão: 10, Arroz: 10 }), stock, offers);
  assert.equal(result.maxPortions, 3);
  assert.deepEqual(result.purchases, [
    { ingredient: "Camarão", count: 3, quantity: 30, costIngredient: "Leite", totalCost: 150 },
    { ingredient: "Arroz", count: 3, quantity: 30, costIngredient: "Carne", totalCost: 30 },
  ]);
  assert.equal(calculateRecipeWithTrades(recipe({ Camarão: 10, Arroz: 10, Leite: 50 }), stock, offers).maxPortions, 2);
});

test("respects stock, exhausted and zero-limit offers, and optimizes large bounds logarithmically", () => {
  const offer = { ingredient: "Fish", quantity: 4, costIngredient: "Coin", cost: 1, remaining: 3 };
  assert.equal(calculateRecipeWithTrades(recipe({ Fish: 2 }), { Fish: 2 }, [offer]).maxPortions, 1);
  assert.equal(calculateRecipeWithTrades(recipe({ Fish: 1 }), { Coin: 0 }, [{ ...offer, remaining: 0 }]).maxPortions, 0);
  const huge = calculateRecipeWithTrades(recipe({ Fish: 1 }), { Coin: 3 }, [{ ...offer, remaining: Number.MAX_SAFE_INTEGER }]);
  assert.equal(huge.maxPortions, 12);
});

test("rejects invalid, duplicate, and chained offers", () => {
  const prepared = recipe({ A: 1 });
  assert.throws(() => calculateRecipeWithTrades(prepared, {}, [{ ingredient: "A", quantity: 0, costIngredient: "Coin", cost: 1, remaining: 1 }]), /Oferta/);
  assert.throws(() => calculateRecipeWithTrades(prepared, {}, [
    { ingredient: "A", quantity: 1, costIngredient: "Coin", cost: 1, remaining: 1 },
    { ingredient: "A", quantity: 1, costIngredient: "Coin", cost: 1, remaining: 1 },
  ]), /duplicada/);
  assert.throws(() => calculateRecipeWithTrades(prepared, {}, [
    { ingredient: "A", quantity: 1, costIngredient: "B", cost: 1, remaining: 1 },
    { ingredient: "B", quantity: 1, costIngredient: "Coin", cost: 1, remaining: 1 },
  ]), /encadeadas/);
  assert.throws(() => calculateRecipeWithTrades(recipe({}), {}, []), /ingredientes/);
});

test("rejects purchases whose resulting inventory would exceed safe integers", () => {
  const limit = Number.MAX_SAFE_INTEGER;
  const result = calculateRecipeWithTrades(recipe({ Fish: limit }), { Fish: limit - 1, Coin: 1 }, [
    { ingredient: "Fish", quantity: 2, costIngredient: "Coin", cost: 1, remaining: 1 },
  ]);
  assert.equal(result.maxPortions, 0);
  assert.deepEqual(result.purchases, []);
});
