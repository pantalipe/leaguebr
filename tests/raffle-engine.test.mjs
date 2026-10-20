import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/raffle-engine.js", import.meta.url), "utf8");
const { eligibleMembers, drawWinner } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const members = [
  { id: "a", nickname: "Alpha" },
  { id: "b", nickname: "Beta" },
  { id: "c", nickname: "Gamma" },
];

test("eligibleMembers excludes explicitly inactive members and preserves active records", () => {
  const inactive = { id: "off", nickname: "Inactive", active: false };
  const input = [members[0], inactive, members[1]];
  const result = eligibleMembers(input);
  assert.deepEqual(result, [members[0], members[1]]);
  assert.equal(input.length, 3);
});

test("malformed and duplicate active member identities are rejected", () => {
  assert.throws(() => eligibleMembers([{ id: "a", nickname: " " }]), /Apelido inválido/);
  assert.throws(() => eligibleMembers([{ id: "a", nickname: "A" }, { id: "a", nickname: "Again" }]), /duplicado/);
  assert.throws(() => eligibleMembers([null]), /Membro inválido/);
});

test("drawWinner selects only from the provided filtered participant pool", () => {
  const selectedPool = eligibleMembers([members[1], members[2]]);
  assert.equal(drawWinner(selectedPool, () => 0), members[1]);
  assert.equal(drawWinner(selectedPool, () => 1), members[2]);
});

test("drawWinner rejects empty pools, invalid records, and duplicate identities", () => {
  assert.throws(() => drawWinner([]), /Não há participantes/);
  assert.throws(() => drawWinner([{ id: "a", nickname: "A" }, { id: "a", nickname: "A2" }], () => 0), /duplicado/);
  assert.throws(() => drawWinner([{ id: "a", nickname: "" }], () => 0), /Apelido inválido/);
});

test("drawWinner uses rejection sampling to avoid modulo bias", () => {
  const values = [0, 5]; // For three participants, 0 is rejected; 5 maps to index 2.
  const seen = [];
  const winner = drawWinner(members, () => {
    const value = values.shift();
    seen.push(value);
    return value;
  });
  assert.equal(winner, members[2]);
  assert.deepEqual(seen, [0, 5]);
});

test("drawWinner validates uint32 samples and does not mutate participants", () => {
  const participants = members.slice();
  const original = participants.slice();
  assert.throws(() => drawWinner(participants, () => -1), /uint32/);
  assert.throws(() => drawWinner(participants, () => 1.5), /uint32/);
  assert.throws(() => drawWinner(participants, () => 0x1_0000_0000), /uint32/);
  assert.equal(drawWinner(participants, () => 2), members[2]);
  assert.deepEqual(participants, original);
});
