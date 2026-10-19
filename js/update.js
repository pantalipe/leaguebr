import { buildRanking, formatDate } from './ranking.js';
import { parseRankingText, prepareUpdate } from './update-ranking.js';

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('pt-BR').format(value);
let sourceMembers = [];
let currentMembers = [];
let candidate = null;
let blobURL = null;
let newRowNumber = 0;

function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}
function showErrors(messages) {
  const box = $('#errors'); box.replaceChildren(); box.hidden = !messages.length;
  if (!messages.length) return;
  const list = node('ul'); messages.forEach((message) => list.append(node('li', message)));
  box.append(list); box.focus();
}
function invalidatePreview() {
  candidate = null; $('#preview').hidden = true; $('#download-status').textContent = '';
  if (blobURL) { URL.revokeObjectURL(blobURL); blobURL = null; }
}
function stageInputs() { return [...document.querySelectorAll('[data-member-id]')]; }
function departureIds() {
  return new Set([...document.querySelectorAll('[data-departure-id]:checked')].map((input) => input.dataset.departureId));
}
function newRows() { return [...document.querySelectorAll('.new-member-row')]; }
function updateCount() {
  const count = stageInputs().filter((input) => !input.disabled && input.value.trim() !== '').length;
  const departed = departureIds().size;
  $('#filled-count').textContent = `${count} estágio(s) preenchido(s) e ${departed} saída(s) marcada(s).`;
}
function renderInputs(values = new Map(), departures = new Set()) {
  $('#stage-entries').replaceChildren();
  for (const [index, member] of currentMembers.entries()) {
    const row = node('li'); row.className = 'stage-entry';
    const identity = node('div');
    identity.append(node('strong', member.nickname), node('small', `Atual: ${number(member.currentStage)} · ${formatDate(member.lastDate)}`));
    const departureLabel = node('label'); departureLabel.className = 'member-status';
    const departure = node('input'); departure.type = 'checkbox'; departure.dataset.departureId = member.id;
    departure.checked = departures.has(member.id); departure.setAttribute('aria-label', `${member.nickname} saiu da guild`);
    departureLabel.append(departure, node('span', 'Saiu da guild')); identity.append(departureLabel);
    const field = node('div');
    const label = node('label', `Novo estágio de ${member.nickname}`);
    label.className = 'sr-only'; label.htmlFor = `stage-${index}`;
    const input = node('input');
    input.id = label.htmlFor; input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*';
    input.autocomplete = 'off'; input.dataset.memberId = member.id;
    input.value = values.get(member.id) ?? ''; input.disabled = departure.checked; input.placeholder = 'Em branco';
    field.append(label, input); row.append(identity, field); $('#stage-entries').append(row);
  }
  const archived = sourceMembers.filter((member) => member.active === false);
  $('#archived-note').textContent = archived.length ? `Históricos preservados de ex-membros: ${archived.map((member) => member.nickname).join(', ')}. Se alguém voltar, adicione seu nickname no bloco de entradas para recuperar o cadastro.` : '';
  updateCount();
}
function addNewRow() {
  const index = ++newRowNumber;
  const row = node('li'); row.className = 'new-member-row'; row.dataset.draftId = `draft-new-${index}`;
  const nameLabel = node('label', 'Nickname');
  const name = node('input'); name.type = 'text'; name.dataset.newName = ''; name.autocomplete = 'off';
  name.setAttribute('aria-label', `Nickname do novo membro ${index}`); nameLabel.append(name);
  const stageLabel = node('label', 'Estágio');
  const stage = node('input'); stage.type = 'text'; stage.inputMode = 'numeric'; stage.pattern = '[0-9]*'; stage.dataset.newStage = '';
  stage.setAttribute('aria-label', `Estágio do novo membro ${index}`); stageLabel.append(stage);
  const remove = node('button', 'Remover'); remove.type = 'button'; remove.className = 'button secondary';
  remove.setAttribute('aria-label', `Remover entrada ${index}`);
  remove.addEventListener('click', () => { row.remove(); invalidatePreview(); showErrors([]); });
  row.append(nameLabel, stageLabel, remove); $('#new-members').append(row);
  invalidatePreview();
  return name;
}
async function fetchMembers() {
  const response = await fetch(new URL('../data/members.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Não foi possível carregar os membros. Confira a conexão e recarregue a página.');
  const data = await response.json();
  const validation = buildRanking(data, { includeInactive: true });
  if (validation.errors.length) throw new Error('Os dados do portal precisam ser corrigidos antes de gerar uma atualização. Avise o responsável pela publicação.');
  return { data, ranking: buildRanking(data).members };
}
async function sourceIsCurrent() {
  const latest = await fetchMembers();
  if (JSON.stringify(latest.data) === JSON.stringify(sourceMembers)) return true;
  const values = new Map(stageInputs().map((input) => [input.dataset.memberId, input.value]));
  const departures = departureIds();
  sourceMembers = latest.data; currentMembers = latest.ranking;
  renderInputs(values, departures); invalidatePreview();
  showErrors(['O portal recebeu outra atualização. Carregamos a base mais recente e preservamos os campos dos membros que continuam ativos. Confira também as entradas e saídas antes de gerar uma nova prévia.']);
  return false;
}
function readChanges() {
  const entries = [], additions = [], errors = [];
  for (const input of stageInputs()) {
    const value = input.value.trim();
    if (input.disabled || value === '') continue;
    const member = currentMembers.find((item) => item.id === input.dataset.memberId);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) errors.push(`${member.nickname}: digite um estágio inteiro, sem pontos ou vírgulas.`);
    else entries.push({ id: member.id, stage: Number(value) });
  }
  for (const row of newRows()) {
    const nickname = row.querySelector('[data-new-name]').value.trim();
    const stage = row.querySelector('[data-new-stage]').value.trim();
    if (!nickname && !stage) continue;
    if (!nickname || !/^\d+$/.test(stage) || !Number.isSafeInteger(Number(stage))) errors.push('Cada entrada precisa de nickname e estágio inteiro, sem pontos ou vírgulas.');
    else additions.push({ nickname, stage: Number(stage) });
  }
  return { entries, additions, departures: [...departureIds()], errors };
}
function previewRow(values) {
  const row = node('tr'); values.forEach((value) => row.append(node('td', value))); $('#preview-body').append(row);
}
function showPreview(result) {
  const changes = new Map(result.changes.map((change) => [change.id, change]));
  $('#preview-body').replaceChildren();
  for (const member of buildRanking(result.members).members.filter((member) => changes.has(member.id))) {
    const change = changes.get(member.id);
    previewRow([member.nickname, number(change.previousStage), number(change.stage), change.sameDay ? 'Correção do mesmo dia' : 'Atualização de estágio']);
  }
  for (const member of result.added) previewRow([member.nickname, '—', number(member.stage), member.reactivated ? 'Voltou à guild' : 'Entrou na guild']);
  for (const member of result.departed) {
    const original = currentMembers.find((item) => item.id === member.id);
    previewRow([member.nickname, number(original.currentStage), '—', 'Saiu da guild']);
  }
  const activeCount = buildRanking(result.members).members.length;
  $('#preview-description').textContent = `Data: ${formatDate($('#ranking-date').value)}. ${result.changes.length} estágio(s), ${result.added.length} entrada(s) e ${result.departed.length} saída(s). O arquivo terá ${activeCount} membros ativos, com históricos de ex-membros preservados.`;
  $('#correction-warning').hidden = !result.changes.some((change) => change.sameDay || change.delta < 0);
  $('#membership-warning').hidden = !result.added.length && !result.departed.length;
  candidate = result.members; $('#preview').hidden = false; $('#preview').focus();
}
$('#update-form').addEventListener('input', (event) => {
  if (event.target.matches('[data-departure-id]')) {
    const stage = stageInputs().find((input) => input.dataset.memberId === event.target.dataset.departureId);
    if (stage) stage.disabled = event.target.checked;
  }
  invalidatePreview(); updateCount(); showErrors([]);
});
$('#add-member').addEventListener('click', () => addNewRow().focus());
$('#apply-list').addEventListener('click', () => {
  const drafts = newRows().map((row) => ({ id: row.dataset.draftId, nickname: row.querySelector('[data-new-name]').value.trim() })).filter((member) => member.nickname);
  const result = parseRankingText($('#ranking-text').value, [...sourceMembers.filter((member) => member.active !== false), ...drafts]);
  if (result.errors.length) { showErrors(result.errors); return; }
  const values = new Map(result.entries.map((entry) => [entry.id, String(entry.stage)]));
  const departures = departureIds(); renderInputs(values, departures);
  newRows().forEach((row) => { row.querySelector('[data-new-stage]').value = values.get(row.dataset.draftId) ?? ''; });
  invalidatePreview(); showErrors([]);
  $('#paste-status').textContent = `${values.size} membro(s) preenchido(s). Confira os estágios e as saídas marcadas.`;
});
$('#update-form').addEventListener('submit', async (event) => {
  event.preventDefault(); invalidatePreview(); showErrors([]);
  const button = $('#update-form button[type="submit"]'); button.disabled = true;
  try {
    if (!await sourceIsCurrent()) return;
    const { entries, additions, departures, errors } = readChanges();
    if (errors.length) { showErrors(errors); return; }
    const result = prepareUpdate(sourceMembers, $('#ranking-date').value, entries, { additions, departures });
    if (result.errors.length) { showErrors(result.errors); return; }
    showPreview(result);
  } catch (error) { showErrors([error.message]); }
  finally { button.disabled = false; }
});
$('#edit-again').addEventListener('click', () => { invalidatePreview(); $('#ranking-date').focus(); });
$('#download').addEventListener('click', async () => {
  if (!candidate) return;
  const reviewedMembers = candidate;
  const button = $('#download'); button.disabled = true;
  try {
    if (!await sourceIsCurrent()) return;
    if (candidate !== reviewedMembers) return;
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = URL.createObjectURL(new Blob([`${JSON.stringify(reviewedMembers, null, 2)}\n`], { type: 'application/json' }));
    const link = node('a'); link.href = blobURL; link.download = 'members.json';
    document.body.append(link); link.click(); link.remove();
    $('#download-status').textContent = 'Download solicitado. Envie members.json ao responsável, incluindo as entradas, saídas e os históricos preservados.';
  } catch (error) { showErrors([error.message]); }
  finally { button.disabled = false; }
});
async function init() {
  try {
    const loaded = await fetchMembers(); sourceMembers = loaded.data; currentMembers = loaded.ranking;
    const today = new Date();
    $('#ranking-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    renderInputs(); addNewRow();
    $('#load-status').textContent = `${currentMembers.length} membros ativos carregados do portal. Nenhum estágio foi preenchido automaticamente.`;
    $('#update-form').hidden = false;
  } catch (error) { $('#load-status').textContent = ''; showErrors([error.message]); }
}
init();
