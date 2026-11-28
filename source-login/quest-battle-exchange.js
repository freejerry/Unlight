import { BATTLE_CARD_ART } from './battle-card.js';
import { playQuestBattleEffect } from './bgm.js';
import { sweepQuestTableCards } from './quest-battle-move.js';
import { questDiceEye } from './quest-dice-roll.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function append(parent, tag, id, className) {
  const node = document.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function presentation(exchange, distance) {
  const { phase, playerAttacks, attackCards, defenceCards, cards, defenceStartedAt, attackStartedAt } = exchange;
  const second = exchange.index === 2;
  if (playerAttacks === null) return null;
  if (cards || exchange.dice || exchange.duelFinish || ['complete', 'terminal', 'uncertain'].includes(phase)) return { role: 'result' };
  if (defenceCards) return null;
  if (phase === 'attack' || (phase === 'committing' && playerAttacks)) {
    return { role: 'attack', banner: second ? 'def_b' : 'atk_a', table: distance === 1 ? 'atk' : distance === 4 ? 'atk_all' : 'atk_l',
      timer: !attackCards, side: 'player' };
  }
  if (phase === 'defense' || (phase === 'committing' && !playerAttacks)) {
    return { role: 'defense', banner: second ? 'atk_b' : 'def_a', table: 'def', timer: !defenceCards, side: 'player' };
  }
  if (Number.isFinite(defenceStartedAt) && playerAttacks) {
    return { role: 'waiting', table: 'wait_atk', timer: !defenceCards, side: 'opponent' };
  }
  if (Number.isFinite(attackStartedAt) && !playerAttacks) {
    return { role: 'waiting', banner: second ? 'atk_b' : 'def_a', table: 'wait_def', timer: !attackCards, side: 'opponent' };
  }
  return null;
}

export function createQuestBattleExchange(battle, {
  signal, isCurrent, assets, status, hands, move, combatControls, showTable, showPhase, cutIn, startTimer, updateHp,
  initialHp, revealCards, drawOpponent, layer, sprite, place, animate, wait, loadDiceArt, playDiceRoll, playFeats, playHit, getHitSignal, playAttackPose, onSettled,
}) {
  const root = layer(battle, 'quest-battle-exchange', 26, 'quest-battle-exchange');
  const points = layer(root, 'quest-battle-combat-points', 0, 'quest-battle-combat-points');
  const rollArt = loadDiceArt();
  let damageLabel;
  void rollArt.then(art => { damageLabel = art?.damage?.label; }, () => {});
  let receipt;
  let shown;
  let stopTimer;
  let clearCutIn;
  let cutInExit;
  let seenReveal = false;
  let revealTask = Promise.resolve();
  let sweepTask;
  let featInsertion;
  let rolled = false;
  let hitCount = 0;
  let hpGate = Promise.resolve();
  let diceSettled = Promise.resolve();
  let pointsKey;
  let resultFinished;
  let visible = true;
  const health = { ...initialHp };
  const lastAbsoluteHp = {};

  function live() { return visible && !signal.aborted && isCurrent(); }

  function summary(exchange) {
    if (!receipt) {
      receipt = append(root, 'section', 'quest-battle-exchange-result', 'sr-only');
      receipt.setAttribute('aria-label', '攻防結果');
    }
    receipt.dataset.playerAttacks = String(exchange.playerAttacks);
    receipt.dataset.turn = String(exchange.turn);
    receipt.dataset.exchangeIndex = String(exchange.index);
    return receipt;
  }

  function paintPoints(state, visible) {
    const layout = assets?.points;
    const { player, opponent } = state.points ?? {};
    const key = visible ? `${player}:${opponent}` : '';
    if (pointsKey === key) return;
    pointsKey = key;
    points.replaceChildren();
    if (!layout || !visible) return;
    for (const [side, value, center] of [['player', player, layout.playerX], ['opponent', opponent, layout.foeX]]) {
      if (!Number.isInteger(value) || value < 0 || value > 9999) continue;
      const strip = append(points, 'div', `quest-battle-${side}-points`, 'quest-battle-point-line');
      strip.dataset.value = String(value);
      strip.setAttribute('aria-label', `${side === 'player' ? '我方' : '對手'}點數 ${value}`);
      const digits = String(value);
      const spacing = layout.digitWidth;
      const extra = Math.max(0, digits.length - 2) * spacing / 2;
      const left = center - digits.length * spacing / 2 + (side === 'player' ? -extra : extra);
      [...digits].forEach((digit, index) => {
        const glyph = layout.digits[Number(digit)];
        if (glyph) sprite(strip, { ...glyph, x: glyph.x + left + index * spacing, y: glyph.y + layout.y });
      });
    }
  }

  function paintRole(exchange, distance) {
    const next = presentation(exchange, distance);
    if (!next) {
      if (shown && (exchange.attackCards || exchange.defenceCards)) {
        stopTimer?.freeze?.();
        shown.timer = false;
        combatControls.hidden = true;
        move.setCombatRole(undefined);
      }
      return;
    }
    const activeInput = ['attack', 'defense'].includes(next.role);
    battle.dataset.combatRole = next.role;
    const label = { attack: '攻擊階段', defense: '防禦階段', waiting: '等待對手', result: '結算攻防' }[next.role];
    if (exchange.phase === 'uncertain') {
      status.value = '無法確認攻防操作。';
      status.className = 'quest-battle-status';
    } else if (shown?.role !== next.role) status.value = label;
    combatControls.hidden = !activeInput;
    move.setCombatRole(activeInput ? next.role : undefined);
    if (next.table !== shown?.table) showTable(next.table ?? 'blank');
    if (next.banner !== undefined && next.banner !== shown?.banner) showPhase(next.banner, activeInput);
    if (next.side !== shown?.side) {
      cutInExit = clearCutIn?.();
      clearCutIn = next.side ? cutIn(next.side) : undefined;
    }
    if (next.timer !== shown?.timer || next.role !== shown?.role) {
      if (next.role !== 'result' && next.role === shown?.role && !next.timer) stopTimer?.freeze?.();
      else {
        stopTimer?.();
        stopTimer = next.timer ? startTimer(activeInput ? move.onTimeout : undefined) : undefined;
      }
    }
    if (activeInput && next.role !== shown?.role) playQuestBattleEffect('phase', signal);
    paintPoints(exchange, next.role !== 'result');
    shown = next;
  }

  function showDiceReceipt(exchange) {
    const parent = summary(exchange);
    for (const [key, label, values] of [
      ['attack', '攻擊骰', exchange.dice.attackDice], ['defense', '防禦骰', exchange.dice.defenceDice],
    ]) {
      const group = append(parent, 'ol', `quest-battle-${key}-dice`, 'quest-battle-dice-record');
      group.setAttribute('aria-label', label);
      for (const value of values) {
        const die = append(group, 'li');
        die.dataset.value = String(value);
        die.dataset.eye = String(questDiceEye(value));
        die.textContent = die.dataset.eye;
      }
    }
  }

  async function drawResultSymbols(art, playerDice, foeDice, playerAttacks) {
    if (!art) return;
    const board = layer(root, 'quest-battle-dice-symbols', 2, 'quest-battle-dice-symbols');
    const markers = [];
    const rows = [];
    for (const [dice, own, attacker] of [[playerDice, true, playerAttacks], [foeDice, false, !playerAttacks]]) {
      const source = (attacker ? art.attack : art.defense)?.normal;
      if (!source?.file) continue;
      const positions = [];
      for (const [original, value] of dice.entries()) {
        const eye = questDiceEye(value);
        if (eye !== 1 && eye < 6) continue;
        const index = positions.length;
        const iniX = (own ? 270 : 680) - (original % 3) * 80;
        const iniY = 470 - Math.floor(original / 3) * 50;
        const x = 263 + (index % 5) * 60;
        const y = own ? 380 + Math.floor(index / 5) * 60 : 280 - Math.floor(index / 5) * 60;
        const marker = sprite(board, { ...source, x: x + source.x, y: y + source.y }, BATTLE_CARD_ART);
        marker.dataset.side = own ? 'player' : 'opponent';
        positions.push(marker);
        markers.push(animate(marker, [{ translate: `${iniX - x}px ${iniY - y}px` }, { translate: '0 0' }], 300, signal));
      }
      rows.push({ markers: positions, attacker, art: attacker ? art.attack : art.defense });
    }
    await Promise.all(markers);
    if (!live()) return;
    const successes = dice => dice.filter(value => [1, 6, 7].includes(questDiceEye(value))).length;
    const pairs = Math.min(successes(playerDice), successes(foeDice));
    await Promise.all(rows.flatMap(row => row.markers.map(async (marker, index) => {
      const frames = index < pairs ? row.art.cancel : row.attacker ? row.art.hit : undefined;
      if (frames?.frames?.length) {
        const x = Number.parseFloat(marker.style.left) - row.art.normal.x;
        const y = Number.parseFloat(marker.style.top) - row.art.normal.y;
        if (!reduced()) await wait(index * 100, signal);
        for (const frame of frames.frames) {
          if (!live()) return;
          if (frame?.file) {
            marker.src = `${BATTLE_CARD_ART}${frame.file}`;
            place(marker, x + frame.x, y + frame.y, frame.width, frame.height);
          }
          if (!reduced()) await wait(1000 / frames.framesPerSecond, signal);
        }
      } else if (index < pairs) await animate(marker, [{ opacity: 1 }, { opacity: 0, scale: 1.2 }], 500, signal, index * 100);
      if (index < pairs) marker.hidden = true;
    })));
    if (!reduced() && successes(playerDice) !== successes(foeDice)) await wait(500, signal);
    if (live()) await animate(board, [{ opacity: 1 }, { opacity: 0 }], 300, signal);
    board.remove();
  }

  async function sweepPlayedCards(reveal) {
    root.dataset.sweepState = 'moving';
    await sweepQuestTableCards(hands, reveal, { signal, isCurrent: live, animate, wait });
    if (live()) root.dataset.sweepState = 'settled';
  }

  async function showDice(exchange) {
    showDiceReceipt(exchange);
    const { playerAttacks, attackDice, defenceDice } = exchange.dice;
    await Promise.all([sweepTask, featInsertion]);
    if (!live() || !attackDice.length || !defenceDice.length) return;
    if (playAttackPose) {
      void Promise.resolve().then(() => live() && playAttackPose({ battle, playerAttacks, signal })).catch(() => false);
    }
    const playerDice = playerAttacks ? attackDice : defenceDice;
    const foeDice = playerAttacks ? defenceDice : attackDice;
    const canvas = append(root, 'canvas', 'quest-battle-dice-roll', 'quest-battle-dice-roll');
    canvas.setAttribute('aria-hidden', 'true');
    try {
      await playDiceRoll(canvas, { playerDice, foeDice, playerAttacks }, { signal,
        onThrow: () => playQuestBattleEffect('dice', signal) });
    } catch { /* A missing visual renderer does not change the authoritative dice record. */ }
    if (!reduced() && live()) await wait(500, signal);
    if (live()) await Promise.all([
      animate(canvas, [{ opacity: 1 }, { opacity: 0 }], 500, signal).then(() => canvas.remove()),
      rollArt.then(art => live() && drawResultSymbols(art?.diceResult, playerDice, foeDice, playerAttacks)),
    ]);
  }

  async function damageCaption(hit, x, hitSignal) {
    const number = append(root, 'span', undefined, 'quest-battle-damage-number');
    const parts = [number];
    try {
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(hit.damage);
      place(number, x - 240, 139, 250, 120);
      if (damageLabel) {
        const marker = sprite(root, { ...damageLabel, x: x + 23, y: 216 }, BATTLE_CARD_ART);
        if (marker) parts.push(marker);
      }
      await Promise.all(parts.map(node =>
        animate(node, [{ opacity: 0, scale: 4 }, { opacity: 1, scale: 1 }], 250, hitSignal, 300)));
      await wait(2200, hitSignal);
      if (hitSignal.aborted) return;
      await Promise.all(parts.map(node => animate(node, [{ opacity: 1 }, { opacity: 0 }], 220, hitSignal)));
    } finally {
      for (const part of parts) part.remove();
    }
  }

  function showDamage(hit, distance, hitSignal) {
    if (!hitSignal || hitSignal.aborted) return;
    playQuestBattleEffect(distance === 1 ? 'slash' : 'bullet', hitSignal);
    if (reduced()) return;
    const x = (hit.player ? [288, 184, 80, 184] : [472, 576, 680, 576])[distance - 1];
    if (Number.isFinite(x)) void damageCaption(hit, x, hitSignal).catch(() => {});
    if (playHit) void Promise.resolve().then(() => !hitSignal.aborted
      && playHit({ hit, distance, battle, signal: hitSignal })).catch(() => {});
  }

  function displayHits(exchange, distance) {
    const pending = exchange.damage.slice(hitCount);
    hitCount = exchange.damage.length;
    if (pending.length) {
      const parent = summary(exchange);
      let list = parent.querySelector('#quest-battle-damage-events');
      if (!list) {
        list = append(parent, 'ol', 'quest-battle-damage-events');
        list.setAttribute('aria-label', '受傷紀錄');
      }
      for (const hit of pending) {
        const row = append(list, 'li');
        row.dataset.player = String(hit.player);
        row.dataset.damage = String(hit.damage);
        row.dataset.nonHostile = String(hit.nonHostile);
        row.textContent = `${hit.player ? '我方' : '對手'} ${hit.damage}`;
      }
    }
    const previous = { ...health };
    const hits = pending.map(hit => {
      const side = hit.player ? 'player' : 'opponent';
      if (Number.isInteger(health[side])) health[side] = Math.max(0, health[side] - hit.damage);
      const hitSignal = hit.damage > 0 ? getHitSignal(side) : null;
      return { hit, hp: { ...health }, hitSignal };
    });
    for (const side of ['player', 'opponent']) {
      const absolute = exchange.hitPoints[side];
      if (!Number.isInteger(absolute) || absolute === lastAbsoluteHp[side]) continue;
      lastAbsoluteHp[side] = absolute;
      health[side] = absolute;
    }
    if (pending.length || !Object.is(previous.player, health.player) || !Object.is(previous.opponent, health.opponent)) {
      const confirmedHp = { ...health };
      const beforeHp = rolled ? diceSettled : Promise.all([sweepTask, featInsertion]);
      hpGate = hpGate.then(async () => {
        await beforeHp;
        if (!live()) return;
        if (!hits.length) {
          await updateHp(confirmedHp);
          return;
        }
        for (const [index, { hit, hp, hitSignal }] of hits.entries()) {
          if (!live()) return;
          const targetHp = index === hits.length - 1 ? confirmedHp : hp;
          if (hit.damage > 0) {
            void Promise.resolve().then(() => showDamage(hit, distance, hitSignal)).catch(() => {});
          }
          await updateHp(targetHp);
          if (hit.damage > 0) await wait(1000, signal);
        }
      });
    }
  }

  async function settle(exchange) {
    let queuedHp;
    do {
      queuedHp = hpGate;
      await Promise.all([diceSettled, queuedHp, sweepTask, featInsertion, cutInExit]);
    } while (live() && queuedHp !== hpGate);
    if (!live()) return;
    const result = summary(exchange);
    result.dataset.state = exchange.phase;
    result.dataset.boundary = exchange.boundary;
    hands.playerTable.hidden = true;
    hands.opponentTable.hidden = true;
    onSettled?.(exchange);
  }

  function update(state) {
    const exchange = state?.exchange;
    if (!exchange || !live()) return;
    battle.dataset.exchangeIndex = String(exchange.index);
    battle.dataset.exchangePhase = exchange.phase;
    if (exchange.playerAttacks !== null) battle.dataset.playerAttacks = String(exchange.playerAttacks);
    const distance = state.result?.distance ?? Number(battle.dataset.distance);
    paintRole(exchange, distance);
    if (Number.isSafeInteger(exchange.opponentTableCount) && !seenReveal && !exchange.cards) {
      drawOpponent(exchange.opponentTableCount);
    }
    // The exchange can be rendered during defense, but only the final server packet opens either table.
    if (exchange.cards && !seenReveal) {
      seenReveal = true;
      root.dataset.revealStage = 'final';
      revealTask = Promise.resolve().then(() => live() && revealCards(exchange.cards));
      sweepTask = revealTask.then(() => live() && sweepPlayedCards(exchange.cards));
    }
    if (exchange.cards && playFeats && state.feats?.used?.length) {
      featInsertion = revealTask.then(() => live() && playFeats(exchange));
    }
    if (exchange.dice && !rolled) {
      rolled = true;
      diceSettled = showDice(exchange);
    }
    displayHits(exchange, distance);
    if ((exchange.phase === 'terminal' || exchange.phase === 'complete') && exchange.boundary && !resultFinished) {
      resultFinished = true;
      void settle(exchange);
    }
    if (exchange.duelFinish) summary(exchange).dataset.duelResult = String(exchange.duelFinish.result);
    if (exchange.questFinish) summary(exchange).dataset.questResult = String(exchange.questFinish.result);
  }

  return {
    update,
    archive(turn, index) {
      visible = false;
      stopTimer?.();
      points.remove();
      const suffix = `${turn}-${index}`;
      root.id = `quest-battle-exchange-archive-${suffix}`;
      if (receipt) {
        receipt.id = `quest-battle-exchange-history-${suffix}`;
        for (const id of ['quest-battle-attack-dice', 'quest-battle-defense-dice', 'quest-battle-damage-events']) {
          const node = receipt.querySelector(`#${id}`);
          if (node) node.id = `${id}-${suffix}`;
        }
      }
      return root;
    },
  };
}
