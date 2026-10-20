import { eligibleMembers, drawWinner } from './raffle-engine.js';
import { normalizeResult } from './raffle-history-engine.js';

const $ = id => document.getElementById(id);
let members = [];
let snapshot = null;
let result = null;

function showError(message) {
  $('raffle-error').textContent = message;
  $('raffle-error').hidden = false;
}

function selectedMembers() {
  const ids = new Set([...$('participant-list').querySelectorAll('input:checked')].map(input => input.value));
  return members.filter(member => ids.has(member.id));
}

function updateCount() {
  const count = selectedMembers().length;
  $('selection-count').textContent = `${count} participante(s) · ${members.length - count} fora do sorteio`;
  $('review').disabled = count === 0;
}

function fillNames(id, list) {
  $(id).replaceChildren(...list.map(member => {
    const item = document.createElement('li');
    item.textContent = member.nickname;
    return item;
  }));
}

$('raffle-form').addEventListener('submit', event => {
  event.preventDefault();
  const participants = selectedMembers();
  if (!participants.length) return;
  const name = $('raffle-name').value.trim();
  if (!name) { $('raffle-name').focus(); return; }
  snapshot = { name, participants, excluded: members.filter(member => !participants.includes(member)) };
  $('review-name').textContent = name;
  $('review-count').textContent = `${participants.length} participante(s) · chance individual: 1 em ${participants.length}`;
  fillNames('review-participants', participants);
  fillNames('review-excluded', snapshot.excluded);
  $('excluded-empty').hidden = snapshot.excluded.length > 0;
  $('raffle-form').hidden = true;
  $('raffle-settings').disabled = true;
  $('raffle-review').hidden = false;
  $('review-title').focus();
});

$('edit').addEventListener('click', () => {
  snapshot = null;
  $('raffle-review').hidden = true;
  $('raffle-settings').disabled = false;
  $('raffle-form').hidden = false;
  $('review').focus();
});

$('draw').addEventListener('click', () => {
  if (!snapshot || result) return;
  $('draw').disabled = true;
  try {
    const winner = drawWinner(snapshot.participants);
    result = normalizeResult({ ...snapshot, winner, drawnAt: new Date().toISOString() });
    $('raffle-error').hidden = true;
    $('winner-name').textContent = winner.nickname;
    $('result-detail').textContent = `${result.name} · ${new Date(result.drawnAt).toLocaleString('pt-BR')} · ${result.participants.length} participante(s)`;
    $('raffle-review').hidden = true;
    $('raffle-result').hidden = false;
    $('result-title').focus();
  } catch (error) {
    showError(`Não foi possível sortear: ${error.message}`);
    $('draw').disabled = false;
  }
});

$('new-raffle').addEventListener('click', () => {
  result = null;
  snapshot = null;
  $('raffle-result').hidden = true;
  $('raffle-settings').disabled = false;
  $('raffle-form').hidden = false;
  $('draw').disabled = false;
  $('download-status').textContent = '';
  // Preserve exclusions so another draw never silently brings excluded members back.
  updateCount();
  $('raffle-name').focus();
});

$('download-result').addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sorteio-leaguebr-${result.drawnAt.replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('download-status').textContent = 'Download solicitado. Envie o JSON ao responsável pelo portal para conferência e publicação no histórico oficial.';
});

for (const [id, checked] of [['select-all', true], ['select-none', false]]) {
  $(id).addEventListener('click', () => {
    for (const input of $('participant-list').querySelectorAll('input')) input.checked = checked;
    updateCount();
  });
}
$('participant-list').addEventListener('change', updateCount);

async function init() {
  try {
    const response = await fetch('./data/members.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao carregar a lista de membros. Recarregue a página para tentar novamente.');
    members = eligibleMembers(await response.json()).sort((a, b) => a.nickname.localeCompare(b.nickname, 'pt-BR'));
    if (!members.length) throw new Error('Não há membros ativos cadastrados para participar.');
    for (const member of members) {
      const label = document.createElement('label');
      label.className = 'participant';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = member.id;
      input.checked = true;
      const name = document.createElement('span');
      name.textContent = member.nickname;
      label.append(input, name);
      $('participant-list').append(label);
    }
    updateCount();
    $('raffle-status').textContent = '';
    $('raffle-form').hidden = false;
  } catch (error) {
    $('raffle-status').textContent = '';
    showError(error.message);
  }
}
init();
