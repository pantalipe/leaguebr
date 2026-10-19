import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadModule(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const rankingUrl = `data:text/javascript;base64,${Buffer.from(await readFile(new URL("../js/ranking.js", import.meta.url))).toString("base64")}`;
const api = await loadModule("../js/update-ranking.js", [["\"./ranking.js\"", JSON.stringify(rankingUrl)]]);
const { parseRankingText, prepareUpdate } = api;
const source = [
  { id: "risk", nickname: "Risk", role: "Líder", portrait: "risk.png", extra: { keep: true }, history: [{ date: "2025-01-01", stage: 1000 }, { date: "2025-01-02", stage: 1050 }] },
  { id: "mat", nickname: "Matrella", history: [{ date: "2025-01-01", stage: 900 }] },
  { id: "lover", nickname: "LoverS", history: [{ date: "2025-01-02", stage: 500 }] },
];

test("parses common ranking forms, grouped thousands, headings and case-insensitive nicknames", () => {
  const result = parseRankingText("PÓDIO\n🥇 1º risk - 1.090\n4º Matrella - 994\nLoverS - 989 - empatado\nRisk: 1.090", source);
  assert.deepEqual(result, { entries: [{ id: "risk", stage: 1090 }, { id: "mat", stage: 994 }, { id: "lover", stage: 989 }], errors: [] });
});

test("reports malformed, unknown, ambiguous and conflicting lines", () => {
  const result = parseRankingText("Pódio\nNobody 10\nMatrella 1,2\nRisk 10\nRisk 11", source);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].stage, 10);
  assert.equal(result.errors.length, 3);
});

test("appends dates while preserving source metadata and independent member histories", () => {
  const original = structuredClone(source);
  const result = prepareUpdate(source, "2025-01-03", [{ id: "risk", stage: 1070 }, { id: "mat", stage: 920 }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.changes.map(({ delta }) => delta), [20, 20]);
  assert.deepEqual(result.members[0].history.at(-1), { date: "2025-01-03", stage: 1070 });
  assert.deepEqual(result.members[0].extra, { keep: true });
  assert.equal(result.members[0].portrait, "risk.png");
  assert.deepEqual(result.members[2], source[2]);
  assert.deepEqual(source, original);
});

test("replaces the last same-day row and retains earlier same-day records", () => {
  const roster = structuredClone(source);
  roster[0].history.push({ date: "2025-01-03", stage: 1060 }, { date: "2025-01-03", stage: 1080 });
  const result = prepareUpdate(roster, "2025-01-03", [{ id: "risk", stage: 1090 }]);
  assert.deepEqual(result.changes[0], { id: "risk", nickname: "Risk", previousStage: 1080, stage: 1090, delta: 10, sameDay: true });
  assert.deepEqual(result.members[0].history.slice(-2), [{ date: "2025-01-03", stage: 1060 }, { date: "2025-01-03", stage: 1090 }]);
});

test("validates atomically: dates, ids, duplicates and safe nonnegative integer stages", () => {
  for (const [date, entries] of [
    ["2025-02-30", [{ id: "risk", stage: 1 }]],
    ["2024-12-31", [{ id: "risk", stage: 1 }]],
    ["2025-01-01", [{ id: "mat", stage: 2 }, { id: "risk", stage: 1 }]],
    ["2025-01-03", [{ id: "nope", stage: 1 }]],
    ["2025-01-03", [{ id: "risk", stage: 1 }, { id: "risk", stage: 2 }]],
    ["2025-01-03", [{ id: "risk", stage: Number.MAX_SAFE_INTEGER + 1 }]],
    ["2025-01-03", []],
  ]) {
    const result = prepareUpdate(source, date, entries);
    assert.ok(result.errors.length, `${date} ${JSON.stringify(entries)}`);
    assert.deepEqual(result.members, source);
    assert.deepEqual(result.changes, []);
  }
});

test("multiple entries may be independently updated against their own history dates", () => {
  const result = prepareUpdate(source, "2025-01-03", [{ id: "lover", stage: 490 }, { id: "mat", stage: 950 }]);
  assert.deepEqual(result.changes.map(({ delta }) => delta), [-10, 50]);
});

test("handles WhatsApp headings, medals, ordinal variants and refuses empty or ambiguous lists", () => {
  const result = parseRankingText('*PÓDIO:*\n🥇 1º Risk - 1090\n*TABELA COMPLETA:*\n2. Matrella — 994\n3) LoverS: 989', source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.entries.length, 3);
  assert.ok(parseRankingText('PÓDIO:', source).errors.length);
  assert.ok(parseRankingText('Risk 1090', [...source, { id: 'other', nickname: 'RISK' }]).errors.length);
});
