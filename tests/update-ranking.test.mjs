import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadModule(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const rankingUrl = `data:text/javascript;base64,${Buffer.from(await readFile(new URL("../js/ranking.js", import.meta.url))).toString("base64")}`;
const promotionsUrl = `data:text/javascript;base64,${Buffer.from(await readFile(new URL("../js/promotions.js", import.meta.url))).toString("base64")}`;
const api = await loadModule("../js/update-ranking.js", [["\"./ranking.js\"", JSON.stringify(rankingUrl)], ["\"./promotions.js\"", JSON.stringify(promotionsUrl)]]);
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

test('imports optional promotion names and IDs while retaining legacy lines', () => {
  const result = parseRankingText('*PÓDIO:*\n🥇 1º Risk - 1.090 - BLACK MYTHRIL\nMatrella | 994 | dark-nox\nLoverS: 989', source);
  assert.deepEqual(result, { entries: [
    { id: 'risk', stage: 1090, promotion: 'black-mithril' },
    { id: 'mat', stage: 994, promotion: 'dark-nox' },
    { id: 'lover', stage: 989 },
  ], errors: [] });
  assert.equal(parseRankingText('Risk - 1090 - warfrost', source).entries[0].promotion, 'winterfrost');
  assert.equal(parseRankingText('Risk - 1090 - Sem promoção', source).entries[0].promotion, null);
});

test('preserves nicknames containing hyphens and numbers with optional promotion', () => {
  const members = [{ id: 'numeric-name', nickname: 'Player-123' }];
  assert.deepEqual(parseRankingText('Player-123 - 1000', members), { entries: [{ id: 'numeric-name', stage: 1000 }], errors: [] });
  assert.deepEqual(parseRankingText('Player-123 - 1000 - Dark Nox', members), { entries: [{ id: 'numeric-name', stage: 1000, promotion: 'dark-nox' }], errors: [] });
});

test('merges compatible duplicate promotions and rejects conflicts or unknown promotions', () => {
  const compatible = parseRankingText('Risk: 1090\nRisk - 1090 - Gold\nRisk - 1090 - gold\nRisk: 1090', source);
  assert.deepEqual(compatible, { entries: [{ id: 'risk', stage: 1090, promotion: 'gold' }], errors: [] });
  for (const text of ['Risk - 1090 - Gold\nRisk - 1090 - Silver', 'Risk - 1090 - Unknown', 'Risk - 1090 - Sem promoção\nRisk - 1090 - Gold']) {
    assert.ok(parseRankingText(text, source).errors.length, text);
  }
});

test('imported stage and promotion changes preserve omitted promotions and source data', () => {
  const roster = structuredClone(source);
  roster[0].promotion = 'gold';
  roster[1].promotion = 'silver';
  const original = structuredClone(roster);
  const parsed = parseRankingText('Risk - 1090 - Mithril\nMatrella: 994', roster);
  assert.deepEqual(parsed.errors, []);
  const result = prepareUpdate(roster, '2025-01-03', parsed.entries, {
    promotions: parsed.entries.filter(entry => Object.hasOwn(entry, 'promotion')),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.members[0].promotion, 'mithril');
  assert.equal(result.members[1].promotion, 'silver');
  assert.equal(result.members[0].history.at(-1).stage, 1090);
  assert.deepEqual(roster, original);
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

test("archives exits without changing history and permits membership-only batches", () => {
  const result = prepareUpdate(source, "2025-01-03", [], { departures: ["risk"], additions: [{ nickname: "kü", stage: 1089 }] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.members[0].history, source[0].history);
  assert.equal(result.members[0].active, false);
  assert.equal(result.members[0].leftAt, "2025-01-03");
  assert.equal(result.members.at(-1).id, "ku");
  assert.equal(result.added[0].reactivated, false);
  assert.equal(result.departed[0].id, "risk");
  assert.equal(source[0].active, undefined);
});
test("rejoining preserves id, metadata and history and validates exit date", () => {
  const archived = structuredClone(source);
  Object.assign(archived[0], { active: false, leftAt: "2025-01-05" });
  const result = prepareUpdate(archived, "2025-01-06", [], { additions: [{ nickname: " RISK ", stage: 1100 }] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.added[0].reactivated, true);
  assert.equal(result.members.length, 3);
  assert.equal(result.members[0].id, "risk");
  assert.equal(result.members[0].portrait, "risk.png");
  assert.equal(result.members[0].joinedAt, "2025-01-06");
  assert.equal(result.members[0].leftAt, undefined);
  assert.equal(result.members[0].history.length, 3);
  assert.ok(prepareUpdate(archived, "2025-01-04", [], { additions: [{ nickname: "Risk", stage: 1100 }] }).errors.length);
  assert.ok(parseRankingText("Risk 1100", archived).errors.length);
  assert.ok(prepareUpdate(archived, "2025-01-06", [{ id: "risk", stage: 1100 }]).errors.length);
});
test("invalid mixed membership batches roll back every change", () => {
  for (const options of [
    { departures: ["mat", "unknown"] },
    { departures: ["risk"], additions: [{ nickname: "Risk", stage: 1 }] },
    { departures: ["mat"], additions: [{ nickname: "New", stage: 1 }, { nickname: "NEW", stage: 2 }] },
    { additions: [{ nickname: "New", stage: -1 }] },
    { departures: ["mat", "mat"] },
  ]) {
    const result = prepareUpdate(source, "2025-01-03", [{ id: "risk", stage: 1100 }], options);
    assert.ok(result.errors.length);
    assert.deepEqual(result.members, source);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.departed, []);
  }
});
test("new identifiers avoid accent collisions and metadata dates constrain departures", () => {
  const roster = [{ id: "ku", nickname: "Other", joinedAt: "2025-01-04", history: [{ date: "2025-01-01", stage: 1 }] }];
  const result = prepareUpdate(roster, "2025-01-05", [], { additions: [{ nickname: "kü", stage: 1 }, { nickname: "!!!", stage: 2 }] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.added.map(member => member.id), ["ku-2", "member"]);
  assert.ok(prepareUpdate(roster, "2025-01-03", [], { departures: ["ku"] }).errors.length);
});

test("updates or clears a promotion without adding a history entry", () => {
  const roster = structuredClone(source);
  roster[0].promotion = "gold";
  const changed = prepareUpdate(roster, "2025-01-03", [], { promotions: [{ id: "risk", promotion: "mithril" }] });
  assert.deepEqual(changed.errors, []);
  assert.equal(changed.members[0].promotion, "mithril");
  assert.deepEqual(changed.members[0].history, roster[0].history);
  assert.deepEqual(changed.promotions, [{ id: "risk", nickname: "Risk", previousPromotion: "gold", promotion: "mithril" }]);

  const cleared = prepareUpdate(changed.members, "2025-01-03", [], { promotions: [{ id: "risk", promotion: null }] });
  assert.deepEqual(cleared.errors, []);
  assert.equal(Object.hasOwn(cleared.members[0], "promotion"), false);
  assert.deepEqual(cleared.members[0].history, roster[0].history);
  assert.equal(cleared.promotions[0].promotion, null);
});

test("combines promotion and stage changes and assigns promotions to new or returning members", () => {
  const combined = prepareUpdate(source, "2025-01-03", [{ id: "risk", stage: 1070 }], { promotions: [{ id: "risk", promotion: "gold" }] });
  assert.deepEqual(combined.errors, []);
  assert.equal(combined.members[0].promotion, "gold");
  assert.deepEqual(combined.members[0].history.at(-1), { date: "2025-01-03", stage: 1070 });

  const added = prepareUpdate(source, "2025-01-03", [], { additions: [{ nickname: "Newbie", stage: 100, promotion: "bronze" }] });
  assert.deepEqual(added.errors, []);
  assert.equal(added.members.at(-1).promotion, "bronze");

  const archived = structuredClone(source);
  Object.assign(archived[0], { active: false, leftAt: "2025-01-02", promotion: "silver" });
  const returned = prepareUpdate(archived, "2025-01-03", [], { additions: [{ nickname: "Risk", stage: 1100, promotion: "gold" }] });
  assert.deepEqual(returned.errors, []);
  assert.equal(returned.members[0].promotion, "gold");
});

test("rejects unknown and duplicate promotion changes atomically", () => {
  for (const promotions of [
    [{ id: "risk", promotion: "unknown" }],
    [{ id: "risk", promotion: "gold" }, { id: "risk", promotion: "silver" }],
  ]) {
    const result = prepareUpdate(source, "2025-01-03", [{ id: "mat", stage: 920 }], { promotions });
    assert.ok(result.errors.length);
    assert.deepEqual(result.members, source);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.promotions, []);
  }
});
