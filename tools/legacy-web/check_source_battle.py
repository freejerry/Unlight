"""Verify source Quest battle presentation and starter skills against a disposable Ruby stage."""

import argparse
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright

import check_source_lobby as qa


STAGE = '#quest-map-battle'
HAND = '#quest-battle-player-hand'
TABLE = '#quest-battle-opponent-table'


def observe_battle_receipts(page, origin):
    # Extend the existing recorder without modifying encoding, server traffic, or the original frame order.
    page.route(origin + '/wire.js?qa-original', lambda route: route.fulfill(content_type='text/javascript', body="""
      export * from './wire.js?battle-original';
      import { createFrameParser as parse, encodeCommand as encode, readReply as read } from './wire.js?battle-original';
      const captured = new WeakSet();
      export function createFrameParser() {
        const parser = parse();
        function dispatch(body, receive) {
          const wire = window.qaQuestWire;
          const gate = wire?.battleFrameHold;
          if (!gate || wire.receiving !== gate.peer) return receive(body);
          const command = ((body[0] ^ (gate.key?.[0] ?? 0)) << 8)
            | (body[1] ^ (gate.key?.[gate.key.length > 1 ? 1 : 0] ?? 0));
          if (!gate.frames.length && command === gate.stopBefore && gate.skip > 0) {
            gate.skip--;
            return receive(body);
          }
          if (gate.frames.length || command === gate.stopBefore) {
            gate.frames.push({command, deliver: () => dispatch(body, receive)});
          } else receive(body);
        }
        return {reset: () => parser.reset(), push: (chunk, receive) => parser.push(chunk, body => dispatch(body, receive))};
      }
      export function encodeCommand(command, fields, key) {
        const frame = encode(command, fields, key);
        const trace = window.qaQuestWire?.sockets.at(-1);
        if (trace?.characterRequests && command === 35) {
          trace.characterRequests.push([command, frame.byteLength, fields[0]?.value]);
        }
        return frame;
      }
      export function readReply(body) {
        const reply = read(body);
        const trace = window.qaQuestWire?.receiving;
        if (!trace || captured.has(body) || ![40,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,60,61,62,65,66,67,68,69,72,73,83,107,108,109,110,115,120].includes(reply.command)) return reply;
        captured.add(body);
        const audit = read(body);
        const values = reply.command === 40 && body.byteLength === 7 ? [audit.byte(), audit.byte(), audit.byte()]
          : [107,108].includes(reply.command) && body.byteLength === 6 ? [audit.int()]
          : [83,110,115].includes(reply.command) && body.byteLength === 7 ? [audit.byte(), audit.int()]
          : reply.command === 109 && body.byteLength === 19 ? [audit.byte(), audit.int(), audit.int(), audit.int(), audit.int()]
          : reply.command === 120 && body.byteLength >= 15 ? [audit.byte(), audit.int(), audit.int(), audit.string(4096, true)]
          : reply.command === 72 && body.byteLength >= 12 ? [audit.byte(), audit.byte(), audit.int(), audit.string(4096, true)]
          : reply.command === 57 && body.byteLength >= 12 ? [audit.byte(), audit.byte(), audit.string(4096, true), audit.string(4096, true)]
          : reply.command === 49 && body.byteLength === 4 ? [audit.byte(), audit.byte()]
          : [51,67,68,69].includes(reply.command) && body.byteLength === 3 ? [audit.byte()] : [];
        (trace.battleAudit ??= []).push([reply.command, body.byteLength, ...values, performance.now()]);
        return reply;
      }
    """))


def defer_battle_frames(page, stop_before, *, skip=0):
    assert page.evaluate("""({stopBefore, skip}) => {
      const wire = window.qaQuestWire;
      const {peer, key} = wire.actionHold;
      wire.battleFrameHold = {peer, key, stopBefore, skip, frames: []};
      return wire.endActionHold(true);
    }""", {'stopBefore': stop_before, 'skip': skip}) > 0


def release_battle_frames(page, *, next_gate=None):
    page.evaluate("""stopBefore => {
      const wire = window.qaQuestWire;
      const {peer, key, frames} = wire.battleFrameHold;
      wire.battleFrameHold = stopBefore === null ? null : {peer, key, stopBefore, frames: []};
      wire.receiving = peer;
      try { for (const {deliver} of frames) deliver(); } finally { wire.receiving = null; }
    }""", next_gate)


def observe_battle_motion(page):
    page.evaluate("""() => {
      const evidence = window.qaBattleMotion = {
        deals: {}, backs: {}, sweeps: {}, moveSweeps: {}, standing: [], stages: [], health: [], featSlots: [], featFrames: {},
        chooserMotion: [], forcedSweeps: {},
      };
      const identities = new WeakMap();
      const bounds = ['x', 'y', 'width', 'height'];
      let serial = 0;
      let phaseKey;
      let healthKey;
      let featKey;
      let chooserKey;
      let lastStanding = 0;
      function box(node, boundsOrigin) {
        const rect = node.getBoundingClientRect();
        return bounds.map(key => Math.round(rect[key] - (key === 'x' || key === 'y' ? boundsOrigin[key] : 0)));
      }
      function painted(node) {
        if (!node || node.hidden || (node instanceof HTMLImageElement && !node.naturalWidth)) return false;
        for (let parent = node; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
          if (parent.id === 'quest-map-battle') break;
        }
        return true;
      }
      function series(collection, node, root, now, context = {}) {
        if (!identities.has(node)) identities.set(node, ++serial);
        const samples = collection[identities.get(node)] ??= [];
        const pixels = box(node, root);
        if (samples.length < 24 && pixels.join() !== samples.at(-1)?.position.join()) {
          samples.push({at: now, position: pixels, opacity: Number(getComputedStyle(node).opacity), ...context,
            zone: node.parentNode.id, direction: node.dataset.coveredTransfer ?? null,
            identified: node.hasAttribute('data-card-id'), cardId: node.dataset.cardId ? +node.dataset.cardId : null});
        }
      }
      function frame(now) {
        const battle = document.getElementById('quest-map-battle');
        if (battle) {
          const root = battle.getBoundingClientRect();
          const {phase, exchangePhase, exchangeIndex, combatRole, moveResult, intro, burn, outcomeState, turn} = battle.dataset;
          const distance = battle.dataset.distance === undefined ? null : Number(battle.dataset.distance);
          const diceNode = battle.querySelector('#quest-battle-dice-roll');
          const dice = diceNode && (diceNode.dataset.state || 'mounted');
          const exchange = battle.querySelector('#quest-battle-exchange');
          const sweep = exchange?.dataset.sweepState;
          const result = battle.querySelector('#quest-battle-result')?.dataset.state;
          const key = [phase, exchangePhase, exchangeIndex, moveResult, intro, burn, outcomeState, turn, dice, sweep, result, distance].join(':');
          if (key !== phaseKey) {
            evidence.stages.push({at: now, phase, exchangePhase, exchangeIndex, moveResult, intro, burn,
              outcomeState, turn, dice, sweep, result, distance});
            phaseKey = key;
          }
          const chooser = battle.querySelector('#quest-battle-character-change[data-state="open"]');
          if (chooser) {
            if (!identities.has(chooser)) identities.set(chooser, ++serial);
            const identity = identities.get(chooser);
            const reserve = chooser.querySelector('#quest-battle-change-left');
            const enabled = Boolean(reserve && !reserve.disabled && reserve.getAttribute('aria-disabled') !== 'true');
            const layer = battle.querySelector('#quest-battle-cut-ins');
            const poses = [...(layer?.querySelectorAll('img[data-side]') ?? [])].filter(painted)
              .map(image => [image.dataset.side, Number(image.dataset.cardId)]);
            const mounted = Boolean(layer);
            const state = JSON.stringify([turn, identity, enabled, mounted, poses]);
            if (state !== chooserKey) {
              evidence.chooserMotion.push({at: now, turn, identity, enabled, mounted, poses});
              chooserKey = state;
            }
          }
          if (turn === '1' && ['1', '2'].includes(exchangeIndex)) {
            const indicator = battle.querySelector('#quest-battle-player-hp');
            const comparison = Array.from(battle.querySelectorAll('#quest-battle-dice-symbols img')).some(painted);
            const caption = Array.from(battle.querySelectorAll('.quest-battle-damage-number')).find(painted)?.textContent ?? null;
            const done = battle.querySelector('button[data-combat-command="done"]');
            const attackReady = exchangeIndex === '2' && combatRole === 'attack' && painted(done) && !done.disabled;
            const hp = painted(indicator) ? Number(indicator.dataset.hp) : null;
            const state = [exchangeIndex, dice, comparison, caption, hp, attackReady].join(':');
            if (state !== healthKey) {
              evidence.health.push({at: now, exchangeIndex, dice, comparison, caption, hp, attackReady});
              healthKey = state;
            }
          }
          if (battle.querySelector('#quest-battle-player-character[data-card-id="635"]') && exchange?.dataset.exchangeKey) {
            const exchangeKey = exchange.dataset.exchangeKey;
            const presentation = exchange.dataset.presentation ?? null;
            const audit = window.qaQuestWire.sockets.at(-1)?.battleAudit ?? [];
            const received = audit.filter(([command]) => command === 109).length;
            const slots = [['player', 3], ['opponent', 0]].map(([side, slot]) =>
              Number(battle.querySelector('.quest-battle-skill-name[data-side="' + side + '"][data-feat-index="' + slot + '"]')?.dataset.skillId) || null);
            const clips = [];
            for (const clip of battle.querySelectorAll('.quest-battle-feat')) {
              const image = clip.querySelector('img');
              if (!painted(image)) continue;
              const {activatedSkillId, featSequence, side} = clip.dataset;
              clips.push(Number(activatedSkillId));
              const samples = evidence.featFrames[activatedSkillId] ??= [];
              const file = (image.currentSrc || image.src).split('/').at(-1);
              if (samples.at(-1)?.file !== file || samples.at(-1)?.sequence !== featSequence) {
                samples.push({at: now, file, sequence: featSequence, side, exchangeKey});
              }
            }
            const hp = ['player', 'opponent'].map(side => Number(battle.querySelector('#quest-battle-' + side + '-hp')?.dataset.hp));
            const comparison = [...exchange.querySelectorAll('#quest-battle-dice-symbols img')].some(painted);
            const change = battle.dataset.characterChangePresentation ?? null;
            const state = JSON.stringify([exchangeKey, presentation, received, slots, clips, Boolean(dice), comparison, hp, change]);
            if (state !== featKey) {
              evidence.featSlots.push({at: now, exchangeKey, presentation, received, slots, clips, dice: Boolean(dice), comparison, hp, change});
              featKey = state;
            }
          }
          if (phase === 'draw') {
            for (const node of battle.querySelectorAll('#quest-battle-player-hand .quest-battle-hand-card')) {
              series(evidence.deals, node, root, now);
            }
          }
          for (const node of battle.querySelectorAll('[data-covered-transfer]')) {
            series(evidence.backs, node, root, now);
          }
          const discard = battle.querySelectorAll('#quest-battle-player-table > [data-sweep="discard"], #quest-battle-opponent-table > [data-sweep="discard"]');
          const moveDiscard = moveResult === 'sweeping' && sweep !== 'moving' && discard.length > 0;
          for (const node of discard) {
            if (moveDiscard) {
              series(evidence.moveSweeps, node, root, now, {distance, up: node.dataset.up ?? null});
            } else if (sweep === 'moving') series(evidence.sweeps, node, root, now);
            else if (battle.dataset.characterChangeKind === 'defeated' && battle.dataset.characterChangePresentation === 'sweeping') {
              series(evidence.forcedSweeps, node, root, now);
            }
          }
          if (moveDiscard || ((phase === 'move' || ['revealing', 'sweeping'].includes(moveResult)) && now - lastStanding >= 50)) {
            const actors = Array.from(battle.querySelectorAll('.quest-battle-stand'));
            const stands = actors.map(node => [node.dataset.side, painted(node), box(node, root)]);
            const avatar = battle.querySelector('.quest-battle-avatar-layer .quest-battle-avatar');
            if (evidence.standing.length < 800) evidence.standing.push({at: now, phase,
              result: moveResult ?? null, stands, avatar: painted(avatar), distance, moveDiscard,
              standDistances: actors.map(node => Number(node.dataset.distance))});
            lastStanding = now;
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }""")


def sent_quest_actions(page):
    return [packet for packet in qa.read_movement_trace(page)['sent'] if packet != [3, 5]]


def expect_covered(opponent):
    assert opponent.locator('[data-card-id], .quest-battle-reveal-card').count() == 0
    expect(opponent.locator('canvas:not([aria-hidden="true"])')).to_have_count(0)


def snapshot(page, stage, directory, name):
    qa.capture(stage, directory, name + '.png', animations='allow')
    return {'frame': name, 'sent': sent_quest_actions(page), 'replies': len(qa.read_movement_trace(page)['replies'])}


def character_raster(character):
    canvas = character.locator('canvas.quest-battle-character-card')
    expect(canvas).to_be_visible()
    pixels = canvas.evaluate("""async canvas => {
      const {width, height} = canvas;
      const {data} = canvas.getContext('2d').getImageData(0, 0, width, height);
      const hash = await crypto.subtle.digest('SHA-256', data);
      const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      return {width, height, sha256, opaque: data.filter((alpha, i) => i % 4 === 3 && alpha === 255).length};
    }""")
    assert (pixels['width'], pixels['height']) == (168, 240) and pixels['opaque'] > 10000, pixels
    return pixels


def match_reserve_bounds(locator, battle, expected):
    expect(locator).to_be_visible()
    bounds = locator.bounding_box()
    base = battle.bounding_box()
    observed = [bounds['x'] - base['x'], bounds['y'] - base['y'], bounds['width'], bounds['height']]
    assert all(abs(actual - source) < 1 for actual, source in zip(observed, expected, strict=True)), (observed, expected)
    return observed


def check_bench_hover(page, stage, battle, directory, *, reserve_index, card_id, hp, skill_id,
                      max_hp=None, name=None, prefix='04-q82'):
    tabs = battle.locator('#quest-battle-reserve-tabs')
    tab = tabs.locator(f'.quest-battle-reserve-tab[data-roster-index="{reserve_index}"][data-card-id="{card_id}"]')
    trigger = tab.locator('[data-reserve-trigger]')
    card = battle.locator(f'#quest-battle-reserve-character-{reserve_index}')
    slide = card.locator('xpath=..')
    active = battle.locator('#quest-battle-player-character')
    plate_kind = 'dead' if hp == 0 else 'base'
    plate = tab.locator(f'img[src$="quest-battle-reserve-tab-{plate_kind}.png"]')
    expect(tabs.locator('.quest-battle-reserve-tab')).to_have_count(1)
    expect(tab.locator('[data-reserve-field="hp"]')).to_have_text(str(hp) if hp else '')
    expect(tab.locator('[data-reserve-field="maxHp"]')).to_have_text(str(max_hp if max_hp is not None else hp))
    if name:
        expect(tab.locator('[data-reserve-field="name"]')).to_have_text(name)
    expect(trigger).to_have_attribute('aria-expanded', 'false')
    expect(card).to_be_hidden()
    closed_bounds = match_reserve_bounds(plate, battle, [168, 648, 168, 32])
    trigger_bounds = match_reserve_bounds(trigger, battle, [168, 648, 168, 32])
    expect(plate).to_have_js_property('naturalWidth', 168)
    expect(plate).to_have_js_property('naturalHeight', 32)
    active_id = active.get_attribute('data-card-id')
    active_health = battle.locator('#quest-battle-player-hp').inner_text()
    sent = sent_quest_actions(page)
    base = battle.bounding_box()
    page.mouse.move(base['x'] + 252, base['y'] + 664)
    expect(trigger).to_have_attribute('aria-expanded', 'true')
    expect(card).to_have_attribute('data-card-id', str(card_id))
    expect(card).to_have_attribute('data-face', 'front')
    expect(card).to_have_css('opacity', '1')
    expect(slide).to_have_css('transition-duration', '0.15s')
    expect(card).to_have_css('filter', 'brightness(0.5)' if hp == 0 else 'none')
    page.wait_for_function("""index => {
      const view = document.getElementById('quest-battle-reserve-character-' + index);
      const board = document.getElementById('quest-map-battle');
      return view && Math.abs(view.getBoundingClientRect().top - board.getBoundingClientRect().top - 440) < 0.25;
    }""", arg=reserve_index, timeout=qa.TIMEOUT)
    open_bounds = match_reserve_bounds(card, battle, [168, 440, 168, 240])
    open_plate = match_reserve_bounds(plate, battle, [168, 408, 168, 32])
    pixels = character_raster(card)
    flip = card.locator('.quest-battle-character-flip')
    cue = flip.locator('img.quest-battle-character-turn-cue[src$="/battle-card-art/chara-front-turn.png"]')
    expect(flip).to_be_visible()
    expect(flip).to_be_enabled()
    page.mouse.move(base['x'] + 252, base['y'] + 547)
    expect(trigger).to_have_attribute('aria-expanded', 'true')
    expect(cue).to_be_visible()
    expect(cue).to_have_js_property('naturalWidth', 88)
    expect(cue).to_have_js_property('naturalHeight', 48)
    expect(cue).to_have_css('opacity', '1')
    cue_bounds = match_reserve_bounds(cue, battle, [216, 544, 87.95, 47.95])
    opened = snapshot(page, stage, directory, f'{prefix}-bench-{card_id}-original-rollover-front')

    flip.click(position={'x': 84, 'y': 180})
    expect(card).to_have_attribute('data-face', 'back')
    expect(flip).to_be_enabled()
    expect(cue).to_be_hidden()
    expect(card.locator(f'.quest-battle-character-feat[data-feat-id="{skill_id}"]')).to_be_visible()
    if hp == 0:
        expect(card).to_have_css('filter', 'brightness(0.5)')
    reverse = snapshot(page, stage, directory, f'{prefix}-bench-{card_id}-authored-reverse')
    page.mouse.move(base['x'] + 380, base['y'] + 600)
    expect(trigger).to_have_attribute('aria-expanded', 'false')
    expect(card).to_have_js_property('inert', True)
    expect(card).to_have_css('opacity', '0')
    page.mouse.move(base['x'] + 252, base['y'] + 664)
    expect(trigger).to_have_attribute('aria-expanded', 'true')
    expect(card).to_have_attribute('data-face', 'back')
    expect(card).to_have_css('opacity', '1')
    expect(cue).to_be_hidden()
    reopened = snapshot(page, stage, directory, f'{prefix}-bench-{card_id}-retained-reverse-after-reopening')
    flip.click(position={'x': 84, 'y': 180})
    expect(card).to_have_attribute('data-face', 'front')
    expect(flip).to_be_enabled()
    page.mouse.move(base['x'] + 380, base['y'] + 600)
    expect(trigger).to_have_attribute('aria-expanded', 'false')
    expect(card).to_have_js_property('inert', True)
    expect(card).to_have_css('opacity', '0')
    expect(slide).to_have_css('transition-duration', '0.08s')
    restored = match_reserve_bounds(plate, battle, [168, 648, 168, 32])
    expect(active).to_have_attribute('data-card-id', active_id)
    expect(battle.locator('#quest-battle-player-hp')).to_have_text(active_health)
    assert sent_quest_actions(page) == sent
    closed = snapshot(page, stage, directory, f'{prefix}-bench-{card_id}-after-original-rollout')
    return {'opened': opened, 'reverse': reverse, 'reopened': reopened, 'closed': closed, 'plateBounds': closed_bounds,
            'triggerBounds': trigger_bounds, 'expandedBounds': open_bounds, 'expandedPlateBounds': open_plate,
            'turnCueBounds': cue_bounds, 'restoredBounds': restored, 'raster': pixels}


def check_opponent_hover(page, stage, battle, directory):
    tabs = battle.locator('#quest-battle-opponent-tabs')
    tab = tabs.locator('.quest-battle-opponent-tab[data-roster-index="0"][data-card-id="1004"]')
    trigger = tab.locator('#quest-battle-opponent-trigger[data-opponent-trigger]')
    plate = tab.locator('img[src$="quest-battle-reserve-tab-base.png"]')
    card = battle.locator('#quest-battle-opponent-character')
    slide = card.locator('xpath=..')
    flip = card.locator('.quest-battle-character-flip')
    cue = flip.locator('img.quest-battle-character-turn-cue[src$="/battle-card-art/chara-front-turn.png"]')
    health = battle.locator('#quest-battle-opponent-hp')
    move_done = battle.locator('button[data-move-command="done"]')
    base = battle.bounding_box()

    def pointer(x, y):
        page.mouse.move(base['x'] + x, base['y'] + y)

    def expand(face):
        pointer(110, 17)
        expect(trigger).to_have_attribute('aria-expanded', 'true')
        expect(card).to_have_attribute('data-card-id', '1004')
        expect(card).to_have_attribute('data-face', face)
        expect(card).to_have_css('opacity', '1')
        expect(slide).to_have_css('transition-duration', '0.15s')
        page.wait_for_function("""() => {
          const view = document.getElementById('quest-battle-opponent-character');
          const board = document.getElementById('quest-map-battle');
          return view && Math.abs(view.getBoundingClientRect().top - board.getBoundingClientRect().top) < 0.25;
        }""", timeout=qa.TIMEOUT)
        pointer(110, 170)
        expect(trigger).to_have_attribute('aria-expanded', 'true')
        return match_reserve_bounds(card, battle, [0, 0, 168, 240])

    def collapse():
        pointer(205, 210)
        expect(trigger).to_have_attribute('aria-expanded', 'false')
        expect(card).to_have_js_property('inert', True)
        expect(card).to_have_css('opacity', '0')
        expect(slide).to_have_css('transition-duration', '0.08s')
        return match_reserve_bounds(plate, battle, [0, 0, 168, 32])

    expect(tabs.locator('.quest-battle-opponent-tab')).to_have_count(1)
    expect(health).to_have_text('1/1')
    expect(trigger).to_be_enabled()
    expect(trigger).to_have_attribute('aria-expanded', 'false')
    expect(card).to_be_hidden()
    expect(move_done).to_be_enabled()
    expect(plate).to_have_js_property('naturalWidth', 168)
    expect(plate).to_have_js_property('naturalHeight', 32)
    collapsed = match_reserve_bounds(plate, battle, [0, 0, 168, 32])
    match_reserve_bounds(trigger, battle, [0, 0, 168, 32])
    fields = {'name': ('蝙蝠', [8, 2, 130, 18]), 'hp': ('1', [138, -2, 30, 25]),
              'level': ('1', [14, 19, 19, 14]), 'attack': ('3', [61, 19, 19, 14]),
              'defense': ('1', [100, 19, 19, 14]), 'maxHp': ('1', [150, 19, 19, 14])}
    for field, (text, geometry) in fields.items():
        label = tab.locator(f'[data-reserve-field="{field}"]')
        expect(label).to_have_text(text)
        match_reserve_bounds(label, battle, geometry)
    sent = sent_quest_actions(page)
    rest = snapshot(page, stage, directory, '05-q1-opponent-tab-at-rest')
    opened = expand('front')
    raised_plate = match_reserve_bounds(plate, battle, [0, 240, 168, 32])
    raster = character_raster(card)
    expect(card.locator('canvas.quest-battle-character-card')).to_have_attribute('aria-label', '蝙蝠 Lv.1 · HP 1 · ATK 3 · DEF 1')
    expect(cue).to_be_visible()
    expect(cue).to_have_css('opacity', '1')
    cue_bounds = match_reserve_bounds(cue, battle, [48, 104, 87.95, 47.95])
    front = snapshot(page, stage, directory, '05-q1-opponent-raised-front')

    flip.click(position={'x': 110, 'y': 170})
    expect(card).to_have_attribute('data-face', 'back')
    expect(flip).to_be_enabled()
    expect(cue).to_be_hidden()
    rear = card.locator('.quest-battle-character-review img[src$="/battle-card-art/chara-reverse-plate.png"]')
    expect(rear).to_be_visible()
    expect(rear).to_have_js_property('naturalWidth', 168)
    expect(card.locator('.quest-battle-character-feat')).to_have_count(0)
    reverse = snapshot(page, stage, directory, '05-q1-opponent-raised-reverse')
    collapse()
    expand('back')
    expect(rear).to_be_visible()
    expect(cue).to_be_hidden()
    reopened = snapshot(page, stage, directory, '05-q1-opponent-reopened-reverse')
    flip.click(position={'x': 110, 'y': 170})
    expect(card).to_have_attribute('data-face', 'front')
    expect(flip).to_be_enabled()
    assert character_raster(card) == raster
    collapse()
    expect(health).to_have_text('1/1')
    expect(battle.locator('#quest-battle-player-hp')).to_have_text('7/7')
    expect(battle).to_have_attribute('data-phase', 'move')
    expect(move_done).to_be_enabled()
    assert sent_quest_actions(page) == sent
    restored = snapshot(page, stage, directory, '05-q1-opponent-tab-restored')
    return {'rest': rest, 'front': front, 'reverse': reverse, 'reopened': reopened, 'restored': restored,
            'restBounds': collapsed, 'openedBounds': opened, 'raisedPlateBounds': raised_plate,
            'turnCueBounds': cue_bounds, 'raster': raster}


def close_battle_lobby_notices(page, stage, origin):
    check = qa.wait_lobby_achievement_check(page, 1)
    response = page.request.get(origin + '/source-login/lobby-achievement-art/index.json')
    assert response.ok
    assets = response.json()
    challenges = qa.startup_challenges(page, check, assets)
    source = page.evaluate('window.qaQuestWire.startupData')
    grants = [packet[2:] for packet in source if packet[:2] == [22, 22]]
    grants.extend(packet[2:] for packet in check['replies'] if packet[:2] == [51, 22])
    cards = assets['card']
    supported = {1: cards.get('characters', {}), 3: cards.get('items', {}), 5: {'0': cards.get('gem')}}
    grants = [grant for grant in grants if str(grant[0]) in assets['achievements']
              and supported.get(grant[1], {}).get(str(grant[2]))]
    news_opened = False
    notice = page.locator('#lobby-achievement-notice[open]')
    while grants or challenges or not news_opened:
        page.wait_for_function("""() => document.querySelector(
          '#lobby-news[open], #lobby-achievement-notice[open][data-state="ready"]')""", timeout=qa.TIMEOUT)
        if page.locator('#lobby-news[open]').is_visible():
            assert not news_opened
            qa.close_lobby_news(page, stage, None, restores_title=not grants and not challenges)
            news_opened = True
        elif notice.get_attribute('data-kind') == 'new-achievement':
            assert challenges
            qa.confirm_new_lobby_challenge(page, stage, None, challenges.pop(0), '')
        else:
            fields = notice.evaluate("""({dataset: data}) =>
              ['achievementId', 'treasureType', 'itemId', 'amount', 'slotType'].map(field => +data[field])""")
            assert fields in grants, (fields, grants)
            grants.remove(fields)
            notice.locator('#lobby-achievement-notice-ok').click()
    expect(notice).to_have_count(0)
    assert qa.read_lobby_achievement_trace(page)['sent'] == check['sent']


def enter_battle(page, origin, database, user, password, directory, quest_id, *, hold_condition=False, roster_size=1):
    ((player_id, flags),) = qa.player(database, user)
    (profile,) = qa.avatar(database, player_id)
    avatar_id = profile[0]
    assert flags == 0
    deck = qa.quest_deck(database, avatar_id)
    assert len(deck) == roster_size and all(entry[2:] == (position, 0) for position, entry in enumerate(deck)), deck
    locked = [entry[:3] + (1,) for entry in deck]
    observe_battle_receipts(page, origin)
    stage, live, errors = qa.open_quest_fixture(page, origin, player_id, user, password,
                                              lobby_achievements=True, defer_lobby_notices=True)
    close_battle_lobby_notices(page, stage, origin)
    owned = qa.quest_inventory(database, avatar_id)
    if not owned:
        assert quest_id == 1
        quest = qa.search_first_quest(page, stage, directory, database, avatar_id)
    else:
        (quest,) = owned
        assert quest[1:3] == (quest_id, 0), quest
        page.locator('#lobby-quest-load').click()
        qa.screen(stage, 'quest-map')
        expect(page.locator('#quest-map-view')).to_have_attribute('data-state', 'ready', timeout=qa.TIMEOUT)
        if quest_id == 82:
            expect(page.locator('#quest-map-view')).to_have_attribute('data-map-id', '6')

    if owned:
        detail, _ = qa.start_preowned_quest(page, database, player_id, quest, locked,
                                           ap_cost={82: 2, 568: 4}.get(quest_id, 0))
    else:
        inventory_id = quest[0]
        start_offset = len(qa.read_movement_trace(page)['replies'])
        page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"] .quest-map-row-open').click()
        detail = page.locator('#quest-map-detail')
        expect(detail).to_have_attribute('data-quest-status', '1')
        detail.locator('[data-quest-command="start"]').click()
        expect(detail).to_have_attribute('data-quest-status', '2', timeout=qa.TIMEOUT)
        qa.wait_quest_start_lock(page, database, avatar_id, quest[:2] + (2,) + quest[3:], locked)
        after_search = qa.read_movement_trace(page)['replies'][start_offset:]
        assert [packet for packet in after_search if packet[0] in (4, 17)] == [
            [17, 11, inventory_id, 1, 1], [4, 10, 4], [17, 11, inventory_id, 2, 1],
        ], after_search
    first_land = detail.locator('button.quest-map-detail-land[data-slot="1"]')
    if quest_id == 4:
        first_land.click()
        expect(detail).to_have_attribute('data-progress', '2', timeout=qa.TIMEOUT)
        entering = detail.locator('button.quest-map-detail-land[data-slot="4"]')
    else:
        assert quest_id in (1, 82, 568)
        entering = first_land
    page.emulate_media(reduced_motion='no-preference')
    observe_battle_motion(page)
    qa.observe_quest_opening_audio(page)
    if hold_condition:
        page.evaluate('window.qaQuestWire.holdAction(22, {before: [120]})')
    else:
        page.evaluate('window.qaQuestWire.holdAction(22, {through: 45})')
    entering.click()
    battle = page.locator(STAGE)
    expect(battle).to_have_attribute('data-burn', 'settled', timeout=qa.TIMEOUT)
    page.wait_for_function('() => window.qaQuestWire.actionHold.queued.length > 0', timeout=qa.TIMEOUT)
    return stage, battle, live, errors, avatar_id, quest, deck


def check_draw(page, stage, battle, directory, *, release=qa.release_movement_reply):
    trace = qa.read_movement_trace(page)
    start = next(packet for packet in trace['replies'] if packet[0] == 40)
    (_, _, deck_size, player_event_size, foe_event_size, distance, _) = start
    replies = [packet for packet in trace['replies'] if 43 <= packet[0] <= 46]
    assert [packet[0] for packet in replies] == [43, 44, 45], replies
    assert trace['readySends'] == [['settled', 'complete']], trace['readySends']
    expect(battle).to_have_attribute('data-phase', 'draw')
    expect(battle.locator(f'{HAND} .quest-battle-hand-card')).to_have_count(0)
    deck_count = battle.locator('#quest-battle-deck-count')
    expect(deck_count).to_have_text(str(deck_size))
    # The native view must paint the source main deck, not just a numeric counter.
    deck = battle.locator('#quest-battle-deck-stock')
    expect(deck).to_be_visible()
    expect(deck).to_have_attribute('data-count', str(deck_size))
    assert deck.evaluate("""canvas => {
      const {width, height} = canvas;
      const style = getComputedStyle(canvas);
      return width === 56 && height === 59 && style.left === '8px' && style.top === '42px'
        && canvas.getContext('2d').getImageData(0, 0, width, height).data
          .some((value, index) => index % 4 === 3 && value > 0);
    }"""), 'Missing rendered source deck'
    checkpoints = [snapshot(page, stage, directory, '02-deck-and-draw-before-sc46')]
    release(page)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    cards = [[card_id, bool(mask & (1 << index)), kind]
             for kind, (_, _, ids, mask, _) in zip(('action', 'event'), replies[1:])
             for index, card_id in enumerate(ids)]
    qa.check_dealt_cards(battle.locator(f'{HAND} .quest-battle-hand-card'), cards)
    qa.check_opponent_backs(page, replies[1][-1] + replies[2][-1])
    remaining = deck_size - len(replies[1][2]) - replies[1][-1]
    expect(deck_count).to_have_text(str(remaining))
    expect(deck).to_have_attribute('data-count', str(remaining))
    evidence = page.evaluate('window.qaBattleMotion.deals')
    flights = []
    for samples in evidence.values():
        visible = [sample for sample in samples if sample['opacity'] > 0.1]
        if len(visible) < 2:
            continue
        origin_x, origin_y, *_ = visible[0]['position']
        destination_x, destination_y, *_ = visible[-1]['position']
        if destination_x - origin_x > 40 and destination_y - origin_y > 150:
            flights.append([visible[0], visible[-1]])
    assert flights, evidence
    checkpoints.append(snapshot(page, stage, directory, '06-action-and-event-hand-after-source-flight'))
    return {'deckStart': [deck_size, player_event_size, foe_event_size], 'openingRange': distance,
            'hand': cards, 'draws': replies, 'flights': flights, 'checkpoints': checkpoints}


def check_eased_condition(page, stage, battle, directory):
    receipt = [120, 30, 1, 0, 2, '近:防1+,特1+']
    first_turn = [115, 120, 43]
    card = battle.locator('#quest-battle-player-character[data-card-id="3"]')
    flip = card.locator('.quest-battle-character-flip')
    reverse = card.locator('.quest-battle-character-review')
    thorn = reverse.locator('.quest-battle-character-feat[data-feat-id="7"][data-feat-index="2"]')
    chips = reverse.locator('#quest-battle-character-requirements-2')
    changed = card.locator('.quest-battle-character-feat[data-condition-changed="true"]')
    assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 120
    trace = qa.read_movement_trace(page)
    assert [row[:-1] for row in trace['battleAudit'] if row[0] in first_turn] == [[115, 7, 1, 38]]
    baseline = sent_quest_actions(page)
    expect(flip).to_be_enabled()
    flip.click(position={'x': 84, 'y': 180})
    expect(card).to_have_attribute('data-face', 'back')
    expect(flip).to_be_enabled()
    expect(thorn).to_have_text('茨林')
    thorn.click()
    expect(thorn).to_have_attribute('aria-pressed', 'true')
    expect(changed).to_have_count(0)
    expect(chips).to_have_attribute('data-cards', '特2+,防2+')
    expect(battle.locator(f'{HAND} .quest-battle-hand-card')).to_have_count(0)
    base = snapshot(page, stage, directory, '05-original-thorn-condition-before-sc120')
    defer_battle_frames(page, 43)
    page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 43', timeout=qa.TIMEOUT)
    trace = qa.read_movement_trace(page)
    assert [row[:-1] for row in trace['battleAudit'] if row[0] in first_turn] == [[115, 7, 1, 38], receipt]
    expect(changed).to_have_count(1)
    expect(thorn).to_have_attribute('data-condition-changed', 'true')
    expect(thorn).to_have_css('color', 'rgb(14, 224, 252)')
    expect(chips).to_have_attribute('data-cards', '防1+,特1+')
    for kind in ('shd', 'str'):
        expect(chips.locator(f'.quest-battle-character-chip[data-type="{kind}"][data-frame="11"]')).to_be_visible()
    expect(battle.locator(f'{HAND} .quest-battle-hand-card')).to_have_count(0)
    confirmed = snapshot(page, stage, directory, '07-authoritative-thorn-condition-before-sc43')
    flip.press('Enter')
    expect(card).to_have_attribute('data-face', 'front')
    expect(flip).to_be_enabled()
    assert sent_quest_actions(page) == baseline
    release_battle_frames(page, next_gate=46)
    page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 46', timeout=qa.TIMEOUT)
    return {'receipt': receipt, 'base': base, 'confirmed': confirmed}


def check_attention_controls(page, stage, battle, directory, card_id, skill_id, skill_name):
    skill = battle.locator(f'#quest-battle-skills .quest-battle-skill-name[data-side="player"][data-skill-id="{skill_id}"]')
    tooltip = battle.locator(f'#quest-battle-skill-detail[data-side="player"][data-skill-id="{skill_id}"]')
    card = battle.locator('#quest-battle-player-character')
    flip = card.locator('.quest-battle-character-flip')
    front = card.locator('canvas.quest-battle-character-card')
    rear = card.locator('.quest-battle-character-review')
    expect(card).to_have_attribute('data-face', 'front')
    expect(front).to_be_visible()
    expect(flip).to_be_enabled()
    expect(skill).to_have_text(skill_name)
    sent = sent_quest_actions(page)
    skill.hover()
    expect(tooltip).to_have_attribute('aria-hidden', 'false')
    expect(tooltip).to_have_css('opacity', '1')
    if skill_id == 100:
        phase, distance, cards, effect = ('防禦', '近,中距離', '防1,防1', '讓防禦力變成與對戰對手的攻擊力相同')
    elif skill_id == 7:
        phase, distance, cards, effect = ('防禦', '近距離', '特合計2以上,防合計2以上', '防禦力+6')
    elif skill_id == 25:
        phase, distance, cards, effect = ('攻擊', '近距離', '劍1,劍1', '攻擊力+5')
    else:
        phase, distance, cards, effect = ('攻擊', '中,遠距離', '槍合計2以上', '攻擊力+5')
    for index, text in enumerate((phase, distance, cards)):
        expect(tooltip.locator('dd').nth(index)).to_have_text(text)
    expect(tooltip).to_contain_text(effect)
    hover = snapshot(page, stage, directory, '05-authored-starter-skill-hover')
    page.mouse.move(770, 340)
    expect(tooltip).to_have_attribute('aria-hidden', 'true')
    skill.focus()
    page.keyboard.press('Tab')
    page.keyboard.press('Shift+Tab')
    expect(skill).to_be_focused()
    expect(tooltip).to_have_attribute('aria-hidden', 'false')
    flip.click(position={'x': 84, 'y': 180})
    expect(card).to_have_attribute('data-face', 'back', timeout=qa.TIMEOUT)
    expect(flip).to_be_enabled()
    expect(front).to_be_hidden()
    if skill_id in (7, 100):
        rear.get_by_role('button', name=skill_name, exact=True).click()
    expect(rear.locator('.quest-battle-character-feat[aria-pressed="true"]')).to_have_text(skill_name)
    assert rear.locator('img').first.evaluate('image => image.complete && image.naturalWidth > 0')
    expect(tooltip).to_have_attribute('aria-hidden', 'true')
    back = snapshot(page, stage, directory, '07-canonical-character-back')
    flip.press('Enter')
    expect(card).to_have_attribute('data-face', 'front', timeout=qa.TIMEOUT)
    expect(flip).to_be_enabled()
    expect(rear).to_be_hidden()
    expect(front).to_be_visible()
    assert [packet for packet in qa.read_movement_trace(page)['replies'] if packet[0] == 37][0][4] == str(card_id)
    assert sent_quest_actions(page) == sent, sent_quest_actions(page)
    return {'skillId': skill_id, 'hover': hover, 'back': back}


def play_movement(page, stage, battle, directory, direction, movement_cards):
    start = qa.read_movement_trace(page)
    initial_distance = int(battle.get_attribute('data-distance'))
    name = {-1: 'forward', 0: 'stay', 1: 'back', 3: 'change'}[direction]
    battle.locator(f'button[data-move-command="{name}"]').click()
    if direction in (0, 3):
        # The displayed default can already be Stay before Ruby acknowledges this explicit click.
        page.wait_for_function("""({start, chosen}) => window.qaQuestWire.sockets.at(-1).replies.slice(start)
          .some(([command, width, player, direction]) => command === 60 && width === 4 && player === 1 && direction === chosen)""",
                               arg={'start': len(start['replies']), 'chosen': direction}, timeout=qa.TIMEOUT)
        assert qa.read_movement_trace(page)['movement'][len(start['movement']):] == [[23, direction]]
    expect(battle).to_have_attribute('data-direction', str(direction))
    hand = battle.locator(f'{HAND} .quest-battle-hand-card')
    for card_id, up in movement_cards:
        cards = hand.evaluate_all("""rows => rows.map(({dataset}) => [+dataset.cardId, dataset.up === 'true'])""")
        index, (_, current_up) = next((slot, card) for slot, card in enumerate(cards) if card[0] == card_id)
        row = battle.locator(f'{HAND} [data-card-id="{card_id}"]')
        if current_up != up:
            rotate = row.locator('.quest-battle-card-rotate')
            expect(rotate).to_be_enabled()
            rotate.press('Enter')
            expect(row).to_have_attribute('data-up', str(up).lower())
            assert [63, 10, 1, 0, index, card_id, int(up)] in qa.read_movement_trace(page)['replies']
        row.locator('.quest-battle-card-primary').click(position={'x': 27, 'y': 18})
        placed = battle.locator(f'#quest-battle-player-table [data-card-id="{card_id}"]')
        expect(placed).to_have_attribute('data-up', str(up).lower())
        expect(row).to_have_count(0)
        trace = qa.read_movement_trace(page)
        assert trace['movement'][-1] == [24, card_id, index, int(up)], trace['movement']
        assert [61, 8, 1, index, card_id] in trace['replies']
    done = battle.locator('button[data-move-command="done"]')
    qa.hold_movement_reply(page, 26, done.click, through=47)
    opponent = battle.locator(TABLE)
    expect_covered(opponent)
    pending = qa.read_movement_trace(page)
    assert [packet[0] for packet in pending['replies'][len(start['replies']):] if packet[0] in (47, 48)] == [47]
    expect(battle.locator('#quest-battle-move-result')).to_be_hidden()
    expect(battle.locator('[data-sweep="discard"]')).to_have_count(0)
    expect(battle).to_have_attribute('data-distance', str(initial_distance))
    before = snapshot(page, stage, directory, '08-move-ok-before-authoritative-reveal')
    qa.release_movement_reply(page)
    expect(battle).to_have_attribute('data-move-result', 'settled', timeout=qa.TIMEOUT)
    (result,) = [packet for packet in qa.read_movement_trace(page)['replies'][len(start['replies']):] if packet[0] == 48]
    assert result[4] == movement_cards, result
    expect(battle).to_have_attribute('data-distance', str(result[3]))
    page.wait_for_function("() => window.qaBattleMotion.stages.some(sample => sample.moveResult === 'settled')")
    animation = page.evaluate('window.qaBattleMotion')
    motion = animation['standing']
    in_move = [sample for sample in motion if sample['phase'] == 'move']
    during_result = [sample for sample in motion if sample['result'] == 'revealing']
    during_sweep = [sample for sample in motion if sample['moveDiscard']]
    assert in_move, motion
    if result[5] or any(result[6:8]):
        assert len(during_result) >= 2, (result, motion)
    for sample in in_move + during_result + [sample for sample in motion if sample['result'] == 'sweeping']:
        assert sample['avatar'] and sorted((side, visible) for side, visible, _ in sample['stands']) == [
            ('opponent', True), ('player', True),
        ], sample
    position_before_sweep = (during_result or in_move)[-1]['stands']
    for sample in during_sweep:
        assert sample['distance'] == initial_distance and sample['standDistances'] == [initial_distance] * 2, sample
        assert sample['stands'] == position_before_sweep, sample

    sweeps = list(animation['moveSweeps'].values())
    for side, cards, locked, start_y in (
            ('player', result[4], False, 346), ('opponent', result[5], bool(result[9]), 84)):
        zone = f'quest-battle-{side}-table'
        flights = [flight for flight in sweeps if flight[0]['zone'] == zone]
        assert [[flight[0]['cardId'], flight[0]['up']] for flight in flights] == [
            [None, None] if locked else [card, str(up).lower()] for card, up in cards
        ], (side, cards, flights)
        for flight in flights:
            assert len(flight) > 1, flight
            assert all(sample['zone'] == zone and sample['distance'] == initial_distance for sample in flight), flight
            start_x, first_y, width, height = flight[0]['position']
            end_x, end_y, *_ = flight[-1]['position']
            assert (width, height) == (56, 86) and start_x > 290 and first_y == start_y, flight
            assert abs(end_x + width / 2 - 40) <= 25 and abs(end_y + height / 2 - 105) <= 12, flight

    distance_changed_at = None
    if initial_distance != result[3]:
        distance_changed_at = next(sample['at'] for sample in animation['stages']
                                   if sample.get('moveResult') in ('sweeping', 'settled') and sample['distance'] == result[3])
        assert all(sample['at'] < distance_changed_at for sample in during_sweep), during_sweep
    return {'before': before, 'receipt': result, 'standing': motion, 'initialDistance': initial_distance,
            'distanceChangedAt': distance_changed_at, 'discardSweep': sweeps,
            'after': snapshot(page, stage, directory, '09-actors-after-real-move-receipt')}


def check_enemy_first(page, stage, battle, directory, defense):
    opponent = battle.locator(TABLE)
    done = battle.locator('button[data-combat-command="done"]')
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-index', '1')
    expect_covered(opponent)
    revealed = battle.locator('#quest-battle-exchange[data-reveal-stage="final"]')
    expect(revealed).to_have_count(0)
    trace = qa.read_movement_trace(page)
    assert [51, 3, 0] in trace['replies'] and [53, 3, 1] in trace['replies']
    masked = [packet for packet in trace['replies'] if packet[0] == 65 and packet[2:] == [0, 0, 0]]
    assert masked and not any(packet[0] == 55 for packet in trace['replies']), trace['replies']
    backs = page.evaluate('Object.values(window.qaBattleMotion.backs)')
    flights = [samples for samples in backs if len(samples) > 1 and samples[0]['direction'] == 'to-table'
               and samples[0]['position'][1] < samples[-1]['position'][1]
               and all(not sample['identified'] for sample in samples)]
    assert flights, backs
    if defense:
        qa.place_terminal_cards(page, battle, 1, False, reserve_attack=False, choices=[tuple(card) for card in defense])
        expect_covered(opponent)
    before = snapshot(page, stage, directory, '03-and-08-enemy-attack-stays-covered-during-defense')
    qa.hold_movement_reply(page, 34, done.click, before=[55])
    try:
        held = qa.read_movement_trace(page)
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 55
        boundaries = [packet[0] for packet in held['replies'] if 51 <= packet[0] <= 56]
        assert boundaries == [51, 52, 53, 54], boundaries
        submitted = [packet[:-1] for packet in held['battleAudit'] if packet[0] in (68, 69)]
        assert submitted == [[68, 3, 0], [69, 3, 1]], submitted
        expect_covered(opponent)
        expect(revealed).to_have_count(0)
        expect(battle.locator('#quest-battle-attack-dice [data-value]')).to_have_count(0)
        both = snapshot(page, stage, directory, '08-both-roles-closed-awaiting-real-sc55')
    finally:
        qa.release_movement_reply(page)
    page.wait_for_function("() => window.qaQuestWire.sockets.at(-1).replies.some(([id]) => id === 55)", timeout=qa.TIMEOUT)
    (reveal,) = [packet for packet in qa.read_movement_trace(page)['replies'] if packet[0] == 55]
    assert len(reveal[3]) == 2 and not reveal[5], reveal
    expect(revealed).to_have_count(1, timeout=qa.TIMEOUT)
    expect(opponent.locator('[data-card-id]').first).to_be_visible(timeout=qa.TIMEOUT)
    after = snapshot(page, stage, directory, '08-enemy-faces-after-authoritative-both-ok')
    faces = opponent.locator('[data-card-id]:visible')
    expect(faces).to_have_count(len(reveal[3]))
    expect(faces.locator('canvas:visible')).to_have_count(len(reveal[3]))
    assert faces.evaluate_all("""rows => rows.map(({dataset}) => [+dataset.cardId, dataset.up === 'true'])""") == reveal[3]
    both_faces = snapshot(page, stage, directory, '08-enemy-both-faces-after-authoritative-reveal')
    roll = battle.locator('#quest-battle-dice-roll')
    expect(roll).to_be_visible(timeout=qa.TIMEOUT)
    expect(battle.locator('#quest-battle-exchange')).to_have_attribute('data-sweep-state', 'settled')
    expect(faces).to_have_count(0)
    animation = page.evaluate('window.qaBattleMotion')
    first_exchange = [sample for sample in animation['stages'] if sample.get('exchangeIndex') == '1']
    moving = next(sample for sample in first_exchange if sample.get('sweep') == 'moving')
    first_roll = next(sample for sample in first_exchange if sample.get('dice'))
    assert not moving['dice'] and moving['at'] < first_roll['at'] and first_roll['sweep'] == 'settled', first_exchange
    sweeps = list(animation['sweeps'].values())
    assert {flight[0]['cardId'] for flight in sweeps} == {card for card, _ in reveal[3]}, sweeps
    for flight in sweeps:
        assert len(flight) > 1 and all(sample['zone'] == 'quest-battle-opponent-table' for sample in flight), flight
        start_x, start_y, width, height = flight[0]['position']
        end_x, end_y, *_ = flight[-1]['position']
        assert start_x > 290 and start_y == 84, flight
        assert abs(end_x + width / 2 - 40) <= 25 and abs(end_y + height / 2 - 105) <= 12, flight
    dice, layering = check_dice_over_character(page, stage, battle, directory)
    hit = check_first_dwarf_hit(page, stage, battle, directory)
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    return {'maskedTransfers': masked, 'flights': flights, 'before': before, 'closed': both, 'revealed': reveal,
            'submitted': submitted, 'after': after, 'bothFaces': both_faces, 'discardSweep': sweeps, 'movingAt': moving['at'],
            'firstRenderedDiceAt': first_roll['at'], 'rolled': dice, 'diceLayering': layering, 'firstHit': hit}


def check_dice_over_character(page, stage, battle, directory):
    from io import BytesIO

    from PIL import Image

    roll = battle.locator('#quest-battle-dice-roll')
    page.wait_for_function("() => document.querySelector('#quest-battle-dice-roll[data-state=\"settled\"]')", timeout=qa.TIMEOUT)
    proof = roll.evaluate("""canvas => {
      const board = document.querySelector('#quest-map-battle');
      const card = board.querySelector('#quest-battle-player-character canvas.quest-battle-character-card');
      const stack = canvas.parentElement === board && card.closest('.quest-battle-roster');
      const diceStyle = getComputedStyle(canvas);
      if (!stack || Number(diceStyle.zIndex) <= Number(getComputedStyle(stack).zIndex)) return null;
      const diceBox = canvas.getBoundingClientRect();
      const { x, y, width, height } = card.getBoundingClientRect();
      const left = x - diceBox.x, top = y - diceBox.y;
      const gl = canvas.getContext('webgl2');
      const cardPixels = card.getContext('2d').getImageData(0, 0, width, height).data;
      const dicePixels = new Uint8Array(width * height * 4);
      gl.readPixels(left, canvas.height - top - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, dicePixels);
      const samples = [];
      let overlap = 0;
      for (let py = 1; py < height - 1; py += 3) {
        for (let px = 1; px < width - 1; px += 3) {
          const diceIndex = 4 * ((height - 1 - py) * width + px);
          const cardIndex = 4 * (py * width + px);
          if (dicePixels[diceIndex + 3] !== 255 || cardPixels[cardIndex + 3] !== 255) continue;
          const die = Array.from(dicePixels.subarray(diceIndex, diceIndex + 3));
          const under = Array.from(cardPixels.subarray(cardIndex, cardIndex + 3));
          if (Math.max(...die.map((value, index) => Math.abs(value - under[index]))) < 65) continue;
          overlap++;
          if (samples.length < 64) samples.push({x: left + px, y: top + py, die, under});
        }
      }
      return {diceZ: Number(diceStyle.zIndex), cardZ: Number(getComputedStyle(stack).zIndex), opacity: Number(diceStyle.opacity),
        pointerEvents: diceStyle.pointerEvents, cardBounds: [left, top, width, height],
        canvasSize: [canvas.width, canvas.height], overlap, samples};
    }""")
    assert (proof and proof['overlap'] >= 24 and proof['opacity'] == 1 and proof['pointerEvents'] == 'none'
            and proof['canvasSize'] == [780, 680] and proof['cardBounds'] == [0, 440, 168, 240]), proof
    name = '09-dice-roll-after-foe-card-discard'
    painted = stage.screenshot(path=directory / (name + '.png'), scale='css', animations='allow')
    with Image.open(BytesIO(painted)) as image:
        visual = image.convert('RGB')
        for sample in proof['samples']:
            sample['visible'] = list(visual.getpixel((sample['x'], sample['y'])))
    matches = sum(all(abs(pixel - die) <= 8 for pixel, die in zip(sample['visible'], sample['die'], strict=True))
                  for sample in proof['samples'])
    assert matches >= len(proof['samples']) * 0.75, (matches, proof)
    proof['compositedMatches'] = matches
    return {'frame': name, 'sent': sent_quest_actions(page), 'replies': len(qa.read_movement_trace(page)['replies'])}, proof


def check_first_dwarf_hit(page, stage, battle, directory):
    hp = battle.locator('#quest-battle-player-hp')
    comparison = battle.locator('#quest-battle-dice-symbols img:visible').first
    expect(comparison).to_be_visible(timeout=qa.TIMEOUT)
    expect(hp).to_have_text('6/7')
    dice_comparison = snapshot(page, stage, directory, '09-first-hit-still-pending-during-dice-comparison')
    page.wait_for_function("() => window.qaBattleMotion.health.some(sample => sample.attackReady)", timeout=qa.TIMEOUT)
    expect(hp).to_have_text('3/7')
    expect(battle.locator('button[data-combat-command="done"]')).to_be_enabled()
    expect(battle.locator('.quest-battle-damage-number')).to_have_text('3')
    resumed = snapshot(page, stage, directory, '09-next-attack-with-confirmed-hp-and-lingering-damage')

    replies = qa.read_movement_trace(page)['replies']
    first_hit = next(packet for packet in replies if packet[0] == 73)
    assert first_hit == [73, 8, 1, 3, 0], first_hit
    assert next(i for i, packet in enumerate(replies) if packet[0] == 56) < replies.index(first_hit), replies
    timeline = page.evaluate('window.qaBattleMotion.health')
    attacked = next(sample for sample in timeline if sample['hp'] == 3)
    ready = next(sample for sample in timeline if sample['attackReady'])
    before_damage = [sample for sample in timeline if sample['at'] < attacked['at']]
    assert any(sample['dice'] for sample in before_damage) and any(sample['comparison'] for sample in before_damage), timeline
    assert all(sample['hp'] == 6 for sample in before_damage) and not attacked['comparison'], timeline
    assert attacked['exchangeIndex'] == '1' and ready['hp'] == 3 and ready['caption'] == '3', timeline
    assert ready['at'] - attacked['at'] >= 900, timeline
    return {'receipt': first_hit, 'timeline': timeline, 'comparison': dice_comparison, 'nextAttack': resumed}


def wait_for_own_attack(page, battle, defense):
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    trace = qa.read_movement_trace(page)
    assert [51, 3, 0] in trace['replies'] and [53, 3, 1] in trace['replies'], trace['replies']
    if defense:
        qa.place_terminal_cards(page, battle, 1, False, reserve_attack=False, choices=[tuple(card) for card in defense])
    battle.locator('button[data-combat-command="done"]').click()
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    assert [51, 3, 1] in qa.read_movement_trace(page)['replies']


def observe_feat_sound(page, *, associate_skill=False):
    page.evaluate("""associate => {
      const playback = window.qaStarterSkillPlayback = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        const result = play.apply(this, args);
        if (this.src.endsWith('/sound/se/ulse13.mp3')) {
          const cue = {at: performance.now(), played: null};
          if (associate) {
            const latest = [...document.querySelectorAll('.quest-battle-feat[data-activated-skill-id]')].at(-1);
            cue.featId = Number(latest?.dataset.activatedSkillId) || null;
          }
          playback.push(cue);
          void result.then(() => { cue.played = true; }, () => { cue.played = false; });
        }
        return result;
      };
    }""", associate_skill)


def confirm_feat_sound(page, trace, feat):
    page.wait_for_function('() => window.qaStarterSkillPlayback.some(cue => cue.played)', timeout=qa.TIMEOUT)
    cue, = page.evaluate('window.qaStarterSkillPlayback')
    receipt_at = next(packet[-1] for packet in trace['battleAudit'] if packet[:-1] == [110, 7, 1, feat])
    assert cue['played'] and cue['at'] >= receipt_at, (receipt_at, cue)
    return cue


def play_starter_skill(page, stage, battle, directory, plan):
    feat = plan['skillId']
    attack = plan['attacks']
    distance = int(battle.get_attribute('data-distance'))
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    skill = battle.locator(f'.quest-battle-skill-name[data-side="player"][data-skill-id="{feat}"]')
    expect(skill).to_have_attribute('data-ready', 'false')
    done = battle.locator('button[data-combat-command="done"]')
    trace = qa.read_movement_trace(page)
    before = len(trace['battleAudit'])
    baseline = sent_quest_actions(page)
    kind = 1 if distance == 1 else 2
    additions, placed = [], []
    for index, (card, up) in enumerate(attack, 1):
        next_actions, next_card = qa.place_terminal_cards(page, battle, kind, True, reserve_attack=False, choices=[(card, up)])
        additions.extend(next_actions)
        placed.extend(next_card)
        expect(skill).to_have_attribute('data-ready', str(index >= plan['qualifiesAfter']).lower())
    assert placed == attack
    limits = [row[:-1] for row in qa.read_movement_trace(page)['battleAudit'][before:] if row[0] in (107, 108, 110)]
    assert limits == [[107, 6, feat]], limits
    points = battle.locator('#quest-battle-player-points')
    if 'attackDice' in plan:
        expect(points).to_have_attribute('data-value', str(plan['attackDice']))
    if plan.get('recheckAvailability'):
        card, face = attack[-1]
        row = battle.locator(f'#quest-battle-player-table [data-card-id="{card}"]')
        row.locator('.quest-battle-card-primary').click(position={'x': 27, 'y': 18})
        expect(row).to_have_count(0)
        expect(skill).to_have_attribute('data-ready', 'false')
        if 'removedPoints' in plan:
            expect(points).to_have_attribute('data-value', str(plan['removedPoints']))
        additions.append([29])
        repush, _ = qa.place_terminal_cards(page, battle, kind, True, reserve_attack=False, choices=[(card, face)])
        additions.extend(repush)
        expect(skill).to_have_attribute('data-ready', 'true')
        if 'attackDice' in plan:
            expect(points).to_have_attribute('data-value', str(plan['attackDice']))
        limits = [row[:-1] for row in qa.read_movement_trace(page)['battleAudit'][before:] if row[0] in (107, 108, 110)]
        assert limits == [[107, 6, feat], [108, 6, feat], [107, 6, feat]], limits
    armed = snapshot(page, stage, directory, '01-starter-skill-authoritative-availability')
    observe_feat_sound(page)
    qa.hold_movement_reply(page, 33, done.click, before=[110])
    try:
        held = qa.read_movement_trace(page)
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 110
        assert not any(row[:-1] == [110, 7, 1, feat] for row in held['battleAudit'])
        width = {32: 12, 28: 11, 29: 10}
        assert sent_quest_actions(page)[len(baseline):] == [[command, width[command]] for command, *_ in additions] + [[33, 9]]
        expect(battle.locator(f'[data-activated-skill-id="{feat}"]')).to_have_count(0)
        assert page.evaluate('window.qaStarterSkillPlayback') == []
        waiting = snapshot(page, stage, directory, '01-skill-awaiting-real-activation')
    finally:
        qa.release_movement_reply(page)
    page.wait_for_function("""id => window.qaQuestWire.sockets.at(-1).battleAudit
      .some(([op, width, player, feat]) => op === 110 && width === 7 && player === 1 && feat === id)""", arg=feat, timeout=qa.TIMEOUT)
    picture = battle.locator(f'.quest-battle-feat[data-activated-skill-id="{feat}"][data-side="player"] img')
    expect(picture).to_be_visible(timeout=qa.TIMEOUT)
    assert picture.evaluate('image => image.complete && image.naturalWidth > 0')
    fired = snapshot(page, stage, directory, '01-real-starter-skill-activation')
    trace = qa.read_movement_trace(page)
    used = [packet[:-1] for packet in trace['battleAudit'] if packet[0] == 110]
    assert used.count([110, 7, 1, feat]) == 1, used
    page.wait_for_function("""index => window.qaQuestWire.sockets.at(-1).replies.slice(index)
      .some(([op]) => op === 56)""", arg=len(held['replies']), timeout=qa.TIMEOUT)
    after = qa.read_movement_trace(page)['replies'][len(held['replies']):]
    dice = next(packet for packet in after if packet[0] == 56)
    if 'attackDice' in plan:
        assert len(dice[3]) == plan['attackDice'], (dice, plan['attackDice'])
    return {'armed': armed, 'waiting': waiting, 'fired': fired, 'receipt': [110, 7, 1, feat],
            'availability': limits, 'cards': placed, 'attackDice': len(dice[3]), 'cue': confirm_feat_sound(page, trace, feat)}


def enter_second_defense(page, battle):
    done = battle.locator('button[data-combat-command="done"]')
    player_table = battle.locator('#quest-battle-player-table')
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-index', '1')
    expect(player_table.locator('[data-card-id]')).to_have_count(0)
    baseline = sent_quest_actions(page)
    done.click()
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    trace = qa.read_movement_trace(page)
    assert trace['combat'] == [[33, '', '']], trace['combat']
    assert sent_quest_actions(page)[len(baseline):] == [[33, 9]]
    roles = [packet for packet in trace['replies'] if packet[0] in (51, 53)]
    assert roles == [[51, 3, 1], [53, 3, 0], [51, 3, 0], [53, 3, 1]], roles
    first_reveal, = [packet for packet in trace['replies'] if packet[0] == 55]
    assert first_reveal[2] == [], first_reveal
    exchanged = max(index for index, packet in enumerate(trace['replies']) if packet == [51, 3, 0])
    return baseline, trace, exchanged


def play_counter_guard(page, stage, battle, directory):
    done = battle.locator('button[data-combat-command="done"]')
    player_table = battle.locator('#quest-battle-player-table')
    opponent_table = battle.locator(TABLE)
    player_points = battle.locator('#quest-battle-player-points')
    opponent_points = battle.locator('#quest-battle-opponent-points')
    skill = battle.locator('.quest-battle-skill-name[data-side="player"][data-skill-id="100"]')
    activation = battle.locator('.quest-battle-feat[data-side="player"][data-activated-skill-id="100"]')
    final = battle.locator('#quest-battle-exchange[data-reveal-stage="final"]')
    baseline, trace, exchanged = enter_second_defense(page, battle)
    audit_start = len(trace['battleAudit'])
    expect(skill).to_have_attribute('data-ready', 'false')
    actions, cards = [], []
    for card, ready in ((2, 'false'), (32, 'true')):
        commands, placed = qa.place_terminal_cards(page, battle, 3, False, reserve_attack=False, choices=[(card, False)])
        definition = qa.action_card_definitions()[card]
        assert (definition['b_type'], definition['b_value']) == ('3', '1'), definition
        actions.extend(commands)
        cards.extend(placed)
        expect(skill).to_have_attribute('data-ready', ready)
    assert cards == [[2, False], [32, False]], cards
    trace = qa.read_movement_trace(page)
    available = [item[:-1] for item in trace['battleAudit'][audit_start:] if item[0] in (107, 108, 110)]
    assert available == [[107, 6, 100]], available
    assert [packet for packet in trace['replies'][exchanged:] if packet[0] == 65 and packet[2] == 1] == [
        [65, 8, 1, 0, 2], [65, 8, 1, 0, 32],
    ]

    def read_board(replies):
        points = [next(packet for packet in reversed(replies) if packet[0] == 82 and packet[2] == side) for side in (1, 0)]
        assert points[0][3:5] == [[2, 32], 3], points
        expect(opponent_table.locator('.quest-battle-dealt-back')).not_to_have_count(0)
        expect_covered(opponent_table)
        expect(final).to_have_count(0)
        assert player_table.locator('[data-card-id]').evaluate_all("""rows =>
          rows.map(({dataset}) => [+dataset.cardId, dataset.up === 'true'])""") == cards
        return points

    observe_feat_sound(page)
    qa.hold_movement_reply(page, 34, done.click, before=[83])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 83
        held_replies = qa.read_movement_trace(page)['replies'][exchanged:]
        assert [packet[0] for packet in held_replies if packet[0] in (54, 55, 56, 83)] == [54], held_replies
        expect(activation).to_have_count(0)
        assert page.evaluate('window.qaStarterSkillPlayback') == []
        expect(done).to_be_disabled()
        preview = read_board(held_replies)
        expect(player_points).to_have_attribute('data-value', str(preview[0][-1]))
        expect(opponent_points).to_have_attribute('data-value', str(preview[1][-1]))
        pending = snapshot(page, stage, directory, '01-counter-guard-before-confirmed-point-rewrite')
    finally:
        defer_battle_frames(page, 55)

    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 55', timeout=qa.TIMEOUT)
        trace = qa.read_movement_trace(page)
        point_changes = [item[:-1] for item in trace['battleAudit'][audit_start:] if item[0] in (83, 110)]
        assert len(point_changes) == 2, point_changes
        rewrite, activated = point_changes
        assert rewrite == [83, 7, 1, preview[1][-1]] and rewrite[-1] > 0, (rewrite, preview)
        assert activated == [110, 7, 1, 100], activated
        assert read_board(trace['replies'][exchanged:]) == preview
        expect(player_points).to_have_attribute('data-value', str(rewrite[-1]))
        expect(opponent_points).to_have_attribute('data-value', str(preview[1][-1]))
        confirmed = snapshot(page, stage, directory, '01-counter-guard-points-before-final-reveal')
    finally:
        release_battle_frames(page)

    page.wait_for_function("""start => window.qaQuestWire.sockets.at(-1).replies.slice(start)
      .some(([opcode]) => opcode === 56)""", arg=exchanged, timeout=qa.TIMEOUT)
    expect(final).to_have_count(1, timeout=qa.TIMEOUT)
    fired = activation.locator('img:visible').first
    expect(fired).to_be_visible(timeout=qa.TIMEOUT)
    assert fired.evaluate('image => image.complete && image.naturalWidth > 0')
    cut_in = snapshot(page, stage, directory, '01-counter-guard-original-feat-cut-in')
    trace = qa.read_movement_trace(page)
    combat = [packet for packet in trace['replies'][exchanged:] if packet[0] in (54, 55, 56, 83)][:4]
    assert [packet[0] for packet in combat] == [54, 83, 55, 56], combat
    _, _, reveal, dice = combat
    assert reveal[2] == cards and dice[2] == 0 and len(dice[3]) == len(dice[4]) == rewrite[-1], combat
    definitions = qa.action_card_definitions()
    assert any(definitions[card]['u_type' if up else 'b_type'] == '2' for card, up in reveal[3]), reveal
    assert trace['combat'] == [[33, '', ''], *[command for command in actions if command[0] == 30], [34, '', '']]
    widths = {32: 12, 30: 11}
    assert sent_quest_actions(page)[len(baseline):] == [[33, 9], *[[code, widths[code]] for code, *_ in actions], [34, 9]]
    return {'cards': cards, 'points': preview, 'rewrite': rewrite, 'dice': dice,
            'beforeRewrite': pending, 'beforeReveal': confirmed, 'cutIn': cut_in, 'cue': confirm_feat_sound(page, trace, 100)}


def play_eased_thorn(page, stage, battle, directory):
    done = battle.locator('button[data-combat-command="done"]')
    skill = battle.locator('.quest-battle-skill-name[data-side="player"][data-skill-id="7"]')
    activation = battle.locator('.quest-battle-feat[data-side="player"][data-activated-skill-id="7"]')
    definitions = qa.action_card_definitions()
    baseline, trace, exchanged = enter_second_defense(page, battle)
    audit_start = len(trace['battleAudit'])
    expect(skill).to_have_attribute('data-ready', 'false')
    own_cards = [[2, False], [27, False]]
    sent = [[33, 9]]
    for card, kind, available in ((2, '3', 'false'), (27, '5', 'true')):
        definition = definitions[card]
        assert (definition['b_type'], definition['b_value']) == (kind, '1'), definition
        hand = battle.locator(f'{HAND} .quest-battle-hand-card')
        hand_ids = hand.evaluate_all('cards => cards.map(card => Number(card.dataset.cardId))')
        index = hand_ids.index(card)
        row = hand.and_(battle.locator(f'[data-card-id="{card}"]'))
        expect(row).to_have_attribute('data-up', 'true')
        rotate = row.locator('.quest-battle-card-rotate')
        expect(rotate).to_be_enabled()
        rotate.press('Enter')
        expect(row).to_have_attribute('data-up', 'false')
        assert [63, 10, 1, 0, index, card, 0] in qa.read_movement_trace(page)['replies']
        row.locator('.quest-battle-card-primary').click(position={'x': 27, 'y': 18})
        expect(battle.locator(f'#quest-battle-player-table [data-card-id="{card}"][data-zone="combat"]')).to_have_attribute('data-up', 'false')
        expect(skill).to_have_attribute('data-ready', available)
        sent.extend([[32, 12], [30, 11]])
    trace = qa.read_movement_trace(page)
    available = [row[:-1] for row in trace['battleAudit'][audit_start:] if row[0] in (107, 108, 110)]
    assert available == [[107, 6, 7]], available
    assert [packet for packet in trace['replies'][exchanged:] if packet[0] == 65 and packet[2] == 1] == [
        [65, 8, 1, 0, 2], [65, 8, 1, 0, 27],
    ]
    points = battle.locator('#quest-battle-player-points')
    expect(points).to_have_attribute('data-value', '13')
    ready = snapshot(page, stage, directory, '01-eased-thorn-ready-with-two-one-point-cards')
    observe_feat_sound(page)
    qa.hold_movement_reply(page, 34, done.click, before=[110])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 110
        expect(activation).to_have_count(0)
        expect_covered(battle.locator(TABLE))
        assert page.evaluate('window.qaStarterSkillPlayback') == []
    finally:
        qa.release_movement_reply(page)

    page.wait_for_function("""start => window.qaQuestWire.sockets.at(-1).replies.slice(start)
      .some(([opcode]) => opcode === 56)""", arg=exchanged, timeout=qa.TIMEOUT)
    effect = activation.locator('img:visible').first
    expect(effect).to_be_visible(timeout=qa.TIMEOUT)
    assert effect.evaluate('image => image.complete && image.naturalWidth > 0')
    fired = snapshot(page, stage, directory, '01-real-eased-thorn-activation')
    trace = qa.read_movement_trace(page)
    used = [row[:-1] for row in trace['battleAudit'][audit_start:] if row[0] == 110]
    assert used == [[110, 7, 1, 7]], used
    final, dice = [packet for packet in trace['replies'][exchanged:] if packet[0] in (55, 56)][:2]
    assert final[:1] == [55] and final[2] == own_cards, final
    assert dice[0] == 56 and dice[2] == 0 and len(dice[4]) == 13, dice
    assert trace['combat'] == [[33, '', ''], [30, 2, 0, 0], [30, 27, 0, 0], [34, '', '']], trace['combat']
    assert sent_quest_actions(page)[len(baseline):] == [*sent, [34, 9]]
    advantage = sum(roll > 3 for roll in dice[4]) - sum(roll > 3 for roll in dice[3])
    damage = None
    if dice[3] and advantage > 0:
        page.wait_for_function("""start => window.qaQuestWire.sockets.at(-1).replies.slice(start)
          .some(([opcode, , side]) => opcode === 73 && side === 0)""", arg=exchanged, timeout=qa.TIMEOUT)
        damage = next(packet for packet in qa.read_movement_trace(page)['replies'][exchanged:] if packet[0] == 73 and not packet[2])
        # The Cave Bat has one HP. Original Entrant#damaged clamps the reported delta to available HP.
        assert damage == [73, 8, 0, 1, 0], (damage, dice)
        expect(battle.locator('#quest-battle-opponent-hp')).to_have_attribute('data-hp', '0', timeout=qa.TIMEOUT)
    return {'cards': own_cards, 'ready': ready, 'fired': fired, 'activation': used[0], 'dice': dice,
            'counterDamage': damage, 'cue': confirm_feat_sound(page, trace, 7)}


def check_gregor_feat_slots(page, battle, pair, *, captions=True):
    names = {123: '噴毒', 1264: '創贈麻煩'}
    effects = {123: '中毒', 1264: '對自身造成1點直接傷害'}
    for (side, slot), feat in zip((('player', 3), ('opponent', 0)), pair, strict=True):
        row = battle.locator(f'.quest-battle-skill-name[data-side="{side}"][data-roster-index="0"][data-feat-index="{slot}"]')
        expect(row).to_have_attribute('data-skill-id', str(feat))
        expect(row).to_have_attribute('data-definition-state', 'ready')
        expect(row).to_have_text(names[feat])
        if not captions:
            continue
        row.hover()
        tooltip = battle.locator(f'#quest-battle-skill-detail[data-side="{side}"][data-skill-id="{feat}"]')
        expect(tooltip).to_have_attribute('aria-hidden', 'false')
        expect(tooltip).to_contain_text(effects[feat])
        page.mouse.move(770, 340)
        expect(tooltip).to_have_attribute('aria-hidden', 'true')
    expect(battle.locator('.quest-battle-skill-name[data-side="player"][data-feat-index="2"]')).to_have_text('I Choose You')


def check_gregor_original_reverse(page, stage, battle, directory):
    card = battle.locator('#quest-battle-player-character[data-card-id="635"]')
    flip = card.locator('.quest-battle-character-flip')
    before = sent_quest_actions(page)
    expect(battle.locator('.quest-battle-skill-name[data-side="player"][data-feat-index="3"]')).to_have_text('噴毒')
    expect(card).to_have_attribute('data-face', 'front')
    flip.click(position={'x': 84, 'y': 180})
    expect(card).to_have_attribute('data-face', 'back')
    expect(flip).to_be_enabled()
    canonical = card.locator('.quest-battle-character-feat[data-feat-index="3"][data-feat-id="1264"]')
    expect(canonical).to_have_text('創贈麻煩')
    canonical.click()
    expect(canonical).to_have_attribute('aria-pressed', 'true')
    proof = snapshot(page, stage, directory, '01-q82-borrowed-hud-and-authored-reverse-card')
    flip.press('Enter')
    expect(card).to_have_attribute('data-face', 'front')
    expect(flip).to_be_enabled()
    assert sent_quest_actions(page) == before
    return proof


def place_gregor_cards(page, battle, cards, *, attack):
    hand = battle.locator(f'{HAND} .quest-battle-hand-card')
    commands = []
    for card, up in cards:
        index = hand.evaluate_all('nodes => nodes.map(node => Number(node.dataset.cardId))').index(card)
        row = hand.and_(battle.locator(f'[data-card-id="{card}"]'))
        orientation = str(up).lower()
        if row.get_attribute('data-up') != orientation:
            rotate = row.locator('.quest-battle-card-rotate')
            expect(rotate).to_be_enabled()
            rotate.press('Enter')
            expect(row).to_have_attribute('data-up', orientation)
            assert [63, 10, 1, 0, index, card, int(up)] in qa.read_movement_trace(page)['replies']
        row.locator('.quest-battle-card-primary').click(position={'x': 27, 'y': 18})
        expect(battle.locator(f'#quest-battle-player-table [data-card-id="{card}"][data-zone="combat"]')).to_have_attribute('data-up', orientation)
        commands.append([28 if attack else 30, card, index if attack else 0, int(up)])
    return commands


def gregor_feat_receipts(page):
    return [item[:-1] for item in qa.read_movement_trace(page)['battleAudit'] if item[0] == 109]


def check_gregor_cast_frames(page, exchange_key='1:2'):
    assert page.evaluate("matchMedia('(prefers-reduced-motion: no-preference)').matches")
    manifest = page.request.get(urljoin(page.url, '/source-login/quest-feat-art/index.json'))
    assert manifest.ok
    source = manifest.json()['feats']
    recorded = page.evaluate('window.qaBattleMotion.featFrames')
    assert set(recorded) == {'1262', '1264'}, recorded
    for feat, samples in recorded.items():
        track = source[feat]
        assert track['framesPerSecond'] == 24, track['framesPerSecond']
        expected = [frame['file'] for frame in track['frames'] if frame]
        assert len({sample['file'] for sample in samples}) >= 3, samples
        assert samples[-1]['at'] - samples[0]['at'] >= 300, samples
        assert len({sample['sequence'] for sample in samples}) == 1, samples
        assert all(sample['side'] == 'player' and sample['exchangeKey'] == exchange_key for sample in samples), samples
        last = -1
        for sample in samples:
            last = expected.index(sample['file'], last + 1)
    return recorded


def check_gregor_feat_pair(page, stage, battle, directory, turn, expected, prior, interim, settled, *, activated=False, commit=33):
    done = battle.locator('button[data-combat-command="done"]')
    start = gregor_feat_receipts(page)
    exchange_key = f'{turn}:2'
    exchange = battle.locator(f'#quest-battle-exchange[data-exchange-key="{exchange_key}"]')
    qa.hold_movement_reply(page, commit, done.click, before=[109])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 109
        assert gregor_feat_receipts(page) == start
        check_gregor_feat_slots(page, battle, prior, captions=False)
        before = snapshot(page, stage, directory, f'01-q82-turn-{turn}-before-first-feat-receipt')
    finally:
        defer_battle_frames(page, 109, skip=1)
    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 109', timeout=qa.TIMEOUT)
        assert gregor_feat_receipts(page) == [*start, expected[0]]
        if activated:
            casts = []
            for feat, name in ((1262, 'i-choose-you'), (1264, 'trouble-craft')):
                cut_in = battle.locator(f'.quest-battle-feat[data-side="player"][data-activated-skill-id="{feat}"] img:visible').first
                expect(cut_in).to_be_visible(timeout=qa.TIMEOUT)
                assert cut_in.evaluate('(image, name) => image.complete && image.naturalWidth > 0 && image.src.includes(name + "-")', name)
                casts.append(snapshot(page, stage, directory, f'01-q82-original-{name}-cut-in'))
        expect(exchange).to_have_attribute('data-presentation', 'settled', timeout=qa.TIMEOUT)
        check_gregor_feat_slots(page, battle, interim)
        assert qa.read_movement_trace(page)['replies'].count([60, 4, 1, 2]) == turn - 1
        half = snapshot(page, stage, directory, f'01-q82-turn-{turn}-one-side-confirmed')
        observed = page.evaluate('window.qaBattleMotion.featSlots')
        first_only = [frame for frame in observed if frame['exchangeKey'] == exchange_key and frame['received'] == len(start) + 1]
        held_label = next(frame for frame in first_only if frame['slots'] == list(interim))
        assert held_label['presentation'] == 'settled', first_only
        assert not held_label['clips'] and not held_label['dice'] and not held_label['comparison'], held_label
        assert all(frame['slots'] == list(prior) for frame in first_only if frame['presentation'] != 'settled'), first_only
        if activated:
            assert held_label['hp'] == [10, 4], held_label
            assert any(frame['presentation'] == 'settling' and (frame['clips'] or frame['dice'] or frame['comparison'])
                       for frame in first_only), first_only
    finally:
        release_battle_frames(page)
    page.wait_for_function("""count => window.qaQuestWire.sockets.at(-1).battleAudit
      .filter(([command]) => command === 109).length === count""", arg=len(start) + 2, timeout=qa.TIMEOUT)
    assert gregor_feat_receipts(page) == [*start, *expected]
    check_gregor_feat_slots(page, battle, settled)
    after = snapshot(page, stage, directory, f'01-q82-turn-{turn}-both-sides-confirmed')
    evidence = {'receipts': expected, 'before': before, 'oneSide': half, 'bothSides': after,
                'firstReceiptPresentation': first_only}
    if activated:
        evidence['activation'], evidence['troubleCraft'] = casts
    return evidence


def play_feat_replacement(page, stage, battle, directory):
    original = (1264, 123)
    changed = (123, 1264)
    replacement = [[109, 19, 1, 0, 3, 123, 14], [109, 19, 0, 0, 0, 1264, 371]]
    restoration = [[109, 19, 0, 0, 0, 123, 14], [109, 19, 1, 0, 3, 1264, 371]]
    done = battle.locator('button[data-combat-command="done"]')
    skill = battle.locator('.quest-battle-skill-name[data-side="player"][data-skill-id="1262"]')
    check_gregor_feat_slots(page, battle, original)
    observe_feat_sound(page, associate_skill=True)
    evidence = {'initial': snapshot(page, stage, directory, '01-q82-original-skill-slots')}
    commands = []
    for turn, defense, attack in (
        (1, (), ((9, True), (4, True), (42, True))),
        (2, ((2, False), (457, True)), ()),
        (3, ((458, True),), ()),
    ):
        if turn == 2:
            expect(battle).to_have_attribute('data-ready-turn', '2', timeout=qa.TIMEOUT)
            expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
            evidence['authoredReverse'] = check_gregor_original_reverse(page, stage, battle, directory)
        if turn > 1:
            qa.check_terminal_movement(page, stage, directory, turn, direction=0)
        expect(battle).to_have_attribute('data-turn', str(turn))
        expect(battle).to_have_attribute('data-exchange-index', '1', timeout=qa.TIMEOUT)
        expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
        commands.extend(place_gregor_cards(page, battle, defense, attack=False))
        done.click()
        commands.append([34, '', ''])
        expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
        expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
        commands.extend(place_gregor_cards(page, battle, attack, attack=True))
        if turn == 1:
            expect(skill).to_have_attribute('data-ready', 'true')
            trace = qa.read_movement_trace(page)
            assert [op for op in trace['battleAudit'] if op[:-1] == [107, 6, 1262]]
            evidence['replaced'] = check_gregor_feat_pair(
                page, stage, battle, directory, turn, replacement, original, (123, 123), changed, activated=True)
            trace = qa.read_movement_trace(page)
            used = [item for item in trace['battleAudit'] if item[0] == 110]
            assert [item[:-1] for item in used] == [[110, 7, 1, 1262], [110, 7, 1, 1264]], used
            page.wait_for_function("""() => window.qaStarterSkillPlayback.length >= 2
              && window.qaStarterSkillPlayback.every(cue => cue.played)""", timeout=qa.TIMEOUT)
            cues = page.evaluate('window.qaStarterSkillPlayback')
            assert [cue['featId'] for cue in cues] == [1262, 1264], cues
            assert all(cue['at'] >= item[-1] for cue, item in zip(cues, used, strict=True)), (cues, used)
            evidence['castCues'] = cues
            evidence['castFrames'] = check_gregor_cast_frames(page)
            damage = [packet for packet in trace['replies'] if packet[0] == 73]
            assert damage == [[73, 8, 1, 1, 1], [73, 8, 0, 1, 0]], damage
            expect(battle.locator('#quest-battle-opponent-hp')).to_have_attribute('data-hp', '4', timeout=qa.TIMEOUT)
            evidence['triggerDamage'] = damage
        elif turn == 2:
            done.click()
            expect(battle).to_have_attribute('data-ready-turn', '3', timeout=qa.TIMEOUT)
            assert gregor_feat_receipts(page) == replacement
            check_gregor_feat_slots(page, battle, changed)
            evidence['retained'] = snapshot(page, stage, directory, '01-q82-no-unconfirmed-restore-on-turn-two')
        else:
            evidence['restored'] = check_gregor_feat_pair(
                page, stage, battle, directory, turn, restoration, changed, (123, 123), original)
        commands.append([33, '', ''])
    expect(battle).to_have_attribute('data-ready-turn', '4', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    expect(battle.locator('#quest-battle-player-hp')).to_have_attribute('data-hp', '8')
    expect(battle.locator('#quest-battle-opponent-hp')).to_have_attribute('data-hp', '2')
    check_gregor_feat_slots(page, battle, original)
    trace = qa.read_movement_trace(page)
    assert gregor_feat_receipts(page) == replacement + restoration
    assert page.evaluate('window.qaStarterSkillPlayback') == evidence['castCues']
    assert trace['combat'] == commands, trace['combat']
    assert [packet for packet in trace['movement'] if packet[0] in (23, 26)] == [[23, 0], [26, '', '']] * 3
    assert [packet[0] for packet in trace['replies'] if packet[0] == 109 or packet == [60, 4, 1, 2]] == [
        109, 109, 60, 60, 109, 109, 60,
    ]
    assert [packet[2] for packet in trace['replies'] if packet[0] == 43] == [1, 2, 3, 4]
    evidence['complete'] = snapshot(page, stage, directory, '01-q82-restored-through-real-fourth-draw')
    return evidence


def check_voluntary_change(page, stage, battle, directory, *, turn=1, previous=(0, 635, '11/11', 1262),
                           selected=(1, 21, '7/7', 25), player_attacks=False, split=True, inspect_opponent=False):
    old_index, old_id, old_hp, old_skill = previous
    new_index, new_id, new_hp, new_skill = selected
    chooser = battle.locator('#quest-battle-character-change')
    reserve = chooser.locator('#quest-battle-change-left')
    front = battle.locator('#quest-battle-player-character')
    stands = battle.locator('.quest-battle-stand[data-side="player"]')
    health = battle.locator('#quest-battle-player-hp')
    combat_done = battle.locator('button[data-combat-command="done"]')
    options = chooser.locator(f'[data-character-change-card][data-slot="{new_index}"][data-card-id="{new_id}"]')
    expect(chooser).to_have_attribute('data-state', 'open', timeout=qa.TIMEOUT)
    expect(chooser).to_have_attribute('data-turn', str(turn))
    audit = qa.read_movement_trace(page)['battleAudit']
    start = max(index for index, entry in enumerate(audit) if entry[0] == 49)

    def gate_packets():
        return [entry[:-1] for entry in qa.read_movement_trace(page)['battleAudit'][start:] if entry[0] in (49, 72, 50, 51)]

    def before_slot_change():
        expect(front).to_have_attribute('data-card-id', str(old_id))
        expect(front).to_have_attribute('data-roster-index', str(old_index))
        expect(stands).to_have_attribute('data-card-id', str(old_id))
        expect(health).to_have_text(old_hp)
        expect(battle.locator(f'.quest-battle-skill-name[data-side="player"][data-skill-id="{old_skill}"]')).to_be_visible()
        expect(battle.locator(f'.quest-battle-skill-name[data-side="player"][data-skill-id="{new_skill}"]')).to_have_count(0)
        expect(combat_done).to_be_hidden()

    def confirmed_slot():
        expect(front).to_have_attribute('data-card-id', str(new_id))
        expect(front).to_have_attribute('data-roster-index', str(new_index))
        expect(stands).to_have_attribute('data-card-id', str(new_id))
        expect(stands).to_be_visible()
        expect(health).to_have_text(new_hp)
        expect(battle.locator(
            f'.quest-battle-skill-name[data-side="player"][data-roster-index="{new_index}"][data-skill-id="{new_skill}"]'
        )).to_be_visible()

    expect(options).to_be_visible()
    expect(reserve).to_be_enabled()
    expect(reserve).to_have_attribute('data-slot', str(new_index))
    before_slot_change()
    prefix = '04-q82' if turn == 1 else f'04-q82-turn-{turn}'
    evidence = {'opened': snapshot(page, stage, directory, f'{prefix}-voluntary-character-chooser')}
    if turn == 1:
        evidence['movePortraits'] = page.wait_for_function("""() => {
          const frames = window.qaBattleMotion.chooserMotion.filter(frame => frame.turn === '1' && frame.enabled);
          const entered = frames.find(frame => JSON.stringify(frame.poses) === '[["player",635],["opponent",1008]]');
          const exited = entered && frames.find(frame => frame.identity === entered.identity
            && frame.at > entered.at && !frame.mounted && frame.poses.length === 0);
          return entered && exited && [entered, exited];
        }""", timeout=qa.TIMEOUT).json_value()
        expect(chooser).to_have_attribute('data-state', 'open')
        expect(reserve).to_be_enabled()
        evidence['portraitsExited'] = snapshot(page, stage, directory, '04-q82-chooser-after-move-portraits-exit')
        if inspect_opponent:
            sent = sent_quest_actions(page)
            origin = battle.bounding_box()
            trigger = battle.locator('#quest-battle-opponent-trigger')
            opponent = battle.locator('#quest-battle-opponent-character[data-card-id="1008"]')
            page.mouse.move(origin['x'] + 110, origin['y'] + 17)
            expect(trigger).to_have_attribute('aria-expanded', 'true')
            expect(opponent).to_have_css('opacity', '1')
            page.mouse.move(origin['x'] + 110, origin['y'] + 170)
            match_reserve_bounds(opponent, battle, [0, 0, 168, 240])
            expect(chooser).to_have_attribute('data-state', 'open')
            expect(reserve).to_be_enabled()
            evidence['opponentDuringChoice'] = snapshot(page, stage, directory, '04-q82-opponent-open-during-own-choice')
            page.mouse.move(origin['x'] + 205, origin['y'] + 210)
            expect(trigger).to_have_attribute('aria-expanded', 'false')
            expect(opponent).to_have_css('opacity', '0')
            expect(reserve).to_be_enabled()
            assert sent_quest_actions(page) == sent
    assert gate_packets() == [[49, 4, 0, 1]]
    prior_requests = page.evaluate('(window.qaQuestWire.sockets.at(-1).characterRequests ??= []).length')
    earlier_sends = sent_quest_actions(page)
    weapon = '0,0,0,0,0,0,0,0,'
    changes = [[49, 4, 0, 1], [72, 28, 1, new_index, new_id, weapon], [72, 28, 0, 0, 1008, weapon]]
    if split:
        qa.hold_movement_reply(page, 35, reserve.click, before=[72])
        try:
            assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 72
            assert gate_packets() == changes[:1]
            assert qa.read_movement_trace(page)['characterRequests'][prior_requests:] == [[35, 6, new_index]]
            assert sent_quest_actions(page)[len(earlier_sends):] == [[35, 6]]
            expect(chooser).to_have_attribute('data-state', 'submitting')
            expect(reserve).to_be_disabled()
            before_slot_change()
            evidence['awaitingRoster'] = snapshot(page, stage, directory, f'{prefix}-awaiting-original-sc72')
        finally:
            defer_battle_frames(page, 50)

        try:
            page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 50', timeout=qa.TIMEOUT)
            assert gate_packets() == changes
            before_slot_change()
            evidence['rosterReceived'] = snapshot(page, stage, directory, f'{prefix}-roster-received-before-original-sc50')
        finally:
            release_battle_frames(page, next_gate=51)

        try:
            page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 51', timeout=qa.TIMEOUT)
            assert gate_packets() == [*changes, [50, 2]]
            expect(chooser).to_be_hidden(timeout=qa.TIMEOUT)
            expect(battle).to_have_attribute('data-character-change-presentation', 'settled', timeout=qa.TIMEOUT)
            confirmed_slot()
            expect(combat_done).to_be_hidden()
            evidence['chooserClosed'] = snapshot(page, stage, directory, f'{prefix}-chooser-closed-before-original-sc51')
        finally:
            release_battle_frames(page)
    else:
        reserve.click()
    role = 'attack' if player_attacks else 'defense'
    expect(battle).to_have_attribute('data-exchange-phase', role, timeout=qa.TIMEOUT)
    confirmed_slot()
    expect(combat_done).to_be_visible()
    expect(combat_done).to_be_enabled()
    assert gate_packets() == [*changes, [50, 2], [51, 3, int(player_attacks)]]
    assert sent_quest_actions(page)[len(earlier_sends):] == [[35, 6]]
    assert qa.read_movement_trace(page)['characterRequests'][prior_requests:] == [[35, 6, new_index]]
    evidence['confirmed'] = snapshot(page, stage, directory, f'{prefix}-switched-actors-and-authenticated-{role}')
    evidence['receipts'] = gate_packets()
    return evidence


def start_borrower_change(page, battle, turn, *, player_attacks):
    expect(battle).to_have_attribute('data-ready-turn', str(turn), timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    start = len(qa.read_movement_trace(page)['replies'])
    battle.locator('button[data-move-command="change"]').click()
    page.wait_for_function("""start => window.qaQuestWire.sockets.at(-1).replies.slice(start)
      .some(([command, width, side, direction]) => command === 60 && width === 4 && side === 1 && direction === 3)""",
                           arg=start, timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-direction', '3')
    battle.locator('button[data-move-command="done"]').click()
    expect(battle.locator('#quest-battle-character-change')).to_have_attribute('data-turn', str(turn), timeout=qa.TIMEOUT)
    turn_replies = qa.read_movement_trace(page)['replies'][start:]
    move, = [packet for packet in turn_replies if packet[0] == 48]
    assert move[2:5] == [int(player_attacks), 1, []], move
    return move


def play_borrower_changes(page, stage, battle, directory):
    original = (1264, 123)
    borrowed = (123, 1264)
    replacement = [[109, 19, 1, 0, 3, 123, 14], [109, 19, 0, 0, 0, 1264, 371]]
    restoration = [[109, 19, 0, 0, 0, 123, 14], [109, 19, 1, 0, 3, 1264, 371]]
    done = battle.locator('button[data-combat-command="done"]')
    skill = battle.locator('.quest-battle-skill-name[data-side="player"][data-skill-id="1262"]')
    donor = battle.locator('.quest-battle-skill-name[data-side="opponent"][data-feat-index="0"]')
    check_gregor_feat_slots(page, battle, original)
    expect(battle).to_have_attribute('data-exchange-index', '1', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    commands = place_gregor_cards(page, battle, ((40, True), (15, True), (35, True)), attack=True)
    assert commands == [[28, 40, 0, 1], [28, 15, 1, 1], [28, 35, 1, 1]], commands
    expect(skill).to_have_attribute('data-ready', 'true')
    assert [row for row in qa.read_movement_trace(page)['battleAudit'] if row[:-1] == [107, 6, 1262]]
    done.click()
    commands.append([33, '', ''])
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    commands.extend(place_gregor_cards(page, battle, ((460, True),), attack=False))
    check = {'replaced': check_gregor_feat_pair(
        page, stage, battle, directory, 1, replacement, original, (123, 123), borrowed, commit=34,
    )}
    commands.append([34, '', ''])
    trace = qa.read_movement_trace(page)
    used = [row[:-1] for row in trace['battleAudit'] if row[0] == 110]
    assert used == [[110, 7, 1, 1262], [110, 7, 1, 1264]], used
    damage = [packet for packet in trace['replies'] if packet[0] == 73]
    assert damage == [[73, 8, 1, 1, 1], [73, 8, 0, 1, 0], [73, 8, 1, 1, 0]], damage

    check['moveTwo'] = start_borrower_change(page, battle, 2, player_attacks=False)
    check['benched'] = check_voluntary_change(
        page, stage, battle, directory, turn=2, previous=(0, 635, '9/11', 123), selected=(1, 21, '7/7', 25),
    )
    expect(donor).to_have_attribute('data-skill-id', '1264')
    expect(battle.locator('#quest-battle-reserve-tabs [data-roster-index="0"][data-card-id="635"]')).to_be_visible()
    done.click()
    commands.append([34, '', ''])
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    done.click()
    commands.append([33, '', ''])

    check['moveThree'] = start_borrower_change(page, battle, 3, player_attacks=True)
    assert gregor_feat_receipts(page) == replacement
    check['returnedWithLoan'] = check_voluntary_change(
        page, stage, battle, directory, turn=3, previous=(1, 21, '5/7', 25), selected=(0, 635, '9/11', 123),
        player_attacks=True, split=False,
    )
    check_gregor_feat_slots(page, battle, borrowed)
    expect(battle.locator('#quest-battle-reserve-tabs [data-roster-index="1"][data-card-id="21"]')).to_be_visible()
    assert gregor_feat_receipts(page) == replacement
    check['loanStillActive'] = snapshot(page, stage, directory, '01-q82-borrowed-feat-on-returned-gregor')
    done.click()
    commands.append([33, '', ''])
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    check['restored'] = check_gregor_feat_pair(
        page, stage, battle, directory, 3, restoration, borrowed, (123, 123), original, commit=34,
    )
    commands.append([34, '', ''])
    expect(battle).to_have_attribute('data-ready-turn', '4', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    expect(battle.locator('#quest-battle-player-hp')).to_have_text('9/11')
    expect(battle.locator('#quest-battle-opponent-hp')).to_have_text('3/5')
    check_gregor_feat_slots(page, battle, original)
    trace = qa.read_movement_trace(page)
    assert gregor_feat_receipts(page) == replacement + restoration
    assert trace['combat'] == commands, trace['combat']
    assert trace['movement'] == [[23, 0], [26, '', ''], [23, 3], [26, '', ''], [23, 3], [26, '', '']]
    assert trace['characterRequests'] == [[35, 6, 1], [35, 6, 0]]
    check['complete'] = snapshot(page, stage, directory, '01-q82-restored-after-two-confirmed-character-changes')
    return check


def check_forced_change(page, stage, battle, directory, opening_hand):
    front = battle.locator('#quest-battle-player-character')
    stands = battle.locator('.quest-battle-stand[data-side="player"]')
    health = battle.locator('#quest-battle-player-hp')
    chooser = battle.locator('#quest-battle-character-change')
    combat_done = battle.locator('button[data-combat-command="done"]')
    move_done = battle.locator('button[data-move-command="done"]')
    expect(battle).to_have_attribute('data-exchange-phase', 'defense', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-index', '1')
    expect(health).to_have_text('1/7')
    expect(front).to_have_attribute('data-card-id', '21')
    expect(battle.locator('#quest-battle-player-table [data-card-id]')).to_have_count(0)
    before_defense = sent_quest_actions(page)

    def receipts():
        return [row[:-1] for row in qa.read_movement_trace(page)['battleAudit'] if row[0] in (57, 58, 72)]

    qa.hold_movement_reply(page, 34, combat_done.click, before=[57])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 57
        trace = qa.read_movement_trace(page)
        damage, = [packet for packet in trace['replies'] if packet[0] == 73]
        dice, = [packet for packet in trace['replies'] if packet[0] == 56]
        assert damage == [73, 8, 1, 1, 0] and trace['replies'].index(dice) < trace['replies'].index(damage), trace['replies']
        assert dice[2] == 0 and (len(dice[3]), len(dice[4])) == (13, 5), dice
        assert trace['combat'] == [[34, '', '']] and receipts() == []
        expect(chooser).to_have_count(0)
        expect(health).to_have_text('0/7', timeout=qa.TIMEOUT)
        before = snapshot(page, stage, directory, '04-q1-confirmed-defeat-with-forced-chooser-receipt-held')
    finally:
        qa.release_movement_reply(page)

    expect(chooser).to_have_attribute('data-kind', 'defeated', timeout=qa.TIMEOUT)
    expect(chooser).to_have_attribute('data-state', 'open', timeout=qa.TIMEOUT)
    expect(chooser).to_have_attribute('data-turn', '1')
    expect(front).to_have_attribute('data-roster-index', '0')
    expect(front).to_have_attribute('data-defeated', 'true')
    expect(front.locator('canvas.quest-battle-character-card')).to_have_css('filter', 'brightness(0.5)')
    defeated_raster = character_raster(front)
    expect(front).to_have_attribute('data-card-id', '21')
    expect(stands).to_have_attribute('data-card-id', '21')
    expect(chooser.locator('[data-character-change-card][data-slot="1"][data-card-id="82"]')).to_be_visible()
    expect(chooser.locator('[data-character-change-card]')).to_have_count(1)
    expect(chooser.locator('#quest-battle-change-close')).to_be_disabled()
    expect(chooser.locator('#quest-battle-change-left[data-slot="1"][data-card-id="82"]')).to_be_enabled()
    fallback = chooser.locator('#quest-battle-change-done')
    expect(fallback).to_have_attribute('data-fallback-slot', '1')
    expect(fallback).to_be_enabled()
    source_start = [57, 12, 0, 1, '', '']
    assert receipts() == [source_start]
    expect(battle.locator('#quest-battle-result')).to_have_count(0)
    opened = snapshot(page, stage, directory, '04-q1-genuine-forced-character-chooser')
    page.evaluate('window.qaQuestWire.sockets.at(-1).characterRequests = []')

    weapon = '0,0,0,0,0,0,0,0,'
    switched = [source_start, [72, 28, 1, 1, 82, weapon], [72, 28, 0, 0, 1004, weapon]]
    qa.hold_movement_reply(page, 35, fallback.click, before=[72])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 72
        assert receipts() == [source_start]
        assert qa.read_movement_trace(page)['characterRequests'] == [[35, 6, 1]]
        expect(chooser).to_have_attribute('data-state', 'submitting')
        expect(fallback).to_be_disabled()
        expect(front).to_have_attribute('data-card-id', '21')
        roster_pending = snapshot(page, stage, directory, '04-q1-forced-selection-before-original-sc72')
    finally:
        defer_battle_frames(page, 58)

    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 58', timeout=qa.TIMEOUT)
        assert receipts() == switched
        expect(chooser).to_have_attribute('data-state', 'submitting')
        expect(front).to_have_attribute('data-card-id', '21')
        expect(stands).to_have_attribute('data-card-id', '21')
        expect(health).to_have_text('0/7')
        expect(move_done).to_be_hidden()
        close_pending = snapshot(page, stage, directory, '04-q1-forced-roster-awaiting-original-sc58')
    finally:
        release_battle_frames(page, next_gate=43)

    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 43', timeout=qa.TIMEOUT)
        assert receipts() == [*switched, [58, 2]]
        expect(chooser).to_be_hidden(timeout=qa.TIMEOUT)
        expect(front).to_have_attribute('data-card-id', '82', timeout=qa.TIMEOUT)
        expect(front).to_have_attribute('data-roster-index', '1')
        expect(front).not_to_have_attribute('data-defeated', 'true')
        expect(stands).to_have_attribute('data-card-id', '82')
        expect(health).to_have_text('8/8')
        expect(battle).not_to_have_attribute('data-ready-turn', '2')
        expect(move_done).to_be_hidden()
        closed = snapshot(page, stage, directory, '04-q1-forced-cinema-finished-before-original-turn-two')
    finally:
        release_battle_frames(page, next_gate=46)

    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 46', timeout=qa.TIMEOUT)
        trace = qa.read_movement_trace(page)
        assert [packet[2] for packet in trace['replies'] if packet[0] == 43] == [1, 2]
        assert [packet[2:] for packet in trace['replies'] if packet[0] in (44, 45)][-2:] == [
            [[], 0, 3], [[61], 1, 1],
        ]
        expect(battle).not_to_have_attribute('data-ready-turn', '2')
        expect(battle.locator(f'{HAND} [data-card-id="61"]')).to_have_count(0)
        expect(move_done).to_be_hidden()
        draw_pending = snapshot(page, stage, directory, '04-q1-turn-two-draw-awaiting-original-sc46')
    finally:
        release_battle_frames(page)

    expect(battle).to_have_attribute('data-ready-turn', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    expect(health).to_have_text('8/8')
    expect(battle.locator('.quest-battle-skill-name[data-side="player"][data-roster-index="1"][data-skill-id="100"]')).to_be_visible()
    expect(move_done).to_be_visible()
    expect(move_done).to_be_enabled()
    expect(battle.locator('button[data-move-command="change"]')).to_be_disabled()
    qa.check_dealt_cards(battle.locator(f'{HAND} .quest-battle-hand-card'), [*opening_hand, [61, True, 'event']])
    defeated_tab = battle.locator('#quest-battle-reserve-tabs [data-roster-index="0"][data-card-id="21"]')
    expect(defeated_tab.locator('[data-reserve-field="hp"]')).to_have_text('')
    trace = qa.read_movement_trace(page)
    assert trace['movement'] == [[23, 1], [26, '', '']]
    assert trace['combat'] == [[34, '', '']] and trace['characterRequests'] == [[35, 6, 1]]
    assert sent_quest_actions(page)[len(before_defense):] == [[34, 9], [35, 6]]
    assert not any(packet[0] in (41, 49, 50) for packet in trace['replies'])
    after = snapshot(page, stage, directory, '04-q1-new-active-markus-in-authoritative-turn-two')
    defeated_reserve = check_bench_hover(page, stage, battle, directory, reserve_index=0, card_id=21,
                                        hp=0, max_hp=7, skill_id=25, name='古魯瓦爾多', prefix='04-q1')
    assert defeated_reserve['raster'] == defeated_raster, defeated_reserve
    return {'dice': dice, 'damage': damage, 'receipts': receipts(), 'beforeChooser': before, 'opened': opened,
            'rosterPending': roster_pending, 'closePending': close_pending, 'closed': closed,
            'drawPending': draw_pending, 'confirmed': after, 'defeatedReserve': defeated_reserve}


def check_forced_change_before_dice(page, stage, battle, directory, opening_hand):
    front = battle.locator('#quest-battle-player-character')
    health = battle.locator('#quest-battle-player-hp')
    chooser = battle.locator('#quest-battle-character-change')
    hand = battle.locator(f'{HAND} .quest-battle-hand-card')
    table = battle.locator('#quest-battle-player-table [data-card-id]')
    dice = battle.locator('#quest-battle-dice-roll')
    done = battle.locator('button[data-combat-command="done"]')
    move_done = battle.locator('button[data-move-command="done"]')
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-exchange-index', '1')
    expect(front).to_have_attribute('data-card-id', '635')
    expect(health).to_have_text('1/11')
    observe_feat_sound(page, associate_skill=True)
    played = [40, 15, 35]
    survivors = [card for card in opening_hand if card[0] not in played]
    commands = place_gregor_cards(page, battle, [(card, True) for card in played], attack=True)
    assert commands == [[28, 40, 0, 1], [28, 15, 1, 1], [28, 35, 1, 1]], commands
    expect(table).to_have_count(3)
    expect(battle.locator('.quest-battle-skill-name[data-side="player"][data-skill-id="1262"]')).to_have_attribute('data-ready', 'true')

    # SC110 and the self-hit precede SC55 in the stock stream. Delay the final reveal independently of SC57.
    qa.hold_movement_reply(page, 33, done.click, before=[55])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 55
        trace = qa.read_movement_trace(page)
        sequence = [packet[:-1] for packet in trace['battleAudit'] if packet[0] in (55, 56, 57, 73, 110)]
        assert [packet[0] for packet in sequence] == [110, 110, 73], sequence
        assert sequence[:2] == [[110, 7, 1, 1262], [110, 7, 1, 1264]], sequence
        damage, = [packet for packet in trace['replies'] if packet[0] == 73]
        assert damage == [73, 8, 1, 1, 1], damage
        expect(battle.locator('.quest-battle-feat, [data-sweep="discard"]')).to_have_count(0)
        expect(health).to_have_text('1/11')
        expect(chooser).to_have_count(0)
        reveal_pending = snapshot(page, stage, directory, '04-q82-self-hit-before-original-shared-reveal')
    finally:
        defer_battle_frames(page, 57)

    try:
        page.wait_for_function('() => window.qaQuestWire.battleFrameHold.frames[0]?.command === 57', timeout=qa.TIMEOUT)
        trace = qa.read_movement_trace(page)
        reveal, = [packet for packet in trace['replies'] if packet[0] == 55]
        assert reveal[2:] == [[[card, True] for card in played], [], 0, 0], reveal
        casts = []
        for feat in (1262, 1264):
            art = battle.locator(f'.quest-battle-feat[data-side="player"][data-activated-skill-id="{feat}"] img:visible').first
            expect(art).to_be_visible(timeout=qa.TIMEOUT)
            assert art.evaluate('image => image.complete && image.naturalWidth > 0')
            casts.append(snapshot(page, stage, directory, f'04-q82-self-defeat-authorized-skill-{feat}'))
        expect(health).to_have_text('0/11', timeout=qa.TIMEOUT)
        expect(chooser).to_have_count(0)
        expect(dice).to_have_count(0)
        expect(table).to_have_count(0)
        before = snapshot(page, stage, directory, '04-q82-self-defeat-before-original-sc57')
    finally:
        release_battle_frames(page)

    expect(chooser).to_have_attribute('data-kind', 'defeated', timeout=qa.TIMEOUT)
    expect(chooser).to_have_attribute('data-state', 'open', timeout=qa.TIMEOUT)
    expect(front).to_have_attribute('data-defeated', 'true')
    expect(front.locator('canvas.quest-battle-character-card')).to_have_css('filter', 'brightness(0.5)')
    expect(chooser.locator('#quest-battle-change-close')).to_be_disabled()
    expect(chooser.locator('[data-character-change-card][data-slot="1"][data-card-id="21"]')).to_be_visible()
    choose = chooser.locator('#quest-battle-change-left[data-slot="1"][data-card-id="21"]')
    expect(choose).to_be_enabled()
    expect(table).to_have_count(0)
    qa.check_dealt_cards(hand, survivors)
    opened = snapshot(page, stage, directory, '04-q82-self-defeat-after-single-table-cleanup')
    page.evaluate('window.qaQuestWire.sockets.at(-1).characterRequests = []')
    qa.hold_movement_reply(page, 35, choose.click, before=[46])
    try:
        assert page.evaluate('window.qaQuestWire.actionHold.blocked') == 46
        trace = qa.read_movement_trace(page)
        weapon = '0,0,0,0,0,0,0,0,'
        receipts = [packet[:-1] for packet in trace['battleAudit'] if packet[0] in (57, 58, 72)]
        assert receipts == [[57, 20, 0, 1, '40,15,35', ''], [72, 28, 1, 1, 21, weapon],
                            [72, 28, 0, 0, 1008, weapon], [58, 2]], receipts
        assert trace['characterRequests'] == [[35, 6, 1]], trace['characterRequests']
        assert [packet[2:] for packet in trace['replies'] if packet[0] in (44, 45)][-2:] == [
            [[48, 43, 47], 7, 0], [[61], 1, 1],
        ]
        expect(front).to_have_attribute('data-card-id', '21', timeout=qa.TIMEOUT)
        expect(front).to_have_attribute('data-roster-index', '1')
        expect(health).to_have_text('7/7')
        expect(battle).not_to_have_attribute('data-ready-turn', '2')
        expect(move_done).to_be_hidden()
        ready_pending = snapshot(page, stage, directory, '04-q82-new-active-before-original-turn-two-ready')
    finally:
        qa.release_movement_reply(page)

    expect(battle).to_have_attribute('data-ready-turn', '2', timeout=qa.TIMEOUT)
    expect(battle).to_have_attribute('data-phase', 'move', timeout=qa.TIMEOUT)
    expect(move_done).to_be_enabled()
    expect(move_done).to_be_visible()
    expect(battle.locator('button[data-move-command="change"]')).to_be_disabled()
    expect(battle.locator('.quest-battle-stand[data-side="player"]')).to_have_attribute('data-card-id', '21')
    expect(battle.locator('#quest-battle-opponent-hp')).to_have_text('5/5')
    expect(battle.locator('#quest-battle-reserve-tabs [data-roster-index="0"][data-card-id="635"] [data-reserve-field="hp"]')).to_have_text('')
    qa.check_dealt_cards(hand, [*survivors, *[[card, True, 'action'] for card in (48, 43, 47)], [61, True, 'event']])
    after = snapshot(page, stage, directory, '04-q82-next-genuine-move-after-self-defeat')

    trace = qa.read_movement_trace(page)
    assert trace['combat'] == [*commands, [33, '', '']]
    assert trace['movement'] == [[23, 1], [26, '', '']]
    assert not any(packet[0] in (41, 49, 50, 56) for packet in trace['replies'])
    motion = page.evaluate('window.qaBattleMotion')
    assert not any(frame['dice'] for frame in motion['stages']), motion['stages']
    sweeps = [series for collection in ('sweeps', 'forcedSweeps') for series in motion[collection].values()]
    assert sorted(series[0]['cardId'] for series in sweeps) == sorted(played), sweeps
    for series in sweeps:
        origin_x, origin_y, *_ = series[0]['position']
        end_x, end_y, *_ = series[-1]['position']
        assert len(series) > 1 and end_x < origin_x - 60 and end_y < origin_y - 60, series
        assert all(frame['zone'] == 'quest-battle-player-table' for frame in series), series

    frames = check_gregor_cast_frames(page, '1:1')
    timeline = [frame for frame in motion['featSlots'] if frame['exchangeKey'] == '1:1']
    zero_hp = next(frame for frame in timeline if frame['hp'] == [0, 5])
    chooser_frame = next(frame for frame in timeline if frame['change'] == 'choosing')
    assert frames['1262'][0]['at'] < frames['1264'][0]['at'] <= zero_hp['at'] <= chooser_frame['at'], timeline
    cues = page.evaluate('window.qaStarterSkillPlayback')
    assert [(cue['featId'], cue['played']) for cue in cues] == [(1262, True), (1264, True)], cues
    return {'casts': casts, 'damage': damage, 'reveal': reveal, 'receipts': receipts, 'sweeps': sweeps,
            'revealPending': reveal_pending,
            'timeline': timeline, 'sounds': cues, 'beforeChooser': before, 'opened': opened,
            'readyPending': ready_pending, 'confirmed': after}


def verify_terminal(page, stage, directory, live, quest_id, quest):
    result = page.locator('#quest-battle-result')
    result_ok = result.locator('#quest-battle-result-ok')
    settlement = page.locator('#quest-map-settlement')
    expect(page.locator(STAGE)).to_have_attribute('data-outcome-state', 'settled', timeout=qa.TIMEOUT)
    # Leave room for the full dice, hit, awards and level-up presentation on the authored clocks.
    expect(result_ok).to_be_enabled(timeout=30000)
    expect(result).to_have_attribute('data-result', '0')
    expect(result).to_have_attribute('data-state', 'ready')
    expect(settlement).to_have_count(0)
    before = qa.read_movement_trace(page)
    assert [packet[0] for packet in before['replies'] if packet[0] in (41, 22, 24)][-3:] == [41, 22, 24]
    result_proof = snapshot(page, stage, directory, '09-win-before-first-ok')
    result_ok.click()
    expect(settlement).to_have_attribute('data-inventory-id', str(quest[0]))
    expect(settlement).to_have_attribute('data-result', 'clear')
    expect(page.locator('#quest-map-view')).to_have_attribute('data-map-id', '1' if quest_id == 1 else '2')
    assert sent_quest_actions(page) == result_proof['sent']
    clear = snapshot(page, stage, directory, '09-quest-clear-before-second-ok')
    settlement.locator('#quest-map-settlement-ok').click()
    expect(settlement).to_have_count(0)
    expect(page.locator('#quest-map-back')).to_be_enabled()
    assert sent_quest_actions(page) == result_proof['sent']
    page.locator('#quest-map-back').click()
    qa.screen(stage, 'lobby')
    after = qa.read_movement_trace(page)
    assert len(live) == 5 and live[-1].is_closed() and all(not socket.is_closed() for socket in live[:4])
    assert urlsplit(live[-1].url).path == qa.QUEST_PORT and after['close'] == [1000, True]
    assert after['sent'][-1] == [2, 5]
    return {'result': result_proof, 'clear': clear, 'close': after['close']}


def finish_stock_attack(page, battle):
    expect(battle).to_have_attribute('data-exchange-phase', 'attack', timeout=qa.TIMEOUT)
    _, cards = qa.place_terminal_cards(page, battle, 1, True, reserve_attack=False,
                                      choices=[(41, False), (26, True), (56, True)])
    assert cards == [[41, False], [26, True], [56, True]], cards
    battle.locator('button[data-combat-command="done"]').click()


def check_battle(page, args, plan):
    origin = f'http://127.0.0.1:{args.port}'
    player_card = plan['cardId']
    quest_id = plan['questId']
    eased = args.case == 'eased-condition'
    replacement = args.case == 'feat-replacement'
    bench_hover = args.case == 'bench-hover'
    voluntary = args.case in ('voluntary-change', 'bench-hover')
    borrower = args.case == 'borrower-change'
    forced = args.case == 'forced-change'
    forced_before_dice = args.case == 'forced-change-before-dice'
    two_cards = voluntary or borrower or forced or forced_before_dice
    stage, battle, live, errors, avatar_id, quest, deck = enter_battle(
        page, origin, args.database, args.user, args.password_file.read_text().rstrip('\r\n'), args.screens, quest_id,
        hold_condition=eased, roster_size=2 if two_cards else 1)
    assert deck[0][1] == player_card, deck
    if two_cards:
        assert [entry[1] for entry in deck] == ([21, 82] if forced else [635, 21]), deck
    evidence = {'case': args.case, 'questId': quest_id, 'inventoryId': quest[0], 'cardId': player_card}
    try:
        if eased:
            equipped = qa.query(args.database, """
                SELECT s.id, s.card_id, s.kind, s.deck_position, s.card_position
                FROM chara_card_slot_inventories s JOIN chara_card_decks d ON d.id = s.chara_card_deck_id
                WHERE d.avatar_id = ? AND d.name = 'Deck 1'
            """, avatar_id)
            assert len(equipped) == 1 and equipped[0][1:] == (10000, 0, 0, 0), equipped
            evidence['weapon'] = equipped[0]
            evidence['easedCondition'] = check_eased_condition(page, stage, battle, args.screens)
            evidence['2-and-6'] = check_draw(page, stage, battle, args.screens, release=release_battle_frames)
        else:
            evidence['2-and-6'] = check_draw(page, stage, battle, args.screens)
        if 'openingActions' in plan:
            assert [row[0] for row in evidence['2-and-6']['hand'] if row[2] == 'action'] == plan['openingActions']
        if args.case == 'opponent-hover':
            qa.music(page, 'quest-duel', 'bgm000.mp3')
            trace = qa.read_movement_trace(page)
            encounter, = [packet for packet in trace['replies'] if packet[0] == 37]
            assert encounter[4:] == ['21', '1004', 11, 0, 0, 0, 0, 0, 0], encounter
            assert quest[6:] == (0, 0, 0), quest
            evidence['encounter'] = encounter
            evidence['opponentHover'] = check_opponent_hover(page, stage, battle, args.screens)
            assert [code for code, _ in sent_quest_actions(page) if code >= 22] == [22]
            assert len(live) == 5 and all(not socket.is_closed() for socket in live), live
            assert qa.quest_inventory(args.database, avatar_id) == [quest[:2] + (2,) + quest[3:]]
            assert qa.quest_deck(args.database, avatar_id) == [deck[0][:3] + (1,)]
            assert not errors, errors
            return
        if forced:
            qa.music(page, 'quest-duel', 'bgm000.mp3')
            encounter, = [packet for packet in qa.read_movement_trace(page)['replies'] if packet[0] == 37]
            assert encounter[4:] == ['21,82', '1004', 11, 6, 0, 0, 0, 0, 0], encounter
            assert quest[6:] == (6, 0, 0), quest
            assert evidence['2-and-6']['deckStart'] == [52, 12, 18]
            assert [card for card in evidence['2-and-6']['hand'] if card[2] == 'event'] == [[262, True, 'event']]
            evidence['encounter'] = encounter
        elif replacement or two_cards:
            qa.music(page, 'quest-duel', 'bgm003.mp3')
            encounter, = [packet for packet in qa.read_movement_trace(page)['replies'] if packet[0] == 37]
            injury = 10 if forced_before_dice else 0
            assert encounter[4:] == ['635,21' if two_cards else '635', '1008', 3, injury, 0, 0, 0, 0, 0], encounter
            evidence['encounter'] = encounter
            if two_cards:
                assert evidence['2-and-6']['deckStart'] == [53, 12, 6]
                event = 460 if borrower or forced_before_dice else 262
                assert [card for card in evidence['2-and-6']['hand'] if card[2] == 'event'] == [[event, True, 'event']]
            if forced_before_dice:
                assert quest[6:] == (10, 0, 0), quest
        else:
            evidence['5-and-7'] = check_attention_controls(page, stage, battle, args.screens,
                                                           player_card, plan['skillId'], plan['skillName'])
        if bench_hover:
            active = battle.locator('#quest-battle-player-character')
            expect(active).to_have_attribute('data-card-id', '635')
            gregor_raster = character_raster(active)
            evidence['benchHover'] = {'before': check_bench_hover(
                page, stage, battle, args.screens, reserve_index=1, card_id=21, hp=7, skill_id=25,
            )}
        evidence['4'] = play_movement(page, stage, battle, args.screens, plan['direction'], plan.get('movementCards', []))
        move = evidence['4']['receipt']
        assert move[2] in (0, 1) and move[3] == plan['range'], move
        if plan.get('playerFirst') is not None:
            assert bool(move[2]) is plan['playerFirst'], move
        if forced:
            assert move[4:] == [[], [[51, False]], 0, 1, 0, 0], move
        if forced_before_dice:
            assert move[4:] == [[], [], 0, 0, 0, 0], move
        if not move[2] and not (replacement or two_cards):
            if args.case == 'presentation':
                evidence['3-and-8'] = check_enemy_first(page, stage, battle, args.screens, plan.get('defense', []))
            else:
                wait_for_own_attack(page, battle, plan.get('defense', []))
        if two_cards:
            if forced:
                evidence['4']['forcedChange'] = check_forced_change(
                    page, stage, battle, args.screens, evidence['2-and-6']['hand'],
                )
            elif forced_before_dice:
                evidence['4']['forcedChange'] = check_forced_change_before_dice(
                    page, stage, battle, args.screens, evidence['2-and-6']['hand'],
                )
            elif borrower:
                evidence['1'] = play_borrower_changes(page, stage, battle, args.screens)
            else:
                evidence['4']['voluntaryChange'] = check_voluntary_change(
                    page, stage, battle, args.screens, inspect_opponent=bench_hover,
                )
                if bench_hover:
                    expect(active).to_have_attribute('data-card-id', '21')
                    grunwald_raster = character_raster(active)
                    bench = evidence['benchHover']
                    bench['after'] = check_bench_hover(
                        page, stage, battle, args.screens, reserve_index=0, card_id=635, hp=11, skill_id=1262,
                    )
                    assert bench['before']['raster'] == grunwald_raster, bench['before']
                    assert bench['after']['raster'] == gregor_raster, bench['after']
            assert len(live) == 5 and all(not socket.is_closed() for socket in live), live
            assert qa.quest_inventory(args.database, avatar_id) == [quest[:2] + (2,) + quest[3:]]
            expected_lock = [entry[:3] + (1,) for entry in deck]
            assert qa.quest_deck(args.database, avatar_id) == expected_lock, expected_lock
        elif replacement:
            evidence['1'] = play_feat_replacement(page, stage, battle, args.screens)
            assert len(live) == 5 and all(not socket.is_closed() for socket in live), live
        elif eased:
            evidence['1'] = play_eased_thorn(page, stage, battle, args.screens)
        elif args.case == 'counter-guard':
            evidence['1'] = play_counter_guard(page, stage, battle, args.screens)
        elif args.case == 'skill':
            evidence['1'] = play_starter_skill(page, stage, battle, args.screens, plan)
        else:
            finish_stock_attack(page, battle)
        if plan.get('wins', True):
            evidence['9'] = verify_terminal(page, stage, args.screens, live, quest_id, quest)
            assert qa.quest_inventory(args.database, avatar_id) == []
            assert qa.quest_deck(args.database, avatar_id)[0][-1] == 0
        trace = qa.read_movement_trace(page)
        assert [code for code, _ in trace['sent'] if code == 22] == [22]
        phases = page.evaluate('window.qaBattleMotion.stages')
        painted_order = [next((index for index, sample in enumerate(phases) if sample.get('phase') == phase), -1)
                         for phase in ('opening', 'draw', 'move')]
        assert painted_order[0] >= 0 and painted_order == sorted(set(painted_order)), phases
        assert not errors, errors
    finally:
        evidence['wire'] = qa.read_movement_trace(page)
        evidence['motion'] = page.evaluate('window.qaBattleMotion')
        (args.screens / 'battle-numbered-wire.json').write_text(json.dumps(evidence, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4389)
    parser.add_argument('--database', required=True, type=lambda name: Path(name).resolve())
    parser.add_argument('--user', required=True, help='Disposable original player')
    parser.add_argument('--password-file', type=Path, required=True)
    parser.add_argument('--screens', required=True, type=Path)
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--case', choices=('presentation', 'skill', 'counter-guard', 'eased-condition',
                                          'feat-replacement', 'voluntary-change', 'borrower-change', 'forced-change',
                                          'forced-change-before-dice', 'bench-hover', 'opponent-hover'),
                        default='presentation')
    parser.add_argument('--plan', type=Path, help='Verified original duel plan for the scoped skill fixture')
    args = parser.parse_args()
    if (args.case == 'skill') != (args.plan is not None):
        parser.error('--case skill and its original --plan must be used together')
    if args.case == 'opponent-hover':
        plan = {'questId': 1, 'cardId': 21}
    elif args.case == 'forced-change':
        plan = {
            'questId': 1, 'cardId': 21, 'direction': 1, 'openingActions': [12, 18, 4, 2, 39],
            'playerFirst': False, 'range': 3, 'wins': False,
        }
    elif args.case in ('borrower-change', 'forced-change-before-dice'):
        plan = {
            'questId': 82, 'cardId': 635, 'direction': int(args.case == 'forced-change-before-dice'),
            'openingActions': [40, 38, 15, 35, 49],
            'playerFirst': True, 'range': 2, 'wins': False,
        }
    elif args.case in ('voluntary-change', 'bench-hover'):
        plan = {
            'questId': 82, 'cardId': 635, 'direction': 3, 'openingActions': [13, 19, 4, 2, 39],
            'playerFirst': False, 'range': 2, 'wins': False,
        }
    elif args.case == 'feat-replacement':
        plan = {
            'questId': 82, 'cardId': 635, 'direction': 0, 'openingActions': [9, 29, 4, 42, 47],
            'playerFirst': False, 'range': 2, 'wins': False,
        }
    elif args.case == 'eased-condition':
        plan = {
            'questId': 1, 'cardId': 3, 'skillId': 7, 'skillName': '茨林', 'direction': -1,
            'openingActions': [27, 2, 60, 45, 32], 'movementCards': [[45, False]],
            'playerFirst': True, 'range': 1, 'wins': False,
        }
    elif args.case == 'counter-guard':
        plan = {
            'questId': 1, 'cardId': 82, 'skillId': 100, 'skillName': '攻防抗衡', 'direction': 0,
            'openingActions': [27, 2, 60, 45, 32], 'movementCards': [[45, False]],
            'playerFirst': True, 'range': 2, 'wins': False,
        }
    elif args.plan:
        plan = json.loads(args.plan.read_text())
    else:
        plan = {
            'questId': 4, 'cardId': 21, 'skillId': 25, 'skillName': '猛擊', 'direction': 1, 'playerFirst': False,
            'range': 1, 'openingActions': [41, 26, 9, 27, 56],
        }
    args.screens.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            reduced_motion = 'no-preference' if args.case == 'feat-replacement' else 'reduce'
            page = browser.new_page(viewport={'width': 780, 'height': 680}, device_scale_factor=1, reduced_motion=reduced_motion)
            check_battle(page, args, plan)
        finally:
            browser.close()
    print(f'Original Ruby battle accepted ({args.case}).')


if __name__ == '__main__':
    main()
