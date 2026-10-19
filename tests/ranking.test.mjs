import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../js/ranking.js", import.meta.url), "utf8");
const { buildRanking, formatDate, parseDay } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("strict Gregorian calendar parsing and formatting", () => {
  assert.equal(parseDay("0001-01-01"), -719162);
  assert.equal(parseDay("2024-02-29") - parseDay("2024-02-28"), 1);
  assert.equal(parseDay("2000-02-29") - parseDay("2000-02-28"), 1);
  for (const date of ["1900-02-29", "2023-02-29", "2024-13-01", "2024-00-01", "2024-1-01", "0000-01-01", "10000-01-01"]) {
    assert.throws(() => parseDay(date), RangeError, date);
  }
  assert.equal(formatDate("0001-01-01"), "01/01/0001");
});

test("day arithmetic uses UTC calendar days regardless of local timezone", () => {
  assert.equal(parseDay("2025-03-10") - parseDay("2025-03-09"), 1);
  assert.equal(formatDate("2025-03-09"), "09/03/2025");
});

test("sorts history and uses last same-day row with prior distinct date", () => {
  const { members, errors } = buildRanking([{
    id: "a", nickname: "Ágata", role: "Líder",
    history: [
      { date: "2025-01-03", stage: 14 },
      { date: "2025-01-01", stage: 8 },
      { date: "2025-01-03", stage: 15 },
    ],
  }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(members[0].history, [
    { date: "2025-01-01", stage: 8 },
    { date: "2025-01-03", stage: 14 },
    { date: "2025-01-03", stage: 15 },
  ]);
  assert.equal(members[0].currentStage, 15);
  assert.equal(members[0].previousDate, "2025-01-01");
  assert.equal(members[0].delta, 7);
  assert.equal(members[0].days, 2);
  assert.equal(members[0].dailyAverage, 3.5);
});

test("one distinct date has no comparison", () => {
  const { members } = buildRanking([{ id: "a", nickname: "A", history: [
    { date: "2025-01-01", stage: 2 }, { date: "2025-01-01", stage: 3 },
  ] }]);
  assert.equal(members[0].currentStage, 3);
  assert.equal(members[0].previousDate, null);
  assert.equal(members[0].delta, null);
  assert.equal(members[0].days, null);
  assert.equal(members[0].dailyAverage, null);
});

test("rejects invalid members and rows while retaining valid rows", () => {
  const { members, errors } = buildRanking([
    { id: "a", nickname: "A", role: " ", history: [
      { date: "2025-02-30", stage: 1 }, { date: "2025-01-01", stage: -1 },
      { date: "2025-01-02", stage: 2 },
    ] },
    { id: "a", nickname: "Duplicate", history: [{ date: "2025-01-01", stage: 5 }] },
    { id: "b", nickname: " ", history: [{ date: "2025-01-01", stage: 1 }] },
    null,
    { id: "empty", nickname: "Empty", history: [] },
  ]);
  assert.equal(members.length, 1);
  assert.equal(members[0].role, "Membro");
  assert.equal(members[0].history.length, 1);
  assert.equal(members[0].currentStage, 2);
  assert.equal(errors.length, 6);
});

test("sorts by stage, then Portuguese nickname, then id; preserves negative corrections", () => {
  const { members } = buildRanking([
    { id: "b", nickname: "Bia", history: [{ date: "2025-01-01", stage: 10 }] },
    { id: "z", nickname: "Ágata", history: [{ date: "2025-01-01", stage: 10 }] },
    { id: "a", nickname: "Agata", history: [{ date: "2025-01-01", stage: 10 }] },
    { id: "c", nickname: "Caio", history: [
      { date: "2025-01-01", stage: 12 }, { date: "2025-01-03", stage: 9 },
    ] },
  ]);
  assert.deepEqual(members.map(({ id }) => id), ["a", "z", "b", "c"]);
  assert.equal(members[3].delta, -3);
  assert.equal(members[3].dailyAverage, -1.5);
  assert.deepEqual(members.map(({ position }) => position), [1, 2, 3, 4]);
});

test("supports the full nonnegative safe integer stage range", () => {
  const { members } = buildRanking([{ id: "a", nickname: "A", history: [
    { date: "2025-01-01", stage: Number.MAX_SAFE_INTEGER },
    { date: "2025-01-02", stage: 0 },
  ] }]);
  assert.equal(members[0].delta, -Number.MAX_SAFE_INTEGER);
});

test("rejects nonnumeric, nonfinite, fractional and unsafe stages", () => {
  const { members, errors } = buildRanking([{
    id: "validation", nickname: "Validation", history: [
      ...["100", NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1].map(stage => ({ date: "2026-10-18", stage })),
      { date: "2026-10-18", stage: 0 },
    ],
  }]);
  assert.equal(members[0].currentStage, 0);
  assert.equal(members[0].history.length, 1);
  assert.equal(errors.length, 5);
  assert.equal(buildRanking({}).errors.length, 1);
});
