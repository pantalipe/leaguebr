import { buildRanking, formatDate } from './ranking.js';
import { parseRankingText, prepareUpdate } from './update-ranking.js';

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('pt-BR').format(value);
let sourceMembers = [];
let currentMembers = [];
let candidate = null;
let blobURL = null;

function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}
function showErrors(messages) {
  const box = $('#errors');
  box.replaceChildren();
  box.hidden = !messages.length;
  if (!messages.length) return;
  const list = node('ul');
  messages.forEach((message) => list.append(node('li', message)));
  box.append(list);
  box.focus();
}
function invalidatePreview() {
  candidate = null;
  $('#preview').hidden = true;
  $('#download-status').textContent = '';
  if (blobURL) { URL.revokeObjectURL(blobURL); blobURL = null; }
}
function stageInputs() { return [...document.querySelectorAll('[data-member-id]')]; }
function updateCount() {
  const count = stageInputs().filter((input) => input.value.trim() !== '').length;
  $('#filled-count').textContent = count ? `${count} de ${currentMembers.length} membros preenchidos.` : 'Nenhum membro preenchido.';
}
function renderInputs(values = new Map()) {
  $('#stage-entries').replaceChildren();
  for (const [index, member] of currentMembers.entries()) {
    const row = node('li'); row.className = 'stage-entry';
    const identity = node('div');
    identity.append(node('strong', member.nickname), node('small', `Atual: ${number(member.currentStage)} · ${formatDate(member.lastDate)}`));
    const field = node('div');
    const label = node('label', `Novo estágio de ${member.nickname}`);
    label.className = 'sr-only'; label.htmlFor = `stage-${index}`;
    const input = node('input');
    input.id = label.htmlFor;
    input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*';
    input.autocomplete = 'off'; input.dataset.memberId = member.id;
    input.value = values.get(member.id) ?? '';
    input.placeholder = 'Em branco';
    field.append(label, input); row.append(identity, field); $('#stage-entries').append(row);
  }
  updateCount();
}
async function fetchMembers() {
  const response = await fetch(new URL('../data/members.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Não foi possível carregar os membros. Confira a conexão e recarregue a página.');
  const data = await response.json();
  const ranking = buildRanking(data);
  if (ranking.errors.length || !ranking.members.length) throw new Error('Os dados do portal precisam ser corrigidos antes de gerar uma atualização. Avise o responsável pela publicação.');
  return { data, ranking: ranking.members };
}
async function sourceIsCurrent() {
  const latest = await fetchMembers();
  if (JSON.stringify(latest.data) === JSON.stringify(sourceMembers)) return true;
  const values = new Map(stageInputs().map((input) => [input.dataset.memberId, input.value]));
  sourceMembers = latest.data; currentMembers = latest.ranking;
  renderInputs(values); invalidatePreview();
  showErrors(['O portal recebeu outra atualização. Carregamos os registros mais recentes e mantivemos seus campos. Confira a nova base e clique em “Conferir atualização” novamente.']);
  return false;
}
function readEntries() {
  const entries = [];
  const errors = [];
  for (const input of stageInputs()) {
    const value = input.value.trim();
    if (value === '') continue;
    const member = currentMembers.find((item) => item.id === input.dataset.memberId);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) errors.push(`${member.nickname}: digite um estágio inteiro, sem pontos ou vírgulas.`);
    else entries.push({ id: member.id, stage: Number(value) });
  }
  return { entries, errors };
}
function showPreview(result) {
  const changes = new Map(result.changes.map((change) => [change.id, change]));
  const ranked = buildRanking(result.members).members.filter((member) => changes.has(member.id));
  $('#preview-body').replaceChildren();
  for (const member of ranked) {
    const change = changes.get(member.id);
    const row = node('tr');
    [member.nickname, number(change.previousStage), number(change.stage), change.sameDay ? 'Correção do mesmo dia' : 'Novo registro'].forEach((value) => row.append(node('td', value)));
    $('#preview-body').append(row);
  }
  const count = result.changes.length;
  $('#preview-description').textContent = `Data: ${formatDate($('#ranking-date').value)}. ${count} membro(s) atualizado(s); ${currentMembers.length - count} mantido(s) sem alteração. O arquivo preserva os registros anteriores dos outros dias.`;
  $('#correction-warning').hidden = !result.changes.some((change) => change.sameDay || change.delta < 0);
  candidate = result.members;
  $('#preview').hidden = false;
  $('#preview').focus();
}
$('#update-form').addEventListener('input', () => { invalidatePreview(); updateCount(); showErrors([]); });
$('#apply-list').addEventListener('click', () => {
  const result = parseRankingText($('#ranking-text').value, sourceMembers);
  if (result.errors.length) { showErrors(result.errors); return; }
  const values = new Map(result.entries.map((entry) => [entry.id, String(entry.stage)]));
  renderInputs(values); invalidatePreview(); showErrors([]);
  $('#paste-status').textContent = `${values.size} membro(s) preenchido(s). Confira os campos abaixo.`;
});
$('#update-form').addEventListener('submit', async (event) => {
  event.preventDefault(); invalidatePreview(); showErrors([]);
  const button = $('#update-form button[type="submit"]');
  button.disabled = true;
  try {
    if (!await sourceIsCurrent()) return;
    const { entries, errors } = readEntries();
    if (errors.length) { showErrors(errors); return; }
    const result = prepareUpdate(sourceMembers, $('#ranking-date').value, entries);
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
    $('#download-status').textContent = 'Download solicitado. Procure members.json na pasta de downloads e envie o arquivo ao responsável pela publicação.';
  } catch (error) { showErrors([error.message]); }
  finally { button.disabled = false; }
});
async function init() {
  try {
    const loaded = await fetchMembers(); sourceMembers = loaded.data; currentMembers = loaded.ranking;
    const today = new Date();
    $('#ranking-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    renderInputs();
    $('#load-status').textContent = `${currentMembers.length} membros carregados do portal. Nenhum estágio foi preenchido automaticamente.`;
    $('#update-form').hidden = false;
  } catch (error) { $('#load-status').textContent = ''; showErrors([error.message]); }
}
init();
