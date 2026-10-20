const MAX_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 200;

function requireText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} inválido.`);
  }
  return value.trim();
}

function normalizeMember(raw, label) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError(`${label} inválido.`);
  return {
    id: requireText(raw.id, `${label}: ID`, MAX_ID_LENGTH),
    nickname: requireText(raw.nickname, `${label}: apelido`, MAX_NAME_LENGTH),
  };
}

function normalizeTimestamp(raw) {
  if (typeof raw !== 'string') throw new TypeError('Data do sorteio inválida.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (!match) throw new TypeError('Data do sorteio inválida.');
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year), mo = Number(month), d = Number(day);
  const h = Number(hour), mi = Number(minute), s = Number(second);
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    throw new TypeError('Data do sorteio inválida.');
  }
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3)), offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) throw new TypeError('Data do sorteio inválida.');
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) throw new TypeError('Data do sorteio inválida.');
  return new Date(timestamp).toISOString();
}

export function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Resultado inválido.');
  if (Object.hasOwn(raw, 'version') && raw.version !== 1) throw new TypeError('Versão do resultado inválida.');
  const name = requireText(raw.name, 'Nome do sorteio', MAX_NAME_LENGTH);
  const drawnAt = normalizeTimestamp(raw.drawnAt);
  const winner = normalizeMember(raw.winner, 'Vencedor');
  if (!Array.isArray(raw.participants) || raw.participants.length === 0) throw new TypeError('Participantes inválidos.');
  if (!Array.isArray(raw.excluded)) throw new TypeError('Lista de excluídos inválida.');
  const participants = raw.participants.map((member) => normalizeMember(member, 'Participante'));
  const excluded = raw.excluded.map((member) => normalizeMember(member, 'Excluído'));
  const ids = new Set();
  for (const member of [...participants, ...excluded]) {
    if (ids.has(member.id)) throw new TypeError(`ID duplicado: ${member.id}.`);
    ids.add(member.id);
  }
  const participantWinner = participants.find((member) => member.id === winner.id);
  if (!participantWinner || participantWinner.nickname !== winner.nickname) throw new TypeError('Vencedor não corresponde a um participante.');
  const id = raw.id === undefined
    ? `raffle-${drawnAt}-${winner.id}`
    : requireText(raw.id, 'ID do sorteio', 200);
  return { version: 1, id, name, drawnAt, winner, participants, excluded };
}

function parseTxtMember(line, label) {
  const match = /^- (.+) \[([^\]\r\n]+)\]$/.exec(line);
  if (!match) throw new TypeError(`${label} inválido no arquivo TXT.`);
  return { nickname: match[1], id: match[2] };
}

function parseList(lines, heading, allowNone = false) {
  const match = new RegExp(`^${heading} \\((\\d+)\\):$`).exec(lines[0] ?? '');
  if (!match) throw new TypeError(`Seção ${heading} inválida no arquivo TXT.`);
  const count = Number(match[1]);
  const entries = lines.slice(1);
  if (allowNone && entries.length === 1 && entries[0] === 'Nenhum.') {
    if (count !== 0) throw new TypeError(`Contagem de ${heading} inválida no arquivo TXT.`);
    return [];
  }
  if (entries.some((line) => !line.startsWith('- ')) || entries.length !== count) {
    throw new TypeError(`Contagem de ${heading} inválida no arquivo TXT.`);
  }
  return entries.map((line) => parseTxtMember(line, heading));
}

export function parseResultFile(text) {
  if (typeof text !== 'string') throw new TypeError('Arquivo de resultado inválido.');
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { throw new TypeError('JSON de resultado inválido.'); }
    if (Array.isArray(parsed)) throw new TypeError('O arquivo deve conter um único resultado.');
    return normalizeResult(parsed);
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 11 || !lines[0].startsWith('LeagueBR — ')) throw new TypeError('Arquivo TXT de sorteio inválido.');
  const name = lines[0].slice('LeagueBR — '.length);
  if (!name || !/^Data: .+$/.test(lines[1]) || !/^Data ISO: .+$/.test(lines[2])) throw new TypeError('Cabeçalho do arquivo TXT inválido.');
  const winnerMatch = /^Vencedor: (.+) \[([^\]\r\n]+)\]$/.exec(lines[3]);
  if (!winnerMatch || lines[4] !== '') throw new TypeError('Vencedor inválido no arquivo TXT.');
  const participantEnd = lines.indexOf('', 5);
  if (participantEnd < 0) throw new TypeError('Seção de participantes incompleta no arquivo TXT.');
  const participants = parseList(lines.slice(5, participantEnd), 'Participantes');
  const excludedEnd = lines.indexOf('', participantEnd + 1);
  if (excludedEnd < 0) throw new TypeError('Seção de excluídos incompleta no arquivo TXT.');
  const excluded = parseList(lines.slice(participantEnd + 1, excludedEnd), 'Fora do sorteio', true);
  if (lines.slice(excludedEnd + 1).join('\n') !== 'Sorteio manual no navegador, com chances iguais por participante.') {
    throw new TypeError('Final do arquivo TXT inválido ou ambíguo.');
  }
  return normalizeResult({
    version: 1,
    name,
    drawnAt: lines[2].slice('Data ISO: '.length),
    winner: { nickname: winnerMatch[1], id: winnerMatch[2] },
    participants,
    excluded,
  });
}

export function validateHistory(raw) {
  if (!Array.isArray(raw)) throw new TypeError('Histórico inválido.');
  const results = raw.map(normalizeResult);
  const ids = new Set();
  const dates = new Set();
  for (const result of results) {
    if (ids.has(result.id)) throw new TypeError(`ID de sorteio duplicado: ${result.id}.`);
    if (dates.has(result.drawnAt)) throw new TypeError(`Data de sorteio duplicada: ${result.drawnAt}.`);
    ids.add(result.id);
    dates.add(result.drawnAt);
  }
  return results.sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
}

export function mergeOfficial(history, result) {
  const existing = validateHistory(history);
  const incoming = normalizeResult(result);
  if (existing.some((item) => item.id === incoming.id)) throw new TypeError(`ID de sorteio duplicado: ${incoming.id}.`);
  if (existing.some((item) => item.drawnAt === incoming.drawnAt)) throw new TypeError(`Data de sorteio duplicada: ${incoming.drawnAt}.`);
  return [...existing, incoming].sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
}
