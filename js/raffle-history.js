import { parseResultFile, validateHistory, mergeOfficial } from './raffle-history-engine.js';

const $ = id => document.getElementById(id);
let history = [];
let candidate = null;
let revision = 0;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function resultCard(result) {
  const card = node('article', undefined, 'panel raffle-panel history-card');
  card.append(node('h3', result.name), node('p', `Vencedor: ${result.winner.nickname}`, 'history-winner'));
  const time = node('time', `${new Date(result.drawnAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)`);
  time.dateTime = result.drawnAt;
  card.append(time, node('p', `${result.participants.length} participante(s) · ${result.excluded.length} excluído(s)`));
  const details = node('details');
  details.append(node('summary', 'Ver participantes e excluídos'));
  for (const [title, members] of [['Participantes', result.participants], ['Fora do sorteio', result.excluded]]) {
    details.append(node('h4', title));
    if (!members.length) details.append(node('p', 'Nenhum.'));
    else {
      const list = node('ul', undefined, 'name-list');
      for (const member of members) list.append(node('li', `${member.nickname} [${member.id}]`));
      details.append(list);
    }
  }
  card.append(details);
  return card;
}

async function fetchHistory() {
  const response = await fetch('./data/raffles.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar o histórico oficial. Recarregue para tentar novamente.');
  return validateHistory(await response.json());
}

function renderHistory() {
  $('official-history').replaceChildren(...history.map(resultCard));
  $('history-status').textContent = history.length ? `${history.length} sorteio(s) oficial(is), do mais recente ao mais antigo.` : 'Nenhum sorteio oficial publicado ainda.';
}

function clearPreview() {
  candidate = null;
  $('import-preview').hidden = true;
  $('pending-result').replaceChildren();
  $('approve-result').checked = false;
  $('download-history').disabled = true;
  $('import-status').textContent = '';
  $('import-error').hidden = true;
}

function importError(error) {
  $('import-error').textContent = error.message;
  $('import-error').hidden = false;
}

$('result-file').addEventListener('change', async () => {
  const currentRevision = ++revision;
  clearPreview();
  const file = $('result-file').files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('O arquivo é muito grande. Selecione um resultado de até 1 MB.');
    const record = parseResultFile(await file.text());
    const latest = await fetchHistory();
    if (currentRevision !== revision) return;
    mergeOfficial(latest, record); // Validate duplicates before allowing review.
    history = latest;
    renderHistory();
    candidate = record;
    $('pending-result').append(resultCard(record));
    $('import-preview').hidden = false;
    $('import-title').focus();
  } catch (error) { if (currentRevision === revision) importError(error); }
});

$('approve-result').addEventListener('change', () => {
  $('download-history').disabled = !candidate || !$('approve-result').checked;
});

$('download-history').addEventListener('click', async () => {
  if (!candidate || !$('approve-result').checked) return;
  const reviewed = candidate;
  const currentRevision = revision;
  $('download-history').disabled = true;
  $('import-error').hidden = true;
  try {
    const latest = await fetchHistory();
    if (currentRevision !== revision || reviewed !== candidate || !$('approve-result').checked) return;
    if (JSON.stringify(latest) !== JSON.stringify(history)) {
      history = latest;
      renderHistory();
      clearPreview();
      $('result-file').value = '';
      throw new Error('O histórico mudou durante a conferência. Selecione o arquivo novamente para conferir sobre a versão mais recente.');
    }
    const merged = mergeOfficial(history, reviewed);
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(merged, null, 2)}\n`], { type: 'application/json' }));
    const link = node('a');
    link.href = url;
    link.download = 'raffles.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('import-status').textContent = `Download solicitado com ${merged.length} sorteio(s). Substitua data/raffles.json no GitHub para publicar. Esta prévia não alterou o histórico oficial.`;
  } catch (error) { importError(error); }
  finally { $('download-history').disabled = !candidate || !$('approve-result').checked; }
});

async function init() {
  try {
    history = await fetchHistory();
    renderHistory();
    $('result-file').disabled = false;
  } catch (error) {
    $('history-status').textContent = '';
    $('history-error').textContent = error.message;
    $('history-error').hidden = false;
  }
}
init();
