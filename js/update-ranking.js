import { buildRanking, parseDay } from "./ranking.js";

const safeStage = (value) => Number.isSafeInteger(value) && value >= 0;

function normalizeNickname(value) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseStage(value) {
  const cleaned = value.replace(/\s/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(cleaned)) return null;
  const stage = Number(cleaned.replaceAll(".", ""));
  return safeStage(stage) ? stage : null;
}

/** Parse a pasted ranking, returning recognized member entries and all line errors. */
export function parseRankingText(text, sourceMembers) {
  const errors = [];
  const entries = [];
  if (typeof text !== "string") return { entries, errors: ["O texto do ranking deve ser uma string."] };
  if (!Array.isArray(sourceMembers)) return { entries, errors: ["A lista de membros deve ser um array."] };

  const byNickname = new Map();
  const ambiguous = new Set();
  for (const member of sourceMembers) {
    if (member && typeof member.nickname === "string") {
      const name = normalizeNickname(member.nickname);
      if (byNickname.has(name)) ambiguous.add(name);
      byNickname.set(name, member);
    }
  }
  const seen = new Map();
  const headings = /^(?:PÓDIO|PODIO|TABELA\s+COMPLETA)\s*:?$/i;
  const patterns = [
    /^(.+?)\s*[-–—:]\s*([\d.]+)(?:\s*[-–—]\s*empatado)?\s*$/iu,
    /^(.+?)\s+([\d.]+)\s*$/u,
  ];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let line = raw.trim().replace(/^\*+|\*+$/g, "").trim();
    if (!line || headings.test(line)) continue;
    line = line.replace(/^(?:🥇|🥈|🥉)\uFE0F?\s*/u, "").replace(/^\d+\s*[º°ª.)]\s*/u, "");
    let match;
    for (const pattern of patterns) {
      match = line.match(pattern);
      if (match) break;
    }
    if (!match) {
      errors.push(`Linha ${index + 1}: formato não reconhecido (“${line}”).`);
      continue;
    }
    const nickname = match[1].trim();
    if (ambiguous.has(normalizeNickname(nickname))) {
      errors.push(`Linha ${index + 1}: há mais de um membro com o nome “${nickname}”. Avise o responsável pelo portal.`);
      continue;
    }
    const stage = parseStage(match[2]);
    if (stage === null) {
      errors.push(`Linha ${index + 1}: estágio inválido (“${match[2]}”).`);
      continue;
    }
    const member = byNickname.get(normalizeNickname(nickname));
    if (!member) {
      errors.push(`Linha ${index + 1}: membro desconhecido (“${nickname}”).`);
      continue;
    }
    if (seen.has(member.id)) {
      if (seen.get(member.id) !== stage) errors.push(`Linha ${index + 1}: estágio conflitante para ${member.nickname}.`);
      continue;
    }
    seen.set(member.id, stage);
    entries.push({ id: member.id, stage });
  }
  if (!entries.length && !errors.length) errors.push("Cole ao menos um nickname com seu estágio.");
  return { entries, errors };
}

/** Apply a complete set of daily updates to a cloned source roster. */
export function prepareUpdate(sourceMembers, date, entries) {
  const errors = [];
  const members = Array.isArray(sourceMembers) ? structuredClone(sourceMembers) : [];
  const fail = (message) => ({ members, changes: [], errors: [...errors, message] });
  if (!Array.isArray(sourceMembers)) return fail("A lista de membros deve ser um array.");
  const ranking = buildRanking(sourceMembers);
  if (ranking.errors.length) return fail("Os dados de origem possuem erros e não podem ser atualizados.");
  let day;
  try { day = parseDay(date); } catch { return fail("A data informada é inválida."); }
  if (!Array.isArray(entries) || entries.length === 0) return fail("Informe ao menos um estágio.");

  const byId = new Map(sourceMembers.map((member) => [member.id, member]));
  const staged = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !byId.has(entry.id)) {
      errors.push("A lista contém um membro desconhecido ou inválido.");
      continue;
    }
    if (!safeStage(entry.stage)) {
      errors.push(`Estágio inválido para ${byId.get(entry.id).nickname}.`);
      continue;
    }
    const latestDay = Math.max(...byId.get(entry.id).history.map((row) => parseDay(row.date)));
    if (day < latestDay) {
      errors.push(`A data ${date} é anterior ao último registro de ${byId.get(entry.id).nickname}.`);
      continue;
    }
    if (staged.has(entry.id)) {
      errors.push(`Membro duplicado: ${byId.get(entry.id).nickname}.`);
      continue;
    }
    staged.add(entry.id);
  }
  if (errors.length) return { members, changes: [], errors };

  const changes = [];
  for (const entry of entries) {
    const original = byId.get(entry.id);
    const history = original.history;
    let previousStage = null;
    let existingIndex = -1;
    for (let i = 0; i < history.length; i++) {
      const rowDay = parseDay(history[i].date);
      if (rowDay === day) existingIndex = i;
      if (rowDay < day && (previousStage === null || rowDay >= previousStage.day)) {
        previousStage = { stage: history[i].stage, day: rowDay };
      }
    }
    const sameDay = existingIndex !== -1;
    const baseline = sameDay ? history[existingIndex].stage : previousStage?.stage;
    const rawCopy = members.find((member) => member.id === entry.id);
    if (sameDay) rawCopy.history[existingIndex] = { ...rawCopy.history[existingIndex], stage: entry.stage };
    else rawCopy.history.push({ date, stage: entry.stage });
    changes.push({
      id: entry.id,
      nickname: original.nickname,
      previousStage: baseline ?? null,
      stage: entry.stage,
      delta: baseline === undefined || baseline === null ? null : entry.stage - baseline,
      sameDay,
    });
  }
  return { members, changes, errors: [] };
}
