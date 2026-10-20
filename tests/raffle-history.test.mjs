import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/raffle-history-engine.js", import.meta.url), "utf8");
const { normalizeResult, parseResultFile, validateHistory, mergeOfficial } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const record = (overrides = {}) => ({
  version: 1,
  id: "draw-a",
  name: "Sorteio de outubro",
  drawnAt: "2026-10-18T12:30:00.000Z",
  winner: { id: "a", nickname: "Alpha antigo" },
  participants: [{ id: "a", nickname: "Alpha antigo" }, { id: "b", nickname: "Beta" }],
  excluded: [{ id: "c", nickname: "Gamma" }],
  ...overrides,
});

const legacyTxt = `LeagueBR — Sorteio antigo
Data: 18/10/2026, 09:30:00
Data ISO: 2026-10-18T12:30:00.000Z
Vencedor: Alpha antigo [a]

Participantes (2):
- Alpha antigo [a]
- Beta [b]

Fora do sorteio (1):
- Gamma [c]

Sorteio manual no navegador, com chances iguais por participante.
`;

test("normalizes exact public fields, canonical time and deterministic legacy ID", () => {
  const { version, ...legacy } = record({ id: undefined, drawnAt: "2026-10-18T09:30:00-03:00", role: "admin", portrait: "x", history: [] });
  const normalized = normalizeResult(legacy);
  assert.deepEqual(normalized, {
    version: 1,
    id: "raffle-2026-10-18T12:30:00.000Z-a",
    name: "Sorteio de outubro",
    drawnAt: "2026-10-18T12:30:00.000Z",
    winner: { id: "a", nickname: "Alpha antigo" },
    participants: [{ id: "a", nickname: "Alpha antigo" }, { id: "b", nickname: "Beta" }],
    excluded: [{ id: "c", nickname: "Gamma" }],
  });
});

test("rejects bad version, wrong winner, duplicate identities and invalid timestamps", () => {
  assert.throws(() => normalizeResult(record({ version: 2 })), /Versão/);
  assert.throws(() => normalizeResult(record({ winner: { id: "a", nickname: "Wrong" } })), /Vencedor/);
  assert.throws(() => normalizeResult(record({ excluded: [{ id: "a", nickname: "Alpha antigo" }] })), /duplicado/);
  assert.throws(() => normalizeResult(record({ participants: [] })), /Participantes/);
  assert.throws(() => normalizeResult(record({ drawnAt: "2026-02-30T12:30:00Z" })), /Data/);
  assert.throws(() => normalizeResult(record({ drawnAt: "yesterday" })), /Data/);
});

test("parses JSON and exact legacy TXT exports", () => {
  assert.deepEqual(parseResultFile(JSON.stringify(record())), normalizeResult(record()));
  assert.deepEqual(parseResultFile(legacyTxt), normalizeResult({ ...record(), id: undefined, name: "Sorteio antigo" }));
  const noExclusions = legacyTxt.replace("Fora do sorteio (1):\n- Gamma [c]", "Fora do sorteio (0):\nNenhum.");
  assert.deepEqual(parseResultFile(noExclusions).excluded, []);
  assert.throws(() => parseResultFile(legacyTxt.replace("Participantes (2):", "Participantes (3):")), /Contagem/);
  assert.throws(() => parseResultFile(legacyTxt.replace("Vencedor: Alpha antigo [a]", "Vencedor: Beta [c]")), /Vencedor/);
  assert.throws(() => parseResultFile(legacyTxt.replace("Sorteio manual no navegador, com chances iguais por participante.", "")), /Final|incompleta/);
  assert.throws(() => parseResultFile(`[${JSON.stringify(record())}]`), /único/);
});

test("history validates uniqueness and sorts newest first", () => {
  const older = record({ id: "draw-old", drawnAt: "2026-10-17T12:30:00.000Z" });
  const history = [record(), older];
  assert.deepEqual(validateHistory(history).map((item) => item.id), ["draw-a", "draw-old"]);
  assert.throws(() => validateHistory([record(), record({ drawnAt: "2026-10-17T12:30:00.000Z" })]), /ID.*duplicado/);
  assert.throws(() => validateHistory([record(), record({ id: "draw-b" })]), /Data.*duplicada/);
});

test("merge rejects duplicate id or time and never mutates input", () => {
  const history = [record({ id: "older", drawnAt: "2026-10-17T12:30:00Z" })];
  const incoming = record({ id: "newer", drawnAt: "2026-10-19T12:30:00Z" });
  const historyBefore = structuredClone(history);
  const incomingBefore = structuredClone(incoming);
  const merged = mergeOfficial(history, incoming);
  assert.deepEqual(merged.map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(history, historyBefore);
  assert.deepEqual(incoming, incomingBefore);
  assert.throws(() => mergeOfficial(history, record({ id: "older", drawnAt: "2026-10-20T12:30:00Z" })), /ID.*duplicado/);
  assert.throws(() => mergeOfficial(history, record({ id: "new", drawnAt: "2026-10-17T12:30:00Z" })), /Data.*duplicada/);
});

test("snapshots retain historical nicknames without consulting the current roster", () => {
  const stored = normalizeResult(record());
  assert.equal(stored.participants[0].nickname, "Alpha antigo");
  assert.equal(stored.winner.nickname, "Alpha antigo");
});

test("generated IDs round-trip even for the longest allowed member ID", () => {
  const member = { id: 'a'.repeat(120), nickname: 'Alpha' };
  const result = normalizeResult(record({ id: undefined, winner: member, participants: [member], excluded: [] }));
  assert.deepEqual(parseResultFile(JSON.stringify(result)), result);
});

test("the published history file is valid without inserting demonstration results", async () => {
  const data = JSON.parse(await readFile(new URL('../data/raffles.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateHistory(data));
});
