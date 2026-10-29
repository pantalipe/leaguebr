import { PROMOTIONS } from './promotions.js';

/** Review image results separately; mutate the form only after validating the selected batch. */
export function initMemberImport({ getMembers, getDepartures = () => [], onApply, onInvalidate, onError }) {
  const filesInput = document.querySelector('#member-images');
  const readButton = document.querySelector('#read-member-images');
  const status = document.querySelector('#member-image-status');
  const review = document.querySelector('#member-image-review');
  const list = document.querySelector('#member-image-results');
  const complete = document.querySelector('#member-roster-complete');
  const confirmation = document.querySelector('#member-roster-confirmation');
  const summary = document.querySelector('#member-roster-summary');
  const confirmButton = document.querySelector('#confirm-member-images');
  let rows = [], urls = [];
  let pending = null;
  const clean = value => value.trim().toLocaleLowerCase('pt-BR');
  function invalidateConfirmation() { pending = null; confirmation.hidden = true; }
  document.querySelector('#update-form').addEventListener('input', invalidateConfirmation);
  document.querySelector('#update-form').addEventListener('click', event => {
    if (event.target.closest('button') && !event.target.closest('#member-import')) invalidateConfirmation();
  });
  function reset() {
    urls.forEach(url => URL.revokeObjectURL(url)); urls = []; rows = [];
    list.replaceChildren(); review.hidden = true; complete.checked = false; invalidateConfirmation();
  }
  function element(tag, text) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function field(labelText, input) {
    input.setAttribute('aria-label', labelText);
    const label = element('label', labelText); label.append(input); return label;
  }
  filesInput.addEventListener('change', () => { reset(); status.textContent = ''; onInvalidate(); });
  window.addEventListener('pagehide', reset);
  readButton.addEventListener('click', async () => {
    const files = [...filesInput.files];
    if (!files.length || files.length > 20) { onError(['Selecione de 1 a 20 imagens por lote.']); return; }
    reset(); onInvalidate(); onError([]);
    readButton.disabled = true; filesInput.disabled = true;
    status.textContent = `Preparando ${files.length} imagem(ns)…`;
    try {
      const members = getMembers();
      const { readMemberImages } = await import('./member-reader.js');
      const results = await readMemberImages(files, { members, onProgress: progress => {
        status.textContent = typeof progress === 'string' ? progress : `${Math.min(progress.index + 1, progress.total)}/${progress.total}: ${progress.message}`;
      } });
      results.forEach((result, index) => {
        const item = element('li'); item.className = 'member-image-result';
        const image = element('img');
        const url = URL.createObjectURL(files[index]); urls.push(url);
        image.src = url; image.alt = `Print ${index + 1}: ${files[index].name}`; image.loading = 'lazy';
        const imageLink = element('a'); imageLink.href = url; imageLink.target = '_blank'; imageLink.rel = 'noopener';
        imageLink.setAttribute('aria-label', `Abrir print ${index + 1} em tamanho completo`); imageLink.append(image);
        const controls = element('div');
        controls.append(element('strong', `${index + 1}. ${files[index].name}`));
        const selected = element('input'); selected.type = 'checkbox';
        selected.checked = Boolean(result.memberId) && Number.isSafeInteger(result.stage) && result.stage >= 0;
        controls.append(field(`Usar imagem ${index + 1}`, selected));
        const member = element('select'); member.append(new Option('Selecione o membro', ''));
        members.forEach(value => member.append(new Option(`${value.nickname}${value.active === false || value.returning ? ' (retorno)' : ''}`, value.id)));
        member.append(new Option('Novo membro', '__new__'));
        member.value = result.memberId || (result.nickname && !members.some(value => clean(value.nickname) === clean(result.nickname)) ? '__new__' : '');
        const nickname = element('input'); nickname.type = 'text'; nickname.value = result.nickname || '';
        const nicknameField = field(`Nick se for novo membro da imagem ${index + 1}`, nickname);
        const toggleNickname = () => { nicknameField.hidden = member.value !== '__new__'; nickname.disabled = nicknameField.hidden; };
        member.addEventListener('change', toggleNickname); toggleNickname();
        const stage = element('input'); stage.type = 'text'; stage.inputMode = 'numeric'; stage.value = result.stage ?? '';
        const promotion = element('select'); promotion.append(new Option('Manter promoção atual', ''));
        PROMOTIONS.forEach(value => promotion.append(new Option(value.name, value.id)));
        promotion.value = result.promotion || '';
        controls.append(field(`Membro da imagem ${index + 1}`, member), nicknameField, field(`Estágio da imagem ${index + 1}`, stage), field(`Promoção da imagem ${index + 1}`, promotion));
        const warnings = [...(result.warnings || [])];
        if (result.error) warnings.push(result.error);
        if (!result.memberId) warnings.push(`Confira o nick lido: ${result.nickname || 'não reconhecido'}. Selecione o cadastro existente ou confirme a possível entrada como novo membro.`);
        if (!result.promotion) warnings.push('Promoção não confirmada: mantenha o cadastro ou escolha no campo acima.');
        controls.append(element('p', warnings.join(' ') || 'Confira os dados com o print antes de aplicar.'));
        item.append(imageLink, controls); list.append(item);
        rows.push({ selected, member, nickname, stage, promotion });
      });
      review.hidden = false;
      status.textContent = `${results.length} imagem(ns) processada(s). Confira os resultados antes de usar.`;
    } catch (error) { onError([error.message]); status.textContent = 'Não foi possível concluir a leitura. Tente novamente.'; }
    finally { readButton.disabled = false; filesInput.disabled = false; }
  });
  document.querySelector('#apply-member-images').addEventListener('click', () => {
    invalidateConfirmation();
    const entries = [], errors = [], seen = new Set();
    const members = new Map(getMembers().map(member => [member.id, member]));
    rows.forEach((row, index) => {
      if (!row.selected.checked) return;
      const member = members.get(row.member.value), value = row.stage.value.trim();
      const isNew = row.member.value === '__new__', nickname = isNew ? row.nickname.value.trim() : member?.nickname;
      if (!member && !isNew) errors.push(`Imagem ${index + 1}: selecione um membro válido.`);
      if (isNew && (!nickname || [...members.values()].some(value => clean(value.nickname) === clean(nickname)))) errors.push(`Imagem ${index + 1}: informe um nick novo ou selecione o cadastro existente.`);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) errors.push(`Imagem ${index + 1}: informe um estágio inteiro válido.`);
      const key = clean(nickname || '');
      if (seen.has(key)) errors.push(`Imagem ${index + 1}: membro repetido. Selecione apenas uma imagem por membro.`);
      seen.add(key);
      entries.push({ id: isNew ? `image-new-${index}` : row.member.value, nickname, isNew, stage: Number(value), ...(row.promotion.value ? { promotion: row.promotion.value } : {}) });
    });
    if (!entries.length) errors.push('Selecione ao menos um resultado para usar.');
    if (errors.length) { onError(errors); return; }
    const departures = complete.checked ? [...members.values()].filter(member => !member.draft && member.active !== false && !entries.some(entry => entry.id === member.id)).map(member => member.id) : [];
    const active = [...members.values()].filter(member => !member.draft && member.active !== false).length;
    const additions = entries.filter(entry => entry.isNew || members.get(entry.id)?.active === false || members.get(entry.id)?.draft);
    const leaving = complete.checked ? departures : getDepartures();
    if (active - leaving.length + additions.length > 20) { onError(['A composição resultaria em mais de 20 membros. Confira as saídas e se o lote está completo.']); return; }
    summary.replaceChildren();
    const groups = [
      ['Entradas', additions.filter(entry => entry.isNew || (members.get(entry.id)?.draft && !members.get(entry.id)?.returning)).map(entry => entry.nickname)],
      ['Retornos', entries.filter(entry => members.get(entry.id)?.active === false || members.get(entry.id)?.returning).map(entry => entry.nickname)],
      ['Saídas sugeridas', departures.map(id => members.get(id).nickname)],
    ];
    groups.forEach(([label, names]) => summary.append(element('p', `${label}: ${names.length ? names.join(', ') : 'nenhuma'}.`)));
    summary.append(element('p', `${entries.length} perfil(is) selecionado(s). ${complete.checked ? 'Lote declarado completo: confira todas as saídas sugeridas.' : 'Lote parcial: ausências não geram saída.'}`));
    pending = { entries, departures, completeRoster: complete.checked };
    confirmation.hidden = false; onError([]); confirmButton.focus();
  });
  confirmButton.addEventListener('click', () => {
    if (!pending) return;
    const { entries, ...options } = pending;
    if (onApply(entries, options) === false) return;
    onError([]); onInvalidate(); invalidateConfirmation();
    status.textContent = `${entries.length} membro(s) preenchido(s). Confira a atualização antes de baixar.`;
  });
}
