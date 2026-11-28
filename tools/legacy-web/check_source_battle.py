"""Verify source Quest battle presentation and starter skills against a disposable Ruby stage."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

import check_source_lobby as qa


STAGE = '#quest-map-battle'
HAND = '#quest-battle-player-hand'
TABLE = '#quest-battle-opponent-table'


def observe_battle_receipts(page, origin):
    # Extend the existing recorder without modifying encoding, server traffic, or the original frame order.
    page.route(origin + '/wire.js?qa-original', lambda route: route.fulfill(content_type='text/javascript', body="""
      export * from './wire.js?battle-original';
      import { readReply as read } from './wire.js?battle-original';
      const captured = new WeakSet();
      export function readReply(body) {
        const reply = read(body);
        const trace = window.qaQuestWire?.receiving;
        if (!trace || captured.has(body) || ![40,43,44,45,46,47,48,51,52,53,54,55,56,61,62,65,66,67,68,69,107,108,110].includes(reply.command)) return reply;
        captured.add(body);
        const audit = read(body);
        const values = reply.command === 40 && body.byteLength === 7 ? [audit.byte(), audit.byte(), audit.byte()]
          : [107,108].includes(reply.command) && body.byteLength === 6 ? [audit.int()]
          : reply.command === 110 && body.byteLength === 7 ? [audit.byte(), audit.int()]
          : [67,68,69].includes(reply.command) && body.byteLength === 3 ? [audit.byte()] : [];
        (trace.battleAudit ??= []).push([reply.command, body.byteLength, ...values, performance.now()]);
        return reply;
      }
    """))


def observe_battle_motion(page):
    page.evaluate("""() => {
      const evidence = window.qaBattleMotion = {deals: {}, backs: {}, sweeps: {}, moveSweeps: {}, standing: [], stages: [], health: []};
      const identities = new WeakMap();
      const bounds = ['x', 'y', 'width', 'height'];
      let serial = 0;
      let phaseKey;
      let healthKey;
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
          const sweep = battle.querySelector('#quest-battle-exchange')?.dataset.sweepState;
          const result = battle.querySelector('#quest-battle-result')?.dataset.state;
          const key = [phase, exchangePhase, exchangeIndex, moveResult, intro, burn, outcomeState, turn, dice, sweep, result, distance].join(':');
          if (key !== phaseKey) {
            evidence.stages.push({at: now, phase, exchangePhase, exchangeIndex, moveResult, intro, burn,
              outcomeState, turn, dice, sweep, result, distance});
            phaseKey = key;
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


def enter_battle(page, origin, database, user, password, directory, quest_id):
    ((player_id, flags),) = qa.player(database, user)
    (profile,) = qa.avatar(database, player_id)
    avatar_id = profile[0]
    assert flags == 0
    deck = qa.quest_deck(database, avatar_id)
    assert len(deck) == 1 and deck[0][2:] == (0, 0), deck
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

    if owned:
        detail, _ = qa.start_preowned_quest(page, database, player_id, quest, [deck[0][:3] + (1,)],
                                           ap_cost=4 if quest_id == 568 else 0)
    else:
        inventory_id = quest[0]
        start_offset = len(qa.read_movement_trace(page)['replies'])
        page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"] .quest-map-row-open').click()
        detail = page.locator('#quest-map-detail')
        expect(detail).to_have_attribute('data-quest-status', '1')
        detail.locator('[data-quest-command="start"]').click()
        expect(detail).to_have_attribute('data-quest-status', '2', timeout=qa.TIMEOUT)
        qa.wait_quest_start_lock(page, database, avatar_id, quest[:2] + (2,) + quest[3:], [deck[0][:3] + (1,)])
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
        assert quest_id in (1, 568)
        entering = first_land
    page.emulate_media(reduced_motion='no-preference')
    observe_battle_motion(page)
    qa.observe_quest_opening_audio(page)
    page.evaluate('window.qaQuestWire.holdAction(22, {through: 45})')
    entering.click()
    battle = page.locator(STAGE)
    expect(battle).to_have_attribute('data-burn', 'settled', timeout=qa.TIMEOUT)
    page.wait_for_function('() => window.qaQuestWire.actionHold.queued.length > 0', timeout=qa.TIMEOUT)
    return stage, battle, live, errors, avatar_id, quest, deck


def check_draw(page, stage, battle, directory):
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
    qa.release_movement_reply(page)
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
    expect(tooltip.locator('dd').nth(0)).to_have_text('攻擊')
    expect(tooltip.locator('dd').nth(1)).to_have_text('近距離' if skill_id == 25 else '中,遠距離')
    expect(tooltip.locator('dd').nth(2)).to_have_text('劍1,劍1' if skill_id == 25 else '槍合計2以上')
    expect(tooltip).to_contain_text('攻擊力+5')
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
    name = {-1: 'forward', 0: 'stay', 1: 'back'}[direction]
    battle.locator(f'button[data-move-command="{name}"]').click()
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
    assert in_move and len(during_result) >= 2, motion
    for sample in in_move + during_result + [sample for sample in motion if sample['result'] == 'sweeping']:
        assert sample['avatar'] and sorted((side, visible) for side, visible, _ in sample['stands']) == [
            ('opponent', True), ('player', True),
        ], sample
    position_before_sweep = during_result[-1]['stands']
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
    dice = snapshot(page, stage, directory, '09-dice-roll-after-foe-card-discard')
    hit = check_first_dwarf_hit(page, stage, battle, directory)
    expect(battle).to_have_attribute('data-exchange-index', '2', timeout=qa.TIMEOUT)
    return {'maskedTransfers': masked, 'flights': flights, 'before': before, 'closed': both, 'revealed': reveal,
            'submitted': submitted, 'after': after, 'bothFaces': both_faces, 'discardSweep': sweeps, 'movingAt': moving['at'],
            'firstRenderedDiceAt': first_roll['at'], 'rolled': dice, 'firstHit': hit}


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
    page.evaluate("""() => {
      const playback = window.qaStarterSkillPlayback = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        const result = play.apply(this, args);
        if (this.src.endsWith('/sound/se/ulse13.mp3')) {
          const cue = {at: performance.now(), played: null};
          playback.push(cue);
          void result.then(() => { cue.played = true; }, () => { cue.played = false; });
        }
        return result;
      };
    }""")
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
    page.wait_for_function('() => window.qaStarterSkillPlayback.some(cue => cue.played)', timeout=qa.TIMEOUT)
    (cue,) = page.evaluate('window.qaStarterSkillPlayback')
    assert cue['played'] and cue['at'] >= next(packet[-1] for packet in trace['battleAudit'] if packet[:-1] == [110, 7, 1, feat])
    return {'armed': armed, 'waiting': waiting, 'fired': fired, 'receipt': [110, 7, 1, feat],
            'availability': limits, 'cards': placed, 'attackDice': len(dice[3]), 'cue': cue}


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
    stage, battle, live, errors, avatar_id, quest, deck = enter_battle(
        page, origin, args.database, args.user, args.password_file.read_text().rstrip('\r\n'), args.screens, quest_id)
    assert deck[0][1] == player_card, deck
    evidence = {'case': args.case, 'questId': quest_id, 'inventoryId': quest[0], 'cardId': player_card}
    try:
        evidence['2-and-6'] = check_draw(page, stage, battle, args.screens)
        if 'openingActions' in plan:
            assert [row[0] for row in evidence['2-and-6']['hand'] if row[2] == 'action'] == plan['openingActions']
        evidence['5-and-7'] = check_attention_controls(page, stage, battle, args.screens,
                                                       player_card, plan['skillId'], plan['skillName'])
        evidence['4'] = play_movement(page, stage, battle, args.screens, plan['direction'], plan.get('movementCards', []))
        move = evidence['4']['receipt']
        assert move[2] in (0, 1) and move[3] == plan['range'], move
        if plan.get('playerFirst') is not None:
            assert bool(move[2]) is plan['playerFirst'], move
        if not move[2]:
            if args.case == 'presentation':
                evidence['3-and-8'] = check_enemy_first(page, stage, battle, args.screens, plan.get('defense', []))
            else:
                wait_for_own_attack(page, battle, plan.get('defense', []))
        if args.case == 'skill':
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
    parser.add_argument('--case', choices=('presentation', 'skill'), default='presentation')
    parser.add_argument('--plan', type=Path, help='Verified original duel plan for the scoped skill fixture')
    args = parser.parse_args()
    if (args.case == 'skill') != (args.plan is not None):
        parser.error('--case skill and its original --plan must be used together')
    plan = json.loads(args.plan.read_text()) if args.plan else {
        'questId': 4, 'cardId': 21, 'skillId': 25, 'skillName': '猛擊', 'direction': 1, 'playerFirst': False, 'range': 1,
        'openingActions': [41, 26, 9, 27, 56],
    }
    args.screens.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(viewport={'width': 780, 'height': 680}, device_scale_factor=1, reduced_motion='reduce')
            check_battle(page, args, plan)
        finally:
            browser.close()
    print(f'Original Ruby battle accepted ({args.case}).')


if __name__ == '__main__':
    main()
