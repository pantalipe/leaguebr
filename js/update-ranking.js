import { buildRanking, parseDay } from "./ranking.js";
import { PROMOTIONS, getPromotion } from "./promotions.js";

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

function parsePromotion(value) {
  const normalized = value.trim().toLocaleLowerCase('pt-BR').replace(/[-\s]+/g, ' ');
  if (normalized === 'sem promoção') return null;
  return PROMOTIONS.find(item => [item.id, item.name].some(name =>
    name.toLocaleLowerCase('pt-BR').replace(/[-\s]+/g, ' ') === normalized
  ))?.id ?? getPromotion(value.trim().toLowerCase())?.id;
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
    if (member && member.active !== false && typeof member.nickname === "string") {
      const name = normalizeNickname(member.nickname);
      if (byNickname.has(name)) ambiguous.add(name);
      byNickname.set(name, member);
    }
  }
  const seen = new Map();
  const headings = /^(?:PÓDIO|PODIO|TABELA\s+COMPLETA)\s*:?$/i;
  const patterns = [
    /^(.+?)\s*[-–—:]\s*([\d.]+)(?:\s*[-–—]\s*empatado)?\s*$/iu,
    /^(.+)\s*[-–—:|]\s*([\d.]+)\s*[-–—:|]\s*(.+?)\s*$/u,
    /^(.+?)\s+([\d.]+)\s*$/u,
  ];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let line = raw.trim().replace(/^\*+|\*+$/g, "").trim();
    if (!line || headings.test(line)) continue;
    line = line.replace(/^(?:🥇|🥈|🥉)\uFE0F?\s*/u, "").replace(/^\d+\s*[º°ª.)]\s*/u, "");
    line = line.replace(/\s*[-–—]\s*empatado\s*$/iu, '');
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
    const promotion = match[3] === undefined ? undefined : parsePromotion(match[3]);
    if (match[3] !== undefined && promotion === undefined) {
      errors.push(`Linha ${index + 1}: promoção desconhecida (“${match[3]}”). Use o nome exibido no seletor de promoções.`);
      continue;
    }
    const member = byNickname.get(normalizeNickname(nickname));
    if (!member) {
      errors.push(`Linha ${index + 1}: membro desconhecido (“${nickname}”).`);
      continue;
    }
    if (seen.has(member.id)) {
      const previous = seen.get(member.id);
      if (previous.stage !== stage) errors.push(`Linha ${index + 1}: estágio conflitante para ${member.nickname}.`);
      if (promotion !== undefined && previous.promotion !== undefined && previous.promotion !== promotion) {
        errors.push(`Linha ${index + 1}: promoção conflitante para ${member.nickname}.`);
      } else if (promotion !== undefined) previous.promotion = promotion;
      continue;
    }
    const entry = { id: member.id, stage, ...(promotion !== undefined ? { promotion } : {}) };
    seen.set(member.id, entry);
    entries.push(entry);
  }
  if (!entries.length && !errors.length) errors.push("Cole ao menos um nickname com seu estágio.");
  return { entries, errors };
}

/** Apply stage and membership changes atomically, preserving archived histories. */
export function prepareUpdate(sourceMembers, date, entries, { additions = [], departures = [], promotions = [] } = {}) {
  const original = Array.isArray(sourceMembers) ? structuredClone(sourceMembers) : [];
  const members = structuredClone(original);
  const errors = [], changes = [], added = [], departed = [], promotionChanges = [];
  const fail = (message) => ({ members: original, changes: [], added: [], departed: [], promotions: [], errors: message ? [...errors, message] : errors });
  if (!Array.isArray(sourceMembers)) return fail("A lista de membros deve ser um array.");
  const ranking = buildRanking(sourceMembers, { includeInactive: true });
  if (ranking.errors.length) return fail("Os dados de origem possuem erros e não podem ser atualizados.");
  let day;
  try { day = parseDay(date); } catch { return fail("A data informada é inválida."); }
  if (![entries, additions, departures, promotions].every(Array.isArray)) return fail("As alterações devem ser listas.");
  if (!entries.length && !additions.length && !departures.length && !promotions.length) return fail("Informe ao menos um estágio, entrada, saída ou promoção.");
  const byId = new Map(members.map(member => [member.id, member]));
  const stats = new Map(ranking.members.map(member => [member.id, member]));
  const staged = new Set(), leaving = new Set(), names = new Set();
  const promoted = new Set();
  const dateAllowed = (member, rejoining = false) => {
    const limits = [stats.get(member.id).lastDate, member.joinedAt];
    if (rejoining) limits.push(member.leftAt);
    if (limits.some(value => value && day < parseDay(value))) {
      errors.push(`A data é anterior ao cadastro ou último registro de ${member.nickname}.`);
      return false;
    }
    return true;
  };
  const applyStage = (member, stage) => {
    let index = -1;
    member.history.forEach((row, i) => { if (row.date === date) index = i; });
    if (index >= 0) member.history[index] = { ...member.history[index], stage };
    else member.history.push({ date, stage });
    return index >= 0;
  };
  for (const id of departures) {
    const member = byId.get(id);
    if (!member || member.active === false || leaving.has(id)) {
      errors.push("Saída duplicada ou membro ativo desconhecido.");
      continue;
    }
    leaving.add(id);
    if (!dateAllowed(member)) continue;
    member.active = false;
    member.leftAt = date;
    departed.push({ id, nickname: member.nickname });
  }
  for (const entry of entries) {
    const member = entry && byId.get(entry.id);
    if (!member || member.active === false || leaving.has(entry.id) || staged.has(entry.id)) {
      errors.push("Atualização duplicada, membro inativo ou desconhecido.");
      continue;
    }
    staged.add(entry.id);
    if (!safeStage(entry.stage)) { errors.push(`Estágio inválido para ${member.nickname}.`); continue; }
    if (!dateAllowed(member)) continue;
    const previousStage = stats.get(member.id).currentStage;
    const sameDay = applyStage(member, entry.stage);
    changes.push({ id: member.id, nickname: member.nickname, previousStage, stage: entry.stage, delta: entry.stage - previousStage, sameDay });
  }
  for (const entry of promotions) {
    const member = entry && byId.get(entry.id);
    if (!member || member.active === false || leaving.has(entry.id) || promoted.has(entry.id)) {
      errors.push("Atualização duplicada, membro inativo ou desconhecido.");
      continue;
    }
    promoted.add(entry.id);
    if (entry.promotion !== null && (typeof entry.promotion !== "string" || !getPromotion(entry.promotion))) {
      errors.push(`Promoção inválida para ${member.nickname}.`);
      continue;
    }
    const previousPromotion = member.promotion ?? null;
    if (entry.promotion === null) delete member.promotion;
    else member.promotion = entry.promotion;
    promotionChanges.push({ id: member.id, nickname: member.nickname, previousPromotion, promotion: entry.promotion });
  }
  for (const addition of additions) {
    const nickname = typeof addition?.nickname === "string" ? addition.nickname.trim() : "";
    const key = normalizeNickname(nickname);
    if (!nickname || names.has(key) || !safeStage(addition?.stage) || (addition?.promotion !== undefined && addition.promotion !== null && (typeof addition.promotion !== "string" || !getPromotion(addition.promotion)))) {
      errors.push("Informe um nickname único, um estágio inteiro válido e uma promoção válida para cada entrada.");
      continue;
    }
    names.add(key);
    const matches = original.filter(member => normalizeNickname(member.nickname) === key);
    if (matches.length > 1 || matches.some(member => member.active !== false)) {
      errors.push(`Já existe um membro ativo ou ambíguo com o nickname ${nickname}.`);
      continue;
    }
    if (matches.length) {
      const member = byId.get(matches[0].id);
      if (!dateAllowed(member, true)) continue;
      applyStage(member, addition.stage);
      member.active = true;
      member.joinedAt = date;
      delete member.leftAt;
      if (addition.promotion !== undefined) {
        if (addition.promotion === null) delete member.promotion;
        else member.promotion = addition.promotion;
      }
      added.push({ id: member.id, nickname: member.nickname, stage: addition.stage, reactivated: true });
    } else {
      const base = nickname.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "member";
      let id = base, suffix = 2;
      while (byId.has(id)) id = `${base}-${suffix++}`;
      const member = { id, nickname, role: "Membro", active: true, joinedAt: date, history: [{ date, stage: addition.stage }] };
      if (addition.promotion) member.promotion = addition.promotion;
      members.push(member);
      byId.set(id, member);
      added.push({ id, nickname, stage: addition.stage, reactivated: false });
    }
  }
  return errors.length ? fail() : { members, changes, added, departed, promotions: promotionChanges, errors: [] };
}
