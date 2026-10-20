const UINT32_RANGE = 0x1_0000_0000;

function fail(message) {
  throw new Error(message);
}

function validateMember(member, index) {
  if (!member || typeof member !== "object" || Array.isArray(member)) {
    fail(`Membro inválido na posição ${index + 1}.`);
  }
  if (typeof member.id !== "string" || !member.id.trim()) {
    fail(`ID inválido no membro da posição ${index + 1}.`);
  }
  if (typeof member.nickname !== "string" || !member.nickname.trim()) {
    fail(`Apelido inválido no membro ${member.id}.`);
  }
}

function validateUniqueMembers(members) {
  const ids = new Set();
  for (const [index, member] of members.entries()) {
    validateMember(member, index);
    if (ids.has(member.id)) fail(`ID de membro duplicado: ${member.id}.`);
    ids.add(member.id);
  }
}

export function eligibleMembers(members) {
  if (!Array.isArray(members)) fail("A lista de membros deve ser um array.");
  const active = members.filter((member) => member?.active !== false);
  validateUniqueMembers(active);
  return active;
}

function secureRandomUint32() {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.getRandomValues !== "function") {
    fail("Fonte criptográfica de aleatoriedade indisponível.");
  }
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

export function drawWinner(participants, randomUint32 = secureRandomUint32) {
  if (!Array.isArray(participants)) fail("A lista de participantes deve ser um array.");
  if (participants.length === 0) fail("Não há participantes elegíveis para o sorteio.");
  validateUniqueMembers(participants);
  if (typeof randomUint32 !== "function") fail("A fonte aleatória deve ser uma função.");

  const count = participants.length;
  const rejectionThreshold = UINT32_RANGE % count;
  let value;
  do {
    value = randomUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      fail("A fonte aleatória deve retornar um inteiro uint32.");
    }
  } while (value < rejectionThreshold);

  return participants[value % count];
}
