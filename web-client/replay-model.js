const OUTCOMES = new Set(['won', 'lost', 'draw']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPair(value, validate) {
  return Array.isArray(value) && value.length === 2 && validate(value[0]) && validate(value[1]);
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isCardList(value) {
  if (!Array.isArray(value)) return false;
  for (const id of value) {
    if (!isNonnegativeInteger(id)) return false;
  }
  return true;
}

export function parseReplayTrace(source) {
  if (!isRecord(source) || !Number.isSafeInteger(source.seed)) {
    throw new Error('Invalid replay seed.');
  }
  if (!isPair(source.outcome, (value) => OUTCOMES.has(value))) {
    throw new Error('Invalid replay outcome.');
  }
  if (!Array.isArray(source.trace) || source.trace.length === 0) {
    throw new Error('Replay trace contains no events.');
  }

  const events = [];
  let previousTick = -1;
  let previousTurn = 0;
  for (const [index, raw] of source.trace.entries()) {
    const path = `trace[${index}]`;
    if (!isRecord(raw)) throw new Error(`Invalid replay event at ${path}.`);
    const { tick, turn, phase, hp } = raw;
    if (!isNonnegativeInteger(tick) || tick < previousTick) {
      throw new Error(`Invalid replay tick at ${path}.tick.`);
    }
    if (!Number.isSafeInteger(turn) || turn < 1 || turn < previousTurn) {
      throw new Error(`Invalid replay turn at ${path}.turn.`);
    }
    if (typeof phase !== 'string' || !phase.trim()) {
      throw new Error(`Invalid replay phase at ${path}.phase.`);
    }
    if (!isPair(hp, isNonnegativeInteger)) {
      throw new Error(`Invalid replay HP at ${path}.hp.`);
    }

    let drawCounts = null;
    if ((phase === 'draw' || phase === 'draw_event') && Object.hasOwn(raw, 'cards')) {
      if (!isPair(raw.cards, isCardList)) {
        throw new Error(`Invalid replay draw lists at ${path}.cards.`);
      }
      drawCounts = raw.cards.map((cards) => cards.length);
    }
    const last = index === source.trace.length - 1;
    if ((phase === 'finished') !== last) {
      throw new Error('Replay trace must end with exactly one finished event.');
    }
    if (last && (!isPair(raw.outcome, (value) => OUTCOMES.has(value))
        || raw.outcome.some((value, side) => value !== source.outcome[side]))) {
      throw new Error(`Replay outcome differs from ${path}.outcome.`);
    }

    events.push({ tick, turn, phase, hp: [...hp], drawCounts, raw });
    previousTick = tick;
    previousTurn = turn;
  }
  return { seed: source.seed, outcome: [...source.outcome], events };
}
