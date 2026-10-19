import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/recipe-engine.js", import.meta.url), "utf8");
const { prepareRecipes, calculateRecipe, filterRecipes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const recipe = (ingredients = ["Ovo", "Ovo", "Trigo", "Trigo"]) => ({
  id: 1, tipo: "Entrada", raridade: "Comum", nome: "Sanduíche de Ovo", ingredientes: ingredients,
  tipo_efeito: "Exploração", porcentagem: 0.01, emblema_do_heroi: 500,
});
const units = { Ovo: 1, Trigo: 100, "Batata": 10, Alface: 20 };

test("prepares repeated ingredients as summed raw inventory units", () => {
  const [prepared] = prepareRecipes([recipe()], units);
  assert.deepEqual(prepared.requirements, { Ovo: 2, Trigo: 200 });
  assert.equal(prepared.nome, "Sanduíche de Ovo");
});

test("calculates exact thresholds, shortages, and multiple portions", () => {
  const [prepared] = prepareRecipes([recipe()], units);
  assert.deepEqual(calculateRecipe(prepared, { Ovo: 2, Trigo: 199 }), {
    maxPortions: 0,
    missing: [{ ingredient: "Trigo", required: 200, available: 199, missing: 1 }],
  });
  assert.deepEqual(calculateRecipe(prepared, { Ovo: 6, Trigo: 600 }), { maxPortions: 3, missing: [] });
  assert.equal(calculateRecipe(prepared, {}).maxPortions, 0);
});

test("stock is not mutated and each recipe is calculated independently", () => {
  const prepared = prepareRecipes([recipe(), { ...recipe(["Batata", "Alface"]), id: 2, nome: "Salada" }], units);
  const stock = { Ovo: 4, Trigo: 400, Batata: 20, Alface: 40 };
  const original = structuredClone(stock);
  assert.equal(calculateRecipe(prepared[0], stock).maxPortions, 2);
  assert.equal(calculateRecipe(prepared[1], stock).maxPortions, 2);
  assert.deepEqual(stock, original);
});

test("rejects invalid recipes, units, costs, and stock values", () => {
  assert.throws(() => prepareRecipes([recipe()], { Ovo: 0, Trigo: 100 }), /Unidade inválida/);
  assert.throws(() => prepareRecipes([recipe(["Desconhecido"])], units), /Ingrediente desconhecido/);
  assert.throws(() => prepareRecipes([recipe(), recipe()], units), /duplicado/);
  assert.throws(() => prepareRecipes([{ ...recipe(), tipo: "Lanche" }], units), /Tipo inválido/);
  assert.throws(() => prepareRecipes([recipe(["Ovo", "Ovo"])], { Ovo: Number.MAX_SAFE_INTEGER }), /Custo inválido/);
  const [prepared] = prepareRecipes([recipe()], units);
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.throws(() => calculateRecipe(prepared, { Ovo: invalid }), /Quantidade inválida/);
  }
});

test("filters by accent-insensitive recipe and ingredient text, then exact facets", () => {
  const recipes = prepareRecipes([
    recipe(),
    { ...recipe(["Batata", "Alface"]), id: 2, tipo: "Prato Principal", raridade: "Excelente", nome: "Salada de Batata" },
  ], units);
  assert.deepEqual(filterRecipes(recipes, { query: "sanduiche" }).map((item) => item.id), [1]);
  assert.deepEqual(filterRecipes(recipes, { query: "batata" }).map((item) => item.id), [2]);
  assert.deepEqual(filterRecipes(recipes, { ingredient: "Ovo" }).map((item) => item.id), [1]);
  assert.deepEqual(filterRecipes(recipes, { ingredients: ["Ovo", "Trigo"] }).map((item) => item.id), [1]);
  assert.deepEqual(filterRecipes(recipes, { ingredients: ["Ovo", "Batata"] }), []);
  assert.equal(filterRecipes(recipes, { ingredients: [] }).length, 2);
  assert.deepEqual(filterRecipes(recipes, { type: "Prato Principal", rarity: "Excelente" }).map((item) => item.id), [2]);
});

test("prepares the supplied 63 recipe inventory", async () => {
  const dataRoot = new URL("../data/", import.meta.url);
  const [unitText, recipeText] = await Promise.all([
    readFile(new URL("ingredientes.json", dataRoot), "utf8"),
    readFile(new URL("receitas.json", dataRoot), "utf8"),
  ]);
  const prepared = prepareRecipes(JSON.parse(recipeText), JSON.parse(unitText));
  assert.equal(prepared.length, 63);
  assert.equal(prepared[0].requirements.Ovo, 2);
  assert.equal(prepared[0].requirements.Trigo, 200);
});
