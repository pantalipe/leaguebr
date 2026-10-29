import { buildRanking, formatDate } from './ranking.js';
import { parseRankingText, prepareUpdate } from './update-ranking.js';
import { PROMOTIONS, getPromotion } from './promotions.js';
import { initMemberImport } from './member-import.js';

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
function promotionName(id) { return id ? getPromotion(id)?.name ?? `Promoção desconhecida (${id})` : 'Sem promoção'; }
function promotionImage(id, img) {
  const promotion = id ? getPromotion(id) : null;
  img.hidden = !promotion?.image;
  if (promotion?.image) { img.src = promotion.image; img.alt = `Emblema ${promotion.name}`; }
  else { img.removeAttribute('src'); img.alt = ''; }
}
function promotionSelect(labelText, currentValue, { existing = false, value = '' } = {}) {
  const field = node('div'); field.className = 'promotion-field';
  const label = node('label', labelText);
  const select = node('select'); select.className = 'promotion-select';
  const safeId = encodeURIComponent(String(currentValue));
  select.id = `promotion-${existing ? 'member' : 'new'}-${safeId}`;
  label.htmlFor = select.id;
  if (existing) select.dataset.promotionMemberId = currentValue;
  else select.dataset.newPromotion = '';
  const currentPromotion = existing ? sourceMembers.find(member => member.id === currentValue)?.promotion : null;
  const placeholder = node('option', existing ? `Manter promoção atual${currentPromotion ? ` · ${promotionName(currentPromotion)}` : ''}` : 'Sem promoção');
  placeholder.value = ''; select.append(placeholder);
  const clear = node('option', existing ? 'Remover promoção atual' : 'Remover promoção anterior (retorno)'); clear.value = '__clear__'; select.append(clear);
  for (const promotion of PROMOTIONS) {
    const option = node('option', promotion.name); option.value = promotion.id; select.append(option);
  }
  select.value = value;
  const preview = node('img'); preview.className = 'promotion-preview'; preview.alt = ''; promotionImage(value || currentPromotion, preview);
  field.append(label, select, preview);
  return { field, select, preview };
}
function updateCount() {
  const count = stageInputs().filter((input) => !input.disabled && input.value.trim() !== '').length;
  const departed = departureIds().size;
  const promotions = [...document.querySelectorAll('[data-promotion-member-id]')].filter(input => !input.disabled && input.value !== '').length;
  $('#filled-count').textContent = `${count} estágio(s) preenchido(s), ${promotions} promoção(ões) alterada(s) e ${departed} saída(s) marcada(s).`;
}
function renderInputs(values = new Map(), departures = new Set(), promotionValues = new Map()) {
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
    field.append(label, input);
    const promotion = promotionSelect(`Nova promoção de ${member.nickname}`, member.id, { existing: true, value: promotionValues.get(member.id) ?? '' });
    promotion.select.disabled = departure.checked;
    row.append(identity, field, promotion.field); $('#stage-entries').append(row);
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
  const promotion = promotionSelect(`Promoção do novo membro ${index}`, row.dataset.draftId);
  const remove = node('button', 'Remover'); remove.type = 'button'; remove.className = 'button secondary';
  remove.setAttribute('aria-label', `Remover entrada ${index}`);
  remove.addEventListener('click', () => { row.remove(); invalidatePreview(); showErrors([]); });
  row.append(nameLabel, stageLabel, promotion.field, remove); $('#new-members').append(row);
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
  const promotionValues = new Map([...document.querySelectorAll('[data-promotion-member-id]')].map(input => [input.dataset.promotionMemberId, input.value]));
  const departures = departureIds();
  sourceMembers = latest.data; currentMembers = latest.ranking;
  renderInputs(values, departures, promotionValues); invalidatePreview();
  showErrors(['O portal recebeu outra atualização. Carregamos a base mais recente e preservamos os campos dos membros que continuam ativos. Confira também as entradas e saídas antes de gerar uma nova prévia.']);
  return false;
}
function readChanges() {
  const entries = [], additions = [], promotions = [], errors = [];
  for (const input of stageInputs()) {
    const value = input.value.trim();
    if (input.disabled || value === '') continue;
    const member = currentMembers.find((item) => item.id === input.dataset.memberId);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) errors.push(`${member.nickname}: digite um estágio inteiro, sem pontos ou vírgulas.`);
    else entries.push({ id: member.id, stage: Number(value) });
  }
  for (const input of document.querySelectorAll('[data-promotion-member-id]')) {
    if (input.disabled || input.value === '') continue;
    promotions.push({ id: input.dataset.promotionMemberId, promotion: input.value === '__clear__' ? null : input.value });
  }
  for (const row of newRows()) {
    const nickname = row.querySelector('[data-new-name]').value.trim();
    const stage = row.querySelector('[data-new-stage]').value.trim();
    const promotion = row.querySelector('[data-new-promotion]').value;
    if (!nickname && !stage) continue;
    if (!nickname || !/^\d+$/.test(stage) || !Number.isSafeInteger(Number(stage))) errors.push('Cada entrada precisa de nickname e estágio inteiro, sem pontos ou vírgulas.');
    else additions.push({ nickname, stage: Number(stage), ...(promotion ? { promotion: promotion === '__clear__' ? null : promotion } : {}) });
  }
  return { entries, additions, departures: [...departureIds()], promotions, errors };
}
function previewRow(values) {
  const row = node('tr'); values.forEach((value) => row.append(node('td', value))); $('#preview-body').append(row);
}
function showPreview(result) {
  const changes = new Map(result.changes.map((change) => [change.id, change]));
  const promotions = new Map(result.promotions.map((change) => [change.id, change]));
  $('#preview-body').replaceChildren();
  const changedIds = new Set([...changes.keys(), ...promotions.keys()]);
  for (const member of buildRanking(result.members).members.filter((member) => changedIds.has(member.id))) {
    const change = changes.get(member.id), promotion = promotions.get(member.id);
    const actions = [];
    if (change) actions.push(change.sameDay ? 'Correção do mesmo dia' : 'Atualização de estágio');
    if (promotion) actions.push(`Promoção: ${promotionName(promotion.previousPromotion)} → ${promotionName(promotion.promotion)}`);
    previewRow([member.nickname, change ? number(change.previousStage) : '—', change ? number(change.stage) : '—', actions.join(' · ')]);
  }
  for (const member of result.added) {
    const saved = result.members.find(item => item.id === member.id);
    const action = member.reactivated ? 'Voltou à guild' : 'Entrou na guild';
    previewRow([member.nickname, '—', number(member.stage), saved?.promotion ? `${action} · Promoção: ${promotionName(saved.promotion)}` : action]);
  }
  for (const member of result.departed) {
    const original = currentMembers.find((item) => item.id === member.id);
    previewRow([member.nickname, number(original.currentStage), '—', 'Saiu da guild']);
  }
  const activeCount = buildRanking(result.members).members.length;
  $('#preview-description').textContent = `Data: ${formatDate($('#ranking-date').value)}. ${result.changes.length} estágio(s), ${result.promotions.length} promoção(ões), ${result.added.length} entrada(s) e ${result.departed.length} saída(s). O arquivo terá ${activeCount} membros ativos, com históricos de ex-membros preservados.`;
  $('#correction-warning').hidden = !result.changes.some((change) => change.sameDay || change.delta < 0);
  $('#membership-warning').hidden = !result.added.length && !result.departed.length;
  candidate = result.members; $('#preview').hidden = false; $('#preview').focus();
}
$('#update-form').addEventListener('input', (event) => {
  if (event.target.matches('[data-departure-id]')) {
    const stage = stageInputs().find((input) => input.dataset.memberId === event.target.dataset.departureId);
    if (stage) stage.disabled = event.target.checked;
    const promotion = [...document.querySelectorAll('[data-promotion-member-id]')].find(input => input.dataset.promotionMemberId === event.target.dataset.departureId);
    if (promotion) promotion.disabled = event.target.checked;
  }
  if (event.target.matches('.promotion-select')) {
    const existing = event.target.dataset.promotionMemberId;
    const savedPromotion = existing ? sourceMembers.find(member => member.id === existing)?.promotion : null;
    const selectedPromotion = event.target.value === '__clear__' ? null : event.target.value || savedPromotion;
    promotionImage(selectedPromotion, event.target.parentElement.querySelector('.promotion-preview'));
  }
  invalidatePreview(); updateCount(); showErrors([]);
});
$('#add-member').addEventListener('click', () => addNewRow().focus());
initMemberImport({
  getDepartures: () => [...departureIds()],
  getMembers: () => {
    const drafts = newRows().map(row => {
      const nickname = row.querySelector('[data-new-name]').value.trim();
      return { id: row.dataset.draftId, nickname, draft: true, returning: sourceMembers.some(member => member.active === false && member.nickname.toLocaleLowerCase('pt-BR') === nickname.toLocaleLowerCase('pt-BR')) };
    }).filter(member => member.nickname);
    return [...sourceMembers.filter(member => !drafts.some(draft => draft.nickname.toLocaleLowerCase('pt-BR') === member.nickname.toLocaleLowerCase('pt-BR') && member.active === false)), ...drafts];
  },
  onInvalidate: invalidatePreview,
  onError: showErrors,
  onApply: (entries, { departures: suggested = [], completeRoster = false } = {}) => {
    const departures = completeRoster ? new Set(suggested) : departureIds();
    if (entries.some(entry => departures.has(entry.id))) {
      showErrors(['Uma imagem selecionada corresponde a um membro marcado como saída. Desmarque essa imagem ou corrija a saída antes de aplicar.']); return false;
    }
    if (completeRoster) {
      for (const row of newRows()) if (!entries.some(entry => entry.id === row.dataset.draftId)) row.remove();
    }
    const values = new Map(stageInputs().map(input => [input.dataset.memberId, input.value]));
    const promotionValues = new Map([...document.querySelectorAll('[data-promotion-member-id]')].map(input => [input.dataset.promotionMemberId, input.value]));
    for (const entry of entries) { values.set(entry.id, String(entry.stage)); if (entry.promotion) promotionValues.set(entry.id, entry.promotion); }
    renderInputs(values, departures, promotionValues);
    for (const row of newRows()) {
      const entry = entries.find(value => value.id === row.dataset.draftId);
      if (!entry) continue;
      row.querySelector('[data-new-stage]').value = String(entry.stage);
      if (entry.promotion) {
        row.querySelector('[data-new-promotion]').value = entry.promotion;
        promotionImage(entry.promotion, row.querySelector('.promotion-preview'));
      }
    }
    for (const entry of entries) {
      if (!entry.isNew && !sourceMembers.some(member => member.id === entry.id && member.active === false)) continue;
      const existing = newRows().find(row => row.querySelector('[data-new-name]').value.trim().toLocaleLowerCase('pt-BR') === entry.nickname.toLocaleLowerCase('pt-BR'));
      const row = existing || addNewRow().closest('.new-member-row');
      row.querySelector('[data-new-name]').value = entry.nickname;
      row.querySelector('[data-new-stage]').value = String(entry.stage);
      if (entry.promotion) {
        row.querySelector('[data-new-promotion]').value = entry.promotion;
        promotionImage(entry.promotion, row.querySelector('.promotion-preview'));
      }
    }
  },
});
$('#apply-list').addEventListener('click', () => {
  const drafts = newRows().map((row) => ({ id: row.dataset.draftId, nickname: row.querySelector('[data-new-name]').value.trim() })).filter((member) => member.nickname);
  const result = parseRankingText($('#ranking-text').value, [...sourceMembers.filter((member) => member.active !== false), ...drafts]);
  if (result.errors.length) { showErrors(result.errors); return; }
  const values = new Map(result.entries.map((entry) => [entry.id, String(entry.stage)]));
  const promotionValues = new Map([...document.querySelectorAll('[data-promotion-member-id]')].map(input => [input.dataset.promotionMemberId, input.value]));
  const importedPromotions = new Map(result.entries.filter(entry => Object.hasOwn(entry, 'promotion')).map(entry => [entry.id, entry.promotion === null ? '__clear__' : entry.promotion]));
  for (const [id, promotion] of importedPromotions) promotionValues.set(id, promotion);
  const departures = departureIds(); renderInputs(values, departures, promotionValues);
  newRows().forEach((row) => {
    row.querySelector('[data-new-stage]').value = values.get(row.dataset.draftId) ?? '';
    if (importedPromotions.has(row.dataset.draftId)) {
      const select = row.querySelector('[data-new-promotion]');
      const value = importedPromotions.get(row.dataset.draftId);
      select.value = value;
      promotionImage(select.value, row.querySelector('.promotion-preview'));
    }
  });
  invalidatePreview(); showErrors([]);
  $('#paste-status').textContent = `${values.size} membro(s) preenchido(s). Confira os estágios, as promoções e as saídas marcadas.`;
});
$('#update-form').addEventListener('submit', async (event) => {
  event.preventDefault(); invalidatePreview(); showErrors([]);
  const button = $('#update-form button[type="submit"]'); button.disabled = true;
  try {
    if (!await sourceIsCurrent()) return;
    const { entries, additions, departures, promotions, errors } = readChanges();
    if (errors.length) { showErrors(errors); return; }
    const result = prepareUpdate(sourceMembers, $('#ranking-date').value, entries, { additions, departures, promotions });
    if (result.errors.length) { showErrors(result.errors); return; }
    if (buildRanking(result.members).members.length > 20) { showErrors(['A guild pode ter no máximo 20 membros ativos. Confira as entradas e saídas.']); return; }
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
