import { buildRanking, formatDate, parseDay } from './ranking.js';

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const signed = (value) => `${value > 0 ? '+' : ''}${number(value)}`;
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const progress = (member) => member.delta === null ? 'Sem histórico suficiente' : `${signed(member.delta)} estágios desde ${formatDate(member.previousDate)}`;
function dateNode(date) {
  const node = element('time', formatDate(date));
  node.dateTime = date;
  return node;
}
// Only local image paths are configurable; no HTML from JSON is injected.
function configuredImage(path, alt) {
  if (typeof path !== 'string' || !/^(?:\.\/)?assets\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..')) return null;
  const image = element('img');
  image.src = path;
  image.alt = alt;
  return image;
}
function renderContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content) || typeof content.name !== 'string' || !content.name.trim()) throw new Error('content.json: nome da guild inválido.');
  document.querySelectorAll('[data-guild-name]').forEach((node) => { node.textContent = content.name; });
  document.title = `${content.name} · Portal da Guild`;
  $('.brand small').textContent = content.game || 'Legend Slayer';
  $('#motto').textContent = content.motto || '';
  $('.footer p').textContent = content.motto || '';
  $('.footer small').textContent = `Portal da comunidade · ${content.game || 'Legend Slayer'}`;
  $('#description').textContent = content.description || '';
  $('#demo-banner').hidden = content.demo !== true;
  const crest = configuredImage(content.crestImage, `Brasão de ${content.name}`);
  if (crest) {
    crest.addEventListener('error', () => crest.replaceWith(element('span', 'L', 'brand-mark')), { once: true });
    $('.brand-mark').replaceWith(crest);
  }
  const mascotName = content.mascot?.name || 'Jörg';
  $('#mascot-name').textContent = mascotName;
  $('#mascot-image').setAttribute('aria-label', `Espaço reservado para a imagem de ${mascotName}`);
  const mascot = configuredImage(content.mascot?.image, mascotName);
  if (mascot) {
    const placeholder = $('#mascot-image');
    placeholder.removeAttribute('role');
    placeholder.removeAttribute('aria-label');
    placeholder.replaceChildren(mascot);
    $('#mascot-caption').hidden = true;
    mascot.addEventListener('error', () => {
      placeholder.replaceChildren(element('span', '✦'));
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', `Imagem de ${mascotName} indisponível`);
      $('#mascot-caption').hidden = false;
    }, { once: true });
  }
  const notices = Array.isArray(content.notices) ? content.notices : [];
  const validNotices = notices.filter((notice) => {
    try { parseDay(notice.date); return typeof notice.title === 'string' && typeof notice.text === 'string'; } catch { return false; }
  }).sort((a, b) => b.date.localeCompare(a.date));
  for (const notice of validNotices) {
    const article = element('article', undefined, 'notice');
    article.append(dateNode(notice.date), element('h3', notice.title), element('p', notice.text));
    $('#notices').append(article);
  }
  if (!validNotices.length) $('#notices').append(element('p', 'Nenhum aviso por enquanto.', 'muted'));
  if (validNotices.length !== notices.length) throw new Error('content.json: há avisos com data, título ou texto inválidos.');
  const rules = Array.isArray(content.rules) ? content.rules : [];
  for (const rule of rules) {
    if (typeof rule !== 'string') throw new Error('content.json: cada regra deve ser um texto.');
    $('#rules-list').append(element('li', rule));
  }
  if (!rules.length) $('#rules-list').append(element('li', 'A liderança ainda não publicou regras.'));
  if (content.goal && typeof content.goal.title === 'string' && typeof content.goal.text === 'string') {
    $('#goal').hidden = false;
    $('#goal').append(element('div', 'NOSSA META', 'eyebrow'), element('h3', content.goal.title), element('p', content.goal.text));
  }
}
function renderMembers(members, content) {
  const stats = [
    ['MEMBROS REGISTRADOS', number(members.length), 'Cada jornada importa'],
    ['MAIOR ESTÁGIO', members.length ? number(members[0].currentStage) : '—', 'No histórico da equipe'],
    ['ÚLTIMO REGISTRO', members.length ? formatDate(members.map((member) => member.lastDate).sort().at(-1)) : '—', 'Atualizações individuais'],
    ['NÍVEL DA GUILD', Number.isSafeInteger(content.level) && content.level >= 0 ? number(content.level) : '—', content.level == null ? 'Ainda não informado' : 'Configurado pela liderança']
  ];
  for (const [label, value, note] of stats) {
    const stat = element('div', undefined, 'stat');
    stat.append(element('small', label), element('strong', value), element('span', note));
    $('#stats').append(stat);
  }
  for (const member of members.slice(0, 3)) {
    const card = element('article', undefined, 'podium-card');
    const top = element('div', undefined, 'podium-top');
    top.append(element('span', `0${member.position}`, 'place'), element('small', member.position === 1 ? 'NA LIDERANÇA' : 'DESTAQUE'));
    const stage = element('p', number(member.currentStage), 'stage-value');
    stage.append(element('small', 'estágio atual'));
    card.append(top, element('h3', member.nickname), stage, element('p', member.delta === null ? 'Sem histórico suficiente' : `${signed(member.delta)} estágios no período`, 'progress-text'));
    $('#podium').append(card);
  }
  for (const member of members) {
    const row = element('tr');
    const values = [String(member.position).padStart(2, '0'), member.nickname, number(member.currentStage), member.delta === null ? 'Sem histórico suficiente' : signed(member.delta), member.previousDate ? formatDate(member.previousDate) : '—', member.dailyAverage === null ? '—' : number(member.dailyAverage), formatDate(member.lastDate)];
    values.forEach((value, index) => row.append(element('td', value, index === 3 ? (member.delta < 0 ? 'negative' : 'positive') : undefined)));
    $('#ranking-body').append(row);
    const card = element('details', undefined, 'panel member-card');
    const summary = element('summary');
    const meta = element('span', undefined, 'member-meta');
    meta.append(element('strong', `Estágio ${number(member.currentStage)}`), dateNode(member.lastDate));
    summary.append(element('span', member.nickname, 'member-name'), element('span', member.role, 'member-role'), meta);
    const history = element('div', undefined, 'history');
    history.append(element('p', progress(member)));
    if (member.dailyAverage !== null) history.append(element('p', `Média: ${number(member.dailyAverage)} estágios/dia em ${member.days} ${member.days === 1 ? 'dia' : 'dias'}.`));
    const list = element('ul');
    for (const record of member.history) {
      const item = element('li');
      item.append(dateNode(record.date), element('span', `Estágio ${number(record.stage)}`));
      list.append(item);
    }
    history.append(list, element('small', 'Registros em ordem cronológica. No mesmo dia, vale o último registro.'));
    card.append(summary, history);
    $('#member-list').append(card);
  }
  if (!members.length) {
    $('#member-list').append(element('p', 'Nenhum membro com estágio válido registrado.', 'muted'));
    const cell = element('td', 'Nenhum membro com estágio válido registrado.');
    cell.colSpan = 7;
    const row = element('tr'); row.append(cell); $('#ranking-body').append(row);
  }
}
async function loadJSON(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path.split('/').at(-1)} (${response.status}).`);
  return response.json();
}
async function init() {
  try {
    const [content, data] = await Promise.all([loadJSON('../data/content.json'), loadJSON('../data/members.json')]);
    renderContent(content);
    const { members, errors } = buildRanking(data);
    renderMembers(members, content);
    $('#status').textContent = errors.length ? `Atenção: ${errors.length} problema(s) nos dados. Corrija members.json. ${errors.map((error) => `${error.id || (error.index === null ? 'Arquivo' : `Membro ${error.index + 1}`)}: ${error.message}`).join('; ')}` : '';
  } catch (error) {
    $('#status').textContent = `Não foi possível carregar todos os dados. Confira os arquivos JSON e recarregue a página. ${error.message}`;
  }
}
init();
