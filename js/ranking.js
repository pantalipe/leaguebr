const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convert a strict Gregorian YYYY-MM-DD date to its UTC day number. */
export function parseDay(date) {
  if (typeof date !== "string") throw new TypeError("date must be YYYY-MM-DD");
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`invalid date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError(`invalid date: ${date}`);
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthLengths[month - 1]) throw new RangeError(`invalid date: ${date}`);

  // setUTCFullYear avoids Date.UTC's special interpretation of years 0..99.
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(0, 0, 0, 0);
  return instant.getTime() / DAY_MS;
}

/** Format a strict calendar date as Brazilian day/month/year. */
export function formatDate(date) {
  const match = DATE_PATTERN.exec(date);
  parseDay(date);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const compareText = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function issue(errors, index, id, message) {
  errors.push({ index, ...(id === undefined ? {} : { id }), message });
}

/** Build the current ranking, retaining valid history rows and reporting rejected data. */
export function buildRanking(input) {
  const errors = [];
  const result = [];
  if (!Array.isArray(input)) {
    return { members: [], errors: [{ index: null, message: "members must be an array" }] };
  }

  const ids = new Set();
  const nicknames = new Set();
  input.forEach((member, index) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      issue(errors, index, undefined, "member must be an object");
      return;
    }
    const id = typeof member.id === "string" ? member.id.trim() : "";
    const nickname = typeof member.nickname === "string" ? member.nickname.trim() : "";
    if (!id || !nickname) {
      issue(errors, index, id || undefined, "member requires a nonempty id and nickname");
      return;
    }
    if (ids.has(id) || nicknames.has(nickname)) {
      issue(errors, index, id, ids.has(id) ? "duplicate id" : "duplicate nickname");
      return;
    }
    ids.add(id);
    nicknames.add(nickname);

    const role = typeof member.role === "string" && member.role.trim() ? member.role.trim() : "Membro";
    const rows = Array.isArray(member.history) ? member.history : [];
    if (!Array.isArray(member.history)) issue(errors, index, id, "history must be an array");
    const valid = [];
    rows.forEach((row, historyIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        issue(errors, index, id, `history[${historyIndex}] must be an object`);
        return;
      }
      let day;
      try {
        day = parseDay(row.date);
      } catch {
        issue(errors, index, id, `history[${historyIndex}] has an invalid date`);
        return;
      }
      if (!Number.isSafeInteger(row.stage) || row.stage < 0) {
        issue(errors, index, id, `history[${historyIndex}] has an invalid stage`);
        return;
      }
      valid.push({ date: row.date, stage: row.stage, day, order: historyIndex });
    });
    if (!valid.length) {
      issue(errors, index, id, "nenhum registro de estágio válido");
      return;
    }
    valid.sort((a, b) => a.day - b.day || a.order - b.order);
    const history = valid.map(({ date, stage }) => ({ date, stage }));
    const current = valid[valid.length - 1];
    let previous;
    for (let i = valid.length - 2; i >= 0; i--) {
      if (valid[i].day !== current.day) {
        previous = valid[i];
        break;
      }
    }
    const delta = previous ? current.stage - previous.stage : null;
    const days = previous ? current.day - previous.day : null;
    result.push({
      id, nickname, role, history,
      currentStage: current.stage,
      lastDate: current.date,
      previousDate: previous ? previous.date : null,
      delta,
      days,
      dailyAverage: previous ? delta / days : null,
      position: 0,
    });
  });

  result.sort((a, b) => b.currentStage - a.currentStage || compareText.compare(a.nickname, b.nickname) || compareText.compare(a.id, b.id));
  result.forEach((member, index) => { member.position = index + 1; });
  return { members: result, errors };
}
