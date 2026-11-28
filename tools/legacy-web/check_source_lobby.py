"""Exercise a fresh fixed-stage player lifecycle against an isolated original Ruby server."""

import argparse
import json
import os
import re
import sqlite3
import struct
from contextlib import closing
from csv import DictReader
from math import isclose
from pathlib import Path
from secrets import token_hex
from subprocess import run
from time import monotonic
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import observe
from check_native_session import command_ids, ensure_no_password, frames_for, verify_exchange

ENTRY = "/source-login/"
SESSION_PORTS = {"/socket/12001", "/socket/12002", "/socket/12003", "/socket/12020"}
QUEST_PORT = "/socket/12005"
STARTER_CHOICES = ((1, 5, 24, 27), (2, 17, 26, 37))
STARTER_CARD = 21
TIMEOUT = 16000
LOBBY_ART_PATH = "/source-login/lobby-art/"
LOBBY_ART = {
    "ap", "ap-fill", "ap-frame", "ap-mask", "background", "duel-stars-3", "entrances", "favorite", "friend", "header", "item",
    "ranking", "record", "status",
}
LOBBY_ENTRY_SYMBOLS = {
    "btn_b", "btn_c", "btn_d", "btn_e", "btn_f", "btn_g", "btn_h", "btn_i", "btn_j", "btn_k", "btn_serial",
}
LOBBY_SIDE_SYMBOLS = {"record", "friend", "item"}
OPTION_DEFAULTS = {"bgm": 50, "se": 50, "cv": 50, "toolTip": True, "arrow": True}
OPTION_EDITS = {"bgm": 0, "se": 99, "cv": 1, "toolTip": False, "arrow": False}
OPTION_STORAGE = "unlight.source-login.preferences"
LOBBY_REFRESH = [0, 2, 0, 17, 10]
QUEST_SEARCH_TIMES = tuple(zip(
    (0, 180, 600, 1800, 3600, 7200, 14400, 28800, 57600, 86400, 259200),
    ("0分", "3分", "10分", "30分", "1小時", "2小時", "4小時", "8小時", "16小時", "1天", "3天"),
))
PEACEFUL_TERRAINS = {
    "empty": (4, 2, 0, 5, 1, "森林小道", "穩靜的獸道", {4: 101}, 4),
    "gem": (32, 4, 1, 10, 6, "寂靜之丘", "綠影斑駁的小高丘", {3: 304, 5: 104}, 5),
}
# One row per turn: action draw, event draw, range, defence faces, and attack faces from the original seed 1 fixture.
TWO_CLOSE_COMBAT_ROUNDS = [
    ([17, 2, 13, 8, 46], 61, 1, [(2, False)], [(17, True), (13, False), (46, True), (61, True)]),
    ([50, 12, 43, 29], 62, 1, [], [(50, True), (43, False), (62, True)]),
]
Q32_LEFT_COMBAT = {
    3: [([18, 2, 14, 9, 50], 260, 3, [(2, False)],
         [(18, False), (14, False), (9, True), (50, False), (260, True)])],
    6: TWO_CLOSE_COMBAT_ROUNDS,
    10: [([19, 2, 15, 10, 50], 61, 3, [(2, False)], [(19, False), (10, True), (50, False)])],
}
# Frames observed in the untouched original Over timelines at 24 fps. Entries are (total, intro).
LOBBY_HOVER_TIMELINES = {"btn_b": (48, 0), "btn_e": (60, 15), "btn_f": (120, 0), "btn_g": (35, 0), "btn_k": (8, 0)}


def query(database, statement, *parameters):
    with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True, timeout=5)) as db:
        return db.execute(statement, parameters).fetchall()


def player(database, name):
    return query(database, "SELECT id, state & 3 FROM players WHERE name = ?", name)


def avatar(database, player_id):
    return query(database, """
        SELECT id, name, level, gems, exp, energy, energy_max, free_duel_count
        FROM avatars WHERE player_id = ?
    """, player_id)


def capture(stage, directory, name, *, animations="disabled"):
    if directory is not None:
        stage.screenshot(path=directory / name, scale="css", animations=animations)


def screen(stage, name):
    expect(stage).to_have_attribute("data-screen", name, timeout=TIMEOUT)
    assert stage.evaluate("stage => [stage.offsetWidth, stage.offsetHeight]") == [780, 680]


def music(page, scene, filename):
    page.wait_for_function("""({scene, filename}) => {
      const audio = document.querySelector(`#stage > audio[data-bgm-scene='${scene}']`);
      return audio?.currentSrc.endsWith('/sound/bgm/' + filename) && audio.loop
        && !audio.paused && audio.currentTime > 0.2;
    }""", arg={"scene": scene, "filename": filename}, timeout=TIMEOUT)


def observe_scene_music_fade(page, scene, *, departure="silent"):
    audio = page.locator(f'#stage > audio[data-bgm-scene="{scene}"]')
    assert audio.evaluate("""(audio, {scene, departure}) => {
      window.qaSceneMusic ??= {};
      const trace = {audio, steps: []};
      window.qaSceneMusic[scene] = trace;
      document.getElementById('stage').addEventListener('game-screen-change', function boundary() {
        if (this.dataset.soundscape !== departure || trace.started) return;
        trace.started = performance.now();
      });
      function sample() {
        const previous = trace.steps.at(-1);
        if (previous?.volume !== audio.volume) {
          trace.steps.push({volume: audio.volume, at: performance.now(), time: audio.currentTime, paused: audio.paused});
        }
      }
      audio.addEventListener('volumechange', sample);
      sample();
      return audio.volume === 0.5 && !audio.paused;
    }""", {"scene": scene, "departure": departure})


def check_scene_music_fade(page, scene):
    page.wait_for_function("""scene => {
      const {audio, steps} = window.qaSceneMusic[scene];
      return audio.paused && !audio.isConnected && steps.at(-1)?.volume === 0;
    }""", arg=scene, timeout=TIMEOUT)
    started, steps = page.evaluate("scene => [window.qaSceneMusic[scene].started, window.qaSceneMusic[scene].steps]", scene)
    assert [round(step["volume"], 2) for step in steps] == [round(step / 20, 2) for step in range(10, -1, -1)], steps
    assert not any(step["paused"] for step in steps[:-1]), steps
    # The source starts a two-second fade. Chromium can deliver volumechange callbacks
    # late during stage decoding, so measure against the scene transition instead.
    duration = steps[-1]["at"] - started
    assert 1800 <= duration <= 2800, (started, steps)
    assert steps[-1]["time"] - steps[0]["time"] >= 1.3, steps
    return duration


def active_session_traffic(sockets, live, start, player_id):
    assert len(sockets[start:]) == len(live[start:]) == 4
    assert {urlsplit(socket.url).path for socket in live[start:]} == SESSION_PORTS
    assert all(not socket.is_closed() for socket in live[start:])
    verify_exchange(sockets[start:start + 1], challenge=True, result=2)
    cert = frames_for(sockets[start][2], 4, 2)[-1]
    assert struct.unpack("!I", cert[-4:])[0] == player_id
    for url, sent, received in sockets[start + 1:]:
        assert frames_for(sent, 2, 2)[0] == struct.pack("!HI", 0, player_id)
        frames_for(received, 4, 4 if urlsplit(url).path == "/socket/12003" else 2)


def account_registration_traffic(sockets, live, start, result):
    assert len(sockets) == len(live) == start + 1 and live[start].is_closed()
    assert urlsplit(live[start].url).path == "/socket/12001"
    assert command_ids(frames_for(sockets[start][1], 2, 1, exact=True)) == [5]
    assert frames_for(sockets[start][2], 4, 1, exact=True) == [struct.pack("!Hi", 0, result)]


def observe_session_codec(page, origin):
    # Keep the production encoding and original Ruby wire. Capture only the fixture's command shape.
    page.route(origin + "/wire.js", lambda route: route.fulfill(content_type="text/javascript", body="""
      import { encodeCommand as encode, readReply as read } from './wire.js?qa-original';
      export * from './wire.js?qa-original';
      function encounterFields(body) {
        const fields = read(body);
        return [fields.int(), fields.string(3), fields.string(4096), fields.string(4096), ...body.slice(-7)];
      }
      function refillFields(body) {
        const fields = read(body);
        const ids = fields.string(4096, true);
        const mask = fields.uint();
        const opponentCount = fields.byte();
        fields.done();
        return [ids === '' ? [] : ids.split(',').map(Number), mask, opponentCount];
      }
      function playedCards(fields) {
        const ids = fields.string(4096, true);
        const faces = fields.string(4096, true).split(',');
        return ids === '' ? [] : ids.split(',').map((id, index) => [Number(id), faces[index] === 'true']);
      }
      function movementResultFields(body) {
        const fields = read(body);
        const initiative = fields.byte();
        const distance = fields.byte();
        const result = [initiative, distance, playedCards(fields), playedCards(fields),
                        fields.byte(), fields.byte(), fields.byte(), fields.byte()];
        fields.done();
        return result;
      }
      function combatCardsFields(body) {
        const fields = read(body);
        const result = [playedCards(fields), playedCards(fields), fields.byte(), fields.byte()];
        fields.done();
        return result;
      }
      function diceFields(body) {
        const fields = read(body);
        const dice = () => {
          const roll = fields.string(4096, true);
          return roll === '' ? [] : roll.split(',').map(Number);
        };
        const result = [fields.byte(), dice(), dice()];
        fields.done();
        return result;
      }
      function pointFields(body) {
        const fields = read(body);
        const player = fields.byte();
        const cards = fields.string(4096, true);
        const result = [player, cards ? cards.split(',').map(Number) : [], fields.uint(), fields.int()];
        fields.done();
        return result;
      }
      function rewardFields(body) {
        const fields = read(body);
        const numbers = () => {
          const csv = fields.string(4096, true);
          return csv ? csv.split(',').map(Number) : [];
        };
        const result = {
          38: () => [numbers(), numbers()],
          122: () => [numbers(), numbers(), numbers(), numbers(), fields.int()],
          123: () => [numbers()],
          124: () => [fields.byte() === 1, numbers(), numbers(), fields.int()],
          125: () => [numbers()],
          126: () => [numbers(), fields.int(), fields.int(), fields.int()],
        }[fields.command]();
        fields.done();
        return result;
      }
      export function encodeCommand(command, fields, key) {
        const frame = encode(command, fields, key);
        const isRefresh = command === 17 && fields?.length === 0;
        if (isRefresh) window.qaLastLobbyRefresh = performance.now();
        window.refreshQASends?.push(isRefresh ? [...encode(command, [])] : command);
        const confirm = command === 12 && fields?.length === 2
          ? [fields[0], fields[1]?.value] : null;
        const deck = command === 12 && fields?.length === 1 ? fields[0] : null;
        const action = [13, 16].includes(command) && fields
          ? [command, fields[0], ...fields.slice(1).map(field => field.value)] : null;
        const movement = [23, 24, 25, 26, 32].includes(command)
          ? [command, ...(fields ?? []).map(field => field.value ?? field)] : null;
        const combat = [28, 29, 30, 31, 33, 34].includes(command)
          ? [command, ...(fields ?? []).map(field => field.value ?? field)] : null;
        const item = command === 7 && fields?.length === 2
          ? fields.map(field => field.value ?? field) : null;
        window.qaQuestWire?.encoded.set(frame, {command, confirm, deck, action, movement, combat, item, key});
        return frame;
      }
      export function readReply(body) {
        const reply = read(body);
        const lobby = window.qaQuestWire?.readingLobby;
        if (lobby && reply.command === 9 && body.byteLength === 6) {
          lobby.replies.push([9, body.byteLength, new DataView(body.buffer, body.byteOffset, body.byteLength).getInt32(2)]);
        }
        const replies = window.qaQuestWire?.receiving?.replies;
        if (replies) {
          const bytes = new DataView(body.buffer, body.byteOffset, body.byteLength);
          const data = reply.command === 32 && body.byteLength >= 6 ? [bytes.getInt32(2)]
            : reply.command === 4 && body.byteLength === 10 ? [bytes.getInt32(2)]
            : [7, 8, 10, 22, 26, 28, 127].includes(reply.command) && body.byteLength === 6 ? [bytes.getInt32(2)]
            : reply.command === 17 && body.byteLength === 11 ? [bytes.getInt32(2), bytes.getInt8(6), bytes.getInt32(7)]
            : [11, 13, 19].includes(reply.command) && body.byteLength === 10 ? [bytes.getInt32(2), bytes.getInt32(6)]
            : reply.command === 12 && body.byteLength === 14 ? [bytes.getInt32(2), bytes.getInt32(6), bytes.getInt32(10)]
            : reply.command === 20 && body.byteLength === 7 ? Array.from({length: 5}, (_, n) => bytes.getInt8(2 + n))
            : reply.command === 24 && body.byteLength === 7 ? [bytes.getInt8(2), bytes.getInt32(3)]
            : reply.command === 25 && body.byteLength === 11 ? [bytes.getInt8(2), bytes.getInt32(3), bytes.getInt32(7)]
            : [38, 122, 123, 124, 125, 126].includes(reply.command) ? rewardFields(body)
            : reply.command === 128 && body.byteLength === 3 ? [bytes.getInt8(2)]
            : reply.command === 37 && body.byteLength >= 9 ? encounterFields(body)
            : reply.command === 40 && body.byteLength === 7 ? [...body.slice(2)]
            : reply.command === 41 && body.byteLength === 32 ? [bytes.getInt8(2),
              ...Array.from({length: 7}, (_, n) => bytes.getInt32(3 + n * 4)), bytes.getInt8(31)]
            : reply.command === 43 && body.byteLength === 3 ? [bytes.getInt8(2)]
            : (reply.command === 44 || reply.command === 45) && body.byteLength >= 11 ? refillFields(body)
            : reply.command === 48 && body.byteLength >= 24 ? movementResultFields(body)
            : [51, 53].includes(reply.command) && body.byteLength === 3 ? [bytes.getInt8(2)]
            : [52, 54, 55].includes(reply.command) && body.byteLength >= 20 ? combatCardsFields(body)
            : reply.command === 56 && body.byteLength >= 11 ? diceFields(body)
            : reply.command === 60 && body.byteLength === 4 ? [bytes.getInt8(2), bytes.getInt8(3)]
            : [61, 62, 65, 66].includes(reply.command) && body.byteLength === 8
            ? [bytes.getInt8(2), bytes.getInt8(3), bytes.getInt32(4)]
            : reply.command === 63 && body.byteLength === 10
            ? [bytes.getInt8(2), bytes.getInt8(3), bytes.getInt8(4), bytes.getInt32(5), bytes.getInt8(9)]
            : [67, 68, 69].includes(reply.command) && body.byteLength === 3 ? [bytes.getInt8(2)]
            : reply.command === 73 && body.byteLength === 8 ? [bytes.getInt8(2), bytes.getInt32(3), bytes.getInt8(7)]
            : reply.command === 74 && body.byteLength === 12
            ? [bytes.getInt8(2), bytes.getInt32(3), bytes.getInt32(7), bytes.getInt8(11)]
            : reply.command === 77 && body.byteLength === 4 ? [bytes.getInt8(2), bytes.getInt8(3)]
            : reply.command === 79 && body.byteLength === 7 ? [bytes.getInt8(2), bytes.getInt32(3)]
            : reply.command === 82 && body.byteLength >= 15 ? pointFields(body)
            : reply.command === 6 && body.byteLength >= 19
            ? [bytes.getInt32(2), bytes.getInt32(6), bytes.getInt32(10), bytes.getInt8(18)] : [];
          replies.push([reply.command, body.byteLength, ...data]);
        }
        return reply;
      }
    """))


def observe_quest_wire(page):
    page.add_init_script(f"""(() => {{
      const wire = window.qaQuestWire = {{ sockets: [], encoded: new WeakMap(), hold: false, lobby: {{sent: [], replies: []}} }};
      wire.holdAction = (command, {{forward = 0, through = null, before = null}} = {{}}) => {{
        const peer = wire.sockets.at(-1);
        wire.actionHold = {{ peer, command, forward, through, before, start: peer.sent.length,
                            queued: [], buffer: new Uint8Array(), key: null }};
      }};
      wire.endActionHold = (deliver, nextCommand = null) => {{
        const {{ queued }} = wire.actionHold;
        wire.actionHold = null;
        if (nextCommand !== null) wire.holdAction(nextCommand);
        if (deliver) for (const receive of queued) receive();
        return queued.length;
      }};
      window.WebSocket = class extends WebSocket {{
        constructor(...args) {{
          super(...args);
          const service = new URL(this.url).pathname;
          if (service === '/socket/12002') this.lobbyTrace = wire.lobby;
          if (service !== {QUEST_PORT!r}) return;
          const overlaps = wire.sockets.some(socket => !socket.close);
          const trace = this.questTrace = {{ sent: [], confirms: [], actions: [], movement: [], combat: [], replies: [], close: null, held: false, overlaps }};
          wire.sockets.push(trace);
          this.addEventListener('close', event => {{ trace.close = [event.code, event.wasClean]; }});
        }}
        send(frame) {{
          const encoded = wire.encoded.get(frame);
          if (this.questTrace) {{
            const {{ command, confirm, action, movement, combat, item, key }} = encoded;
            const hold = wire.actionHold;
            if (hold?.peer === this.questTrace && hold.command === command && hold.before !== null) hold.key = key;
            this.questTrace.sent.push([command, frame.byteLength]);
            if (confirm) this.questTrace.confirms.push(confirm);
            if (action) this.questTrace.actions.push(action);
            if (movement) this.questTrace.movement.push(movement);
            if (combat) this.questTrace.combat.push(combat);
            if (item) (this.questTrace.rewardItems ??= []).push(item);
            if (command === 22) {{
              const battle = document.querySelector('#quest-map-battle');
              (this.questTrace.readySends ??= []).push([battle?.dataset.burn, battle?.dataset.intro]);
            }}
          }}
          if (this.lobbyTrace && encoded && encoded.deck !== null) this.lobbyTrace.sent.push([encoded.command, frame.byteLength, encoded.deck]);
          super.send(frame);
        }}
        set onmessage(handler) {{
          let heldBytes = 0;
          let heldSize = 0;
          if (this.lobbyTrace) {{
            super.onmessage = event => {{
              wire.readingLobby = this.lobbyTrace;
              try {{ handler.call(this, event); }} finally {{ wire.readingLobby = null; }}
            }};
            return;
          }}
          super.onmessage = this.questTrace ? event => {{
            const trace = this.questTrace;
            if (wire.hold && trace.sent.length === 2) {{
              const chunk = new Uint8Array(event.data);
              for (const byte of chunk.subarray(0, Math.max(0, 4 - heldBytes))) heldSize = heldSize * 256 + byte;
              heldBytes += chunk.length;
              trace.held = heldSize >= 2 && heldBytes >= heldSize + 5;
              return;
            }}
            const receive = (message = event) => {{
              wire.receiving = trace;
              try {{ handler.call(this, message); }} finally {{ wire.receiving = null; }}
            }};
            const hold = wire.actionHold;
            if (hold?.peer === trace && trace.sent.slice(hold.start).some(([command]) => command === hold.command)) {{
              if (!hold.forward && hold.through === null && hold.before === null) {{ hold.queued.push(receive); return; }}
              // Keep exact source frames intact while forwarding earlier packets from a shared chunk.
              const chunk = new Uint8Array(event.data);
              const combined = new Uint8Array(hold.buffer.length + chunk.length);
              combined.set(hold.buffer);
              combined.set(chunk, hold.buffer.length);
              hold.buffer = combined;
              while ((hold.forward || hold.through !== null || hold.before !== null) && hold.buffer.length >= 4) {{
                const packetSize = new DataView(hold.buffer.buffer).getUint32(0) + 5;
                if (hold.buffer.length < packetSize) return;
                if (hold.before !== null) {{
                  const [high, low] = hold.buffer.subarray(4, 6);
                  // This is a passive look at the command ID on the same authenticated peer.
                  const command = ((high ^ (hold.key?.[0] ?? 0)) << 8)
                    | (low ^ (hold.key?.[hold.key.length > 1 ? 1 : 0] ?? 0));
                  if (hold.before.includes(command)) {{
                    hold.blocked = command;
                    hold.before = null;
                    break;
                  }}
                }}
                const replyCount = trace.replies.length;
                receive({{data: hold.buffer.slice(0, packetSize).buffer}});
                hold.buffer = hold.buffer.slice(packetSize);
                if (hold.forward) hold.forward--;
                if (trace.replies.slice(replyCount).some(([command]) => command === hold.through)) {{
                  hold.through = null;
                }}
              }}
              if (!hold.forward && hold.through === null && hold.before === null && hold.buffer.length) {{
                const held = {{data: hold.buffer.buffer}};
                hold.queued.push(() => receive(held));
                hold.buffer = new Uint8Array();
              }}
            }} else receive();
          }} : handler;
        }}
      }};
    }})();""")


def wait_refresh_cooldown(page):
    page.wait_for_function("""() => Number.isFinite(window.qaLastLobbyRefresh)
      && performance.now() - window.qaLastLobbyRefresh >= 2050""", timeout=TIMEOUT)


def wait_logout(page, database, player_id):
    deadline = monotonic() + 3
    # Navigation destroys the old document's browser socket observers. Use Ruby's teardown state.
    while query(database, "SELECT state & 3, logout_at >= login_at FROM players WHERE id = ?", player_id) != [(0, 1)]:
        assert monotonic() < deadline, "Original session did not close after navigation"
        page.wait_for_timeout(50)


def equipped_parts(database, avatar_id):
    return [part_id for (part_id,) in query(database, """
        SELECT avatar_part_id FROM part_inventories
        WHERE avatar_id = ? AND (used & 1) = 1 ORDER BY id
    """, avatar_id)]


def quest_inventory(database, avatar_id):
    return query(database, """
        SELECT id, quest_id, status, find_at, progress, deck_index, hp0, hp1, hp2
        FROM avatar_quest_inventories WHERE avatar_id = ? ORDER BY id
    """, avatar_id)


def quest_deck(database, avatar_id):
    return query(database, """
        SELECT i.id, i.chara_card_id, i.position, d.status
        FROM chara_card_decks d JOIN card_inventories i ON i.chara_card_deck_id = d.id
        WHERE d.avatar_id = ? AND d.name = 'Deck 1' ORDER BY i.position
    """, avatar_id)


def verify_starter(database, avatar_id, selected_parts):
    decks = dict(query(database, "SELECT name, id FROM chara_card_decks WHERE avatar_id = ?", avatar_id))
    assert set(decks) == {"Binder", "Deck 1", "Deck 2", "Deck 3"}
    starter = query(database, """
        SELECT chara_card_id, position FROM card_inventories
        WHERE chara_card_deck_id = ? ORDER BY position
    """, decks["Deck 1"])
    assert starter == [(STARTER_CARD, 0)], "The original first deck does not contain the chosen starter"
    assert equipped_parts(database, avatar_id) == [*selected_parts, 42, 43]


def check_avatar_assets(responses, parts):
    by_path = {urlsplit(response.url).path: response for response in responses}
    art = {path: response for path, response in by_path.items() if path.startswith(LOBBY_ART_PATH)}
    hover_path = LOBBY_ART_PATH + "hover/"
    manifest = art.pop(hover_path + "index.json")
    assert manifest.ok
    hover = manifest.json()
    buttons = hover["buttons"]
    assert set(buttons) == LOBBY_ENTRY_SYMBOLS | LOBBY_SIDE_SYMBOLS, sorted(buttons)
    expected_art = {LOBBY_ART_PATH + name + ".png" for name in LOBBY_ART}
    expected_art.add(hover_path + hover["entrancesBase"])
    expected_art.update(hover_path + frames[state] for frames in buttons.values() for state in ("up", "over"))
    assert {symbol for symbol, frames in buttons.items() if frames.get("animation")} == LOBBY_HOVER_TIMELINES.keys()
    expected_art.update(hover_path + buttons[symbol]["animation"]["file"] for symbol in LOBBY_HOVER_TIMELINES)
    assert art.keys() == expected_art, (sorted(art.keys() - expected_art), sorted(expected_art - art.keys()))
    catalog = by_path["/source-login/avatar-catalog.json"]
    wardrobe = by_path["/source-login/avatar-wardrobe/index.json"]
    assert catalog.ok and wardrobe.ok
    definitions = catalog.json()["parts"]
    index = wardrobe.json()
    sheets = index["sheets"]
    expected = set()
    layers = 0
    for part_id in parts:
        for layer in definitions[str(part_id)]["layers"]:
            clip = index["parts"][Path(layer["path"]).stem]
            if clip["width"] == clip["height"] == 0:
                continue
            layers += 1
            sheet = sheets[int(clip["sheet"])] if isinstance(sheets, list) else sheets[str(clip["sheet"])]
            expected.add(urlsplit(urljoin(wardrobe.url, sheet["file"])).path)
    actual = {path: response for path, response in by_path.items()
              if "/avatar-wardrobe/" in path and path.endswith(".png")}
    assert actual.keys() == expected, (sorted(actual), sorted(expected))
    assert all(response.ok and response.headers["content-type"].split(";")[0] == "image/png"
               for response in [*art.values(), *actual.values()])
    return layers


def check_avatar_canvas(page, stage, parts, responses):
    canvas = page.locator("#post-login #lobby-avatar")
    expect(canvas).to_have_attribute("data-avatar-state", "ready", timeout=TIMEOUT)
    expect(canvas).to_have_attribute("data-avatar-parts", ",".join(map(str, parts)))
    expected_layers = check_avatar_assets(responses, parts)
    assert expected_layers > 0
    expect(canvas).to_have_attribute("data-avatar-layers", str(expected_layers))
    assert canvas.get_attribute("data-avatar-missing-parts") is None
    canvas.evaluate("node => Promise.allSettled(node.getAnimations().map(animation => animation.finished))")
    art = canvas.bounding_box()
    stage_box = stage.bounding_box()
    assert (art["x"] - stage_box["x"], art["y"] - stage_box["y"], art["width"], art["height"]) == (489, 230, 290, 450), art
    return portrait_sha(canvas)


def portrait_sha(canvas):
    return canvas.evaluate("""async image => {
      if (image.width !== 290 || image.height !== 450) throw new Error('Invalid source canvas size');
      const { data } = image.getContext('2d').getImageData(0, 0, image.width, image.height);
      let transparent = 0, drawn = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]) drawn++;
        else transparent++;
      }
      if (drawn === 0 || transparent === 0) throw new Error('Missing composed avatar silhouette');
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }""")


def check_lobby(page, player_id, profile):
    avatar_id, name, level, gems, exp, energy, energy_max, free_duel_count = profile
    expect(page.locator("#lobby-view")).to_be_visible()
    expect(page.locator("#lobby-title")).to_have_text("大廳")
    for field, value in (("player-id", player_id), ("avatar-id", avatar_id), ("avatar-name", name),
                         ("level", level), ("gems", gems), ("exp", exp)):
        expect(page.locator(f"#lobby-{field}")).to_have_text(str(value))
    expect(page.locator("#lobby-player-id")).to_be_hidden()
    expect(page.locator("#lobby-avatar-id")).to_be_hidden()
    expect(page.locator("#lobby-deck-name")).to_have_text("Deck 1")
    assert (energy, energy_max, free_duel_count) == (5, 5, 3), profile
    ap = page.locator("#lobby-energy")
    expect(ap).to_have_text(f"{energy}/{energy_max}")
    expect(ap).to_be_visible()
    expect(page.locator("#lobby-free-duel-count")).to_have_text(str(free_duel_count))
    stars = page.locator("#lobby-free-duel-stars")
    expect(stars).to_have_attribute("src", f"{LOBBY_ART_PATH}duel-stars-{free_duel_count}.png")
    expect(stars).to_be_visible()
    page.wait_for_function("""() => {
      const image = document.querySelector('#lobby-free-duel-stars');
      return image?.complete && image.naturalWidth === 43 && image.naturalHeight === 13;
    }""", timeout=TIMEOUT)
    expect(page.locator("#lobby-view")).to_have_attribute("data-hover-art", "ready", timeout=TIMEOUT)
    expect(page.locator("#lobby-view .lobby-art-motion")).to_have_count(len(LOBBY_HOVER_TIMELINES), timeout=TIMEOUT)
    expect(page.locator("#lobby-exp-next")).to_have_text("/10")
    entries = page.locator("#lobby-entries")
    quest_entry = entries.get_by_role("button", name="任務", exact=True)
    expect(quest_entry).to_be_visible()
    expect(page.locator("#lobby-logout, #lobby-news-open")).to_have_count(0)
    shell = page.locator("#lobby-view").bounding_box()
    quest = quest_entry.bounding_box()
    status = page.locator("#lobby-profile").bounding_box()
    ap_box = page.locator("#lobby-profile .ap").bounding_box()
    stars_box = stars.bounding_box()
    center = (quest["x"] + quest["width"] / 2 - shell["x"], quest["y"] + quest["height"] / 2 - shell["y"])
    assert center == (464, 240) and (quest["width"], quest["height"]) == (156, 156), quest
    assert (status["x"] - shell["x"], status["y"] - shell["y"], status["width"], status["height"]) == (0, 660, 760, 20), status
    assert (ap_box["x"] - shell["x"], ap_box["y"] - shell["y"], ap_box["width"], ap_box["height"]) == (
        659, 615, 90, 65
    ), ap_box
    assert (stars_box["x"] - shell["x"], stars_box["y"] - shell["y"], stars_box["width"], stars_box["height"]) == (
        717, 664, 43, 13
    ), stars_box


def close_lobby_news(page, stage, directory):
    news = page.locator("#lobby-news")
    news_close = page.locator("#lobby-news-close")
    expect(news).to_have_attribute("data-state", "ready")
    expect(news).to_be_visible()
    expect(news_close).to_be_focused()
    news_box = news.bounding_box()
    assert tuple(news_box[key] for key in ("x", "y", "width", "height")) == (246, 158, 378, 342), news_box
    expect(page.locator("#lobby-news-content li")).to_have_count(3)
    expect(page.locator("#quest-map-view")).to_be_hidden()
    capture(stage, directory, "11a-lobby-news.png")
    check_button_hover(page, news_close)
    news_close.press("Escape")
    expect(news).to_be_hidden()
    expect(page.locator("#lobby-title")).to_be_focused()


def wait_quest_art(page):
    page.wait_for_function("""() => [...document.querySelectorAll('#quest-map-view img')]
      .filter(image => image.getClientRects().length && image.getAttribute('src'))
      .every(image => image.complete && image.naturalWidth > 0)""", timeout=TIMEOUT)


def check_quest_previews(page, stage, directory, live, *, animate):
    active = [socket for socket in live if not socket.is_closed()]
    assert len(active) == 5
    audio = page.locator('#stage > audio[data-bgm-scene="quest"]')
    clock = audio.evaluate("audio => { window.qaPreviewAudio = audio; return audio.currentTime; }")
    open_picker = page.locator("#quest-map-region-open")
    picker = page.locator("#quest-map-region-picker")
    picker_close = page.locator("#quest-map-region-close")
    landmark = page.get_by_role("button", name="魔女山谷", exact=True)
    search = page.locator("#quest-map-search-preview")
    search_close = page.locator("#quest-map-search-close")
    picker.evaluate("""dialog => {
      const originalAnimate = dialog.animate.bind(dialog);
      window.qaPickerSlides = [];
      dialog.animate = (frames, timing) => {
        window.qaPickerSlides.push([frames[0].transform, frames.at(-1).transform, timing.duration]);
        return originalAnimate(frames, timing);
      };
    }""")

    open_picker.press("Enter")
    expect(picker).to_be_visible()
    expect(search).to_be_hidden()
    expect(picker.locator('button[data-region-page="1"]')).to_have_accessible_name("HexRealm")
    memory_land = picker.get_by_role("button", name="MemoryLand", exact=True)
    expect(memory_land).to_be_enabled()
    picker.evaluate("dialog => Promise.allSettled(dialog.getAnimations().map(animation => animation.finished))")
    assert picker.bounding_box() == {"x": 32, "y": 64, "width": 384, "height": 384}
    stage.evaluate("stage => document.fonts.ready")
    wait_quest_art(page)
    capture(stage, directory, "11b1-quest-map-picker.png")
    page.keyboard.press("Tab")
    assert picker.evaluate("dialog => dialog.contains(document.activeElement)")
    page.keyboard.press("Escape")
    expect(picker).to_be_hidden()
    expect(open_picker).to_be_focused()
    open_picker.press("Enter")
    expect(picker).to_be_visible()
    picker_close.click()
    expect(picker).to_be_hidden()
    expect(open_picker).to_be_focused()
    slides = page.evaluate("window.qaPickerSlides")
    if animate:
        assert len(slides) == 4 and all(slide[2] == 300 for slide in slides), slides
        assert [slide[1] for slide in slides] == ["translateY(0px)", "translateY(-500px)"] * 2, slides
    else:
        assert not slides, slides

    page.mouse.click(245, 249)  # The authored tower is decorative; the adjacent ribbon is interactive.
    expect(search).to_be_hidden()
    landmark.hover()
    capture(stage, directory, "11b2-quest-map-landmark-hover.png")
    landmark.press("Enter")
    expect(search).to_be_visible()
    expect(picker).to_be_hidden()
    assert search.bounding_box() == {"x": 270, "y": 280, "width": 368, "height": 152}
    expect(page.locator("#quest-map-search-name")).to_have_text("魔女山谷")
    thumb = page.locator("#quest-map-search-thumbnail")
    expect(thumb).to_have_attribute("src", "/source-login/quest-art/quest-search-thumbnail-06.jpg")
    page.wait_for_function("() => document.querySelector('#quest-map-search-thumbnail').naturalWidth === 88", timeout=TIMEOUT)
    slider = page.locator("#quest-map-search-time")
    value = page.locator("#quest-map-search-time-value")
    confirm = page.locator("#quest-map-search-confirm")
    expect(slider).to_have_attribute("min", "0")
    expect(slider).to_have_attribute("max", "10")
    expect(slider).to_have_value("0")
    assert search.evaluate("dialog => dialog.contains(document.activeElement)")
    for index, (seconds, label) in enumerate(QUEST_SEARCH_TIMES):
        if index:
            slider.press("ArrowRight")
        expect(slider).to_have_value(str(index))
        expect(slider).to_have_attribute("aria-valuetext", label)
        expect(value).to_have_text(label)
        expect(value).to_have_attribute("data-seconds", str(seconds))
        expect(page.locator("#quest-map-search-ap")).to_have_text(re.compile(r"(?:^|\D)1(?:\D|$)"))
        expect(confirm).to_be_enabled()
        if index <= 1:
            capture(stage, directory, f"11b{3 + index}-quest-search-{seconds}s.png")
    assert [socket for socket in live if not socket.is_closed()] == active
    slider.press("Enter")
    expect(search).to_be_visible()
    page.keyboard.press("Escape")
    expect(search).to_be_hidden()
    expect(landmark).to_be_focused()
    landmark.press("Enter")
    expect(slider).to_have_value("10")
    search_close.click()
    expect(search).to_be_hidden()
    expect(landmark).to_be_focused()
    open_picker.press("Enter")
    memory_land.press("Enter")
    expect(picker).to_be_hidden()
    expect(open_picker).to_be_focused()
    quest = page.locator("#quest-map-view")
    expect(quest).to_have_attribute("data-map-type", "tutorial")
    expect(quest).to_have_attribute("data-region-page", "tutorial")
    expect(quest).to_have_attribute("data-state", "ready")
    expect(page.locator("#quest-map-progress")).to_have_text("0/2")
    tutorial = page.get_by_role("button", name="微笑的平原", exact=True)
    expect(tutorial).to_be_enabled()
    wait_quest_art(page)
    capture(stage, directory, "11b5-quest-map-memoryland.png")
    page.mouse.click(156, 135)  # The original locked 屍之森 ribbon must not open a search preview.
    expect(search).to_be_hidden()
    tutorial.press("Enter")
    expect(search).to_have_attribute("data-map-id", "2009")
    expect(page.locator("#quest-map-search-name")).to_have_text("微笑的平原")
    expect(slider).to_have_value("10")
    expect(confirm).to_be_enabled()
    search_close.press("Enter")
    expect(tutorial).to_be_focused()
    open_picker.press("Enter")
    picker.get_by_role("button", name="HexRealm", exact=True).press("Enter")
    expect(picker).to_be_hidden()
    expect(quest).to_have_attribute("data-region-page", "1")
    expect(quest).to_have_attribute("data-map-type", "normal")
    expect(landmark).to_be_enabled()
    expect(page.locator("#quest-map-progress")).to_have_text("0/3")
    assert audio.evaluate("(audio, time) => window.qaPreviewAudio === audio && audio.currentTime > time && !audio.paused", clock)
    assert [socket for socket in live if not socket.is_closed()] == active


def check_quest_scene(page, stage, directory, database, player_id, profile, sockets, live, *, cancel=False, animate=False):
    core = [socket for socket in live if not socket.is_closed()]
    assert len(core) == 4 and {urlsplit(socket.url).path for socket in core} == SESSION_PORTS
    rows = quest_inventory(database, profile[0])
    cards = quest_deck(database, profile[0])
    parts = equipped_parts(database, profile[0])
    launcher = page.locator("#lobby-quest-load")
    quest = page.locator("#quest-map-view")
    count = len(sockets)
    quest_count = page.evaluate("window.qaQuestWire.sockets.length")
    page.evaluate("hold => { window.qaQuestWire.hold = hold; }", cancel)
    if animate:
        observe_scene_music_fade(page, "lobby")
        page.emulate_media(reduced_motion="no-preference")
        stage.evaluate("""stage => {
          window.qaQuestFades = [];
          new MutationObserver(() => {
            const phase = stage.dataset.questTransition;
            const view = stage.querySelector(phase === 'to-quest' ? '#lobby-view' : '#quest-map-view');
            if (phase && view) {
              window.qaQuestFades.push([phase, view.inert, ...view.getAnimations().map(a => a.effect.getTiming().duration)]);
            }
          }).observe(stage, {attributes: true, attributeFilter: ['data-quest-transition']});
        }""")
    launcher.press("Enter")

    if cancel:
        screen(stage, "quest-pending")
        page.wait_for_function("index => window.qaQuestWire.sockets[index]?.held === true", arg=quest_count, timeout=TIMEOUT)
        expect(quest).to_be_hidden()
        back = page.locator("#quest-pending-back")
        expect(back).to_be_focused()
        back.press("Enter")
    else:
        screen(stage, "quest-map")
        expect(quest).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
        expect(quest).to_have_attribute("data-map-id", "1")
        expect(page.locator("#quest-map-progress")).to_have_text("0/3")
        expect(page.locator("#quest-map-capacity")).to_have_text(f"{len(rows)}/4")
        expect(page.locator("#quest-map-world").get_by_role("button", name="魔女山谷")).to_be_visible()
        deck = page.locator("#quest-map-deck")
        expect(deck).to_contain_text("Deck 1")
        expect(deck).to_have_attribute("data-deck-index", "1")
        expect(deck.locator("li[data-card-id]")).to_have_count(len(cards))
        for inventory_id, card_id, position, _ in cards:
            slot = deck.locator(f'li[data-position="{position}"]')
            expect(slot).to_have_attribute("data-inventory-id", str(inventory_id))
            expect(slot).to_have_attribute("data-card-id", str(card_id))
        expect(page.locator("#quest-map-energy")).to_have_text(f"{profile[5]}/{profile[6]}")
        portrait = page.locator("#quest-map-avatar")
        expect(portrait).to_have_attribute("data-avatar-state", "ready", timeout=TIMEOUT)
        expect(portrait).to_have_attribute("data-avatar-parts", ",".join(map(str, parts)))
        inventory = page.locator("#quest-map-inventory > li[data-inventory-id]")
        expect(inventory).to_have_count(len(rows))
        for inventory_id, quest_id, status, *_ in rows:
            row = page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"]')
            expect(row).to_have_attribute("data-quest-id", str(0 if status == 4 else quest_id))
            expect(row).to_have_attribute("data-quest-status", str(status))
            if status == 4:
                expect(row.get_by_role("timer")).to_have_text(re.compile(r"^\[\d+d\d{2}h\d{2}m\]$"))
            elif quest_id == 1:
                expect(row.locator(".quest-map-row-name")).to_have_text("落日大蝙蝠")
        back = page.locator("#quest-map-back")
        expect(back).to_be_focused()
        music(page, "quest", "ulbgm03.mp3")
        assert len(live) == count + 1 and [socket for socket in live if not socket.is_closed()] == [*core, live[-1]]
        wait_quest_art(page)
        capture(stage, directory, "11b-quest-map.png")
        check_quest_previews(page, stage, directory, live, animate=animate)
        if animate:
            lobby_fade = check_scene_music_fade(page, "lobby")
            observe_scene_music_fade(page, "quest")
        back.press("Enter")

    screen(stage, "lobby")
    expect(quest).to_be_hidden()
    expect(launcher).to_be_focused()
    page.evaluate("() => { window.qaQuestWire.hold = false; }")
    traces = page.evaluate("window.qaQuestWire.sockets.map(({sent, replies, close, held, overlaps}) => "
                           "({sent, replies, close, held, overlaps}))")
    assert len(traces) == quest_count + 1 and not traces[-1]["overlaps"], traces
    trace = traces[-1]
    assert len(live) == len(sockets) == count + 1 and live[-1].is_closed()
    assert [socket for socket in live if not socket.is_closed()] == core
    quest_url, sent, received = sockets[-1]
    assert urlsplit(quest_url).path == QUEST_PORT
    assert trace["close"] == [1000, True], trace
    outgoing = frames_for(sent, 2, 3 if cancel else 4, exact=True)
    assert outgoing[0] == struct.pack("!HI", 0, player_id)
    assert 15 <= len(outgoing[1]) <= 18 and all(len(frame) == 2 for frame in outgoing[2:])
    assert [size for _, size in trace["sent"]] == [9, len(outgoing[1]) + 3, *([5] * (len(outgoing) - 2))], trace
    if cancel:
        assert trace["held"] and [command for command, _ in trace["sent"]] == [0, 1, 2], trace
        assert [reply[0] for reply in trace["replies"]] == [0], trace
        frames_for(received, 4, 2)
    else:
        assert not trace["held"] and [command for command, _ in trace["sent"]] == [0, 1, 3, 2], trace
        discovered = [(inventory_id, quest_id, 0, status) for inventory_id, quest_id, status, *_ in rows if status != 4]
        incoming = trace["replies"]
        expected = [0, 1, 32, *([6] * len(discovered)), 3]
        assert [reply[0] for reply in incoming[:len(expected)]] == expected, incoming
        assert incoming[2][1:] == [6, query(database, "SELECT COUNT(*) FROM action_cards")[0][0]]
        assert sorted(tuple(reply[2:]) for reply in incoming[3:3 + len(discovered)]) == sorted(discovered)
        assert incoming[len(expected) - 1] == [3, 2]
        assert [len(frame) for frame in frames_for(received, 4, len(expected))] == [
            reply[1] for reply in incoming[:len(expected)]
        ]
    music(page, "lobby", "ulbgm02.mp3")
    if animate:
        quest_fade = check_scene_music_fade(page, "quest")
        print(f"Observed ten audio fade steps in {lobby_fade:.0f}ms (Lobby) and {quest_fade:.0f}ms (Quest).")
        fades = page.evaluate("window.qaQuestFades")
        assert [(phase, inert) for phase, inert, _ in fades] == [("to-quest", True), ("to-lobby", True)], fades
        assert all(isclose(duration, 800 / 1.7, abs_tol=0.01) for _, _, duration in fades), fades
        page.emulate_media(reduced_motion="reduce")
    assert avatar(database, player_id) == [profile] and equipped_parts(database, profile[0]) == parts
    assert quest_inventory(database, profile[0]) == rows and quest_deck(database, profile[0]) == cards


def check_owned_quest_inventory(page, origin, database, name, password, directory):
    ((player_id, flags),) = player(database, name)
    (profile,) = avatar(database, player_id)
    rows = quest_inventory(database, profile[0])
    assert flags == 0 and sorted(row[2] for row in rows) == [0, 4], "Use a signed-out discovered and pending fixture"
    _, sockets, errors = observe(page)
    live = []
    page.on("websocket", lambda socket: live.append(socket))
    observe_session_codec(page, origin)
    observe_quest_wire(page)
    assert page.goto(origin + ENTRY, wait_until="domcontentloaded").ok
    stage = page.locator("#stage")
    expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
    page.locator("#username").fill(name)
    page.locator("#password").fill(password)
    page.locator("#login-submit").click()
    screen(stage, "lobby")
    close_lobby_news(page, stage, None)
    active_session_traffic(sockets, live, 0, player_id)
    (profile,) = avatar(database, player_id)
    check_quest_scene(page, stage, None, database, player_id, profile, sockets, live, cancel=True)
    check_quest_scene(page, stage, directory, database, player_id, profile, sockets, live)
    assert quest_inventory(database, profile[0]) == rows
    assert not errors, errors
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)


def observe_detail_audio(page):
    music(page, "quest", "ulbgm03.mp3")
    page.evaluate("""() => {
      const track = document.querySelector('#stage > audio[data-bgm-scene="quest"]');
      const observation = window.qaDetailAudio = {track, start: track.currentTime, clicks: 0};
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.src.endsWith('/ulse01.mp3')) observation.clicks++;
        return original.call(this);
      };
    }""")


def check_deck_arrows(page, stage, directory, database, avatar_id):
    deck = page.locator("#quest-map-deck")
    slots = deck.locator("#quest-map-deck-cards > li[data-position][data-card-id]")
    previous = page.locator("#quest-map-deck-previous")
    following = page.locator("#quest-map-deck-next")
    parts = quest_deck(database, avatar_id)
    assert len(parts) == 1 and parts[0][1:3] == (STARTER_CARD, 0)
    baseline = page.evaluate("window.qaQuestWire.lobby")
    expect(deck).to_have_attribute("data-deck-index", "1")
    expect(slots).to_have_count(1)
    steps = ((following, 2), (following, 3), (following, 1), (previous, 3), (following, 1))
    for index, (control, selected) in enumerate(steps):
        expect(control).to_be_enabled()
        if index == 0:
            control.click()
        else:
            control.press("Enter")
        expect(deck).to_have_attribute("data-deck-index", str(selected))
        expect(deck.locator("#quest-map-active-deck-name")).to_have_text(f"{selected}. Deck {selected}")
        expect(slots).to_have_count(int(selected == 1))
        if selected == 1:
            expect(slots).to_have_attribute("data-card-id", str(STARTER_CARD))
            expect(slots).to_have_attribute("data-position", "0")
        assert query(database, "SELECT current_deck FROM avatars WHERE id = ?", avatar_id) == [(selected,)]
        if index == 0:
            capture(stage, directory, "15e-quest-deck2.png")
    targets = [selected for _, selected in steps]
    traffic = page.evaluate("window.qaQuestWire.lobby")
    assert traffic["sent"][len(baseline["sent"]):] == [[12, 9, target] for target in targets]
    assert traffic["replies"][len(baseline["replies"]):] == [[9, 6, target] for target in targets]
    assert quest_deck(database, avatar_id) == parts
    assert page.evaluate("window.qaDetailAudio.clicks") == 0


def check_quest_detail(page, stage, directory, database, avatar_id, quest, *, drop_reply):
    inventory_id = quest[0]
    row = page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"]')
    select_row = row.locator(".quest-map-row-open")
    detail = page.locator("#quest-map-detail")
    back = page.locator("#quest-map-detail-back")
    land = detail.locator('.quest-map-detail-land[data-slot="1"][data-land-id="201"]')
    page.evaluate("window.qaQuestWire.holdAction(12)")
    select_row.click()
    expect(detail).to_be_visible(timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-inventory-id", str(inventory_id))
    expect(page.locator("#quest-map-detail-title")).to_have_text("落日大蝙蝠")
    expect(page.locator("#quest-map-detail-caption")).to_have_text("飛舞於山谷間的大蝙蝠，今晚也要搜尋犧牲者")
    expect(land).to_be_visible()
    expect(detail.locator('[data-quest-command="start"]')).to_be_disabled()
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-quest-status", "0")
    expect(row).to_have_attribute("data-quest-status", "0")
    assert page.evaluate("window.qaQuestWire.sockets.at(-1).confirms") == [[inventory_id, 1]]
    confirmed = quest[:2] + (1,) + quest[3:]
    assert quest_inventory(database, avatar_id) == [confirmed]
    wait_quest_art(page)
    capture(stage, directory, "15a-quest-detail-held.png")

    if drop_reply:
        expect(detail).to_have_attribute("data-confirmation-state", "uncertain", timeout=TIMEOUT)
        assert page.evaluate("window.qaQuestWire.endActionHold(false)") > 0
        expect(detail).to_have_attribute("data-quest-status", "0")
        capture(stage, directory, "15b-quest-detail-uncertain.png")
    else:
        assert page.evaluate("window.qaQuestWire.endActionHold(true)") > 0
        expect(detail).to_have_attribute("data-quest-status", "1")
        terrain = page.locator("#quest-map-detail-land-data")
        heading = detail.locator(".quest-map-detail-data-art > img").first
        land_name = page.locator("#quest-map-detail-land-name")
        land_caption = page.locator("#quest-map-detail-land-caption")
        expect(heading).to_be_visible()
        expect(terrain).to_be_hidden()
        expect(land_name).to_have_text("")
        land.hover()
        expect(land_name).to_have_text("寬廣高原1")
        expect(land_name).to_be_visible()
        expect(land_caption).to_have_text("蝙蝠揮舞翅膀的廣大高原")
        wait_quest_art(page)
        capture(stage, directory, "15b-quest-detail-land-hover.png")
        page.mouse.move(770, 346)
        expect(heading).to_be_visible()
        expect(terrain).to_be_hidden()
        expect(land_name).to_have_text("")
        expect(land_caption).to_have_text("")
        capture(stage, directory, "15c-quest-detail-land-out.png")

    back.press("Enter")
    expect(detail).to_be_hidden()
    expect(select_row).to_be_focused()
    assert page.evaluate("window.qaDetailAudio.clicks") == 1
    select_row.press("Enter")
    expect(detail).to_be_visible()
    expect(detail).to_have_attribute("data-quest-status", "0" if drop_reply else "1")
    assert page.evaluate("window.qaQuestWire.sockets.at(-1).confirms") == [[inventory_id, 1]]
    back.press("Enter")
    expect(select_row).to_be_focused()
    assert page.evaluate("""() => {
      const {track, start, clicks} = window.qaDetailAudio;
      return clicks === 2 && track === document.querySelector('#stage > audio[data-bgm-scene="quest"]')
        && !track.paused && track.currentTime > start;
    }""")
    return confirmed


def search_first_quest(page, stage, directory, database, avatar_id):
    page.locator("#lobby-quest-load").press("Enter")
    screen(stage, "quest-map")
    expect(page.locator("#quest-map-view")).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    landmark = page.get_by_role("button", name="魔女山谷", exact=True)
    landmark.press("Enter")
    expect(page.locator("#quest-map-search-time")).to_have_value("0")
    page.locator("#quest-map-search-confirm").press("Enter")
    result = page.locator("#quest-map-search-result")
    expect(result).to_be_visible(timeout=TIMEOUT)
    expect(page.locator("#quest-map-search-result-name")).to_have_text("落日大蝙蝠")
    expect(page.locator("#quest-map-energy")).to_have_text("4/5")
    (quest,) = quest_inventory(database, avatar_id)
    assert quest[1:3] == (1, 0)
    expect(result).to_have_attribute("data-inventory-id", str(quest[0]))
    expect(page.locator("#quest-map-inventory > li[data-inventory-id]")).to_have_attribute("data-quest-status", "0")
    capture(stage, directory, "15-quest-search-immediate.png")
    page.locator("#quest-map-search-result-ok").press("Enter")
    expect(landmark).to_be_focused()
    return quest


def check_instant_quest_search(page, stage, directory, database, player_id, profile, live, session_start, *, drop_reply):
    avatar_id = profile[0]
    assert not quest_inventory(database, avatar_id) and profile[5:7] == (5, 5)
    parts, decks = equipped_parts(database, avatar_id), quest_deck(database, avatar_id)
    core = live[session_start:]
    assert len(core) == 4 and all(not socket.is_closed() for socket in core)
    quest = search_first_quest(page, stage, directory, database, avatar_id)
    assert len(live[session_start:]) == 5 and all(not socket.is_closed() for socket in live[session_start:])
    launcher = page.locator("#lobby-quest-load")
    observe_detail_audio(page)
    if not drop_reply:
        check_deck_arrows(page, stage, directory, database, avatar_id)
        assert quest_inventory(database, avatar_id) == [quest]
    confirmed = check_quest_detail(page, stage, directory, database, avatar_id, quest, drop_reply=drop_reply)
    expect(page.locator("#quest-map-energy")).to_have_text("4/5")
    page.locator("#quest-map-back").press("Enter")
    screen(stage, "lobby")
    expect(launcher).to_be_focused()
    expect(page.locator("#lobby-energy")).to_have_text("4/5")
    assert [socket for socket in live[session_start:] if not socket.is_closed()] == core
    trace = page.evaluate("""() => {
      const {sent, confirms, replies, close, overlaps} = window.qaQuestWire.sockets.at(-1);
      return {sent, confirms, replies, close, overlaps};
    }""")
    assert [command for command, _ in trace["sent"]] == [0, 1, 3, 5, 3, 12, *([] if drop_reply else [3]), 2], trace
    assert trace["sent"][3] == [5, 13] and trace["close"] == [1000, True] and not trace["overlaps"], trace
    assert trace["sent"][5] == [12, 10] and trace["confirms"] == [[quest[0], 1]], trace
    energy, discovered = [reply for reply in trace["replies"] if reply[0] in (4, 6)]
    assert energy == [4, 10, 4] and discovered[0] == 6 and discovered[2:] == [quest[0], 1, 0, 0]
    expected_confirmation = [] if drop_reply else [[17, 11, quest[0], 1, 1]]
    assert [reply for reply in trace["replies"] if reply[0] == 17] == expected_confirmation, trace
    updated = profile[:5] + (4,) + profile[6:]
    recovered = None
    if drop_reply:
        launcher.press("Enter")
        screen(stage, "quest-map")
        row = page.locator(f'#quest-map-inventory > li[data-inventory-id="{quest[0]}"]')
        expect(row).to_have_attribute("data-quest-status", "1", timeout=TIMEOUT)
        row.locator(".quest-map-row-open").press("Enter")
        detail = page.locator("#quest-map-detail")
        expect(detail).to_have_attribute("data-quest-status", "1")
        expect(page.locator("#quest-map-detail-title")).to_have_text("落日大蝙蝠")
        expect(detail.locator('.quest-map-detail-land[data-land-id="201"]')).to_be_visible()
        wait_quest_art(page)
        capture(stage, directory, "15d-quest-detail-reconciled.png")
        page.locator("#quest-map-detail-back").press("Enter")
        page.locator("#quest-map-back").press("Enter")
        screen(stage, "lobby")
        recovered = page.evaluate("window.qaQuestWire.sockets.at(-1)")
        assert [command for command, _ in recovered["sent"]] == [0, 1, 3, 2], recovered
        assert [reply[2:] for reply in recovered["replies"] if reply[0] == 6] == [[quest[0], 1, 0, 1]]
        assert not recovered["overlaps"] and recovered["close"] == [1000, True]
        assert [socket for socket in live[session_start:] if not socket.is_closed()] == core
    assert avatar(database, player_id) == [updated] and quest_inventory(database, avatar_id) == [confirmed]
    assert equipped_parts(database, avatar_id) == parts and quest_deck(database, avatar_id) == decks
    if directory is not None:
        evidence = {"quest": trace, "reopenedQuest": recovered, "lobbyDeck": page.evaluate("window.qaQuestWire.lobby")}
        (directory / "15-quest-detail-wire.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return updated


def check_quest_position_catalog(page, origin):
    response = page.request.get(origin + "/api/quest-catalog?id=1&id=3")
    assert response.ok
    quests = response.json()["quests"]
    assert {quest["id"]: quest["ap"] for quest in quests} == {1: 0, 3: 1}
    positions = {
        quest["id"]: [(land["slot"], land["id"], land["nextMask"], land["nextSlots"],
                       land["stage"], land["treasureType"]) for land in quest["positions"]]
        for quest in quests
    }
    assert positions == {1: [(1, 201, 0, [], 11, 0)], 3: [(1, 201, 2, [4], 11, 0), (4, 210, 0, [], 11, 1)]}


def wait_quest_start_lock(page, database, avatar_id, started, expected_deck):
    deadline = monotonic() + 4
    while (quest_inventory(database, avatar_id), quest_deck(database, avatar_id)) != ([started], expected_deck):
        assert monotonic() < deadline, "Original Ruby did not commit quest progress and deck lock"
        page.wait_for_timeout(30)


def observe_quest_opening_audio(page):
    page.evaluate("""() => {
      const trace = window.qaQuestWire.sockets.at(-1);
      const play = HTMLMediaElement.prototype.play;
      trace.openingEffects = [];
      HTMLMediaElement.prototype.play = function () {
        const file = this.src.split('/').at(-1);
        if (!/^ulse(?:05_[ab]|06|07|08|09|10_f|12|23|28|29)\\.mp3$/.test(file)) return play.call(this);
        const view = document.getElementById('quest-map-battle');
        const phase = view?.dataset.exchangePhase || view?.dataset.phase;
        return play.call(this).then(() => { trace.openingEffects.push([file, phase]); });
      };
    }""")


def action_card_definitions():
    source = Path(__file__).resolve().parents[2] / "app/server/data/csv/tcn/ActionCards.csv"
    with source.open(encoding="utf-8-sig", newline="") as csv_file:
        return {int(row["id"]): row for row in DictReader(csv_file)}


def check_dealt_cards(hand, expected_hand):
    definitions = action_card_definitions()
    expect(hand).to_have_count(len(expected_hand))
    assert hand.evaluate_all("""cards => cards.map(({dataset}) =>
      [Number(dataset.cardId), dataset.up === 'true', dataset.kind])""") == expected_hand
    # Read layout order independently of the original transfer tween from table to hand.
    assert hand.evaluate_all("""cards => cards.every((card, index) => index === 0
      || card.offsetLeft > cards[index - 1].offsetLeft)""")
    for index, (card_id, up, kind) in enumerate(expected_hand):
        definition = definitions[card_id]
        name = "事件牌" if kind == "event" else "行動牌"
        facing = "正向" if up else "反向"
        face = "u" if up else "b"
        card = hand.nth(index)
        expect(card).to_have_accessible_name(f"{name} {card_id}，{facing}")
        expect(card).to_have_attribute("data-face-type", str(int(definition[f"{face}_type"])))
        expect(card).to_have_attribute("data-face-value", str(int(definition[f"{face}_value"])))
    expect(hand.locator('canvas[role="img"][width="56"][height="86"]')).to_have_count(
        len(expected_hand), timeout=TIMEOUT)


def check_opponent_backs(page, initial_count, *, since=0):
    page.wait_for_function("""({initial, since}) => {
      const hand = document.querySelector('#quest-battle-opponent-hand');
      const table = document.querySelector('#quest-battle-opponent-table');
      const replies = window.qaQuestWire.sockets.at(-1).replies.slice(since);
      const moved = replies.filter(([code, width, player, index, id]) =>
        [61, 62].includes(code) && width === 8 && player === 0 && index >= 0 && id === 0)
        .reduce((count, [code]) => count + (code === 61 ? 1 : -1), 0);
      if (!hand || !table || moved < 0 || moved > initial) return false;
      return [[hand, initial - moved], [table, moved]].every(([node, expected]) =>
        node.dataset.count === String(expected) && node.querySelectorAll('canvas').length === expected
        && !node.querySelector('[data-card-id]'));
    }""", arg={"initial": initial_count, "since": since}, timeout=TIMEOUT)


def check_quest_opening(page, stage, directory, *, drop_reply, starting_hp=7):
    battle = page.locator("#quest-map-battle")
    hand = battle.locator(".quest-battle-hand-card")
    opponent_hand = page.locator("#quest-battle-opponent-hand")
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    trace = page.evaluate("window.qaQuestWire.sockets.at(-1)")
    ready = [reply for reply in trace["replies"] if 43 <= reply[0] <= 46]
    assert [reply[0] for reply in ready] == [43, 44, 45] and ready[0] == [43, 3, 1], ready
    assert [packet for packet in trace["sent"] if packet[0] == 22] == [[22, 5]]
    assert trace["readySends"] == [["settled", "complete"]], trace["readySends"]
    expect(hand).to_have_count(0)
    assert opponent_hand.locator("canvas").count() == 0
    expect(battle).to_have_attribute("data-phase", "draw")
    expect(battle).to_have_attribute("data-turn", "1")
    expect(page.locator("#quest-battle-move-time")).to_have_count(0)
    assert all(file != "ulse06.mp3" for file, _ in trace["openingEffects"])
    capture(stage, directory, "17a-ready-awaiting-move-reply.png")

    if drop_reply:
        expect(battle).to_have_attribute("data-phase", "uncertain", timeout=TIMEOUT)
        assert page.evaluate("window.qaQuestWire.endActionHold(true)") > 0
        expect(battle).to_have_attribute("data-phase", "uncertain")
        expect(hand).to_have_count(0)
        assert opponent_hand.locator("canvas").count() == 0
        expect(page.locator("#quest-battle-move-time")).to_have_count(0)
        capture(stage, directory, "17b-ready-uncertain.png")
        return

    assert page.evaluate("window.qaQuestWire.endActionHold(true)") > 0
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-turn", "1")
    expect(battle).to_have_attribute("data-distance", "2")
    expected_hand = [
        [card_id, bool((mask >> index) & 1), kind]
        for kind, (_, _, ids, mask, _) in zip(("action", "event"), ready[1:])
        for index, card_id in enumerate(ids)
    ]
    assert expected_hand, ready
    check_dealt_cards(hand, expected_hand)
    check_opponent_backs(page, ready[1][4] + ready[2][4])
    assert opponent_hand.locator("canvas").evaluate_all("""backs => backs.every((card, index) => index === 0
      || card.getBoundingClientRect().x < backs[index - 1].getBoundingClientRect().x)""")
    assert opponent_hand.locator("[data-card-id]").count() == 0
    for side, hp, maximum in (("player", starting_hp, 7), ("opponent", 1, 1)):
        gauge = page.locator(f"#quest-battle-{side}-hp")
        expect(gauge).to_have_attribute("data-hp", str(hp))
        expect(gauge).to_have_attribute("data-max", str(maximum))
        expect(gauge).to_have_text(f"{hp}/{maximum}")
    expect(page.locator("#quest-battle-turn")).to_have_text("1")
    timer = page.locator("#quest-battle-move-time")
    expect(timer).to_have_attribute("data-duration-ms", "60000")
    timer_gauges = battle.locator("#quest-battle-move-time ~ .quest-battle-time-gauge")
    gauge_geometry = timer_gauges.evaluate_all("""gauges => gauges.map(gauge => {
      const style = getComputedStyle(gauge);
      return [style.left, style.top, style.width, style.transformOrigin];
    })""")
    assert gauge_geometry == [
        ["2px", "338px", "353px", "353px 1px"], ["405px", "338px", "353px", "0px 1px"],
    ], gauge_geometry
    start = int(timer.evaluate("timer => timer.value"))
    assert 0 < start <= 60
    page.wait_for_function("""initial => +document.getElementById('quest-battle-move-time').value < initial""",
                           arg=start, timeout=TIMEOUT)
    buttons = page.locator("#quest-battle-move-controls button[data-move-command]")
    assert buttons.evaluate_all("""buttons => buttons.map(button =>
      [button.dataset.moveCommand, button.getAttribute('aria-disabled')])""") == [
        [command, str(command == "change").lower()] for command in ("back", "stay", "change", "forward", "done")
    ]
    expect(page.locator("#quest-battle-move-controls button[data-move-command]:visible")).to_have_count(5)
    page.wait_for_function("""expected => {
      const effects = window.qaQuestWire.sockets.at(-1).openingEffects;
      return effects.some(([file, phase]) => file === 'ulse12.mp3' && phase === 'move')
        && effects.filter(([file]) => file === 'ulse06.mp3').length === expected;
    }""", arg=len(ready[1][2]) + ready[1][4], timeout=TIMEOUT)
    effects = page.evaluate("window.qaQuestWire.sockets.at(-1).openingEffects")
    assert [phase for file, phase in effects if file == "ulse12.mp3"] == ["draw", "move"], effects
    portrait = battle.locator(".quest-battle-avatar-layer .quest-battle-avatar")
    expect(portrait).to_be_visible()
    assert portrait.evaluate("""canvas => {
      const battle = canvas.closest('#quest-map-battle');
      const base = battle.querySelector('.quest-battle-base');
      const style = getComputedStyle(canvas);
      if (style.left !== '590px' || style.top !== '473px'
          || Number(getComputedStyle(canvas.parentNode).zIndex) <= Number(getComputedStyle(base).zIndex)) return false;
      const {data} = canvas.getContext('2d').getImageData(0, 0, 760 - 590, 680 - 473);
      return data.some((channel, index) => index % 4 === 3 && channel === 255);
    }""")
    music(page, "quest-duel", "bgm000.mp3")
    wait_quest_art(page)
    capture(stage, directory, "17c-first-move.png")
    return expected_hand


def hold_movement_reply(page, command, activate, *, through=None, before=None):
    page.evaluate("""({command, through, before}) => window.qaQuestWire.holdAction(command, {through, before})""",
                  {"command": command, "through": through, "before": before})
    activate()
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)


def release_movement_reply(page, *, next_command=None):
    assert page.evaluate("next => window.qaQuestWire.endActionHold(true, next)", next_command) > 0


def read_movement_trace(page):
    return page.evaluate("window.qaQuestWire.sockets.at(-1)")


def check_movement_effects(page, *, rotations, transfers):
    page.wait_for_function("""({rotations, transfers}) => {
      const effects = window.qaQuestWire.sockets.at(-1).openingEffects;
      return effects.filter(([file]) => file === 'ulse08.mp3').length >= rotations
        && effects.filter(([file, phase]) => file === 'ulse06.mp3' && phase !== 'draw').length >= transfers;
    }""", arg={"rotations": rotations, "transfers": transfers}, timeout=TIMEOUT)
    effects = read_movement_trace(page)["openingEffects"]
    assert sum(file == "ulse08.mp3" for file, _ in effects) == rotations, effects
    assert sum(file == "ulse06.mp3" and phase != "draw" for file, phase in effects) == transfers, effects


def check_quest_movement(page, stage, directory, initial_hand, *, drop_reply):
    battle = page.locator("#quest-map-battle")
    hand_region = battle.locator("#quest-battle-player-hand")
    hand = hand_region.locator(".quest-battle-hand-card")
    table = battle.locator("#quest-battle-player-table")
    result = battle.locator("#quest-battle-move-result")
    forward = battle.locator('button[data-move-command="forward"]')
    commit = battle.locator('button[data-move-command="done"]')
    definitions = action_card_definitions()
    candidates = [(index, row) for index, row in enumerate(initial_hand) if row[2] == "action"]
    assert candidates
    movement_cards = [candidate for candidate in candidates
                      if definitions[candidate[1][0]]["u_type" if candidate[1][1] else "b_type"] == "4"]
    different_faces = [candidate for candidate in candidates
                       if definitions[candidate[1][0]]["u_type"] != definitions[candidate[1][0]]["b_type"]]
    index, (card_id, initial_face, kind) = (movement_cards or different_faces or candidates)[0]
    hand_card = hand_region.locator(f'.quest-battle-hand-card[data-card-id="{card_id}"]')
    placed_card = table.locator(f'[data-card-id="{card_id}"]')
    rotate = hand_card.locator(".quest-battle-card-rotate")
    add = hand_card.locator(".quest-battle-card-primary")
    body_hit = {"x": 27, "y": 18}
    flipped = not initial_face
    movement = []
    page.evaluate("window.qaMovementMusic = document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")

    direction_before = battle.get_attribute("data-direction")
    hold_movement_reply(page, 23, forward.click)
    movement.append([23, -1])
    assert battle.get_attribute("data-direction") == direction_before
    expect(forward).to_be_visible()
    expect(commit).to_be_disabled()
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-direction", "-1")
    expect(forward).to_be_hidden()
    expect(battle.locator("#quest-battle-move-controls button[data-move-command]:visible")).to_have_count(4)
    assert [60, 4, 1, -1] in read_movement_trace(page)["replies"]

    expect(rotate).to_be_enabled()
    hold_movement_reply(page, 32, lambda: rotate.press("Enter"))
    movement.append([32, card_id, 0, index, int(flipped)])
    expect(hand_card).to_have_attribute("data-up", str(initial_face).lower())
    release_movement_reply(page)
    expect(hand_card).to_have_attribute("data-up", str(flipped).lower())
    assert [63, 10, 1, 0, index, card_id, int(flipped)] in read_movement_trace(page)["replies"]
    rotated_hand = initial_hand.copy()
    rotated_hand[index] = [card_id, flipped, kind]
    check_dealt_cards(hand, rotated_hand)
    capture(stage, directory, "18a-direction-and-rotation.png")

    add_bounds = add.bounding_box()
    hold_movement_reply(page, 24, lambda: add.click(position=body_hit))
    movement.append([24, card_id, index, int(flipped)])
    expect(hand_card).to_be_visible()
    expect(placed_card).to_have_count(0)
    expect(commit).to_be_disabled()
    page.mouse.click(add_bounds["x"] + body_hit["x"], add_bounds["y"] + body_hit["y"])
    assert read_movement_trace(page)["movement"] == movement
    if drop_reply:
        expect(battle).to_have_attribute("data-phase", "uncertain", timeout=TIMEOUT)
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-phase", "uncertain")
        expect(hand_card).to_be_visible()
        expect(placed_card).to_have_count(0)
        expect(commit).to_be_disabled()
        page.mouse.click(add_bounds["x"] + body_hit["x"], add_bounds["y"] + body_hit["y"])
        assert read_movement_trace(page)["movement"] == movement
        assert [61, 8, 1, index, card_id] in read_movement_trace(page)["replies"]
        check_movement_effects(page, rotations=1, transfers=0)
        capture(stage, directory, "18b-movement-reply-uncertain.png")
        return movement

    release_movement_reply(page)
    expect(placed_card).to_be_visible()
    expect(hand_card).to_have_count(0)
    expect(placed_card).to_have_attribute("data-up", str(flipped).lower())
    assert [61, 8, 1, index, card_id] in read_movement_trace(page)["replies"]
    capture(stage, directory, "18b-owned-card-on-table.png")

    table_rotate = placed_card.locator(".quest-battle-card-rotate")
    expect(table_rotate).to_be_enabled()
    table_rotate.press("Enter")
    movement.append([32, card_id, 1, 0, int(initial_face)])
    expect(placed_card).to_have_attribute("data-up", str(initial_face).lower())
    assert [63, 10, 1, 1, 0, card_id, int(initial_face)] in read_movement_trace(page)["replies"]

    retract = placed_card.locator(".quest-battle-card-primary")
    hold_movement_reply(page, 25, lambda: retract.click(position=body_hit))
    movement.append([25, card_id, 0])
    expect(placed_card).to_be_visible()
    expect(hand_card).to_have_count(0)
    release_movement_reply(page)
    expect(hand_card).to_be_visible()
    expect(placed_card).to_have_count(0)
    assert [62, 8, 1, 0, card_id] in read_movement_trace(page)["replies"]
    returned_hand = [row for row in initial_hand if row[0] != card_id] + [[card_id, initial_face, kind]]
    check_dealt_cards(hand, returned_hand)
    scroll_offsets = page.evaluate("""() => ['#stage', '#quest-map-view', '#quest-map-battle'].map(selector => {
      const view = document.querySelector(selector);
      return [view.scrollLeft, view.scrollTop];
    })""")
    assert scroll_offsets == [[0, 0], [0, 0], [0, 0]], scroll_offsets
    capture(stage, directory, "18c-owned-card-returned.png")

    add.click(position=body_hit)
    movement.append([24, card_id, len(initial_hand) - 1, int(initial_face)])
    expect(placed_card).to_be_visible()
    capture(stage, directory, "18d-move-ready-to-submit.png")
    hold_movement_reply(page, 26, commit.click, through=47)
    movement.append([26, "", ""])
    expect(result).to_be_hidden()
    expect(commit).to_be_disabled()
    prior = read_movement_trace(page)["replies"]
    assert [reply for reply in prior if reply[0] in (47, 48)] == [[47, 2]]
    release_movement_reply(page)
    expect(result).to_have_count(1, timeout=TIMEOUT)
    trace = read_movement_trace(page)
    resolution = [reply for reply in trace["replies"] if reply[0] in (47, 48)]
    assert [reply[0] for reply in resolution] == [47, 48], resolution
    _, _, initiative, distance, own_cards, foe_cards, own_power, foe_power, own_locked, foe_locked = resolution[1]
    assert own_cards == [[card_id, initial_face]], resolution
    outcome = {"distance": distance, "player-initiative": bool(initiative), "player-power": own_power,
               "opponent-power": foe_power, "player-locked": bool(own_locked), "opponent-locked": bool(foe_locked)}
    for key, value in outcome.items():
        expect(result).to_have_attribute(f"data-{key}", str(value).lower())
    expect(result).to_have_text(("近距離", "中距離", "遠距離", "距離不明")[distance - 1]
                               + ("，我方先攻" if initiative else "，對手先攻"))
    for rows, known, locked, top in ((table, own_cards, own_locked, 346),
                                     (battle.locator("#quest-battle-opponent-table"), foe_cards, foe_locked, 84)):
        revealed = rows.locator(".quest-battle-reveal-card")
        expect(revealed).to_have_count(len(known))
        if not locked:
            assert revealed.evaluate_all("""cards => cards.map(({dataset}) =>
                 [Number(dataset.cardId), dataset.up === 'true'])""") == known
        expect(revealed.locator("canvas")).to_have_count(len(known))
        geometry = revealed.evaluate_all("""async cards => {
          await Promise.allSettled(cards.flatMap(card =>
            card.querySelector('canvas').getAnimations().map(animation => animation.finished)));
          return cards.map(card => {
            const stage = card.closest('#quest-map-battle').getBoundingClientRect();
            return [card, card.querySelector('canvas')].map(node => {
              const box = node.getBoundingClientRect();
              return [box.width, box.height, box.top - stage.top];
            });
          });
        }""")
        assert geometry == [[[56, 86, top], [56, 86, top]]] * len(known), geometry
    expect(battle.locator("#quest-battle-move-time")).to_have_count(0)
    assert all(not node.is_enabled() for node in battle.locator("button[data-move-command]").all())
    check_movement_effects(page, rotations=2, transfers=3)
    if directory is not None:
        stage.screenshot(path=directory / "18e-confirmed-movement-result.png", scale="css")
    expect(battle).to_have_attribute("data-move-result", "settled", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-distance", str(distance))
    expect(battle).to_have_attribute("data-initiative", "player" if initiative else "opponent")
    effects = read_movement_trace(page)["openingEffects"]
    assert [file for file, _ in effects if file in {"ulse28.mp3", "ulse29.mp3"}] == [
        "ulse28.mp3" if foe_locked else "ulse29.mp3"
    ] * len(foe_cards), effects
    music(page, "quest-duel", "bgm000.mp3")
    assert page.evaluate("window.qaMovementMusic === document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")
    capture(stage, directory, "18f-movement-settled.png")
    return movement


def combat_health(battle):
    readings = {}
    for side in ("player", "opponent"):
        value = battle.locator(f"#quest-battle-{side}-hp")
        readings[side] = int(value.get_attribute("data-hp"))
    return readings


def check_combat_hp(battle, before, replies):
    expected = dict(before)
    for command, _, player, *values in replies:
        side = "player" if player else "opponent"
        if command == 73:
            expected[side] -= values[0]
        elif command == 74 and values[0] == 0:
            expected[side] -= values[1]
        elif command == 77:
            expected[side] += values[0]
        elif command == 79:
            expected[side] = values[0]
    for side, hp in expected.items():
        expect(battle.locator(f"#quest-battle-{side}-hp")).to_have_attribute("data-hp", str(max(0, hp)))


def observe_combat_dice(page):
    page.evaluate("""() => {
      const trace = window.qaQuestWire.sockets.at(-1);
      trace.diceDraws = [];
      const contexts = new WeakSet();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        const gl = getContext.call(this, kind, ...args);
        if (kind !== 'webgl2' || this.id !== 'quest-battle-dice-roll' || !gl || contexts.has(gl)) return gl;
        contexts.add(gl);
        const materials = new WeakMap();
        const observed = new Set();
        let bound;
        let region;
        function observe(name, record) {
          const method = gl[name].bind(gl);
          gl[name] = (...args) => {
            const result = method(...args);
            record(args);
            return result;
          };
        }
        observe('bindTexture', ([target, texture]) => { if (target === gl.TEXTURE_2D) bound = texture; });
        observe('texImage2D', args => {
          const image = args.at(-1);
          if (bound && image instanceof HTMLImageElement) materials.set(bound, image.src.split('/').at(-1));
        });
        observe('scissor', args => { region = args; });
        observe('drawElements', () => {
          const file = materials.get(bound);
          if (!region || !file) return;
          const key = region.join(',') + file;
          if (observed.has(key)) return;
          observed.add(key);
          trace.diceDraws.push([...region, file]);
        });
        return gl;
      };
    }""")


def check_quest_combat(page, stage, directory, initial_hand, *, drop_reply):
    battle = page.locator("#quest-map-battle")
    hand = battle.locator("#quest-battle-player-hand")
    table = battle.locator("#quest-battle-player-table")
    done = battle.locator('button[data-combat-command="done"]')
    result = battle.locator('#quest-battle-exchange-result[data-exchange-index="1"], '
                            '#quest-battle-exchange-history-1-1')
    if not drop_reply:
        observe_combat_dice(page)
    page.wait_for_function("""() => window.qaQuestWire.sockets.at(-1).replies
      .some(([command]) => command === 51)""", timeout=TIMEOUT)
    trace = read_movement_trace(page)
    first_attack = next(reply for reply in trace["replies"] if reply[0] == 51)
    assert first_attack in ([51, 3, 0], [51, 3, 1]), first_attack
    player_attacks = bool(first_attack[2])
    expect(battle).to_have_attribute("data-player-attacks", str(player_attacks).lower(), timeout=TIMEOUT)
    assert not trace["combat"]
    live_card = hand.locator(".quest-battle-hand-card").first.locator(".quest-battle-card-primary")
    current_phase = battle.get_attribute("data-exchange-phase")
    if not player_attacks and current_phase == "awaiting-defense":
        expect(battle).to_have_attribute("data-combat-role", "waiting")
        expect(live_card).to_be_disabled()
        expect(done).to_be_hidden()
        target = live_card.bounding_box()
        page.mouse.click(target["x"] + 27, target["y"] + 18)
        assert not read_movement_trace(page)["combat"]
        capture(stage, directory, "19a-waiting-for-opponent-attack.png")
    role = "attack" if player_attacks else "defense"
    expect(battle).to_have_attribute("data-exchange-phase", role, timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-combat-role", role)
    expect(done).to_be_enabled()
    expect(battle.locator("button[data-move-command]:visible")).to_have_count(0)
    timer = battle.locator("#quest-battle-combat-time")
    expect(timer).to_have_attribute("data-duration-ms", "60000")
    moved = next(reply for reply in trace["replies"] if reply[0] == 48)
    distance = moved[3]
    played = {card for card, _ in moved[4]}
    remaining = [row for row in initial_hand if row[0] not in played]
    check_dealt_cards(hand.locator(".quest-battle-hand-card"), remaining)
    if not player_attacks:
        assert [53, 3, 1] in read_movement_trace(page)["replies"]
    definitions = action_card_definitions()
    candidates = [(index, row) for index, row in enumerate(remaining) if row[2] == "action"]
    assert candidates
    expected_type = "1" if player_attacks and distance == 1 else "2" if player_attacks else "3"
    matching = [(index, row) for index, row in candidates
                if definitions[row[0]]["u_type" if row[1] else "b_type"] == expected_type]
    index, (card_id, up, _) = ([(i, row) for i, row in matching if i > 0] or matching or candidates)[0]
    hand_card = hand.locator(f'.quest-battle-hand-card[data-card-id="{card_id}"]')
    placed_card = table.locator(f'[data-card-id="{card_id}"][data-zone="combat"]')
    add = hand_card.locator(".quest-battle-card-primary")
    body_hit = {"x": 27, "y": 18}
    add_opcode, remove_opcode, done_opcode = (28, 29, 33) if player_attacks else (30, 31, 34)
    # Flash passes the checked physical index for attacking, and a default zero for defense.
    actions = [[add_opcode, card_id, index if player_attacks else 0, int(up)]]
    effects_before = read_movement_trace(page)["openingEffects"]
    capture(stage, directory, "19b-local-combat-phase.png")

    add_bounds = add.bounding_box()
    hold_movement_reply(page, add_opcode, lambda: add.click(position=body_hit))
    expect(hand_card).to_be_visible()
    expect(placed_card).to_have_count(0)
    expect(done).to_be_disabled()
    duplicate_hit = (add_bounds["x"] + body_hit["x"], add_bounds["y"] + body_hit["y"])
    page.mouse.click(*duplicate_hit)
    assert read_movement_trace(page)["combat"] == actions
    if drop_reply:
        expect(battle).to_have_attribute("data-exchange-phase", "uncertain", timeout=TIMEOUT)
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-exchange-phase", "uncertain")
        expect(hand_card).to_be_visible()
        expect(placed_card).to_have_count(0)
        page.mouse.click(*duplicate_hit)
        trace = read_movement_trace(page)
        assert trace["combat"] == actions and [65, 8, 1, 0, card_id] in trace["replies"], trace
        assert sum(file == "ulse06.mp3" for file, _ in trace["openingEffects"]) == sum(
            file == "ulse06.mp3" for file, _ in effects_before
        )
        expect(result).to_have_count(0)
        capture(stage, directory, "19c-combat-reply-uncertain.png")
        return actions

    release_movement_reply(page)
    expect(placed_card).to_be_visible()
    expect(hand_card).to_have_count(0)
    expect(placed_card).to_have_attribute("data-up", str(up).lower())
    assert [65, 8, 1, 0, card_id] in read_movement_trace(page)["replies"]
    capture(stage, directory, "19c-combat-card-placed.png")

    retract = placed_card.locator(".quest-battle-card-primary")
    hold_movement_reply(page, remove_opcode, lambda: retract.click(position=body_hit))
    actions.append([remove_opcode, card_id, 0])
    expect(placed_card).to_be_visible()
    expect(hand_card).to_have_count(0)
    release_movement_reply(page)
    expect(hand_card).to_be_visible()
    expect(placed_card).to_have_count(0)
    assert [66, 8, 1, 0, card_id] in read_movement_trace(page)["replies"]
    assert hand.locator(".quest-battle-hand-card").last.get_attribute("data-card-id") == str(card_id)

    add.click(position=body_hit)
    actions.append([add_opcode, card_id, len(remaining) - 1 if player_attacks else 0, int(up)])
    expect(placed_card).to_be_visible()
    done_box = done.bounding_box()
    hold_movement_reply(page, done_opcode, done.click, through=55)
    actions.append([done_opcode, "", ""])
    trace = read_movement_trace(page)
    first_reveal = next(i for i, payload in enumerate(trace["replies"]) if payload[0] == 55)
    revealed = trace["replies"][first_reveal]
    assert revealed[2] == [[card_id, up]], revealed
    phase_receipts = [payload for payload in trace["replies"][:first_reveal + 1] if 51 <= payload[0] <= 55]
    assert [payload[0] for payload in phase_receipts] == [51, 52, 53, 54, 55], phase_receipts
    assert phase_receipts[2] == [53, 3, int(not player_attacks)]
    assert not any(payload[0] == 56 for payload in trace["replies"][first_reveal + 1:])
    expect(done).to_be_disabled()
    expect(timer).to_have_count(0)
    expect(battle.locator("#quest-battle-attack-dice [data-value], #quest-battle-defense-dice [data-value]")).to_have_count(0)
    hp_before = combat_health(battle)
    page.mouse.click(done_box["x"] + done_box["width"] / 2, done_box["y"] + done_box["height"] / 2)
    assert read_movement_trace(page)["combat"] == actions
    assert combat_health(battle) == hp_before
    capture(stage, directory, "19d-reveal-before-dice.png")

    assert page.evaluate("""index => {
      const wire = window.qaQuestWire;
      return wire.endActionHold(true) > 0 && wire.sockets.at(-1).replies.slice(index + 1)
        .some(([command]) => command === 56);
    }""", first_reveal), "Actual SC56 did not arrive inside the held result tail"
    expect(result).to_have_count(1, timeout=TIMEOUT)
    expect(result).to_have_attribute("data-player-attacks", str(player_attacks).lower())
    trace = read_movement_trace(page)
    after_reveal = trace["replies"][first_reveal + 1:]
    dice_index = next(i for i, payload in enumerate(after_reveal) if payload[0] == 56)
    die = after_reveal[dice_index]
    assert bool(die[2]) is player_attacks, die
    if die[3] and die[4]:
        roll = battle.locator('#quest-battle-dice-roll[data-state="settled"]')
        expect(roll).to_have_attribute("width", "780", timeout=TIMEOUT)
        expect(roll).to_have_attribute("height", "680")
        assert roll.evaluate("""canvas => {
          const gl = canvas.getContext('webgl2');
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return pixels.some((channel, index) => index % 4 === 3 && channel !== 0);
        }""")
        # Original camera regions stay on their owning side, but the materials follow attack/defense.
        phases = ("attack", "defense") if player_attacks else ("defense", "attack")
        actual_draws = sorted(read_movement_trace(page)["diceDraws"])
        assert actual_draws == [
            [0, 0, 450, 660, f"dice-roll-{phases[0]}.png"], [120, 20, 660, 660, f"dice-roll-{phases[1]}.png"]
        ], actual_draws
        if directory is not None:
            stage.screenshot(path=directory / "19e-original-dice-roll.png", scale="css")
    page.wait_for_function("""index => {
      const replies = window.qaQuestWire.sockets.at(-1).replies.slice(index + 1);
      const dice = replies.findIndex(([command]) => command === 56);
      return dice >= 0 && replies.slice(dice + 1).some(([command]) => [41, 43, 49, 51, 57, 59].includes(command));
    }""", arg=first_reveal, timeout=TIMEOUT)
    trace = read_movement_trace(page)
    after_reveal = trace["replies"][first_reveal + 1:]
    boundary_index = next(i for i in range(dice_index + 1, len(after_reveal))
                          if after_reveal[i][0] in (41, 43, 49, 51, 57, 59))
    boundary_command = after_reveal[boundary_index][0]
    state, boundary = ("terminal", "terminal") if boundary_command == 41 else (
        "complete", "character-change" if boundary_command in (49, 57) else "next-attack")
    expect(result).to_have_attribute("data-state", state, timeout=TIMEOUT)
    expect(result).to_have_attribute("data-boundary", boundary)
    for side, values in (("attack", die[3]), ("defense", die[4])):
        spots = result.locator(f"#quest-battle-{side}-dice [data-value], #quest-battle-{side}-dice-1-1 [data-value]")
        expect(spots).to_have_count(len(values), timeout=TIMEOUT)
        eyes = (2, 3, 4, 5, 6, 1)
        assert spots.evaluate_all("dice => dice.map(die => [+die.dataset.value, +die.dataset.eye])") == [
            [value, eyes[value]] for value in values
        ]
    first_index = trace["replies"].index(first_attack)
    health = [payload for payload in trace["replies"][first_index:first_reveal + 1 + boundary_index]
              if payload[0] in (73, 74, 79)]
    check_combat_hp(battle, {"player": 7, "opponent": 1}, health)
    damage_rows = result.locator("#quest-battle-damage-events li[data-damage], "
                                 "#quest-battle-damage-events-1-1 li[data-damage]")
    assert damage_rows.evaluate_all("""rows => rows.map(({dataset}) => [
      dataset.player === 'true', Number(dataset.damage), dataset.nonHostile === 'true'
    ])""") == [[bool(payload[2]), payload[3], bool(payload[4])] for payload in health if payload[0] == 73]
    effects = read_movement_trace(page)["openingEffects"]
    assert sum(file == "ulse06.mp3" for file, _ in effects) - sum(
        file == "ulse06.mp3" for file, _ in effects_before
    ) == 3, effects
    assert sum(file == "ulse07.mp3" for file, _ in effects) == (len(die[3]) + len(die[4]) if die[3] and die[4] else 0), effects
    assert [phase for file, phase in effects if file == "ulse12.mp3" and phase not in {"draw", "move"}][:1] == [role], effects
    if any(payload[0] == 73 and payload[3] > 0 and not payload[4] for payload in health):
        assert any(file == ("ulse09.mp3" if distance == 1 else "ulse10_f.mp3") for file, _ in effects), effects
    assert read_movement_trace(page)["combat"] == actions
    assert page.evaluate("window.qaMovementMusic === document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")
    capture(stage, directory, "19f-authoritative-first-exchange.png")
    return actions


def check_exchange_receipt(receipt, index, dice, health):
    expect(receipt).to_have_attribute("data-turn", "1", timeout=TIMEOUT)
    expect(receipt).to_have_attribute("data-exchange-index", str(index))
    expect(receipt).to_have_attribute("data-player-attacks", str(bool(dice[2])).lower())
    expect(receipt).to_have_attribute("data-state", "complete", timeout=TIMEOUT)
    expect(receipt).to_have_attribute("data-boundary", "next-attack" if index == 1 else "next-turn")
    for side, values in (("attack", dice[3]), ("defense", dice[4])):
        spots = receipt.locator(f"[id^='quest-battle-{side}-dice'] [data-value]")
        expect(spots).to_have_count(len(values))
        assert spots.evaluate_all("spots => spots.map(spot => +spot.dataset.value)") == values
    damage = receipt.locator("li[data-damage]")
    assert damage.evaluate_all("rows => rows.map(({dataset}) => [+dataset.damage, dataset.player === 'true'])") == [
        [payload[3], bool(payload[2])] for payload in health if payload[0] == 73
    ]


def check_reverse_combat_points(page):
    replies = read_movement_trace(page)["replies"]
    _, reverse = [index for index, payload in enumerate(replies) if payload[0] == 51]
    opening = replies[reverse - 2:reverse]
    assert [(payload[0], payload[2]) for payload in opening] == [(82, 0), (82, 1)], opening
    # Further genuine point updates can arrive before the prior visual exchange settles.
    page.wait_for_function("""start => {
      const scores = new Map(window.qaQuestWire.sockets.at(-1).replies.slice(start)
        .filter(([command]) => command === 82)
        .map(([, , player, , , value]) => [player, value]));
      return [['player', 1], ['opponent', 0]].every(([side, player]) => {
        const strip = document.getElementById(`quest-battle-${side}-points`);
        return strip?.dataset.value === String(scores.get(player)) &&
          Array.from(strip.querySelectorAll('img')).some(image => image.complete && image.naturalWidth > 0);
      });
    }""", arg=reverse - 2, timeout=TIMEOUT)


def check_quest_next_turn(page, stage, directory, initial_hand):
    battle = page.locator("#quest-map-battle")
    hand = battle.locator("#quest-battle-player-hand .quest-battle-hand-card")
    done = battle.locator('button[data-combat-command="done"]')
    move_timer = battle.locator("#quest-battle-move-time")
    move_done = battle.locator('button[data-move-command="done"]')
    original = read_movement_trace(page)["replies"]
    initial_refills = [payload for payload in original if payload[0] in (44, 45)]
    move = next(payload for payload in original if payload[0] == 48)
    played = {card for card, _ in move[4]}
    survivors = [row for row in initial_hand if row[0] not in played]
    opponent_count = sum(payload[4] for payload in initial_refills) - len(move[5])
    actions = []
    hp = combat_health(battle)
    source_index = next(index for index, payload in enumerate(original) if payload[0] == 48) + 1
    definitions = action_card_definitions()

    for index, last_command in ((1, 51), (2, 46)):
        player_attacks = bool(move[2]) if index == 1 else not bool(move[2])
        role = "attack" if player_attacks else "defense"
        expect(battle).to_have_attribute("data-turn", "1")
        expect(battle).to_have_attribute("data-exchange-index", str(index), timeout=TIMEOUT)
        expect(battle).to_have_attribute("data-exchange-phase", role, timeout=TIMEOUT)
        expect(done).to_be_enabled()
        check_dealt_cards(hand, survivors)
        if index == 2:
            check_reverse_combat_points(page)
        capture(stage, directory, f"20-{index}-local-{role}.png")

        placed = []
        if not player_attacks:
            # Preserve the authentic stock roll, using only known ordinary defense cards.
            for card_id, up, kind in survivors:
                if kind != "action" or definitions[card_id]["u_type" if up else "b_type"] != "3":
                    continue
                card = hand.and_(battle.locator(f'[data-card-id="{card_id}"]')).locator(".quest-battle-card-primary")
                card.click(position={"x": 27, "y": 18})
                expect(battle.locator(f'#quest-battle-player-table [data-card-id="{card_id}"][data-zone="combat"]')).to_be_visible()
                actions.append([30, card_id, 0, int(up)])
                placed.append([card_id, up])
        survivor_ids = {card for card, _ in placed}
        survivors = [row for row in survivors if row[0] not in survivor_ids]
        done_opcode = 33 if player_attacks else 34
        target = done.bounding_box()
        hold_movement_reply(page, done_opcode, done.click, before=[last_command, 41])
        actions.append([done_opcode, "", ""])
        blocked = page.evaluate("window.qaQuestWire.actionHold.blocked")
        assert blocked == last_command, f"The authentic stock duel ended in exchange {index} before opcode {last_command}"
        moved_on = read_movement_trace(page)["replies"][source_index:]
        phase = [payload for payload in moved_on if 51 <= payload[0] <= 56]
        assert [payload[0] for payload in phase] == [51, 52, 53, 54, 55, 56], phase
        assert phase[0] == [51, 3, int(player_attacks)] and phase[2] == [53, 3, int(not player_attacks)], phase
        assert phase[4][2] == placed and phase[5][2] == int(player_attacks), phase
        if player_attacks:
            assert phase[5][3] == [], phase[5]
        opponent_count -= len(phase[4][3])
        health = [payload for payload in moved_on if payload[0] in (73, 74, 79)]
        expect(done).to_be_disabled()
        expect(move_done).to_be_disabled()
        expect(move_timer).to_have_count(0)
        check_dealt_cards(hand, survivors)
        page.mouse.click(target["x"] + target["width"] / 2, target["y"] + target["height"] / 2)
        assert read_movement_trace(page)["combat"] == actions
        if index == 1:
            expect(battle).to_have_attribute("data-exchange-index", "1")
            assert not any(payload[0] == 43 for payload in moved_on), moved_on
            capture(stage, directory, "21-first-result-before-role-reply.png")
        else:
            expect(battle).to_have_attribute("data-turn", "2", timeout=TIMEOUT)
            expect(battle).to_have_attribute("data-phase", "draw")
            expect(battle).to_have_attribute("data-draw-state", "awaiting-cards")
            expect(battle).to_have_attribute("data-ready-turn", "1")
            expect(battle.locator("#quest-battle-turn")).to_have_text("2")
            expect(hand.locator('.quest-battle-card-primary[aria-disabled="true"]')).to_have_count(len(survivors))
            expect(battle.locator("#quest-battle-exchange-history-1-1")).to_have_count(1)
            assert [payload[0] for payload in moved_on if 43 <= payload[0] <= 46] == [43, 44, 45], moved_on
            capture(stage, directory, "22-next-draw-before-move-reply.png")

        source_index += len(moved_on)
        release_movement_reply(page)
        history = battle.locator(f"#quest-battle-exchange-history-1-{index}")
        check_exchange_receipt(history, index, phase[5], health)
        check_combat_hp(battle, hp, health)
        hp = combat_health(battle)

    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-turn", "2")
    expect(battle).to_have_attribute("data-ready-turn", "2")
    expect(move_done).to_be_visible()
    expect(move_done).to_be_enabled()
    expect(done).to_be_hidden()
    expect(move_timer).to_have_attribute("data-duration-ms", "60000")
    assert 0 < int(move_timer.evaluate("timer => timer.value")) <= 60
    trace = read_movement_trace(page)
    refills = [payload for payload in trace["replies"] if 43 <= payload[0] <= 46]
    assert [payload[0] for payload in refills] == [43, 44, 45, 46] * 2 and refills[4] == [43, 3, 2], refills
    new_cards = [
        [card, bool((mask >> offset) & 1), kind]
        for kind, (_, _, cards, mask, _) in zip(("action", "event"), refills[5:7])
        for offset, card in enumerate(cards)
    ]
    assert new_cards, refills
    check_dealt_cards(hand, survivors + new_cards)
    check_opponent_backs(page, opponent_count + sum(payload[4] for payload in refills[5:7]), since=source_index)
    assert trace["combat"] == actions and trace["readySends"] == [["settled", "complete"]], trace
    assert page.evaluate("window.qaMovementMusic === document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")
    capture(stage, directory, "23-authoritative-turn-two-move.png")

    # The new Move is actionable on the same peer and still waits for its own direction echo.
    back = battle.locator('button[data-move-command="back"]')
    direction_before = battle.get_attribute("data-direction")
    hold_movement_reply(page, 23, back.click)
    assert battle.get_attribute("data-direction") == direction_before
    expect(move_done).to_be_disabled()
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-direction", "1")
    expect(back).to_be_hidden()
    assert [60, 4, 1, 1] in read_movement_trace(page)["replies"][len(trace["replies"]):]
    capture(stage, directory, "24-authoritative-turn-two-direction.png")
    return actions, [[23, 1]]


def check_terminal_movement(page, stage, directory, turn, *, direction=0):
    battle = page.locator("#quest-map-battle")
    expect(battle).to_have_attribute("data-ready-turn", str(turn), timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    since = len(read_movement_trace(page)["replies"])
    choice = {-1: "forward", 0: "stay", 1: "back"}[direction]
    battle.locator(f'button[data-move-command="{choice}"]').click()
    expect(battle).to_have_attribute("data-direction", str(direction))
    battle.locator('button[data-move-command="done"]').click()
    expect(battle).to_have_attribute("data-move-result", "settled", timeout=TIMEOUT)
    replies = read_movement_trace(page)["replies"][since:]
    (move,) = [packet for packet in replies if packet[0] == 48]
    assert move[4] == [] and [60, 4, 1, direction] in replies, move
    capture(stage, directory, f"25-{turn}-terminal-authentic-move.png")
    return [[23, direction], [26, "", ""]]


def place_terminal_cards(page, battle, attack_type, player_attacks, *, reserve_attack, choices=None):
    hand = battle.locator("#quest-battle-player-hand .quest-battle-hand-card")
    table = battle.locator("#quest-battle-player-table")
    definitions = action_card_definitions()
    actions = []
    placed = []

    def points(card, face, kind):
        fields = definitions[card]
        prefix = "u" if face else "b"
        return int(fields[f"{prefix}_value"]) if int(fields[f"{prefix}_type"]) == kind else 0

    current = hand.evaluate_all("cards => cards.map(({dataset}) => [+dataset.cardId, dataset.up === 'true', dataset.kind])")
    kind = attack_type if player_attacks else 3
    if choices is None:
        candidates = [(card, up) for card, up, kind in current if kind == "action"]
        reserved = None
        if reserve_attack and candidates:
            reserved = max(candidates, key=lambda entry: max(points(entry[0], face, attack_type) for face in (True, False)))[0]
        choices = []
        for card, up in candidates:
            face = max((up, not up), key=lambda choice: points(card, choice, kind))
            if card != reserved and points(card, face, kind):
                choices.append((card, face))
    for card, face in choices:
        assert points(card, face, kind) > 0, (card, face, kind)
        position = next(slot for slot, row in enumerate(current) if row[0] == card)
        current_face = current[position][1]
        card_row = hand.and_(battle.locator(f'[data-card-id="{card}"]'))
        if face != current_face:
            rotate = card_row.locator(".quest-battle-card-rotate")
            expect(rotate).to_be_enabled()
            rotate.press("Enter")
            expect(card_row).to_have_attribute("data-up", str(face).lower())
            actions.append([32, card, 0, position, int(face)])
            assert [63, 10, 1, 0, position, card, int(face)] in read_movement_trace(page)["replies"]
        card_row.locator(".quest-battle-card-primary").click(position={"x": 27, "y": 18})
        expect(table.locator(f'[data-card-id="{card}"][data-zone="combat"]')).to_be_visible()
        actions.append([28 if player_attacks else 30, card, position if player_attacks else 0, int(face)])
        placed.append([card, face])
        current.pop(position)
    return actions, placed


def play_terminal_combat(page, stage, directory, *, completions=(24,), defeat=False, dwarf_slot=None, left_slot=None,
                         reward_rounds=None, reward_defeat=False):
    battle = page.locator("#quest-map-battle")
    done = battle.locator('button[data-combat-command="done"]')
    actions = []
    opening = read_movement_trace(page)["replies"]
    completed_roles = sum(packet[0] == 51 for packet in opening)
    if dwarf_slot is not None:
        # The opt-in dwarf fixture seeds the original stock deal. Guard its exact observed cards and roles.
        deal = [p for p in opening if p[0] in (44, 45)][-2:]
        assert deal == [[44, 24, [41, 26, 9, 27, 56], 31, 5], [45, 14, [259], 1, 1]], deal
    rounds = TWO_CLOSE_COMBAT_ROUNDS[:reward_rounds] if reward_rounds else Q32_LEFT_COMBAT.get(left_slot)
    opening_hp = combat_health(battle) if 10 in (dwarf_slot, left_slot) else None
    turn_limit = len(rounds) if rounds else 2 if reward_defeat else 3
    for turn in range(1, turn_limit + 1):
        retreat = defeat or dwarf_slot in (4, 5) or left_slot in (3, 6)
        forward = reward_rounds or reward_defeat
        actions.extend(check_terminal_movement(page, stage, directory, turn, direction=-1 if forward else int(retreat)))
        move = [packet for packet in read_movement_trace(page)["replies"] if packet[0] == 48][-1]
        if dwarf_slot is not None and turn == 1:
            assert move[2:4] == [False, 1], move
        if rounds:
            cards, event, distance, defence, attack = rounds[turn - 1]
            deal = [p for p in read_movement_trace(page)["replies"] if p[0] in (44, 45)][-2:]
            assert [p[2:] for p in deal] == [[cards, (1 << len(cards)) - 1, 5], [[event], 1, 1]], deal
            assert move[2:4] == [False, distance], move
        if reward_defeat:
            deal = [p[2:] for p in read_movement_trace(page)["replies"] if p[0] in (44, 45)][-2:]
            assert deal == ([[[22, 20, 11, 44, 42], 31, 5], [[62], 1, 1]] if turn == 1 else [[[], 0, 4], [[64], 1, 1]]), deal
            assert move[2:4] == [False, 3], move
        if opening_hp is not None and turn == 1:
            healing = [p for p in read_movement_trace(page)["replies"][len(opening):] if p[0] == 77]
            assert ([77, 4, 1, 1] in healing) == (opening_hp["player"] < 7), healing
            check_combat_hp(battle, opening_hp, healing)
            capture(stage, directory, "25a-authoritative-rest-heal-before-defense.png")
        attack_type = 1 if move[3] == 1 else 2
        for index, following in ((1, 51), (2, 46)):
            count = completed_roles + (turn - 1) * 2 + index
            page.wait_for_function("""count => window.qaQuestWire.sockets.at(-1).replies
              .filter(([command]) => command === 51).length === count""", arg=count, timeout=TIMEOUT)
            phase = [payload for payload in read_movement_trace(page)["replies"] if payload[0] == 51][-1]
            assert phase in ([51, 3, 0], [51, 3, 1]), phase
            player_attacks = bool(phase[2])
            if rounds or reward_defeat or (dwarf_slot is not None and turn == 1):
                assert player_attacks == (index == 2), phase
            role = "attack" if player_attacks else "defense"
            expect(battle).to_have_attribute("data-exchange-index", str(index), timeout=TIMEOUT)
            expect(battle).to_have_attribute("data-exchange-phase", role, timeout=TIMEOUT)
            card_actions, placed = ([], []) if defeat or (dwarf_slot is not None and not player_attacks) else place_terminal_cards(
                page, battle, attack_type, player_attacks, reserve_attack=not player_attacks and index == 1,
                choices=(attack if player_attacks else defence) if rounds else None)
            if dwarf_slot is not None and player_attacks:
                assert placed == [[41, False], [26, True], [56, True]], placed
            actions.extend(card_actions)
            capture(stage, directory, f"26-{turn}-{index}-terminal-{role}.png")
            command = 33 if player_attacks else 34
            hold_movement_reply(page, command, done.click, before=[*completions, following])
            actions.append([command, "", ""])
            trace = read_movement_trace(page)
            last_reveal = [payload for payload in trace["replies"] if payload[0] == 55][-1]
            assert last_reveal[2] == placed, (last_reveal, placed)
            if page.evaluate("window.qaQuestWire.actionHold.blocked") in completions:
                if rounds:
                    assert turn == len(rounds) and index == 2, (left_slot, turn, index)
                if reward_defeat:
                    assert (turn, index) == (2, 1)
                return actions, trace, turn
            release_movement_reply(page)
    outcomes = [packet for packet in trace["replies"] if packet[0] in (51, 56, 73)]
    raise AssertionError(f"Stock Quest did not end during {turn_limit} turns: {outcomes}")


def owned_character_cards(database, avatar_id):
    return set(query(database, """
        SELECT i.id, i.chara_card_id FROM card_inventories i JOIN chara_card_decks d ON d.id = i.chara_card_deck_id
        WHERE d.avatar_id = ?
    """, avatar_id))


def check_terminal_storage(database, player_id, inventory_id, deck, before, cards_before, replies, *,
                           quest_id=1, land_slot=1, previous_progress=0, map_flag=0, bonus=False, card_id=STARTER_CARD):
    (duel,) = [packet for packet in replies if packet[0] == 41]
    assert len(duel) == 11 and duel[1] == 32 and duel[-1] == int(bonus), duel
    result = duel[2]
    assert result in (0, 1, 2)
    win = result == 0
    terminal = replies[replies.index(duel):]
    (deletion,) = [packet for packet in terminal if packet[0] == 22]
    assert deletion == [22, 6, inventory_id]
    progress = previous_progress | (1 << land_slot) if win else previous_progress
    progress_packets = [packet for packet in terminal if packet[0] == 19]
    assert progress_packets == ([[19, 10, inventory_id, progress]] if win else [])
    deck_updates = [packet for packet in terminal if packet[0] == 20]
    assert len(deck_updates) == (2 if win else 1) and deck_updates[-1] == [20, 7, 1, 2, 0, 0, 0]
    assert terminal.index(deck_updates[-1]) < terminal.index(deletion)
    if win:
        assert terminal.index(progress_packets[0]) < terminal.index(deck_updates[0])
    avatar_id = before[0]
    assert query(database, """
        SELECT quest_id, avatar_id, before_avatar_id, status, progress, deck_index, hp0, hp1, hp2
        FROM avatar_quest_inventories WHERE id = ?
    """, inventory_id) == [(quest_id, 0, avatar_id, 3 if win else 5, progress, 1, 0, 0, 0)]
    assert query(database, """
        SELECT quest_inventory_id, finish_point, result, chara_card_id_0, chara_card_id_1, chara_card_id_2
        FROM quest_clear_logs WHERE avatar_id = ?
    """, avatar_id) == [(inventory_id, land_slot, result, card_id, None, None)]
    assert quest_inventory(database, avatar_id) == []
    assert quest_deck(database, avatar_id) == deck
    ((stored_flag, stored_clears),) = query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id)
    assert stored_flag == map_flag
    if stored_clears != int(win):
        # A real weekly achievement can refresh the Ruby Avatar after emitting its new clear count, before saving.
        clear_reply = [28, 6, 1]
        assert quest_id in (4, 32) and win and stored_clears == 0 and clear_reply in terminal, terminal
        gems = [p[2] for p in terminal if p[0] == 10]
        assert len(gems) >= 2 and gems[-1] > gems[-2] and [10, 6, gems[-1]] in terminal[terminal.index(clear_reply):], terminal
    projection = {packet[0]: packet[2] for packet in terminal if packet[0] in (7, 8, 10, 26, 28)}
    actual = avatar(database, player_id)[0]
    assert actual[2:5] == tuple(projection.get(command, before[index]) for index, command in ((2, 8), (3, 10), (4, 7)))
    assert projection.get(26, map_flag) == map_flag and projection.get(28, 0) == int(win)
    awards = [(packet[2], packet[3]) for packet in terminal if packet[0] == 13]
    assert len(awards) == len(set(awards)) and owned_character_cards(database, avatar_id) == cards_before | set(awards)
    return duel, actual


def check_terminal_presentation(page, stage, directory, mode, inventory_id, duel, profile, starting_level, held, *,
                                starting_hp=7, foe_hp=1):
    battle = page.locator("#quest-map-battle")
    result = battle.locator("#quest-battle-result")
    settle_status = battle.locator("#quest-battle-settlement-status")
    duel_ok = result.locator("#quest-battle-result-ok")
    settlement = page.locator("#quest-map-settlement")
    back = page.locator("#quest-map-back")
    won = duel[2] == 0
    assert not any(packet[0] == 24 for packet in held["replies"]), held["replies"]
    expect(battle).to_have_attribute("data-outcome-state", "awaiting-settlement", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-phase", "terminal", timeout=TIMEOUT)
    expect(result).to_be_visible(timeout=TIMEOUT)
    expect(result).to_have_attribute("data-result", str(duel[2]))
    expect(result).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    emblem = result.locator("#quest-battle-result-call")
    expected_emblem = ("win-10.png", "lose-23.png", "draw-18.png")[duel[2]]
    expect(emblem).to_have_attribute("src", re.compile(f"/{re.escape(expected_emblem)}$"))
    expect(emblem).to_be_visible()
    assert emblem.evaluate("image => image.complete && image.naturalWidth > 0")
    expect(battle.locator(".quest-battle-hands")).to_be_hidden()
    awards = result.locator("#quest-battle-result-awards")
    expect(awards.locator('img[src$="reward-plate.png"]')).to_be_visible()
    source_fields = ("gems", "exp", "expBonus", "gemsPow", "expPow", "totalGems", "totalExp")
    for field, value in zip(source_fields, duel[3:10], strict=True):
        expect(awards.locator(f'[data-award="{field}"]')).to_have_attribute("data-value", str(value))
    expect(result.locator("#quest-battle-result-level")).to_be_hidden()
    health = [packet for packet in held["replies"] if packet[0] in (73, 74, 77, 79)]
    check_combat_hp(battle, {"player": starting_hp, "opponent": foe_hp}, health)
    expect(duel_ok).to_be_disabled()
    expect(settlement).to_have_count(0)
    expect(back).to_be_hidden()
    target = duel_ok.bounding_box()
    if target:
        page.mouse.click(target["x"] + target["width"] / 2, target["y"] + target["height"] / 2)
        expect(settlement).to_have_count(0)
    capture(stage, directory, "27-duel-result-awaiting-quest-reply.png")

    if mode == "late":
        expect(battle).to_have_attribute("data-outcome-state", "uncertain", timeout=TIMEOUT)
        expect(settle_status).to_have_text("無法確認任務結算。")
        expect(settle_status).to_be_visible()
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-outcome-state", "uncertain")
        expect(duel_ok).to_be_disabled()
        expect(settlement).to_have_count(0)
        expect(back).to_be_hidden()
        capture(stage, directory, "28-terminal-quest-reply-uncertain.png")
    else:
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-outcome-state", "settled", timeout=TIMEOUT)
        expect(duel_ok).to_be_enabled()
        if profile[2] > starting_level:
            expect(result.locator("#quest-battle-result-level")).to_contain_text(f"等級提升為{starting_level + 1}")
        capture(stage, directory, "28-verified-duel-result.png")
        duel_ok.click()
        expect(settlement).to_be_visible(timeout=TIMEOUT)
        expect(settlement).to_have_attribute("open", "")
        expect(settlement).to_have_attribute("data-inventory-id", str(inventory_id))
        expect(settlement).to_have_attribute("data-result", "clear" if won else "failed")
        expect(result).to_be_hidden()
        capture(stage, directory, "29a-original-quest-clear.png")
        page.locator("#quest-map-settlement-ok").click()
        expect(settlement).to_be_hidden()
        expect(back).to_be_enabled()
        expect(back).to_be_visible()
        expect(back).to_be_focused()
        expect(page.locator("#quest-map-inventory > li")).to_have_count(0)
        expect(page.locator("#quest-map-capacity")).to_have_text("0/4")
        expect(page.locator("#quest-map-progress")).to_have_text("1/3" if won else "0/3")
        expect(page.locator("#quest-map-level")).to_have_text(str(profile[2]))
        expect(page.locator("#quest-map-gems")).to_have_text(str(profile[3]))
        expect(page.locator("#quest-map-exp")).to_have_text(str(profile[4]))
        expect(page.locator('#quest-map-deck[data-deck-index="1"] li[data-card-id="21"][data-position="0"]')).to_be_visible()
        expect(page.locator("#quest-map-deck-next")).to_be_enabled()
        music(page, "quest", "ulbgm03.mp3")
        capture(stage, directory, "29b-original-quest-map-return.png")

    trace = read_movement_trace(page)
    quest_result = 0 if won else 1
    assert [packet for packet in trace["replies"] if packet[0] == 24] == [[24, 7, quest_result, inventory_id]]
    assert [packet for packet in trace["sent"] if packet[0] != 3] == [packet for packet in held["sent"] if packet[0] != 3]


def open_quest_fixture(page, origin, player_id, name, password):
    _, sockets, errors = observe(page)
    live = []
    page.on("websocket", lambda socket: live.append(socket))
    observe_session_codec(page, origin)
    observe_quest_wire(page)
    assert page.goto(origin + ENTRY, wait_until="domcontentloaded").ok
    stage = page.locator("#stage")
    expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
    page.locator("#username").fill(name)
    page.locator("#password").fill(password)
    page.locator("#login-submit").click()
    screen(stage, "lobby")
    close_lobby_news(page, stage, None)
    active_session_traffic(sockets, live, 0, player_id)
    return stage, live, errors


def check_quest_start(page, origin, database, name, password, directory, fault, *, next_turn=False, terminal=None):
    ((player_id, flags),) = player(database, name)
    (profile,) = avatar(database, player_id)
    avatar_id = profile[0]
    original_deck = quest_deck(database, avatar_id)
    original_parts = equipped_parts(database, avatar_id)
    assert flags == 0 and profile[5:7] == (5, 5) and not quest_inventory(database, avatar_id)
    assert len(original_deck) == 1 and original_deck[0][1:] == (STARTER_CARD, 0, 0)
    stage, live, errors = open_quest_fixture(page, origin, player_id, name, password)
    (profile,) = avatar(database, player_id)
    core = live[:4]
    quest = search_first_quest(page, stage, directory, database, avatar_id)
    inventory_id = quest[0]
    row = page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"]')
    row.locator(".quest-map-row-open").click()
    detail = page.locator("#quest-map-detail")
    view = page.locator("#quest-map-view")
    start = detail.locator('[data-quest-command="start"]')
    expect(detail).to_have_attribute("data-quest-status", "1", timeout=TIMEOUT)
    confirmed = quest[:2] + (1,) + quest[3:]
    assert quest_inventory(database, avatar_id) == [confirmed]
    updated = profile[:5] + (4,) + profile[6:]
    face = page.locator('#quest-map-deck-cards .quest-map-card-face[data-card-id="21"]')
    expect(face).to_be_visible(timeout=TIMEOUT)
    expect(face).to_have_accessible_name("古魯瓦爾多 Lv.1 · HP 7 · ATK 5 · DEF 5")
    assert face.evaluate("canvas => canvas.width === 168 && canvas.height === 240 && "
                         "canvas.getContext('2d').getImageData(84, 110, 1, 1).data[3] === 255")
    face_size = face.bounding_box()
    assert (face_size["width"], face_size["height"]) == (84, 120)
    wait_quest_art(page)
    capture(stage, directory, "16a-starter-card.png")

    if fault is None:
        deck = page.locator("#quest-map-deck")
        page.locator("#quest-map-deck-next").press("Enter")
        expect(deck).to_have_attribute("data-deck-index", "2")
        expect(deck.locator("li[data-card-id]")).to_have_count(0)
        start.press("Enter")
        alert = page.locator('#login-alert[data-kind="quest-empty-deck"]')
        expect(alert).to_be_visible()
        expect(page.locator("#login-alert-title")).to_have_text("警告")
        expect(page.locator("#login-alert-message")).to_have_text("卡組是空的")
        capture(stage, directory, "16a-empty-deck-warning.png")
        page.locator("#login-alert-ok").press("Enter")
        expect(alert).to_be_hidden()
        assert page.evaluate("window.qaQuestWire.sockets.at(-1).actions") == []
        assert quest_inventory(database, avatar_id) == [confirmed] and avatar(database, player_id) == [updated]
        assert quest_deck(database, avatar_id) == original_deck
        page.locator("#quest-map-deck-previous").press("Enter")
        expect(deck).to_have_attribute("data-deck-index", "1")
        expect(deck.locator('li[data-card-id="21"][data-position="0"]')).to_be_visible()
        assert query(database, "SELECT current_deck FROM avatars WHERE id = ?", avatar_id) == [(1,)]

    page.evaluate("window.qaQuestWire.holdAction(13)")
    target = start.bounding_box()
    start.click()
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-quest-status", "1")
    active_land = detail.locator('button.quest-map-detail-land[data-slot="1"]')
    expect(active_land).to_have_count(0)
    pawn = page.locator("#quest-map-detail-pawn")
    expect(pawn).to_be_hidden()
    started = quest[:2] + (2,) + quest[3:]
    locked = [original_deck[0][:3] + (1,)]
    wait_quest_start_lock(page, database, avatar_id, started, locked)
    assert avatar(database, player_id) == [updated]
    capture(stage, directory, "16b-start-before-reply.png")
    expected_movement = []
    expected_combat = []
    next_movement = []
    terminal_actions = []
    terminal_turn = None

    if fault == "start":
        expect(view).to_have_attribute("data-start-state", "uncertain", timeout=TIMEOUT)
        assert page.evaluate("window.qaQuestWire.endActionHold(false)") > 0
        expect(detail).to_have_attribute("data-quest-status", "1")
        expect(active_land).to_have_count(0)
        capture(stage, directory, "16c-start-uncertain.png")
    else:
        assert page.evaluate("window.qaQuestWire.endActionHold(true)") > 0
        expect(detail).to_have_attribute("data-quest-status", "2", timeout=TIMEOUT)
        expect(row).to_have_attribute("data-quest-status", "2")
        expect(active_land).to_be_enabled()
        expect(pawn).to_have_attribute("data-slot", "start")
        expect(page.locator("#quest-map-back")).to_be_hidden()
        expect(page.locator("#quest-map-detail-back")).to_be_hidden()
        expect(page.locator("#quest-map-energy")).to_have_text("4/5")
        wait_quest_art(page)
        capture(stage, directory, "16c-start-confirmed.png")
        if fault == "land":
            page.evaluate("window.qaQuestWire.holdAction(16, {forward: 2})")
        else:
            page.emulate_media(reduced_motion="no-preference")
            music(page, "quest", "ulbgm03.mp3")
            observe_scene_music_fade(page, "quest", departure="quest-duel")
            observe_quest_opening_audio(page)
            page.evaluate("window.qaQuestWire.holdAction(22, {through: 45})")
        target = active_land.bounding_box()
        active_land.click()
        battle = page.locator("#quest-map-battle")
        if fault == "land":
            page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
            expect(pawn).to_have_attribute("data-slot", "1")
            expect(view).to_have_attribute("data-adventure-state", "uncertain", timeout=TIMEOUT)
            expect(battle).to_be_hidden()
            assert page.evaluate("window.qaQuestWire.endActionHold(false)") > 0
            capture(stage, directory, "16d-land-uncertain.png")
        else:
            expect(battle).to_have_attribute("data-stage", "11", timeout=TIMEOUT)
            expect(battle).to_have_attribute("data-phase", "opening", timeout=TIMEOUT)
            page.wait_for_function("""() => document.querySelector('#quest-map-battle')?.dataset.burn === 'burning'
              && document.querySelector('.quest-map-board').style.maskImage.startsWith('url(')""", timeout=TIMEOUT)
            if directory is not None:
                stage.screenshot(path=directory / "16d-battle-transition.png", scale="css")
            expect(battle).to_have_attribute("data-burn", "settled", timeout=TIMEOUT)
            music(page, "quest-duel", "bgm000.mp3")
            check_scene_music_fade(page, "quest")
            expect(page.locator(".quest-map-board")).to_be_hidden()
            assert {"quest-battle-stage11-far.jpg", "quest-battle-stage11-near-bottom.png",
                    "quest-battle-stage11-near-foreground.png"} <= set(battle.locator("img").evaluate_all(
                        "images => images.map(image => image.src.split('/').at(-1))"))
            wait_quest_art(page)
            capture(stage, directory, "16e-battle-opening.png")
            expect(battle).to_have_attribute("data-intro", "characters", timeout=TIMEOUT)
            portrait = battle.locator("#quest-battle-intro .quest-battle-avatar")
            expect(portrait).to_have_css("transform-origin", "0px 0px")
            if directory is not None:
                stage.screenshot(path=directory / "16f-character-intro.png", scale="css")
            initial_hand = check_quest_opening(page, stage, directory, drop_reply=fault == "ready")
            if initial_hand is not None:
                if terminal:
                    page.emulate_media(reduced_motion="reduce")
                    cards_before = owned_character_cards(database, avatar_id)
                    terminal_actions, held_trace, terminal_turn = play_terminal_combat(page, stage, directory)
                    duel, after = check_terminal_storage(database, player_id, inventory_id, original_deck, updated,
                                                         cards_before, held_trace["replies"])
                    check_terminal_presentation(page, stage, directory, terminal, inventory_id, duel, after, updated[2], held_trace)
                else:
                    expected_movement = check_quest_movement(page, stage, directory, initial_hand, drop_reply=fault == "move")
                if not terminal and fault in (None, "combat"):
                    assert avatar(database, player_id) == [updated]
                    assert quest_inventory(database, avatar_id) == [started] and quest_deck(database, avatar_id) == locked
                    if next_turn:
                        expected_combat, next_movement = check_quest_next_turn(page, stage, directory, initial_hand)
                    else:
                        expected_combat = check_quest_combat(page, stage, directory, initial_hand, drop_reply=fault == "combat")

    if fault:
        if page.locator("#login-alert").is_visible():
            page.locator("#login-alert-ok").press("Enter")
        page.mouse.click(target["x"] + target["width"] / 2, target["y"] + target["height"] / 2)
        page.wait_for_timeout(150)
    trace = page.evaluate("window.qaQuestWire.sockets.at(-1)")
    assert len(live) == 5 and all(not peer.is_closed() for peer in live) and not trace["overlaps"]
    actions = trace["actions"]
    assert actions == [[13, inventory_id, 1], *([] if fault == "start" else [[16, inventory_id, 1, 1]])]
    encounter_entry = next((i for i, reply in enumerate(trace["replies"]) if reply[0] == 128), len(trace["replies"]))
    states = [reply for reply in trace["replies"][:encounter_entry] if reply[0] in (4, 17)]
    assert states[:2] == [[4, 10, 4], [17, 11, inventory_id, 1, 1]]
    assert states[2:] == ([] if fault == "start" else [[4, 10, 4], [17, 11, inventory_id, 2, 1]])
    encounter = [reply for reply in trace["replies"] if reply[0] in (128, 37, 40)]
    expected_encounter = [] if fault == "start" else [128, 37] if fault == "land" else [128, 37, 40]
    assert [reply[0] for reply in encounter] == expected_encounter, encounter
    if encounter:
        assert encounter[0] == [128, 3, 1] and encounter[1][2:] == [-1, "CPU", "21", "1004", 11, *([0] * 6)]
    ready_requested = fault in (None, "ready", "move", "combat")
    if ready_requested:
        assert len(encounter[2]) == 7 and encounter[2][1] == 7 and encounter[2][-2:] == [2, 1]
        ready = [reply for reply in trace["replies"] if 43 <= reply[0] <= 46]
        assert [reply[0] for reply in ready] == [43, 44, 45, 46] * (terminal_turn or (2 if next_turn else 1))
        assert ready[-1] == [46, 2], ready
        assert len(trace["readySends"]) == 1
    movement_sizes = {23: 6, 24: 11, 25: 10, 26: 9, 32: 12}
    combined_movement = expected_movement + next_movement + [row for row in terminal_actions if row[0] in movement_sizes]
    assert trace["movement"] == combined_movement, trace["movement"]
    assert [packet for packet in trace["sent"] if packet[0] in movement_sizes] == [
        [command, movement_sizes[command]] for command, *_ in combined_movement
    ]
    combat_sizes = {28: 11, 29: 10, 30: 11, 31: 10, 33: 9, 34: 9}
    combined_combat = expected_combat + [row for row in terminal_actions if row[0] in combat_sizes]
    assert trace["combat"] == combined_combat, trace["combat"]
    assert [packet for packet in trace["sent"] if packet[0] in combat_sizes] == [
        [command, combat_sizes[command]] for command, *_ in combined_combat
    ]
    assert [command for command, _ in trace["sent"] if command not in {0, 1, 3}] == [
        5, 12, *(command for command, *_ in actions), *([22] if ready_requested else []),
        *(command for command, *_ in expected_movement), *(command for command, *_ in expected_combat),
        *(command for command, *_ in next_movement), *(command for command, *_ in terminal_actions),
    ]
    assert [packet for packet in trace["sent"] if packet[0] in {13, 16}] == [
        [command, 10 if command == 13 else 11] for command, *_ in actions
    ]
    assert equipped_parts(database, avatar_id) == original_parts
    if not any(reply[0] == 41 for reply in trace["replies"]):
        assert avatar(database, player_id) == [updated]
        assert quest_inventory(database, avatar_id) == [started] and quest_deck(database, avatar_id) == locked
    if fault == "start":
        if page.locator("#login-alert").is_visible():
            page.locator("#login-alert-ok").press("Enter")
        page.locator("#quest-map-back").press("Enter")
        screen(stage, "lobby")
        trace = page.evaluate("window.qaQuestWire.sockets.at(-1)")
        assert trace["close"] == [1000, True] and trace["sent"][-1] == [2, 5]
        assert [peer for peer in live if not peer.is_closed()] == core
    if terminal == "return":
        page.locator("#quest-map-back").click()
        screen(stage, "lobby")
        trace = read_movement_trace(page)
        assert trace["sent"][-1] == [2, 5] and trace["close"] == [1000, True]
        assert [peer for peer in live if not peer.is_closed()] == core and len(live) == 5
        expect(page.locator("#lobby-quest-load")).to_be_focused()
        capture(stage, directory, "30-terminal-original-lobby-return.png")
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)
    assert not errors, errors
    if directory is not None:
        (directory / "16-quest-start-wire.json").write_text(json.dumps(trace, indent=2) + "\n")


def check_next_quest_land(page, stage, directory, database, quest, avatar_id, locked, held):
    inventory_id = quest[0]
    view = page.locator("#quest-map-view")
    detail = page.locator("#quest-map-detail")
    battle = page.locator("#quest-map-battle")
    slot4 = detail.locator('button.quest-map-detail-land[data-slot="4"][data-land-id="210"]')
    duel_ok = battle.locator("#quest-battle-result-ok")
    result = battle.locator("#quest-battle-result")
    prior = held["replies"]
    (duel,) = [packet for packet in prior if packet[0] == 41]
    assert duel[2] == 0 and duel[-1] == 0, f"Actual q3 first fight ended with {duel}"
    finish = prior[prior.index(duel):]
    assert [packet for packet in finish if packet[0] == 19] == [[19, 10, inventory_id, 2]]
    assert not any(packet[0] in (20, 22, 24) for packet in finish), finish
    expect(result).to_have_attribute("data-result", "0", timeout=TIMEOUT)
    expect(result).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    expect(duel_ok).to_be_disabled()
    expect(slot4).to_have_count(0)
    expect(page.locator("#quest-map-settlement")).to_have_count(0)
    capture(stage, directory, "31-q3-result-before-damage-proof.png")

    release_movement_reply(page, next_command=3)
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    fenced = read_movement_trace(page)
    suffix = fenced["replies"][len(prior):]
    (damage,) = [packet[4:] for packet in suffix if packet[:4] == [20, 7, 1, 2]]
    assert fenced["sent"][len(held["sent"]):] == [[3, 5]] and not any(packet[0] == 3 for packet in suffix)
    expect(duel_ok).to_be_disabled()
    expect(slot4).to_have_count(0)
    expect(page.locator("#quest-map-settlement")).to_have_count(0)
    capture(stage, directory, "32-q3-result-before-original-pong.png")
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-outcome-state", "land-cleared", timeout=TIMEOUT)
    expect(duel_ok).to_be_enabled()
    assert [3, 2] in read_movement_trace(page)["replies"][len(fenced["replies"]):]
    duel_ok.click()
    expect(battle).to_have_count(0)
    expect(view).to_have_attribute("data-adventure-state", "between-lands", timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-inventory-id", str(inventory_id))
    expect(detail).to_have_attribute("data-quest-status", "2")
    expect(detail).to_have_attribute("data-progress", "2")
    expect(detail.locator('#quest-map-detail-pawn[data-slot="1"] img')).to_be_visible()
    expect(detail.locator('span.quest-map-detail-land[data-slot="1"][data-cleared="true"]')).to_be_visible()
    expect(slot4).to_be_enabled()
    expect(detail.locator("button.quest-map-detail-land")).to_have_count(1)
    for selector in ("#quest-map-back", "#quest-map-detail-back", "#quest-map-deck-previous", "#quest-map-deck-next"):
        expect(page.locator(selector)).to_be_hidden()
    expect(page.locator("#quest-map-settlement")).to_have_count(0)
    assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 2, 1, *damage)]
    assert quest_deck(database, avatar_id) == locked
    assert query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id) == [(0, 3)]
    assert query(database, "SELECT id FROM quest_clear_logs WHERE avatar_id = ?", avatar_id) == []
    capture(stage, directory, "33-q3-retained-detail.png")
    music(page, "quest", "ulbgm03.mp3")
    before_next = read_movement_trace(page)
    assert [p for p in before_next["sent"] if p[0] != 3] == [p for p in held["sent"] if p[0] != 3]

    page.emulate_media(reduced_motion="no-preference")
    hold_movement_reply(page, 16, slot4.click, through=37)
    receiving = read_movement_trace(page)["replies"][len(before_next["replies"]):]
    arrivals = [packet for packet in receiving if packet[0] in (128, 37, 40)]
    assert [packet[0] for packet in arrivals] == [128, 37] and arrivals[0] == [128, 3, 4]
    assert arrivals[1][2:] == [-1, "CPU", "21", "1004", 11, *damage, 0, 0, 0], arrivals
    expect(battle).to_have_count(0)
    assert read_movement_trace(page)["readySends"] == [["settled", "complete"]]
    capture(stage, directory, "34-q3-second-encounter-withheld.png")
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-stage", "11", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-land-slot", "4")
    expect(battle).to_have_attribute("data-encounter-key", f"{inventory_id}:4")
    expect(battle).to_have_attribute("data-burn", "settled", timeout=TIMEOUT)
    music(page, "quest-duel", "bgm000.mp3")
    assert page.evaluate("window.qaFirstDuel !== document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")
    assert page.locator('audio[src$="/bgm010.mp3"]').count() == 0
    capture(stage, directory, "35-q3-original-second-opening.png")
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-turn", "1")
    expect(battle.locator("#quest-battle-player-hp")).to_have_attribute("data-hp", str(7 - damage[0]))
    expect(battle.locator("#quest-battle-opponent-hp")).to_have_attribute("data-hp", "1")
    expect(battle.locator('[id^="quest-battle-exchange-history-"]')).to_have_count(0)
    trace = read_movement_trace(page)
    assert trace["readySends"] == [["settled", "complete"]] * 2
    opening = [packet for packet in trace["replies"][len(before_next["replies"]):] if 43 <= packet[0] <= 46]
    assert [packet[0] for packet in opening] == [43, 44, 45, 46] and opening[0] == [43, 3, 1], opening
    new_hand = [[card, bool((mask >> index) & 1), kind]
                for kind, (_, _, cards, mask, _) in zip(("action", "event"), opening[1:3])
                for index, card in enumerate(cards)]
    check_dealt_cards(battle.locator("#quest-battle-player-hand .quest-battle-hand-card"), new_hand)
    assert trace["actions"] == [[13, inventory_id, 1], [16, inventory_id, 1, 1], [16, inventory_id, 1, 4]]
    assert [packet for packet in trace["sent"][len(before_next["sent"]):] if packet[0] != 3] == [[16, 11], [22, 5]]
    assert not any(packet[0] in (22, 24) for packet in trace["replies"])
    assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 2, 1, *damage)]
    assert quest_deck(database, avatar_id) == locked
    capture(stage, directory, "36-q3-original-second-move.png")
    return trace


def check_q3_final_treasure(page, stage, directory, database, quest, deck, before, cards_before, second_open, held):
    inventory_id, quest_id = quest[:2]
    final_replies = held["replies"][len(second_open["replies"]):]
    (duel,) = [packet for packet in final_replies if packet[0] == 41]
    assert duel[2] == 0 and duel[-1] == 0, f"Actual q3 final fight ended with {duel}"
    assert page.evaluate("window.qaQuestWire.actionHold.blocked") == 25
    pending = [packet for packet in final_replies if packet[0] in (19, 20, 22, 24, 25, 26, 28, 41)
               or (packet[0] == 13 and packet[3] == 1004)]
    assert [packet[0] for packet in pending] == [41, 19, 13], pending
    assert pending[1] == [19, 10, inventory_id, 18]
    _, _, card_inventory, card_id = pending[2]
    assert card_inventory > 0 and card_id == 1004

    battle = page.locator("#quest-map-battle")
    result = battle.locator("#quest-battle-result")
    duel_ok = result.locator("#quest-battle-result-ok")
    treasure = page.locator("#quest-map-treasure")
    clear = page.locator("#quest-map-settlement")
    back = page.locator("#quest-map-back")
    expect(battle).to_have_attribute("data-outcome-state", "awaiting-settlement")
    expect(result).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    expect(duel_ok).to_be_disabled()
    expect(treasure).to_have_count(0)
    expect(clear).to_have_count(0)
    expect(back).to_be_hidden()
    expect(page.locator("#quest-map-view")).to_have_attribute("data-map-id", "1")
    # The original service has committed the card even though the corresponding treasure reply is still held.
    avatar_id = before[0]
    assert cards_before | {(card_inventory, card_id)} <= owned_character_cards(database, avatar_id)
    capture(stage, directory, "38-q3-awaiting-treasure-reply.png")

    release_movement_reply(page)
    expect(battle).to_have_attribute("data-outcome-state", "settled", timeout=TIMEOUT)
    expect(duel_ok).to_be_enabled()
    expect(treasure).to_have_count(0)
    expect(clear).to_have_count(0)
    trace = read_movement_trace(page)
    awards = [(packet[2], packet[3]) for packet in trace["replies"] if packet[0] == 13]
    assert len(awards) == len({physical for physical, _ in awards})
    assert [(physical, awarded) for physical, awarded in awards if awarded == 1004] == [(card_inventory, card_id)]
    after_cards = cards_before | set(awards)
    assert owned_character_cards(database, avatar_id) == after_cards
    suffix = [packet for packet in trace["replies"][len(held["replies"]):] if packet[0] in (20, 22, 24, 25, 26, 28)]
    assert [packet[0] for packet in suffix] == [25, 20, 20, 28, 26, 22, 24], suffix
    assert suffix[0] == [25, 11, 1, 1, 1004]
    assert suffix[1][:4] == [20, 7, 1, 2]
    assert suffix[2:] == [[20, 7, 1, 2, 0, 0, 0], [28, 6, 0], [26, 6, 1], [22, 6, inventory_id], [24, 7, 0, inventory_id]]
    assert query(database, """
        SELECT quest_id, avatar_id, before_avatar_id, status, progress, deck_index, hp0, hp1, hp2
        FROM avatar_quest_inventories WHERE id = ?
    """, inventory_id) == [(quest_id, 0, avatar_id, 3, 18, 1, 0, 0, 0)]
    log_sql = """SELECT quest_inventory_id, finish_point, result, chara_card_id_0
                 FROM quest_clear_logs WHERE avatar_id = ?"""
    assert query(database, log_sql, avatar_id) == [(inventory_id, 4, 0, STARTER_CARD)]
    assert quest_deck(database, avatar_id) == deck
    assert quest_inventory(database, avatar_id) == []
    assert query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id) == [(1, 0)]

    page.emulate_media(reduced_motion="no-preference")
    duel_ok.dblclick()
    expect(treasure).to_be_visible(timeout=TIMEOUT)
    treasure_ok = treasure.locator("#quest-map-treasure-ok")
    expect(treasure_ok).to_be_disabled()
    expect(treasure).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    for field, value in (("treasure-id", 1004), ("type", 1), ("slot-type", 1), ("value", 1004),
                         ("card-id", card_id), ("card-inventory-id", card_inventory)):
        expect(treasure).to_have_attribute(f"data-{field}", str(value))
    expect(treasure.locator("#quest-map-treasure-card")).to_be_visible()
    expect(clear).to_have_count(0)
    expect(result).to_have_count(0)
    expect(treasure_ok).to_be_enabled()
    expect(treasure_ok).to_be_focused()
    page.wait_for_function("""() => window.qaQuestWire.sockets.at(-1).openingEffects
      .filter(([file]) => file === 'ulse23.mp3').length === 1""", timeout=TIMEOUT)
    capture(stage, directory, "39-q3-authentic-bat-treasure.png")
    treasure_ok.click()
    expect(treasure).to_have_count(0)
    expect(clear).to_have_attribute("open", "")
    expect(clear).to_have_attribute("data-result", "clear")
    expect(clear).to_have_attribute("data-inventory-id", str(inventory_id))
    capture(stage, directory, "40-q3-authentic-quest-clear.png")
    clear.locator("#quest-map-settlement-ok").click()
    expect(clear).to_be_hidden()
    expect(back).to_be_enabled()
    expect(back).to_be_focused()
    view = page.locator("#quest-map-view")
    expect(view).to_have_attribute("data-map-id", "2", timeout=TIMEOUT)
    expect(view.locator('button[data-map-id="2"]')).to_have_accessible_name("隱者之道")
    expect(view.locator('button[data-map-id="2"]')).to_be_enabled()
    expect(page.locator("#quest-map-progress")).to_have_text("0/3")
    expect(page.locator("#quest-map-capacity")).to_have_text("0/4")
    expect(page.locator("#quest-map-deck-next")).to_be_enabled()
    metrics = {packet[0]: packet[2] for packet in trace["replies"] if packet[0] in (7, 8, 10)}
    profile = tuple(metrics.get(command, before[index]) for index, command in ((2, 8), (3, 10), (4, 7)))
    assert query(database, "SELECT level, gems, exp FROM avatars WHERE id = ?", avatar_id) == [profile]
    for field, value in zip(("level", "gems", "exp"), profile, strict=True):
        expect(view.locator(f"#quest-map-{field}")).to_have_text(str(value))
    after_modal = read_movement_trace(page)
    assert [p for p in after_modal["sent"] if p[0] != 3] == [p for p in trace["sent"] if p[0] != 3]
    assert sum(file == "ulse23.mp3" for file, _ in after_modal["openingEffects"]) == 1
    assert query(database, log_sql, avatar_id) == [(inventory_id, 4, 0, STARTER_CARD)]
    assert owned_character_cards(database, avatar_id) == after_cards
    capture(stage, directory, "41-q3-authoritative-map-unlock.png")


def start_preowned_quest(page, database, player_id, quest, locked, *, ap_cost):
    inventory_id, quest_id = quest[:2]
    row = page.locator(f'#quest-map-inventory > li[data-inventory-id="{inventory_id}"][data-quest-id="{quest_id}"]')
    row.locator(".quest-map-row-open").click()
    detail = page.locator("#quest-map-detail")
    expect(detail).to_have_attribute("data-quest-status", "1", timeout=TIMEOUT)
    before = avatar(database, player_id)[0]
    detail.locator('[data-quest-command="start"]').click()
    expect(detail).to_have_attribute("data-quest-status", "2", timeout=TIMEOUT)
    wait_quest_start_lock(page, database, before[0], quest[:2] + (2,) + quest[3:], locked)
    before = before[:5] + (before[5] - ap_cost,) + before[6:]
    assert avatar(database, player_id) == [before]
    states = [packet for packet in read_movement_trace(page)["replies"] if packet[0] in (4, 17)]
    assert states == [[17, 11, inventory_id, 1, quest_id], [4, 10, before[5]], [17, 11, inventory_id, 2, quest_id]], states
    return detail, before


def check_preowned_quest(page, origin, database, name, password, directory, *, continue_land, complete=False):
    ((player_id, flags),) = player(database, name)
    (profile,) = avatar(database, player_id)
    avatar_id = profile[0]
    (quest,) = quest_inventory(database, avatar_id)
    quest_id, initial_damage = (3, 0) if continue_land else (1, 6)
    assert flags == 0 and quest[1:3] == (quest_id, 0) and quest[4:] == (0, 1, initial_damage, 0, 0), quest
    assert profile[5:7] == (4, 5)
    assert query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id) == [
        (0, 3 if continue_land else 0),
    ]
    deck = quest_deck(database, avatar_id)
    assert len(deck) == 1 and deck[0][1:] == (STARTER_CARD, 0, 0)
    locked = [deck[0][:3] + (1,)]
    stage, live, errors = open_quest_fixture(page, origin, player_id, name, password)
    page.locator("#lobby-quest-load").click()
    screen(stage, "quest-map")
    expect(page.locator("#quest-map-view")).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    inventory_id = quest[0]
    if continue_land:
        response = page.request.get(f"{origin}/api/quest-catalog?id=3&map=1")
        assert response.ok
        (source,) = response.json()["quests"]
        assert [(row["slot"], row["id"], row["nextSlots"], row["stage"], row["eventNo"]) for row in source["positions"]] == [
            (1, 201, [4], 11, 0), (4, 210, [], 11, 0),
        ]
        if complete:
            assert source["positions"][1]["fixedCharacterTreasure"] == {
                "treasureId": 1004, "type": 1, "slotType": 1, "value": 1004,
            }
    detail, before = start_preowned_quest(page, database, player_id, quest, locked, ap_cost=int(continue_land))
    first = detail.locator('button.quest-map-detail-land[data-slot="1"][data-land-id="201"]')
    expect(first).to_be_enabled()
    page.emulate_media(reduced_motion="no-preference")
    observe_quest_opening_audio(page)
    page.evaluate("window.qaQuestWire.holdAction(22, {through: 45})")
    first.click()
    check_quest_opening(page, stage, directory, drop_reply=False, starting_hp=7 - initial_damage)
    page.evaluate("window.qaFirstDuel = document.querySelector('#stage > audio[data-bgm-scene=quest-duel]')")
    encounter = read_movement_trace(page)["replies"]
    assert next(packet for packet in encounter if packet[0] == 37)[2:] == [
        -1, "CPU", "21", "1004", 11, initial_damage, 0, 0, 0, 0, 0,
    ]
    page.emulate_media(reduced_motion="reduce")
    cards_before = owned_character_cards(database, avatar_id)
    actions, held, _ = play_terminal_combat(page, stage, directory, completions=(20,) if continue_land else (24,),
                                            defeat=not continue_land)
    if continue_land:
        second_open = check_next_quest_land(page, stage, directory, database, quest, avatar_id, locked, held)
        if complete:
            page.emulate_media(reduced_motion="reduce")
            second_actions, second_held, _ = play_terminal_combat(page, stage, directory, completions=(25, 24))
            check_q3_final_treasure(page, stage, directory, database, quest, deck, before, cards_before, second_open, second_held)
            page.locator("#quest-map-back").click()
            screen(stage, "lobby")
    else:
        duel, after = check_terminal_storage(database, player_id, inventory_id, deck, before, cards_before, held["replies"])
        assert duel[2] == 1 and any(packet[0] == 73 and packet[2] == 1 and packet[3] > 0 for packet in held["replies"])
        check_terminal_presentation(page, stage, directory, "defeat", inventory_id, duel, after, before[2], held, starting_hp=1)
        page.locator("#quest-map-back").click()
        screen(stage, "lobby")

    trace = read_movement_trace(page)
    assert len(live) == 5 and not trace["overlaps"]
    assert all(not peer.is_closed() for peer in live[:4])
    assert trace["close"] == (None if continue_land and not complete else [1000, True])
    assert trace["confirms"] == [[inventory_id, 1]]
    assert [packet[0] for packet in trace["sent"] if packet[0] not in (0, 1, 3)] == [
        12, 13, 16, 22, *(command for command, *_ in actions), *([16, 22] if continue_land else []),
        *([command for command, *_ in second_actions] if complete else []), *([2] if not continue_land or complete else []),
    ]
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)
    assert not errors, errors
    if directory is not None:
        (directory / "37-quest-wire.json").write_text(json.dumps(trace, indent=2) + "\n")


def check_terrain_hover(page, stage, directory, land, title, caption, image):
    box = land.bounding_box()
    land.hover()
    expect(page.locator("#quest-map-detail-land-name")).to_have_text(title)
    expect(page.locator("#quest-map-detail-land-caption")).to_have_text(caption)
    wait_quest_art(page)
    capture(stage, directory, image)
    page.mouse.move(770, 346)
    expect(page.locator("#quest-map-detail-land-name")).to_have_text("")
    return box


def check_gem_receipt(page, stage, directory, *, inventory_id, slot, amount, balance, cue_count,
                      capture_back=False, hud_balance=None):
    treasure = page.locator("#quest-map-treasure")
    ok = treasure.locator("#quest-map-treasure-ok")
    if capture_back:
        page.wait_for_function("() => window.qaInitialGemHolding !== undefined", timeout=TIMEOUT)
        assert page.evaluate("window.qaInitialGemHolding") == {"backVisible": True, "okDisabled": True}
        if treasure.get_attribute("data-state") == "holding":
            capture(stage, directory, "03a-gem-before-flip.png", animations="allow")
    expect(treasure).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    for field, value in (("treasure-id", 50001 if amount == 30 else 50002), ("type", 5), ("slot-type", 1),
                         ("value", amount), ("gem-balance", balance), ("quest-inventory-id", inventory_id),
                         ("land-slot", slot)):
        expect(treasure).to_have_attribute(f"data-{field}", str(value))
    assert treasure.get_attribute("data-art") is None
    face = treasure.get_by_role("img", name=f"{amount} Gem", exact=True)
    expect(face).to_be_visible()
    name = face.locator("#quest-map-treasure-gem-name")
    total = face.locator("#quest-map-treasure-gem-amount")
    expect(name).to_have_text("GET GEM!!")
    expect(total).to_have_text(str(amount))
    for element, font in ((name, "Unlight Treasure Mincho"), (total, "Bradley Gratis")):
        assert element.evaluate("""(node, family) => getComputedStyle(node).fontFamily.startsWith(`"${family}"`)
          && Array.from(document.fonts).some(font => font.status === 'loaded'
            && font.family.replaceAll('"', '') === family)""", font)
    for art_file in ("treasure-gem-frame.png", "treasure-gem-icon.png"):
        image = face.locator(f'img[src$="{art_file}"]')
        expect(image).to_be_visible()
        assert image.evaluate("image => image.complete && image.naturalWidth > 0")
    page.wait_for_function("""count => window.qaQuestWire.sockets.at(-1).terrainSounds
      .filter(file => file === 'ulse23.mp3').length === count""", arg=cue_count, timeout=TIMEOUT)
    expect(page.locator("#quest-map-gems")).to_have_text(str(balance if hud_balance is None else hud_balance))
    expect(ok).to_be_focused()
    sent = [packet for packet in read_movement_trace(page)["sent"] if packet[0] != 3]
    stage_box = stage.bounding_box()
    page.mouse.click(stage_box["x"] + 95, stage_box["y"] + 198)
    expect(treasure).to_be_visible()
    assert [packet for packet in read_movement_trace(page)["sent"] if packet[0] != 3] == sent
    ok.hover()
    expect(ok.locator('img[src$="quest-ok-over.png"]')).to_be_visible()
    image = "04-confirmed-fixed-gem-receipt.png" if slot == 1 else f"slot-{slot:02d}-gem-{amount}.png"
    capture(stage, directory, image, animations="allow")
    ok.click()
    expect(treasure).to_have_count(0)
    assert [packet for packet in read_movement_trace(page)["sent"] if packet[0] != 3] == sent


def check_q4_terminal(page, stage, directory, database, player_id, quest, deck, injury, mode):
    before = avatar(database, player_id)[0]
    cards = owned_character_cards(database, before[0])
    page.emulate_media(reduced_motion="reduce")
    actions, held, _ = play_terminal_combat(page, stage, directory, defeat=mode == "defeat", dwarf_slot=4)
    inventory_id = quest[0]
    duel, after = check_terminal_storage(database, player_id, inventory_id, deck, before, cards, held["replies"],
                                         quest_id=4, land_slot=4, previous_progress=2, map_flag=1)
    assert duel[2] == int(mode == "defeat"), duel
    assert not any(packet[0] == 25 for packet in held["replies"])
    if mode == "win":
        assert [20, 7, 1, 2, 4, 0, 0] in held["replies"], held["replies"]
    check_terminal_presentation(page, stage, directory, "return", inventory_id, duel, after, before[2], held,
                                starting_hp=7 - injury, foe_hp=3)
    expect(page.locator("#quest-map-view")).to_have_attribute("data-map-id", "2")
    expect(page.locator("#quest-map-treasure")).to_have_count(0)
    trace = read_movement_trace(page)
    assert trace["actions"] == [[13, inventory_id, 1], [16, inventory_id, 1, 1], [16, inventory_id, 1, 4]]
    assert [p[0] for p in trace["sent"] if p[0] not in (0, 1, 3)] == [
        12, 13, 16, 16, 22, *(command for command, *_ in actions),
    ]
    check_receipt_ap(page, "quest-map", after)


def check_receipt_ap(page, prefix, profile):
    energy, cap = profile[5:7]
    expect(page.locator(f"#{prefix}-energy")).to_have_text(re.compile(rf"^{energy}(?:/{cap})?$"), timeout=TIMEOUT)


def check_q32_result_gate(page, stage, directory, held, encounter, inventory_id, slot, progress, starting_hp, *, foe_hp=3):
    assert page.evaluate("window.qaQuestWire.actionHold.blocked") == 25
    before = held["replies"][len(encounter["replies"]):]
    (duel,) = [p for p in before if p[0] == 41]
    assert duel[2] == 0 and duel[-1] == 0, duel
    (proof,) = [p for p in before if p[0] == 19]
    assert proof == [19, 10, inventory_id, progress | (1 << slot)]
    assert before.index(duel) < before.index(proof)
    balances = [p[2] for p in before if p[0] == 10]
    assert balances
    if slot != 6:
        assert [p[2] for p in before[before.index(proof) + 1:] if p[0] == 10] == [balances[-1]]
        assert len(balances) >= 2 and balances[-1] == balances[-2] + 30, before
    assert not any(p[0] in (20, 22, 24, 25) for p in before)
    battle = page.locator("#quest-map-battle")
    result = battle.locator("#quest-battle-result")
    ok = result.locator("#quest-battle-result-ok")
    expect(battle).to_have_attribute("data-outcome-state", "awaiting-settlement")
    expect(result).to_have_attribute("data-result", "0")
    expect(result).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    expect(result.locator('#quest-battle-result-call[src$="win-10.png"]')).to_be_visible()
    check_combat_hp(battle, {"player": starting_hp, "opponent": foe_hp}, [p for p in before if p[0] in (73, 74, 77, 79)])
    expect(ok).to_be_disabled()
    expect(page.locator("#quest-map-detail")).to_have_attribute("data-progress", str(progress))
    for selector in ("#quest-map-treasure", "#quest-map-settlement", "button.quest-map-detail-land"):
        expect(page.locator(selector)).to_have_count(0)
    reward = "card" if slot == 6 else "gem"
    capture(stage, directory, f"slot-{slot:02d}-win-awaiting-real-{reward}-reply.png")
    return balances[-1], ok


def check_q32_final_gem(page, stage, directory, database, player_id, quest, deck, damage, *, previous_progress, left=False):
    inventory_id = quest[0]
    avatar_id = avatar(database, player_id)[0][0]
    battle = page.locator("#quest-map-battle")
    view = page.locator("#quest-map-view")
    detail = page.locator("#quest-map-detail")
    active_lands = detail.locator("button.quest-map-detail-land")
    treasure = page.locator("#quest-map-treasure")
    clear = page.locator("#quest-map-settlement")
    gems = page.locator("#quest-map-gems")
    combat_dir = directory / "slot-10-combat" if directory is not None else None
    if combat_dir is not None:
        combat_dir.mkdir(exist_ok=True)
    expect(view).to_have_attribute("data-adventure-state", "between-lands")
    expect(active_lands).to_have_count(1)
    last_land = active_lands.and_(detail.locator('[data-slot="10"][data-land-id="104"]'))
    check_terrain_hover(page, stage, directory, last_land, "通往集落之路1", "小矮人們的通道", "slot-10-last-battle-hover.png")
    before_last = read_movement_trace(page)
    hold_movement_reply(page, 16, last_land.click, through=37)
    held = read_movement_trace(page)
    (point, roster) = [p for p in held["replies"][len(before_last["replies"]):] if p[0] != 3]
    assert point == [128, 3, 10] and roster[2:] == [-1, "CPU", "21", "1001", 2, *damage, 0, 0, 0], roster
    expect(battle).to_have_count(0)
    assert held["readySends"] == [["settled", "complete"]] * (2 if left else 1)
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-encounter-key", f"{inventory_id}:10", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-stage", "2")
    music(page, "quest-duel", "bgm002.mp3")
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    expect(battle.locator("#quest-battle-player-hp")).to_have_attribute("data-hp", str(7 - damage[0]))
    expect(battle.locator("#quest-battle-opponent-hp")).to_have_attribute("data-hp", "3")
    capture(stage, directory, "slot-10-authoritative-final-move.png" if left else "slot-10-authoritative-second-move.png", animations="allow")
    final_battle = read_movement_trace(page)
    final_before = avatar(database, player_id)[0]
    final_cards = owned_character_cards(database, avatar_id)
    page.emulate_media(reduced_motion="reduce")
    final_actions, final_held, _ = play_terminal_combat(page, stage, combat_dir, completions=(25, 24),
                                                    left_slot=10 if left else None, dwarf_slot=None if left else 10)
    final_balance, final_ok = check_q32_result_gate(page, stage, directory, final_held, final_battle, inventory_id,
                                                   10, previous_progress, 7 - damage[0])
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-outcome-state", "settled", timeout=TIMEOUT)
    expect(final_ok).to_be_enabled()
    for node in (treasure, clear):
        expect(node).to_have_count(0)
    trace = read_movement_trace(page)
    final_replies = trace["replies"][len(final_battle["replies"]):]
    assert [p for p in final_replies if p[0] == 25] == [[25, 11, 5, 1, 30]]
    assert [p for p in final_replies if p[0] == 24] == [[24, 7, 0, inventory_id]]
    final_duel, final_avatar = check_terminal_storage(database, player_id, inventory_id, deck, final_before, final_cards,
                                                      final_replies, quest_id=32, land_slot=10, previous_progress=previous_progress, map_flag=3)
    assert final_duel[9] == (25 if left else 45), final_duel
    (gem_reply,) = [p for p in final_replies if p[0] == 25]
    assert [p[2] for p in final_replies[:final_replies.index(gem_reply)] if p[0] == 10][-1] == final_balance
    page.emulate_media(reduced_motion="no-preference")
    final_ok.click()
    expect(battle).to_have_count(0)
    expect(clear).to_have_count(0)
    check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=10, amount=30, balance=final_balance,
                      cue_count=4, hud_balance=final_avatar[3])
    expect(clear).to_have_attribute("open", "")
    expect(clear).to_have_attribute("data-result", "clear")
    expect(clear).to_have_attribute("data-inventory-id", str(inventory_id))
    capture(stage, directory, "quest-32-confirmed-clear.png")
    clear.locator("#quest-map-settlement-ok").click()
    expect(clear).to_have_count(0)
    expect(page.locator("#quest-map-back")).to_be_focused()
    expect(view).to_have_attribute("data-map-id", "4")
    expect(page.locator("#quest-map-capacity")).to_have_text("0/4")
    expect(page.locator("#quest-map-progress")).to_have_text("1/8")
    expect(gems).to_have_text(str(final_avatar[3]))
    check_receipt_ap(page, "quest-map", final_avatar)
    expect(page.locator('#quest-map-deck[data-deck-index="1"] li[data-card-id="21"][data-position="0"]')).to_be_visible()
    music(page, "quest", "ulbgm03.mp3")
    return final_actions


def check_q32_right_route(page, stage, directory, database, player_id, quest, deck, locked, first_battle, positions):
    inventory_id = quest[0]
    before = avatar(database, player_id)[0]
    avatar_id = before[0]
    for slot, land, next_slots, reward, amount in ((5, 104, [8], 50001, 30), (8, 6, [10], 50002, 50), (10, 104, [], 50001, 30)):
        position = positions[slot]
        assert (position["id"], position["nextSlots"]) == (land, next_slots)
        field = "fixedBattleGemTreasure" if position["enemyId"] else "fixedGemTreasure"
        assert position[field] == {"treasureId": reward, "type": 5, "slotType": 1, "value": amount}
    battle = page.locator("#quest-map-battle")
    view = page.locator("#quest-map-view")
    detail = page.locator("#quest-map-detail")
    treasure = page.locator("#quest-map-treasure")
    clear = page.locator("#quest-map-settlement")
    active_lands = detail.locator("button.quest-map-detail-land")
    gems = page.locator("#quest-map-gems")
    page.emulate_media(reduced_motion="reduce")
    first_dir = directory / "slot-05-combat" if directory is not None else None
    if first_dir is not None:
        first_dir.mkdir(exist_ok=True)
    first_actions, held, _ = play_terminal_combat(page, stage, first_dir, completions=(25, 24), dwarf_slot=5)
    balance_5, first_ok = check_q32_result_gate(page, stage, directory, held, first_battle, inventory_id, 5, 2, 6)
    release_movement_reply(page, next_command=3)
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    fenced = read_movement_trace(page)
    source = fenced["replies"][len(held["replies"]):]
    assert len(source) == 2 and source[0] == [25, 11, 5, 1, 30] and source[1][:4] == [20, 7, 1, 2], source
    damage = source[1][4:]
    assert damage == [4, 0, 0], source[1]
    assert fenced["sent"][len(held["sent"]):] == [[3, 5]]
    expect(first_ok).to_be_disabled()
    expect(treasure).to_have_count(0)
    expect(active_lands).to_have_count(0)
    capture(stage, directory, "slot-05-result-awaiting-same-peer-pong.png")
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-outcome-state", "land-cleared", timeout=TIMEOUT)
    expect(first_ok).to_be_enabled()
    expect(treasure).to_have_count(0)
    page.emulate_media(reduced_motion="no-preference")
    first_ok.click()
    expect(battle).to_have_count(0)
    expect(view).to_have_attribute("data-adventure-state", "terrain-reward")
    expect(detail).to_have_attribute("data-progress", "34")
    expect(active_lands).to_have_count(0)
    expect(clear).to_have_count(0)
    assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 34, 1, *damage)]
    assert quest_deck(database, avatar_id) == locked
    assert avatar(database, player_id)[0][3] == balance_5
    music(page, "quest", "ulbgm03.mp3")
    check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=5, amount=30, balance=balance_5, cue_count=2)

    expect(view).to_have_attribute("data-adventure-state", "between-lands")
    expect(active_lands).to_have_count(1)
    next_land = active_lands.and_(detail.locator('[data-slot="8"][data-land-id="6"]'))
    check_terrain_hover(page, stage, directory, next_land, "森林小道", "穩靜的獸道", "slot-08-forest-path-hover.png")
    page.evaluate("window.qaMapAfterDuel = document.querySelector('#stage > audio[data-bgm-scene=quest]')")
    after_first = read_movement_trace(page)
    after_first_avatar = avatar(database, player_id)[0]
    check_receipt_ap(page, "quest-map", after_first_avatar)
    hold_movement_reply(page, 16, next_land.click, before=[25])
    held = read_movement_trace(page)
    assert held["replies"][len(after_first["replies"]):] == [[128, 3, 8], [19, 10, inventory_id, 290], [10, 6, balance_5 + 50]]
    expect(gems).to_have_text(str(balance_5))
    expect(detail).to_have_attribute("data-progress", "34")
    for node in (battle, treasure, active_lands, clear):
        expect(node).to_have_count(0)
    capture(stage, directory, "slot-08-awaiting-original-50-gem-reply.png")
    release_movement_reply(page, next_command=3)
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    fenced = read_movement_trace(page)
    assert fenced["replies"][len(held["replies"]):] == [[25, 11, 5, 1, 50]]
    assert fenced["sent"][len(held["sent"]):] == [[3, 5]]
    expect(treasure).to_have_count(0)
    release_movement_reply(page)
    expect(view).to_have_attribute("data-adventure-state", "terrain-reward", timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-progress", "290")
    for node in (battle, active_lands, clear):
        expect(node).to_have_count(0)
    check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=8, amount=50,
                      balance=balance_5 + 50, cue_count=3)
    assert page.evaluate("window.qaMapAfterDuel === document.querySelector('#stage > audio[data-bgm-scene=quest]')")
    assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 290, 1, *damage)]
    assert avatar(database, player_id) == [after_first_avatar[:3] + (balance_5 + 50,) + after_first_avatar[4:]]
    assert quest_deck(database, avatar_id) == locked

    final_actions = check_q32_final_gem(page, stage, directory, database, player_id, quest, deck, damage,
                                       previous_progress=290)
    trace = read_movement_trace(page)
    assert trace["actions"] == [[13, inventory_id, 1], *[[16, inventory_id, 1, slot] for slot in (1, 5, 8, 10)]]
    assert trace["readySends"] == [["settled", "complete"]] * 2
    assert [p for p in trace["replies"] if p[0] == 25] == [[25, 11, 5, 1, amount] for amount in (30, 30, 50, 30)]
    assert [p[0] for p in trace["sent"] if p[0] not in (0, 1, 3)] == [
        12, 13, 16, 16, 22, *(command for command, *_ in first_actions), 16, 16, 22,
        *(command for command, *_ in final_actions),
    ]
    assert sum(sound == "ulse23.mp3" for sound in trace["terrainSounds"]) == 4
    capture(stage, directory, "quest-32-authoritative-world-return.png")


def check_q32_left_chest(page, stage, directory, inventory_id, card_inventory_id):
    treasure = page.locator("#quest-map-treasure")
    ok = treasure.locator("#quest-map-treasure-ok")
    expect(treasure).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    for field, value in (("treasure-id", 60001), ("type", 6), ("slot-type", 1), ("value", STARTER_CARD),
                         ("card-id", STARTER_CARD), ("card-inventory-id", card_inventory_id),
                         ("quest-inventory-id", inventory_id), ("land-slot", 6)):
        expect(treasure).to_have_attribute(f"data-{field}", str(value))
    assert treasure.get_attribute("data-art") is None
    face = treasure.locator("#quest-map-treasure-card")
    expect(face).to_be_visible()
    assert face.evaluate("""canvas => [canvas.width, canvas.height].every(size => size > 0)
      && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(
        (value, i) => i % 4 === 3 && value === 255)""")
    page.wait_for_function("""() => window.qaQuestWire.sockets.at(-1).terrainSounds
      .filter(file => file === 'ulse23.mp3').length === 3""", timeout=TIMEOUT)
    expect(ok).to_be_focused()
    ok.hover()
    expect(ok.locator('img[src$="quest-ok-over.png"]')).to_be_visible()
    capture(stage, directory, "slot-06-fresh-binder-card-21.png", animations="allow")
    sent = [p for p in read_movement_trace(page)["sent"] if p[0] != 3]
    ok.click()
    expect(treasure).to_have_count(0)
    assert [p for p in read_movement_trace(page)["sent"] if p[0] != 3] == sent


def check_q32_stage_zero(page, stage, directory, battle):
    candles = battle.locator(".quest-battle-stage-animation")
    expect(candles).to_have_count(6, timeout=TIMEOUT)
    first = candles.first
    expect(first).to_be_visible()
    expect(first).to_have_attribute("data-frame", re.compile(r"^(?:[0-9]|[1-3][0-9]|40)$"))
    original_frame = first.get_attribute("data-frame")
    expect(first).not_to_have_attribute("data-frame", original_frame, timeout=TIMEOUT)
    assert candles.evaluate_all("nodes => nodes.every(node => node.dataset.frame === nodes[0].dataset.frame)")
    geometry = candles.evaluate_all("""nodes => nodes.map(node =>
      ['left', 'top', 'width', 'height', 'zIndex'].map(field => Number.parseFloat(node.style[field])))""")
    expected = [[x, 194.40566, 67.19727, 141.59424, 0] for x in (270.40137, 422.40137, 86.40137, 606.40137)]
    expected.extend([[-80, -8, 224, 472, 3], [616, -8, 224, 472, 3]])
    assert all(isclose(value, target, abs_tol=0.05) for actual, authored in zip(geometry, expected, strict=True)
               for value, target in zip(actual, authored, strict=True)), geometry
    for filename in ("quest-battle-stage00-castle.png", "quest-battle-stage00-barrier.png"):
        expect(battle.locator(f'img[src$="{filename}"]')).to_be_visible()
    expect(candles.locator('img[src$="quest-battle-stage00-candle-atlas.png"]')).to_have_count(6)
    wait_quest_art(page)
    capture(stage, directory, "slot-06-stage-zero-animated-candles.png", animations="allow")


def check_q32_left_route(page, stage, directory, database, player_id, quest, deck, locked, opening, positions):
    inventory_id = quest[0]
    avatar_id = avatar(database, player_id)[0][0]
    assert (positions[3]["id"], positions[3]["stage"], positions[3]["nextSlots"]) == (304, 3, [6])
    assert (positions[6]["id"], positions[6]["stage"], positions[6]["enemyId"], positions[6]["nextSlots"]) == (10021, 0, 20021, [10])
    assert (positions[10]["id"], positions[10]["stage"], positions[10]["nextSlots"]) == (104, 2, [])
    for slot in (3, 10):
        assert positions[slot]["fixedBattleGemTreasure"] == {"treasureId": 50001, "type": 5, "slotType": 1, "value": 30}
    assert positions[6]["ownCardTreasure"] == {"treasureId": 60001, "type": 6, "slotType": 1, "value": 1}
    battle = page.locator("#quest-map-battle")
    view = page.locator("#quest-map-view")
    detail = page.locator("#quest-map-detail")
    treasure = page.locator("#quest-map-treasure")
    clear = page.locator("#quest-map-settlement")
    active_lands = detail.locator("button.quest-map-detail-land")
    actions_by_slot = []
    progress = 2
    for slot, next_slot, foe_hp, exp, damage in ((3, 6, 3, 25, [1, 0, 0]), (6, 10, 7, 45, [6, 0, 0])):
        cards = owned_character_cards(database, avatar_id)
        combat_dir = directory / f"slot-{slot:02d}-combat" if directory is not None else None
        if combat_dir is not None:
            combat_dir.mkdir(exist_ok=True)
        page.emulate_media(reduced_motion="reduce")
        actions, held, _ = play_terminal_combat(page, stage, combat_dir, completions=(25, 24), left_slot=slot)
        actions_by_slot.append(actions)
        balance, result_ok = check_q32_result_gate(page, stage, directory, held, opening, inventory_id,
                                                  slot, progress, 6, foe_hp=foe_hp)
        before_chest = held["replies"][len(opening["replies"]):]
        (duel,) = [p for p in before_chest if p[0] == 41]
        assert duel[9] == exp, duel
        if slot == 6:
            awards = [(physical, card) for command, _, physical, card in (p for p in before_chest if p[0] == 13)]
            assert len(awards) == len({physical for physical, _ in awards}), awards
            (card_inventory_id,) = [physical for physical, card in awards if card == STARTER_CARD]
            own_award = [13, 10, card_inventory_id, STARTER_CARD]
            order = before_chest.index(own_award)
            assert before_chest.index([19, 10, inventory_id, 74]) < order
            assert (card_inventory_id, STARTER_CARD) not in cards
            assert owned_character_cards(database, avatar_id) == cards | set(awards)
            assert query(database, """SELECT d.name, i.chara_card_id FROM card_inventories i
                JOIN chara_card_decks d ON d.id = i.chara_card_deck_id
                WHERE d.avatar_id = ? AND i.id = ?""", avatar_id, card_inventory_id) == [("Binder", STARTER_CARD)]
            card_receipt = {
                "slot": 6, "inventoryId": card_inventory_id, "cardId": STARTER_CARD, "location": "Binder",
                "earlierAncillaryAwards": [p[2:] for p in before_chest[:order] if p[0] == 13],
                "allAwards": awards,
            }
        release_movement_reply(page, next_command=3)
        page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
        fenced = read_movement_trace(page)
        reward = [6, 1, STARTER_CARD] if slot == 6 else [5, 1, 30]
        assert fenced["replies"][len(held["replies"]):] == [[25, 11, *reward], [20, 7, 1, 2, *damage]]
        assert fenced["sent"][len(held["sent"]):] == [[3, 5]]
        expect(result_ok).to_be_disabled()
        expect(treasure).to_have_count(0)
        expect(active_lands).to_have_count(0)
        capture(stage, directory, f"slot-{slot:02d}-awaiting-same-quest-pong.png")
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-outcome-state", "land-cleared", timeout=TIMEOUT)
        expect(treasure).to_have_count(0)
        expect(result_ok).to_be_enabled()
        sent = [p for p in read_movement_trace(page)["sent"] if p[0] != 3]
        page.emulate_media(reduced_motion="no-preference")
        result_ok.click()
        progress |= 1 << slot
        expect(view).to_have_attribute("data-adventure-state", "terrain-reward")
        expect(detail).to_have_attribute("data-progress", str(progress))
        expect(battle).to_have_count(0)
        expect(active_lands).to_have_count(0)
        expect(clear).to_have_count(0)
        music(page, "quest", "ulbgm03.mp3")
        after = avatar(database, player_id)[0]
        assert after[3] == balance
        if slot == 3:
            check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=slot, amount=30, balance=balance, cue_count=2)
        else:
            check_q32_left_chest(page, stage, directory, inventory_id, card_inventory_id)
            expect(page.locator("#quest-map-gems")).to_have_text(str(balance))
        assert [p for p in read_movement_trace(page)["sent"] if p[0] != 3] == sent
        check_receipt_ap(page, "quest-map", after)
        assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], progress, 1, *damage)]
        assert quest_deck(database, avatar_id) == locked
        expect(view).to_have_attribute("data-adventure-state", "between-lands")
        expect(active_lands).to_have_count(1)
        expect(active_lands).to_have_attribute("data-slot", str(next_slot))
        if slot == 6:
            break
        check_terrain_hover(page, stage, directory, active_lands, "黑太子1", "死神纏身的黑暗王子。", "slot-06-black-prince-hover.png")
        before_battle = read_movement_trace(page)
        hold_movement_reply(page, 16, active_lands.click, through=37)
        encounter = read_movement_trace(page)
        point, roster = [p for p in encounter["replies"][len(before_battle["replies"]):] if p[0] != 3]
        assert point == [128, 3, 6] and roster[2:] == [-1, "CPU", "21", "21", 0, *damage, 0, 0, 0], roster
        assert encounter["readySends"] == [["settled", "complete"]]
        expect(battle).to_have_count(0)
        release_movement_reply(page)
        expect(battle).to_have_attribute("data-encounter-key", f"{inventory_id}:6", timeout=TIMEOUT)
        expect(battle).to_have_attribute("data-stage", "0")
        expect(battle).to_have_attribute("data-land-slot", "6")
        music(page, "quest-duel", "bgm000.mp3")
        check_q32_stage_zero(page, stage, directory, battle)
        expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
        check_combat_hp(battle, {"player": 7 - damage[0], "opponent": 7}, [])
        capture(stage, directory, "slot-06-authoritative-castle-move.png", animations="allow")
        opening = read_movement_trace(page)

    final_actions = check_q32_final_gem(page, stage, directory, database, player_id, quest, deck, [6, 0, 0],
                                       previous_progress=74, left=True)
    trace = read_movement_trace(page)
    assert trace["actions"] == [[13, inventory_id, 1], *[[16, inventory_id, 1, slot] for slot in (1, 3, 6, 10)]]
    assert trace["readySends"] == [["settled", "complete"]] * 3
    assert [p for p in trace["replies"] if p[0] == 25] == [
        [25, 11, 5, 1, 30], [25, 11, 5, 1, 30], [25, 11, 6, 1, STARTER_CARD], [25, 11, 5, 1, 30],
    ]
    assert [p[0] for p in trace["sent"] if p[0] not in (0, 1, 3)] == [
        12, 13, 16, *(command for group in (*actions_by_slot, final_actions) for command in (16, 22, *(p[0] for p in group))),
    ]
    assert sum(sound == "ulse23.mp3" for sound in trace["terrainSounds"]) == 4
    assert (card_inventory_id, STARTER_CARD) in owned_character_cards(database, avatar_id)
    capture(stage, directory, "quest-32-authoritative-world-return.png")
    return card_receipt


def bonus_profile(database, player_id):
    profile = avatar(database, player_id)[0]
    avatar_id = profile[0]
    return {
        "profile": profile,
        "cards": owned_character_cards(database, avatar_id),
        "items": set(query(database, "SELECT id, avatar_item_id FROM item_inventories WHERE avatar_id = ?", avatar_id)),
        "slotCards": set(query(database, """SELECT i.id, i.kind, i.card_id FROM chara_card_slot_inventories i
            JOIN chara_card_decks d ON i.chara_card_deck_id = d.id WHERE d.avatar_id = ?""", avatar_id)),
    }


def verify_bonus_storage(database, player_id, before, replies, kept, duel):
    (inventory,) = [p for p in replies if p[0] == 38]
    (result,) = [p for p in replies if p[0] == 126]
    assert replies.index(inventory) < replies.index(result)
    assert inventory[3] == result[2] == kept
    ids = inventory[2]
    genre, card_id, count = kept or (None, None, 0)
    addition = (duel[9 if genre == 0 else 8] * (count - 100)) // 100 if genre in (0, 1) else 0
    assert result[3:] == [duel[8] + (addition if genre == 1 else 0), duel[9] + (addition if genre == 0 else 0), addition]
    after = bonus_profile(database, player_id)
    if genre in (3, 4, 5):
        assert len(ids) == count and len(set(ids)) == count
        for physical in ids:
            row = query(database, """SELECT d.name, i.chara_card_id FROM card_inventories i
                 JOIN chara_card_decks d ON i.chara_card_deck_id = d.id
                 WHERE d.avatar_id = ? AND i.id = ?""", after["profile"][0], physical)
            assert row == [("Binder", card_id)], row
    else:
        assert ids == []
    char_awards = {(physical, card_id) for physical in ids}
    char_awards.update(tuple(p[2:]) for p in replies if p[0] == 13)
    item_awards = {tuple(p[2:]) for p in replies if p[0] == 11}
    slot_awards = {tuple(p[2:]) for p in replies if p[0] == 12}
    assert after["cards"] == before["cards"] | char_awards
    assert after["items"] == before["items"] | item_awards
    assert after["slotCards"] == before["slotCards"] | slot_awards
    if genre == 2:
        assert sum(item == card_id for _, item in item_awards - before["items"]) == count
    if genre in (6, 7):
        assert sum(card == card_id for _, _, card in slot_awards - before["slotCards"]) == count
    old = before["profile"]
    assert after["profile"][3] == old[3] + (addition if genre == 1 else 0)
    assert after["profile"][4] == old[4] + (addition if genre == 0 else 0)
    added = {key: sorted(after[key] - before[key]) for key in ("cards", "items", "slotCards")}
    return result, after["profile"], added


def check_bonus_dice(panel, selector, dice):
    value = panel.locator(selector)
    expect(value).to_have_attribute("data-dice", ",".join(map(str, dice)), timeout=TIMEOUT)
    expect(value).to_have_attribute("data-total", str(sum(dice)))
    assert len(dice) == 2 and all(1 <= eye <= 6 for eye in dice)


def bonus_commands(page):
    return [p for p in read_movement_trace(page)["sent"] if p[0] in (7, 36, 37, 38, 39)]


def press_bonus_action(page, button, command, blocked_reply, sent, *, repeat_pointer=True):
    expect(button).to_be_visible(timeout=TIMEOUT)
    expect(button).to_be_enabled(timeout=TIMEOUT)
    box = button.bounding_box()
    assert box is not None
    point = (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    hold_movement_reply(page, command, button.click, before=[blocked_reply])
    if repeat_pointer:
        page.mouse.click(*point)
    sent.append([command, 13 if command == 7 else 5])
    assert bonus_commands(page) == sent
    return point


def check_bonus_guess(page, stage, directory, bonus, *, choice, bottom, expected_roll, prize, following,
                      sent, pending_frame, result_frame, rank=155):
    offset = len(read_movement_trace(page)["replies"])
    press_bonus_action(page, bonus.locator(f"#quest-battle-bonus-{choice}"), 36 if choice == "high" else 37, 124, sent)
    expect(bonus).to_have_attribute("data-state", "rolling")
    expect(bonus.locator("#quest-battle-bonus-selected")).to_have_attribute("data-choice", choice)
    expect(bonus.locator("button:enabled:visible")).to_have_count(0)
    for control in ("next", "get", "exit", "item"):
        expect(bonus.locator(f"#quest-battle-bonus-{control}")).to_be_hidden()
    held = [p for p in read_movement_trace(page)["replies"][offset:] if p[0] in (124, 125)]
    assert held == [[125, 9, expected_roll]], held
    capture(stage, directory, pending_frame, animations="allow")
    release_movement_reply(page)
    (verdict,) = [p for p in read_movement_trace(page)["replies"][offset:] if p[0] == 124]
    won = sum(expected_roll) >= sum(bottom) if choice == "high" else sum(expected_roll) <= sum(bottom)
    assert verdict[2:] == [won, prize if won else [], following if won else [], rank], verdict
    expect(bonus.locator("#quest-battle-bonus-decision")).to_have_attribute("data-won", str(won).lower(), timeout=TIMEOUT)
    check_bonus_dice(bonus, "#quest-battle-bonus-dice", expected_roll)
    painted = bonus.locator('#quest-battle-bonus-dice[data-state="settled"]')
    expect(painted).to_be_visible()
    assert painted.evaluate("""canvas => {
      const gl = canvas.getContext('webgl2');
      if (canvas.width !== 780 || canvas.height !== 680 || !gl || gl.isContextLost()) return false;
      const pixels = new Uint8Array(4 * canvas.width * canvas.height);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }"""), "The original two dice must paint real WebGL pixels"
    capture(stage, directory, result_frame, animations="allow")
    return verdict


def bonus_item_inventory(database, avatar_id):
    return {physical: (item_id, state, used) for physical, item_id, state, used in query(database, """
        SELECT id, avatar_item_id, state, use_at IS NOT NULL FROM item_inventories
        WHERE avatar_id = ? AND avatar_item_id IN (4, 5, 6) ORDER BY id
    """, avatar_id)}


def select_bonus_item(bonus, database, avatar_id, item_id):
    panel = bonus.locator("#quest-battle-bonus-item-panel")
    if not panel.is_visible():
        bonus.locator("#quest-battle-bonus-item").click()
    expect(panel).to_have_attribute("data-state", "open")
    physical_ids = [physical for physical, (master, state, _) in bonus_item_inventory(database, avatar_id).items()
                    if master == item_id and state == 0]
    assert physical_ids, item_id
    row = panel.locator(f'.quest-battle-bonus-item-row[data-item-id="{item_id}"]')
    expect(row).to_have_attribute("data-count", str(len(physical_ids)))
    physical_id = int(row.get_attribute("data-inventory-id"))
    assert physical_id in physical_ids
    row.click()
    expect(panel).to_have_attribute("data-selected-item-id", str(item_id))
    ((name, description),) = query(database, "SELECT name, caption FROM avatar_items WHERE id = ?", item_id)
    expect(panel.locator("#quest-battle-bonus-item-name")).to_have_text(name)
    expect(panel.locator("#quest-battle-bonus-item-caption")).to_have_text(description)
    expect(panel.locator("#quest-battle-bonus-item-count")).to_have_text(str(len(physical_ids)))
    expect(panel.locator("#quest-battle-bonus-item-time")).to_have_text("-")
    return panel, physical_id, name


def record_bonus_item_evidence(page, item_id, inventory_id, before, held, after, *, notice):
    evidence = {"itemId": item_id, "inventoryId": inventory_id, "heldState": "using-item", "heldNotice": notice}
    for mark, trace in (("before", before), ("held", held), ("after", after)):
        evidence[mark] = {key: len(trace[key]) for key in ("sent", "replies")}
    page.evaluate("item => (window.qaQuestWire.sockets.at(-1).rewardItemEvidence ??= []).push(item)", evidence)


def use_bonus_item(page, stage, directory, bonus, database, avatar_id, item_id, sent, *, target, decision=None):
    assert bonus_commands(page) == sent
    before = bonus_item_inventory(database, avatar_id)
    panel, physical_id, name = select_bonus_item(bonus, database, avatar_id, item_id)
    assert bonus_item_inventory(database, avatar_id) == before
    assert bonus_commands(page) == sent
    notice = page.locator('#login-alert[open][data-kind="quest-reward-item-used"]')
    expect(notice).to_have_count(0)
    wait_quest_art(page)
    capture(stage, directory, f"09-item-{item_id}-authored-description.png", animations="allow")
    start = read_movement_trace(page)
    shown_target = bonus.locator("#quest-battle-bonus-target").get_attribute("data-dice")
    expected = [[127, 6, physical_id], [123, 9, target]]
    if decision is not None:
        expected.append(decision)
    use_point = press_bonus_action(page, panel.locator("#quest-battle-bonus-item-use"), 7, expected[-1][0], sent,
                                   repeat_pointer=False)
    held = read_movement_trace(page)
    assert held["rewardItems"][len(start.get("rewardItems", [])):] == [[physical_id, 21]]
    assert held["replies"][len(start["replies"]):] == expected[:-1]
    assert bonus_item_inventory(database, avatar_id) == before | {physical_id: (item_id, 2, 1)}
    expect(bonus).to_have_attribute("data-state", "using-item")
    expect(bonus.locator("#quest-battle-bonus-decision")).to_have_attribute("data-won", "false")
    if decision is None:
        expect(bonus.locator("#quest-battle-bonus-target")).to_have_attribute("data-dice", shown_target)
    else:
        check_bonus_dice(bonus, "#quest-battle-bonus-target", target)
    expect(bonus).to_have_attribute("data-item-inventory-id", str(physical_id))
    expect(bonus).to_have_attribute("data-item-id", str(item_id))
    left = sum(master == item_id and state == 0 for master, state, _ in before.values()) - 1
    row = panel.locator(f'.quest-battle-bonus-item-row[data-item-id="{item_id}"]')
    if left:
        expect(row).to_have_attribute("data-count", str(left))
    else:
        expect(row).to_have_count(0)
    for control in ("high", "low", "next", "get", "exit", "item"):
        expect(bonus.locator(f"#quest-battle-bonus-{control}:enabled:visible")).to_have_count(0)
    expect(notice).to_be_visible(timeout=TIMEOUT)
    expect(notice.locator("#login-alert-title")).to_have_text("信息")
    expect(notice.locator("#login-alert-message")).to_have_text(f"使用{name}")
    expect(notice.locator("#login-alert-ok")).to_be_focused()
    capture(stage, directory, f"09-item-{item_id}-source-ack-with-effect-held.png", animations="allow")
    if decision is not None:
        page.mouse.click(*use_point)
        assert bonus_commands(page) == sent
        notice.locator("#login-alert-ok").click()
        expect(notice).to_have_count(0)
        expect(bonus).to_have_attribute("data-state", "using-item")
    release_movement_reply(page)
    if decision is None and directory is not None:
        # Hold only the two live visual fades long enough for the compositor screenshot.
        try:
            page.wait_for_function("""dice => {
              const stage = document.getElementById('stage');
              const bonus = document.getElementById('quest-battle-bonus');
              const drawer = document.getElementById('quest-battle-bonus-item-panel');
              const target = document.getElementById('quest-battle-bonus-target');
              const notice = document.querySelector('#login-alert[open][data-kind="quest-reward-item-used"]');
              if (bonus?.dataset.itemTransition !== 'incoming' || target?.dataset.dice !== dice.join(',')
                || !drawer || drawer.hidden || Number(getComputedStyle(drawer).opacity) < 0.95
                || Math.abs(drawer.getBoundingClientRect().x - stage.getBoundingClientRect().x - 25) > 0.5
                || notice?.querySelector('#login-alert-ok') !== document.activeElement) return false;
              const fades = ['high', 'low'].map(direction => {
                const button = document.getElementById(`quest-battle-bonus-${direction}`);
                if (!button || button.hidden || !button.disabled || Number(getComputedStyle(button).opacity) < 0.6) return null;
                return button.getAnimations().find(animation => animation.playState === 'running');
              });
              if (!fades.every(Boolean)) return false;
              window.qaRewardFrameFades = fades;
              for (const fade of fades) fade.pause();
              return true;
            }""", arg=target, timeout=TIMEOUT)
            capture(stage, directory, "09-item-4-source-effect-with-drawer-open.png", animations="allow")
            assert page.evaluate("""() => {
              const stage = document.getElementById('stage');
              const drawer = document.getElementById('quest-battle-bonus-item-panel');
              const notice = document.querySelector('#login-alert[open][data-kind="quest-reward-item-used"]');
              const mask = getComputedStyle(stage, '::after');
              return window.qaRewardFrameFades?.every(fade => fade.playState === 'paused')
                && !drawer.hidden && Number(getComputedStyle(drawer).opacity) >= 0.95
                && Math.abs(drawer.getBoundingClientRect().x - stage.getBoundingClientRect().x - 25) <= 0.5
                && notice?.querySelector('#login-alert-ok') === document.activeElement
                && mask.backdropFilter === 'blur(1px)' && Number(mask.opacity) > 0;
            }""")
        finally:
            page.evaluate("""() => {
              for (const fade of window.qaRewardFrameFades ?? []) fade.play();
              delete window.qaRewardFrameFades;
            }""")
    after = read_movement_trace(page)
    assert after["replies"][len(start["replies"]):] == expected
    expect(panel).to_be_hidden()
    check_bonus_dice(bonus, "#quest-battle-bonus-target", target)
    if decision is None:
        expect(bonus).to_have_attribute("data-state", "guess", timeout=TIMEOUT)
        for direction in ("high", "low"):
            control = bonus.locator(f"#quest-battle-bonus-{direction}")
            expect(control).to_be_visible()
            control.evaluate("button => Promise.all(button.getAnimations().map(animation => animation.finished))")
        expect(notice).to_be_visible()
        capture(stage, directory, "09-item-4-source-effect-with-notice-open.png", animations="allow")
        notice.locator("#login-alert-ok").click()
        expect(notice).to_have_count(0)
    assert bonus_commands(page) == sent
    record_bonus_item_evidence(page, item_id, physical_id, start, held, after, notice=True)
    return physical_id


def check_bonus_item_chain(page, stage, directory, bonus, database, player_id, sent, profile, following):
    avatar_id = profile["profile"][0]
    initial = bonus_item_inventory(database, avatar_id)
    assert sorted(initial.values()) == [(4, 0, 0), (4, 0, 0), (5, 0, 0), (6, 0, 0)], initial
    launcher = bonus.locator("#quest-battle-bonus-item")
    panel = bonus.locator("#quest-battle-bonus-item-panel")
    launcher.click()
    expect(panel).to_have_attribute("data-state", "open")
    panel.locator("#quest-battle-bonus-item-close").click()
    expect(panel).to_be_hidden()
    assert bonus_commands(page) == sent

    clover = use_bonus_item(page, stage, directory, bonus, database, avatar_id, 4, sent, target=[3, 1])
    expect(bonus).to_have_attribute("data-round", "2")
    verdict = check_bonus_guess(page, stage, directory, bonus, choice="low", bottom=[3, 1], expected_roll=[2, 4],
                                prize=[2, 11, 1], following=following, sent=sent,
                                pending_frame="09-second-roll-before-held-decision.png",
                                result_frame="09-second-authoritative-failure.png")
    assert not verdict[2]
    panel, insufficient, _ = select_bonus_item(bonus, database, avatar_id, 5)
    expect(panel.locator('[data-item-id="4"][data-count="1"]')).to_have_count(1)
    start = read_movement_trace(page)
    press_bonus_action(page, panel.locator("#quest-battle-bonus-item-use"), 7, 3, sent)
    held = read_movement_trace(page)
    assert held["sent"][len(start["sent"]):] == [[7, 13], [3, 5]]
    assert held["rewardItems"][len(start["rewardItems"]):] == [[insufficient, 21]]
    assert held["replies"][len(start["replies"]):] == []
    expect(page.locator("#login-alert[open]")).to_have_count(0)
    expect(bonus).to_have_attribute("data-state", "using-item")
    release_movement_reply(page)
    expect(bonus).to_have_attribute("data-state", "failure", timeout=TIMEOUT)
    after = read_movement_trace(page)
    assert after["replies"][len(start["replies"]):] == [[3, 2]]
    assert bonus_item_inventory(database, avatar_id)[insufficient][:2] == (5, 0)
    expect(panel).to_have_attribute("data-state", "open")
    expect(panel.locator('[data-item-id="5"]')).to_have_attribute("data-inventory-id", str(insufficient))
    expect(page.locator("#login-alert[open]")).to_have_count(0)
    expect(bonus.locator("#quest-battle-bonus-decision")).to_have_attribute("data-won", "false")
    record_bonus_item_evidence(page, 5, insufficient, start, held, after, notice=False)
    capture(stage, directory, "09-insufficient-item-left-failed-and-unspent.png", animations="allow")

    amended = [124, 28, True, [2, 11, 1], following, 155]
    heather = use_bonus_item(page, stage, directory, bonus, database, avatar_id, 6, sent, target=[2, 4], decision=amended)
    expect(bonus.locator("#quest-battle-bonus-decision")).to_have_attribute("data-won", "true", timeout=TIMEOUT)
    expect(bonus.locator("#quest-battle-bonus-get")).to_be_enabled(timeout=TIMEOUT)
    expect(bonus).to_have_attribute("data-round", "2")
    used = {physical: (master, state) for physical, (master, state, _) in bonus_item_inventory(database, avatar_id).items()}
    assert used == {physical: (master, 2 if physical in (clover, heather) else 0)
                    for physical, (master, _, _) in initial.items()}
    assert bonus_profile(database, player_id) == profile
    capture(stage, directory, "09-authoritative-amend-without-extra-roll.png", animations="allow")
    return amended


def reward_checkpoint(trace):
    return {key: len(trace[key]) for key in ("sent", "replies")}


def check_high_low_panel(page, stage, directory, database, player_id, choice, card_id, duel, *, checkpoints=None):
    battle = page.locator("#quest-map-battle")
    bonus = battle.locator("#quest-battle-result #quest-battle-bonus")
    result_ok = battle.locator("#quest-battle-result-ok")
    awards = battle.locator("#quest-battle-result-awards")
    count_proof = []
    choices = [[0, 0, 320], [3, 23, 1] if card_id == 30 else [2, 11, 1], [1, 0, 340], [0, 0, 350]]
    bottom = [4, 4] if card_id == 30 else [1, 6]
    terminal = choice in ("terminal-get", "terminal-exit")
    direct = choice in ("get", "terminal-get")
    if terminal:
        choices = [[1, 0, 260], [0, 0, 270], [1, 0, 280], [2, 11, 1]]
    rank = 118 if terminal else 154
    initial = [p for p in read_movement_trace(page)["replies"] if p[0] in (122, 123)]
    assert [p[0] for p in initial] == [122, 123]
    assert initial[0][2:] == [*choices, rank] and initial[1][2:] == [bottom]
    item_case = choice == "item"
    assert not item_case or card_id == 25
    before = bonus_profile(database, player_id)
    pending_totals = awards.locator(', '.join(f'[data-award="{field}"]' for field in (
        "gemsPow", "expPow", "gemsCardPower", "expCardPower", "totalGems", "totalExp")))
    expect(pending_totals).to_have_count(6)
    assert pending_totals.evaluate_all("""nodes => nodes.every(node => node.hidden ||
      getComputedStyle(node).visibility === 'hidden' || Number(getComputedStyle(node).opacity) === 0)""")
    if not terminal:
        expect(result_ok).to_have_attribute("data-confirmation", "begin", timeout=TIMEOUT)
        expect(result_ok).to_be_enabled()
        capture(stage, directory, "05-bonus-duel-award.png", animations="allow")
        result_ok.click()
    expect(bonus).to_have_attribute("data-state", "offer", timeout=TIMEOUT)
    expect(bonus.locator("#quest-battle-bonus-item")).to_be_hidden()
    for control in ("high", "low", "exit"):
        expect(bonus.locator(f"#quest-battle-bonus-{control}")).to_be_hidden()
    check_bonus_dice(bonus, "#quest-battle-bonus-target", bottom)
    offer = bonus.locator('.quest-battle-bonus-card[data-zone="current"], .quest-battle-bonus-card[data-zone="next"]')
    assert offer.evaluate_all("cards => cards.map(({dataset: d}) => [+d.genre, +d.id, +d.amount])") == choices
    capture(stage, directory, "06-authentic-offer-and-baseline-dice.png", animations="allow")
    assert bonus_commands(page) == [] and bonus_profile(database, player_id) == before
    cue_offset = len(read_movement_trace(page)["terrainSoundRequests"])
    kept = choices[0]
    verdict = None
    if not direct:
        offset = len(read_movement_trace(page)["replies"])
        press_bonus_action(page, bonus.locator("#quest-battle-bonus-next"), 39, 123, count_proof)
        expect(bonus).to_have_attribute("data-state", "opening")
        expect(bonus.locator("button:enabled:visible")).to_have_count(0)
        for control in ("high", "low", "exit"):
            expect(bonus.locator(f"#quest-battle-bonus-{control}")).to_be_hidden()
        held = [p for p in read_movement_trace(page)["replies"][offset:] if p[0] in (122, 123)]
        following = [3, 23, 1] if card_id == 30 else [1, 0, 360]
        if terminal:
            following = [0, 0, 300]
        assert len(held) == 1 and held[0][0] == 122 and held[0][2:] == [following, [], [], [], rank + 1], held
        release_movement_reply(page)
        expect(bonus).to_have_attribute("data-state", "guess", timeout=TIMEOUT)
        check_bonus_dice(bonus, "#quest-battle-bonus-target", bottom)
        expect(bonus.locator("#quest-battle-bonus-item")).to_be_hidden()
        capture(stage, directory, "07-next-enabled-authentic-high-low-choice.png", animations="allow")
        first_roll = [3, 1] if item_case else ([3, 5] if card_id == 30 else [6, 1])
        if terminal:
            first_roll = [1, 2]
        verdict = check_bonus_guess(page, stage, directory, bonus, choice="high" if item_case or terminal else choice, bottom=bottom,
                                    expected_roll=first_roll, prize=choices[1],
                                    following=following, sent=count_proof, rank=rank + 1,
                                    pending_frame="08-authentic-roll-before-held-decision.png",
                                    result_frame="09-authoritative-high-low-decision.png")
        assert bonus_profile(database, player_id) == before
        if item_case:
            assert not verdict[2]
            verdict = check_bonus_item_chain(page, stage, directory, bonus, database, player_id, count_proof, before, following)
        kept = verdict[3]

    if choice == "terminal-exit":
        assert not verdict[2] and kept == []
        owned_items = bonus_item_inventory(database, before["profile"][0])
        drawer = bonus.locator("#quest-battle-bonus-item-panel")
        bonus.locator("#quest-battle-bonus-item").click()
        expect(drawer).to_have_attribute("data-state", "open")
        assert bonus_commands(page) == count_proof
        capture(stage, directory, "09a-terminal-guess-failed-with-unspent-drawer.png", animations="allow")
    offset = len(read_movement_trace(page)["replies"])
    claim_action = "exit" if verdict is not None and not verdict[2] else "get"
    held_code = 38 if direct else 126
    press_bonus_action(page, bonus.locator(f"#quest-battle-bonus-{claim_action}"), 38, held_code, count_proof)
    expect(bonus).to_have_attribute("data-state", "claiming")
    expect(bonus.locator("button:enabled:visible")).to_have_count(0)
    expect(bonus.locator("#quest-battle-bonus-claim")).to_be_hidden()
    assert pending_totals.evaluate_all("nodes => nodes.every(node => node.hidden || Number(getComputedStyle(node).opacity) === 0)")
    expect(battle.locator('#quest-battle-result-ok[data-confirmation="return"]:enabled')).to_have_count(0)
    seen = [p for p in read_movement_trace(page)["replies"][offset:] if p[0] in (38, 126)]
    assert [p[0] for p in seen] == ([] if held_code == 38 else [38]), seen
    if choice == "terminal-exit":
        assert seen == [[38, 10, [], []]]
        expect(drawer).to_be_visible()
    if checkpoints is not None:
        checkpoints["claimPending"] = reward_checkpoint(read_movement_trace(page))
    capture(stage, directory, f"10-claim-while-source-sc{held_code}-held.png", animations="allow")
    release_movement_reply(page)
    expect(bonus).to_have_attribute("data-state", "claimed", timeout=TIMEOUT)
    expect(result_ok).to_have_attribute("data-confirmation", re.compile(r"^(?:return|level)$"), timeout=TIMEOUT)
    expect(result_ok).to_be_enabled(timeout=TIMEOUT)
    if checkpoints is not None:
        checkpoints["claimAccepted"] = reward_checkpoint(read_movement_trace(page))
    after_replies = read_movement_trace(page)["replies"][offset:]
    result, profile, added = verify_bonus_storage(database, player_id, before, after_replies, kept, duel)
    claim = bonus.locator("#quest-battle-bonus-claim")
    for name, value in zip(("total-gems", "total-exp", "add-point"), result[3:], strict=True):
        expect(claim).to_have_attribute(f"data-{name}", str(value))
    expect(awards.locator('[data-award="totalGems"]')).to_have_attribute("data-value", str(result[3]))
    expect(awards.locator('[data-award="totalExp"]')).to_have_attribute("data-value", str(result[4]))
    expect(awards.locator('[data-award="totalGems"]')).to_be_visible()
    expect(awards.locator('[data-award="totalExp"]')).to_be_visible()
    expect(claim).to_have_attribute("data-inventory-ids", ",".join(map(str, next(p for p in after_replies if p[0] == 38)[2])))
    if kept:
        card = bonus.locator('.quest-battle-bonus-card[data-zone="claimed"]')
        expect(card).to_be_visible()
        for field, expected in zip(("genre", "id", "amount"), kept, strict=True):
            expect(card).to_have_attribute(f"data-{field}", str(expected))
        if kept[0] == 0:
            expect(awards.locator('[data-award="expCardPower"]')).to_have_attribute("data-value", str(kept[2]))
        elif kept[0] == 1:
            expect(awards.locator('[data-award="gemsCardPower"]')).to_have_attribute("data-value", str(kept[2]))
    if terminal:
        assert added == {"cards": [], "items": [], "slotCards": []}
        assert result == ([126, 25, [1, 0, 260], 5, 6, 3] if direct else [126, 18, [], 2, 6, 0]), result
        assert count_proof == ([[38, 5]] if direct else [[39, 5], [36, 5], [38, 5]])
        expect(result_ok).to_have_attribute("data-confirmation", "return")
        if choice == "terminal-exit":
            assert bonus_item_inventory(database, before["profile"][0]) == owned_items
            expect(drawer).to_be_visible()
            expect(drawer.locator("button:enabled:visible")).to_have_count(0)
            expect(bonus.locator('.quest-battle-bonus-card[data-zone="claimed"]')).to_have_count(0)
    if result_ok.get_attribute("data-confirmation") == "level":
        capture(stage, directory, "11-before-authoritative-bonus-level-up.png", animations="allow")
        result_ok.click()
        expect(result_ok).to_have_attribute("data-confirmation", "return", timeout=TIMEOUT)
        expect(result_ok).to_be_enabled()
        caption = battle.locator("#quest-battle-result-level").get_by_text(re.compile(r"虛擬人物的等級提升為[0-9]+"))
        expect(caption).to_be_visible()
        capture(stage, directory, "11a-authoritative-bonus-level-up.png", animations="allow")
    expected_cues = ["ulse17.mp3"] if direct else [
        "ulse17.mp3", "ulse17.mp3", "ulse07.mp3", "ulse07.mp3",
        "ulse18.mp3" if verdict[2] else "ulse19.mp3", "ulse17.mp3",
    ]
    if item_case:
        expected_cues = [f"ulse{number:02}.mp3" for number in (17, 17, 7, 7, 19, 17, 17, 17, 7, 7, 19, 17, 18, 17)]
    if choice == "terminal-exit":
        expected_cues.insert(-1, "ulse17.mp3")
    cue_files = ["ulse07.mp3", "ulse17.mp3", "ulse18.mp3", "ulse19.mp3"]
    page.wait_for_function("""({offset, files, count}) => {
      const cues = window.qaQuestWire.sockets.at(-1).terrainSoundRequests.slice(offset)
        .filter(({file}) => files.includes(file));
      return cues.length >= count && cues.every(({playback}) => playback !== 'pending');
    }""",
                           arg={"offset": cue_offset, "files": cue_files, "count": len(expected_cues)}, timeout=TIMEOUT)
    reward_sounds = [cue for cue in read_movement_trace(page)["terrainSoundRequests"][cue_offset:]
                     if cue["file"] in cue_files]
    expected_sounds = [{"file": file, "playback": "played"} for file in expected_cues]
    assert reward_sounds == expected_sounds, (reward_sounds, expected_sounds)
    capture(stage, directory, "11-verified-bonus-receipt-and-return.png", animations="allow")
    if checkpoints is not None:
        checkpoints["beforeResultOK"] = reward_checkpoint(read_movement_trace(page))
    result_ok.click()
    assert bonus_commands(page) == count_proof
    return result, profile, added


def enter_q568_encounter(page, stage, directory, button, inventory_id, slot, card_id, hp, damage):
    battle = page.locator("#quest-map-battle")
    before = read_movement_trace(page)
    hold_movement_reply(page, 16, button.click, through=37)
    held = read_movement_trace(page)
    point, roster = [p for p in held["replies"][len(before["replies"]):] if p[0] != 3]
    foe = 1079 if slot == 1 else 94
    assert point == [128, 3, slot] and roster[2:] == [-1, "CPU", str(card_id), str(foe), 0, damage, 0, 0, 0, 0, 0]
    assert held.get("readySends", []) == [["settled", "complete"]] * int(slot == 5)
    expect(battle).to_have_count(0)
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-encounter-key", f"{inventory_id}:{slot}", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-stage", "0")
    music(page, "quest-duel", "bgm000.mp3")
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    check_combat_hp(battle, {"player": hp - damage, "opponent": 8}, [])
    wait_quest_art(page)
    capture(stage, directory, f"land-{slot:02d}-first-authentic-move.png", animations="allow")
    return read_movement_trace(page)


def check_terminal_bonus_archive_gate(page, stage, directory):
    battle = page.locator("#quest-map-battle")
    result = battle.locator('#quest-battle-result[data-result="1"]')
    expect(battle).to_have_attribute("data-outcome-state", "awaiting-settlement", timeout=TIMEOUT)
    expect(result.locator('#quest-battle-result-call[src$="lose-23.png"]')).to_be_visible(timeout=TIMEOUT)
    ok = result.locator('#quest-battle-result-ok[data-confirmation="begin"]')
    expect(ok).to_be_enabled(timeout=TIMEOUT)
    capture(stage, directory, "05-bonus-duel-award.png", animations="allow")
    ok.click()
    bonus = result.locator("#quest-battle-bonus")
    expect(bonus).to_have_attribute("data-state", "offer", timeout=TIMEOUT)
    expect(bonus.locator("#quest-battle-bonus-next")).to_be_disabled()
    get = bonus.locator("#quest-battle-bonus-get")
    expect(get).to_be_visible()
    expect(get).to_be_disabled()
    point = get.bounding_box()
    assert point is not None
    page.mouse.click(point["x"] + point["width"] / 2, point["y"] + point["height"] / 2)
    assert bonus_commands(page) == []
    expect(page.locator("#quest-map-settlement")).to_have_count(0)
    expect(page.locator("#quest-map-back")).to_be_hidden()
    capture(stage, directory, "05a-terminal-offer-with-source-sc24-held.png", animations="allow")


def check_terminal_bonus_map_return(page, stage, directory, inventory_id, profile, card_id, checkpoints):
    settle = page.locator('#quest-map-settlement[open][data-result="failed"]')
    expect(settle).to_have_attribute("data-inventory-id", str(inventory_id), timeout=TIMEOUT)
    expect(settle.locator("#quest-map-settlement-title")).to_have_text("任務失敗")
    expect(settle.locator('img[src$="quest-failed.png"]')).to_be_visible()
    expect(page.locator("#quest-battle-result")).to_be_hidden()
    wait_quest_art(page)
    capture(stage, directory, "12-terminal-quest-failed.png", animations="allow")
    checkpoints["beforeFailureOK"] = reward_checkpoint(read_movement_trace(page))
    settle.locator("#quest-map-settlement-ok").click()
    expect(settle).to_be_hidden()
    back = page.locator("#quest-map-back")
    expect(back).to_be_visible()
    expect(back).to_be_enabled()
    expect(back).to_be_focused()
    expect(page.locator("#quest-map-inventory > li")).to_have_count(0)
    expect(page.locator("#quest-map-capacity")).to_have_text("0/4")
    expect(page.locator("#quest-map-view")).to_have_attribute("data-map-id", "22")
    expect(page.locator("#quest-map-level")).to_have_text(str(profile[2]))
    expect(page.locator("#quest-map-gems")).to_have_text(str(profile[3]))
    expect(page.locator("#quest-map-exp")).to_have_text(str(profile[4]))
    expect(page.locator("#quest-map-energy")).to_have_text(f"{profile[5]}/{profile[6]}", timeout=TIMEOUT)
    expect(page.locator(f'#quest-map-deck[data-deck-index="1"] li[data-card-id="{card_id}"][data-position="0"]')).to_be_visible()
    expect(page.locator("#quest-map-deck-next")).to_be_enabled()
    music(page, "quest", "ulbgm03.mp3")
    capture(stage, directory, "13-terminal-return-to-quest-map.png", animations="allow")
    before = read_movement_trace(page)
    checkpoints["beforeBack"] = reward_checkpoint(before)
    assert len(before["sent"]) == checkpoints["beforeResultOK"]["sent"]
    back.click()
    screen(stage, "lobby")
    expect(page.locator("#lobby-quest-load")).to_be_focused()
    page.wait_for_function("() => window.qaQuestWire.sockets.at(-1).close !== null", timeout=TIMEOUT)
    after = read_movement_trace(page)
    assert after["sent"][len(before["sent"]):] == [[2, 5]] and after["close"] == [1000, True]
    checkpoints["afterBack"] = reward_checkpoint(after)
    capture(stage, directory, "14-terminal-back-to-same-lobby.png", animations="allow")


def check_q568_high_low(page, origin, database, name, password, directory, choice):
    ((player_id, flags),) = player(database, name)
    (initial,) = avatar(database, player_id)
    avatar_id = initial[0]
    (quest,) = quest_inventory(database, avatar_id)
    (deck,) = quest_deck(database, avatar_id)
    inventory_id = quest[0]
    card_id = deck[1]
    assert flags == 0 and initial[2] == 6 and initial[4:7] == (165, 4, 8)
    assert quest[1:3] == (568, 0) and quest[4:] == (0, 1, 0, 0, 0), quest
    assert card_id in (25, 30) and deck[2:] == (0, 0)
    terminal = choice in ("terminal-get", "terminal-exit")
    assert not terminal or card_id == 25
    checkpoints = {} if terminal else None
    locked = [deck[:3] + (1,)]
    assert query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id) == [(21, 0)]
    stage, live, errors = open_quest_fixture(page, origin, player_id, name, password)
    page.locator("#lobby-quest-load").click()
    screen(stage, "quest-map")
    view = page.locator("#quest-map-view")
    expect(view).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    expect(view).to_have_attribute("data-map-id", "22")
    catalog = page.request.get(f"{origin}/api/quest-catalog?id=568&map=22")
    assert catalog.ok
    (definition,) = catalog.json()["quests"]
    lands = {land["slot"]: land for land in definition["positions"]}
    assert definition["ap"] == 4
    assert (lands[1]["id"], lands[1]["stage"], lands[1]["enemyId"]) == (2704, 0, 2701)
    assert (lands[5]["id"], lands[5]["stage"], lands[5]["enemyId"], lands[5]["nextSlots"]) == (10094, 0, 20094, [7])
    assert lands[5]["bonusGameTreasure"] == {"treasureId": 70004, "type": 7, "slotType": 1, "value": 4}
    assert 5 in lands[1]["nextSlots"]
    detail, before = start_preowned_quest(page, database, player_id, quest, locked, ap_cost=4)
    expect(page.locator("#quest-map-energy")).to_have_text("0/8")
    page.evaluate("""() => {
      const trace = window.qaQuestWire.sockets.at(-1);
      trace.terrainSounds = [];
      trace.terrainSoundRequests = [];
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!this.src.includes('/sound/se/')) return original.call(this);
        // Different elements can start decoding later despite being requested first.
        const request = {file: this.src.split('/').at(-1), playback: 'pending'};
        trace.terrainSoundRequests.push(request);
        try {
          const playback = original.call(this);
          void playback.then(() => {
            request.playback = 'played';
            trace.terrainSounds.push(request.file);
          }, () => { request.playback = 'rejected'; });
          return playback;
        } catch (error) {
          request.playback = 'rejected';
          throw error;
        }
      };
    }""")
    battle = page.locator("#quest-map-battle")
    treasure = page.locator("#quest-map-treasure")
    active_lands = detail.locator("button.quest-map-detail-land")
    rounds, max_hp = (2, 13) if card_id == 30 else (1, 10)
    damage = 0
    staged = []
    for slot in (1, 5):
        combat_dir = directory / f"slot-{slot:02d}-source-combat" if directory is not None else None
        if combat_dir is not None:
            combat_dir.mkdir(exist_ok=True)
        page.emulate_media(reduced_motion="no-preference")
        button = active_lands.and_(detail.locator(f'[data-slot="{slot}"]'))
        check_terrain_hover(page, stage, directory, button, lands[slot]["name"], lands[slot]["caption"], f"land-{slot:02d}-source-hover.png")
        opening = enter_q568_encounter(page, stage, directory, button, inventory_id, slot, card_id, max_hp, damage)
        page.emulate_media(reduced_motion="reduce")
        if terminal and slot == 5:
            base = avatar(database, player_id)[0]
            cards_before = owned_character_cards(database, avatar_id)
            actions, held, turns = play_terminal_combat(page, stage, combat_dir, completions=(24,), defeat=True, reward_defeat=True)
            staged.append(actions)
            assert turns == 2
            authored = held["replies"][len(opening["replies"]):]
            assert [p for p in authored if p[0] == 73 and p[2] == 1] == [[73, 8, 1, 5, 0], [73, 8, 1, 3, 0]]
            assert page.evaluate("window.qaQuestWire.actionHold.blocked") == 24
            assert [p for p in authored if p[0] in (20, 22, 24)] == [[20, 7, 1, 2, 0, 0, 0], [22, 6, inventory_id]]
            duel, source_profile = check_terminal_storage(database, player_id, inventory_id, [deck], base, cards_before,
                                                          authored, quest_id=568, land_slot=5, previous_progress=2,
                                                          map_flag=21, bonus=True, card_id=card_id)
            assert duel == [41, 32, 1, 2, 6, 0, 100, 100, 2, 6, 1], duel
            assert source_profile[2:7] == (6, 142, 226, 0, 8), source_profile
            check_terminal_bonus_archive_gate(page, stage, directory)
            checkpoints["archiveHeld"] = reward_checkpoint(read_movement_trace(page))
            release_movement_reply(page)
            expect(battle).to_have_attribute("data-outcome-state", "settled", timeout=TIMEOUT)
            expect(battle.locator("#quest-battle-bonus-get")).to_be_enabled()
            assert [p for p in read_movement_trace(page)["replies"] if p[0] == 24] == [[24, 7, 1, inventory_id]]
            checkpoints["archiveReleased"] = reward_checkpoint(read_movement_trace(page))
            page.emulate_media(reduced_motion="no-preference")
            break
        actions, held, _ = play_terminal_combat(page, stage, combat_dir, completions=(25, 24) if slot == 1 else (20, 24),
                                                 reward_rounds=rounds)
        staged.append(actions)
        authored = held["replies"][len(opening["replies"]):]
        (duel,) = [p for p in authored if p[0] == 41]
        if slot == 1:
            assert duel[2] == 0 and duel[-1] == 0
            progress = [19, 10, inventory_id, 2]
            assert progress in authored and page.evaluate("window.qaQuestWire.actionHold.blocked") == 25
            balances = [p[2] for p in authored if p[0] == 10]
            assert len(balances) >= 2 and balances[-1] == balances[-2] + 30, authored
            balance = balances[-1]
            expect(active_lands).to_have_count(0)
            ok = battle.locator("#quest-battle-result-ok")
        else:
            assert [p for p in authored if p[0] in (19, 25)] == [[19, 10, inventory_id, 34], [25, 11, 7, 1, 4]]
            assert duel[2] == 0 and duel[-1] == 1
            assert page.evaluate("window.qaQuestWire.actionHold.blocked") == 20
            assert [p[0] for p in authored if p[0] in (122, 123)] == [122, 123]
            expect(detail).to_have_attribute("data-progress", "2")
            expect(active_lands).to_have_count(0)
            expect(battle).to_have_attribute("data-outcome-state", "awaiting-settlement", timeout=TIMEOUT)
            expect(battle.locator('#quest-battle-result-ok[data-confirmation="return"]:enabled')).to_have_count(0)
            capture(stage, directory, "04-bonus-result-before-quest-injury-proof.png", animations="allow")
        release_movement_reply(page, next_command=3)
        page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
        fenced = read_movement_trace(page)
        damage += 2
        tail = [[20, 7, 1, 2, damage, 0, 0]]
        if slot == 1:
            tail.insert(0, [25, 11, 5, 1, 30])
            expect(battle.locator("#quest-battle-result-ok:enabled")).to_have_count(0)
        assert fenced["replies"][len(held["replies"]):] == tail
        assert fenced["sent"][len(held["sent"]):] == [[3, 5]]
        expect(active_lands).to_have_count(0)
        expect(treasure).to_have_count(0)
        assert bonus_commands(page) == []
        if slot == 5:
            expect(battle.locator('#quest-battle-result-ok[data-confirmation="return"]:enabled')).to_have_count(0)
            capture(stage, directory, "04a-original-quest-pong-held.png", animations="allow")
        release_movement_reply(page)
        assert [3, 2] in read_movement_trace(page)["replies"][len(fenced["replies"]):]
        page.emulate_media(reduced_motion="no-preference")
        if slot == 1:
            result_view = battle.locator('#quest-battle-result[data-result="0"]')
            expect(result_view).to_be_visible(timeout=TIMEOUT)
            expect(result_view.locator('#quest-battle-result-call[src$="win-10.png"]')).to_be_visible(timeout=TIMEOUT)
            expect(ok).to_be_enabled(timeout=TIMEOUT)
            ok.click()
            expect(view).to_have_attribute("data-adventure-state", "terrain-reward")
            music(page, "quest", "ulbgm03.mp3")
            check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=slot, amount=30, balance=balance, cue_count=1)
            assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 2, 1, damage, 0, 0)]
            expect(view).to_have_attribute("data-adventure-state", "between-lands")

    stored = [quest[:2] + (2, quest[3], 34, 1, 4, 0, 0)]
    if not terminal:
        assert quest_inventory(database, avatar_id) == stored and quest_deck(database, avatar_id) == locked
    result, profile, added = check_high_low_panel(page, stage, directory, database, player_id, choice, card_id, duel,
                                                 checkpoints=checkpoints)
    expect(battle).to_have_count(0)
    if terminal:
        assert profile[2:7] == (6, 145 if choice == "terminal-get" else 142, 226, 0, 8), profile
        assert quest_inventory(database, avatar_id) == [] and quest_deck(database, avatar_id) == [deck]
        assert len(live) == 5 and all(not peer.is_closed() for peer in live)
        check_terminal_bonus_map_return(page, stage, directory, inventory_id, profile, card_id, checkpoints)
    else:
        expect(view).to_have_attribute("data-adventure-state", "between-lands", timeout=TIMEOUT)
        expect(detail).to_have_attribute("data-progress", "34")
        expect(detail).to_have_attribute("data-inventory-id", str(inventory_id))
        expect(active_lands).to_have_count(1)
        next_land = active_lands.and_(detail.locator('[data-slot="7"][data-land-id="1106"]'))
        expect(next_land).to_be_enabled()
        expect(page.locator("#quest-map-settlement")).to_have_count(0)
        expect(treasure).to_have_count(0)
        expect(page.locator("#quest-map-gems")).to_have_text(str(profile[3]))
        expect(page.locator("#quest-map-exp")).to_have_text(str(profile[4]))
        expect(page.locator("#quest-map-energy")).to_have_text(f"{profile[5]}/{profile[6]}", timeout=TIMEOUT)
        assert quest_inventory(database, avatar_id) == stored and quest_deck(database, avatar_id) == locked
        expect(page.locator("#quest-map-back")).to_be_hidden()
        music(page, "quest", "ulbgm03.mp3")
        check_terrain_hover(page, stage, directory, next_land, lands[7]["name"], lands[7]["caption"],
                            "12-return-on-the-same-active-quest.png")
    assert query(database, "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?", avatar_id) == [(21, 0)]
    trace = read_movement_trace(page)
    assert trace["actions"] == [[13, inventory_id, 1], [16, inventory_id, 1, 1], [16, inventory_id, 1, 5]]
    assert trace["readySends"] == [["settled", "complete"]] * 2
    assert [p[0] for p in trace["sent"] if p[0] not in (0, 1, 3, 7, 36, 37, 38, 39)] == [
        12, 13, *(code for group in staged for code in (16, 22, *(p[0] for p in group))),
        *([2] if terminal else []),
    ]
    assert len(live) == 5 and not trace["overlaps"] and all(not peer.is_closed() for peer in live[:4])
    assert live[-1].is_closed() == terminal
    assert [p for p in trace["replies"] if p[0] == 24] == ([[24, 7, 1, inventory_id]] if terminal else [])
    trace["persistedReward"] = {
        "option": choice, "receipt": result[2:], "gemsBeforeEntry": before[3], "expBeforeEntry": before[4],
        "profile": dict(zip(("level", "gems", "exp", "energy", "energyMax"), profile[2:7], strict=True)),
        "questProgress": 2 if terminal else 34, "questInjury": [0 if terminal else 4, 0, 0],
        "deckLocked": (deck if terminal else locked[0])[-1], "inventoryAdded": added,
    }
    if terminal:
        trace["terminalReward"] = {
            "inventoryId": inventory_id, "result": "failed", "archivedStatus": 5, "finishSlot": 5,
            "profileBeforeClaim": dict(zip(("level", "gems", "exp", "energy", "energyMax"), source_profile[2:7], strict=True)),
            "fourCorePeersRetained": all(not peer.is_closed() for peer in live[:4]),
            "checkpoints": checkpoints,
        }
    if choice == "item":
        trace["persistedReward"]["consumables"] = bonus_item_inventory(database, avatar_id)
        trace["retainedRewardMap"] = {
            "inventoryId": int(detail.get_attribute("data-inventory-id")),
            "mapId": int(view.get_attribute("data-map-id")),
            "progress": int(detail.get_attribute("data-progress")),
            "enabledSlot": int(next_land.get_attribute("data-slot")),
            "landId": int(next_land.get_attribute("data-land-id")),
            "backVisible": page.locator("#quest-map-back").is_visible(),
        }
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)
    assert not errors, errors
    if directory is not None:
        (directory / "quest-high-low-wire.json").write_text(json.dumps(trace, indent=2) + "\n")


def check_peaceful_quest(page, origin, database, name, password, directory, kind, gem_slot, complete):
    quest_id, map_id, ap_cost, first_id, stage_id, title, caption, next_lands, battle_slot = PEACEFUL_TERRAINS[kind]
    gem = kind == "gem"
    battle_slot = battle_slot if gem_slot is None else gem_slot
    battle_stage, enemy, foe, battle_title, battle_caption = (3, 301, "1007", "月光下的泥潭1", "住著老蛤蟆的泥潭") if battle_slot == 3 else (
        2, 101, "1001", "通往集落之路1", "小矮人們的通道",
    )
    ((player_id, flags),) = player(database, name)
    (profile,) = avatar(database, player_id)
    avatar_id = profile[0]
    (quest,) = quest_inventory(database, avatar_id)
    assert flags == 0 and profile[5:7] == (4, 5), profile
    injury = 4 if complete == "defeat" else 1
    assert quest[1:3] == (quest_id, 0) and quest[4:] == (0, 1, injury, 0, 0), quest
    map_read = "SELECT quest_flag, quest_clear_num FROM avatars WHERE id = ?"
    assert query(database, map_read, avatar_id) == [(map_id - 1, 0)]
    deck = quest_deck(database, avatar_id)
    parts = equipped_parts(database, avatar_id)
    assert len(deck) == 1 and deck[0][1:] == (STARTER_CARD, 0, 0)
    locked = [deck[0][:3] + (1,)]
    stage, live, errors = open_quest_fixture(page, origin, player_id, name, password)
    page.locator("#lobby-quest-load").click()
    screen(stage, "quest-map")
    view = page.locator("#quest-map-view")
    expect(view).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
    expect(view).to_have_attribute("data-map-id", str(map_id))
    response = page.request.get(f"{origin}/api/quest-catalog?id={quest_id}&map={map_id}")
    assert response.ok
    (source,) = response.json()["quests"]
    positions = {land["slot"]: land for land in source["positions"]}
    first = positions[1]
    assert (source["ap"], first["id"], first["stage"], first["enemyId"], first["eventNo"]) == (ap_cost, first_id, stage_id, 0, 0)
    assert first["emptyTerrain"] is not gem and first["nextSlots"] == list(next_lands)
    assert {slot: positions[slot]["id"] for slot in first["nextSlots"]} == next_lands
    if gem:
        assert first["fixedGemTreasure"] == {"treasureId": 50001, "type": 5, "slotType": 1, "value": 30}
    assert (positions[battle_slot]["enemyId"], positions[battle_slot]["stage"]) == (enemy, battle_stage)

    inventory_id = quest[0]
    detail, before = start_preowned_quest(page, database, player_id, quest, locked, ap_cost=ap_cost)
    first_button = detail.locator(f'button.quest-map-detail-land[data-slot="1"][data-land-id="{first_id}"]')
    active_lands = detail.locator("button.quest-map-detail-land")
    battle = page.locator("#quest-map-battle")
    treasure = page.locator("#quest-map-treasure")
    player_gems = page.locator("#quest-map-gems")
    player_ap = page.locator("#quest-map-energy")
    page.emulate_media(reduced_motion="no-preference")
    expect(first_button).to_be_enabled(timeout=TIMEOUT)
    expect(active_lands).to_have_count(1)
    expect(player_ap).to_have_text(f"{before[5]}/{before[6]}")
    balance_text = player_gems.inner_text()
    original_progress = detail.get_attribute("data-progress")
    first_box = check_terrain_hover(page, stage, directory, first_button, title, caption, "01-first-land-hover.png")
    music(page, "quest", "ulbgm03.mp3")
    page.evaluate("""observeGemBack => {
      const track = document.querySelector('#stage > audio[data-bgm-scene=quest]');
      window.qaTerrainMusic = {track, start: track.currentTime};
      const trace = window.qaQuestWire.sockets.at(-1);
      trace.terrainSounds = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const playback = play.call(this);
        if (this.src.includes('/sound/se/')) {
          void playback.then(() => trace.terrainSounds.push(this.src.split('/').at(-1))).catch(() => {});
        }
        return playback;
      };
      if (observeGemBack) {
        const observer = new MutationObserver(() => {
          const panel = document.querySelector('#quest-map-treasure[data-state=holding]');
          if (!panel) return;
          const back = panel.querySelector('#quest-map-treasure-back');
          window.qaInitialGemHolding = {backVisible: Boolean(back && !back.hidden && back.getClientRects().length),
            okDisabled: panel.querySelector('#quest-map-treasure-ok')?.disabled === true};
          observer.disconnect();
        });
        observer.observe(document.querySelector('#quest-map-view'), {
          subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'],
        });
      }
    }""", gem)
    pre_entry = read_movement_trace(page)
    hold_movement_reply(page, 16, first_button.click, before=[25 if gem else 19])
    expect(view).to_have_attribute("data-adventure-state", "entering")
    expect(detail.locator('#quest-map-detail-pawn[data-slot="1"] img')).to_be_visible()
    expect(active_lands).to_have_count(0)
    expect(battle).to_have_count(0)
    expect(treasure).to_have_count(0)
    expect(player_gems).to_have_text(balance_text)
    assert detail.get_attribute("data-progress") == original_progress
    page.mouse.click(first_box["x"] + first_box["width"] / 2, first_box["y"] + first_box["height"] / 2)
    held = read_movement_trace(page)
    assert held["actions"] == [[13, inventory_id, 1], [16, inventory_id, 1, 1]]
    assert held["terrainSounds"] == []
    before_fence = [[128, 3, 1], [19, 10, inventory_id, 2], [10, 6, before[3] + 30]] if gem else [[128, 3, 1]]
    replies = held["replies"][len(pre_entry["replies"]):]
    assert [packet for packet in replies if packet[0] != 3] == before_fence, replies
    capture(stage, directory, "02-withheld-land-proof.png")

    release_movement_reply(page, next_command=3)
    page.wait_for_function("() => window.qaQuestWire.actionHold.queued.length > 0", timeout=TIMEOUT)
    fenced = read_movement_trace(page)
    expected = [[25, 11, 5, 1, 30]] if gem else [[19, 10, inventory_id, 2]]
    assert fenced["replies"][len(held["replies"]):] == expected
    assert fenced["sent"][len(held["sent"]):] == [[3, 5]]
    expect(active_lands).to_have_count(0)
    expect(treasure).to_have_count(0)
    expect(player_gems).to_have_text(balance_text)
    assert detail.get_attribute("data-progress") == original_progress
    capture(stage, directory, "03-withheld-original-pong.png")
    release_movement_reply(page)
    assert [3, 2] in read_movement_trace(page)["replies"][len(fenced["replies"]):]
    expect(detail).to_have_attribute("data-progress", "2", timeout=TIMEOUT)
    expect(detail.locator('span.quest-map-detail-land[data-cleared="true"][data-slot="1"]')).to_be_visible()
    if gem:
        expect(view).to_have_attribute("data-adventure-state", "terrain-reward")
        expect(active_lands).to_have_count(0)
        check_gem_receipt(page, stage, directory, inventory_id=inventory_id, slot=1, amount=30,
                          balance=before[3] + 30, cue_count=1, capture_back=True)
    else:
        expect(player_gems).to_have_text(balance_text)
        expect(treasure).to_have_count(0)
    expect(view).to_have_attribute("data-adventure-state", "between-lands", timeout=TIMEOUT)
    expect(active_lands).to_have_count(len(next_lands), timeout=TIMEOUT)
    assert active_lands.evaluate_all("lands => lands.map(({dataset}) => [+dataset.slot, +dataset.landId])") == [
        list(pair) for pair in next_lands.items()
    ]
    assert page.evaluate("""() => {
      const {track, start} = window.qaTerrainMusic;
      return track === document.querySelector('#stage > audio[data-bgm-scene=quest]') && !track.paused && track.currentTime > start;
    }""")
    complete_first = read_movement_trace(page)
    assert [p for p in complete_first["sent"][len(pre_entry["sent"]):] if p[0] != 3] == [[16, 11]]
    assert complete_first["terrainSounds"] == (["ulse23.mp3"] if gem else [])
    for selector in ("#quest-map-back", "#quest-map-detail-back", "#quest-map-deck-previous", "#quest-map-deck-next"):
        expect(page.locator(selector)).to_be_hidden()
    expect(page.locator("#quest-map-settlement")).to_have_count(0)
    expect(player_ap).to_have_text(f"{before[5]}/{before[6]}")
    capture(stage, directory, "05-retained-quest-route.png")

    next_button = detail.locator(f'button.quest-map-detail-land[data-slot="{battle_slot}"]')
    check_terrain_hover(page, stage, directory, next_button, battle_title, battle_caption, "06-next-land-hover.png")
    hold_movement_reply(page, 16, next_button.click, through=37)
    opening = read_movement_trace(page)
    arrival = [p for p in opening["replies"][len(complete_first["replies"]):] if p[0] != 3]
    assert [p[0] for p in arrival] == [128, 37] and arrival[0] == [128, 3, battle_slot], arrival
    assert arrival[1][2:] == [-1, "CPU", "21", foe, battle_stage, injury, 0, 0, 0, 0, 0], arrival
    expect(battle).to_have_count(0)
    assert all(p[0] != 22 for p in opening["sent"])
    assert opening["terrainSounds"] == complete_first["terrainSounds"]
    capture(stage, directory, "07-withheld-battle-opening.png")
    release_movement_reply(page)
    expect(battle).to_have_attribute("data-stage", str(battle_stage), timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-land-slot", str(battle_slot))
    expect(battle).to_have_attribute("data-encounter-key", f"{inventory_id}:{battle_slot}")
    music(page, "quest-duel", f"bgm{battle_stage:03d}.mp3")
    art = page.request.get(f"{origin}/source-login/quest-art/sources.json")
    assert art.ok
    layers = {layer["file"] for layer in art.json()["battle"]["stages"][str(battle_stage)]["layers"]}
    assert layers <= set(battle.locator("img").evaluate_all("images => images.map(image => image.src.split('/').at(-1))"))
    wait_quest_art(page)
    far_band = battle.locator(".quest-battle-far-band")
    if battle_stage == 2:
        expect(far_band.locator('img[src$="quest-battle-stage02-far.png"]')).to_have_count(2)
        duration, initial_x = far_band.evaluate("""band => [band.getAnimations()[0].effect.getTiming().duration,
          new DOMMatrixReadOnly(getComputedStyle(band).transform).m41]""")
        assert isclose(duration, 760 * 1000 / 20.4)
        page.wait_for_function("""x => new DOMMatrixReadOnly(getComputedStyle(
          document.querySelector('.quest-battle-far-band')).transform).m41 < x""", arg=initial_x)
    else:
        expect(far_band).to_have_count(0)
    capture(stage, directory, "08-authoritative-battle-opening.png", animations="allow")
    expect(battle).to_have_attribute("data-phase", "move", timeout=TIMEOUT)
    expect(battle).to_have_attribute("data-turn", "1")
    expect(battle.locator("#quest-battle-player-hp")).to_have_attribute("data-hp", str(7 - injury))
    expect(battle.locator("#quest-battle-opponent-hp")).to_have_attribute("data-hp", "3")
    trace = read_movement_trace(page)
    assert len(live) == 5 and all(not peer.is_closed() for peer in live) and not trace["overlaps"]
    assert trace["readySends"] == [["settled", "complete"]]
    assert trace["actions"] == [[13, inventory_id, 1], [16, inventory_id, 1, 1], [16, inventory_id, 1, battle_slot]]
    assert [p for p in trace["sent"] if p[0] not in (0, 1, 3)] == [[12, 10], [13, 10], [16, 11], [16, 11], [22, 5]]
    authored = [p for p in trace["replies"][len(opening["replies"]):] if p[0] in (40, 43, 44, 45, 46)]
    assert [p[0] for p in authored] == [40, 43, 44, 45, 46] and authored[1] == [43, 3, 1], authored
    assert quest_inventory(database, avatar_id) == [quest[:2] + (2, quest[3], 2, *quest[5:])]
    assert quest_deck(database, avatar_id) == locked and equipped_parts(database, avatar_id) == parts
    assert query(database, map_read, avatar_id) == [(map_id - 1, 0)]
    assert avatar(database, player_id) == [before[:3] + (before[3] + (30 if gem else 0),) + before[4:]]
    capture(stage, directory, "09-authoritative-battle-move.png", animations="allow")
    if complete:
        staged_award = None
        if gem:
            route_check = check_q32_left_route if battle_slot == 3 else check_q32_right_route
            staged_award = route_check(page, stage, directory, database, player_id, quest, deck, locked, trace, positions)
        else:
            check_q4_terminal(page, stage, directory, database, player_id, quest, deck, injury, complete)
        assert all(not peer.is_closed() for peer in live[:4])
        terminal_avatar = avatar(database, player_id)[0]
        terminal_map = query(database, map_read, avatar_id)[0]
        archived = query(database, """
            SELECT status, progress, deck_index, hp0, hp1, hp2
            FROM avatar_quest_inventories WHERE id = ?
        """, inventory_id)
        assert len(archived) == 1
        page.locator("#quest-map-back").click()
        screen(stage, "lobby")
        trace = read_movement_trace(page)
        assert len(live) == 5 and all(not peer.is_closed() for peer in live[:4])
        assert trace["close"] == [1000, True] and [p for p in trace["sent"] if p[0] == 2] == [[2, 5]]
        check_receipt_ap(page, "lobby", avatar(database, player_id)[0])
        assert equipped_parts(database, avatar_id) == parts and quest_deck(database, avatar_id) == deck
        trace["persistedAtReturn"] = {
            "avatar": dict(zip(("level", "gems", "exp", "energy", "energyMax"), terminal_avatar[2:7], strict=True)),
            "region": dict(zip(("flag", "clears"), terminal_map, strict=True)),
            "archive": dict(zip(("status", "progress", "deckIndex", "hp0", "hp1", "hp2"), archived[0], strict=True)),
            "deckLock": quest_deck(database, avatar_id)[0][-1],
        }
        if staged_award is not None:
            trace["physicalCardAward"] = staged_award
        capture(stage, directory, "lobby-after-original-quest-close.png")
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)
    assert not errors, errors
    if directory is not None:
        (directory / "10-peaceful-terrain-wire.json").write_text(json.dumps(trace, indent=2) + "\n")


def check_button_hover(page, button):
    # The dedicated game fixture is centered in its matching 780×680 viewport.
    page.mouse.move(770, 340)
    resting = button.evaluate("element => getComputedStyle(element).backgroundColor")
    button.hover()
    assert button.evaluate("element => getComputedStyle(element).backgroundColor") != resting
    page.mouse.move(770, 340)
    expect(button).to_have_css("background-color", resting)


def check_hover_timing(motion, symbol):
    frames, intro = LOBBY_HOVER_TIMELINES[symbol]
    frame_ms = 1000 / 24
    samples = [(0.75, 0), (1.25, 1), (frames - 0.25, frames - 1), (frames + 0.25, intro)]
    if intro:
        samples.extend([(intro - 0.25, intro - 1), (intro + 0.25, intro), (frames + 1.25, intro + 1)])
    result = motion.evaluate("""(image, times) => {
      const animations = image.getAnimations();
      const timing = animations.map(animation => {
        const { duration, delay, iterations } = animation.effect.getTiming();
        animation.pause();
        return { duration, delay, repeats: iterations === Infinity };
      });
      const height = image.parentElement.offsetHeight;
      const frames = times.map(time => {
        for (const animation of animations) animation.currentTime = time;
        const transform = getComputedStyle(image).transform;
        return transform === 'none' ? 0 : -new DOMMatrixReadOnly(transform).m42 / height;
      });
      return { timing, frames };
    }""", [point * frame_ms for point, _ in samples])
    expected_phases = [((frames - intro) * frame_ms, intro * frame_ms, True)]
    if intro:
        expected_phases.insert(0, (intro * frame_ms, 0, False))
    assert len(result["timing"]) == len(expected_phases), (symbol, result)
    for actual, (duration, delay, repeats) in zip(result["timing"], expected_phases):
        assert isclose(actual["duration"], duration, abs_tol=0.01), (symbol, actual)
        assert isclose(actual["delay"], delay, abs_tol=0.01) and actual["repeats"] == repeats, (symbol, actual)
    assert result["frames"] == [frame for _, frame in samples], (symbol, result["frames"])


def lobby_screenshot_pixels(page, clip, points):
    image = page.screenshot(clip=clip, scale="css", animations="disabled")
    return page.evaluate("""async ({png, points}) => {
      const frame = await createImageBitmap(new Blob([Uint8Array.from(png)], {type: 'image/png'}));
      const context = new OffscreenCanvas(frame.width, frame.height).getContext('2d');
      context.drawImage(frame, 0, 0);
      frame.close();
      return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3));
    }""", {"png": list(image), "points": points})


def check_lobby_hover(page, stage, directory):
    lobby = page.locator("#lobby-view")
    expect(lobby).to_have_attribute("data-hover-art", "ready", timeout=TIMEOUT)
    entries = lobby.locator("li:has(> .lobby-art-over)")
    expect(entries).to_have_count(len(LOBBY_ENTRY_SYMBOLS | LOBBY_SIDE_SYMBOLS))
    assert set(entries.evaluate_all("items => items.map(item => item.dataset.symbol)")) == (
        LOBBY_ENTRY_SYMBOLS | LOBBY_SIDE_SYMBOLS
    )

    box = stage.bounding_box()
    outside_entries = (box["x"] + 770, box["y"] + 340)
    page.mouse.move(*outside_entries)
    page.locator("#lobby-title").focus()
    header = {"x": box["x"] + 300, "y": box["y"], "width": 460, "height": 1}
    gutter = {"x": box["x"] + 779, "y": box["y"], "width": 1, "height": 680}
    assert lobby_screenshot_pixels(page, header, [(0, 0), (459, 0)]) == [[58, 76, 86], [41, 41, 44]]
    assert lobby_screenshot_pixels(page, gutter, [(0, y) for y in (0, 160, 320, 640, 679)]) == [
        [15, 15, 15], [11, 11, 11], [7, 7, 7], [0, 0, 0], [0, 0, 0],
    ]
    capture(stage, directory, "11-lobby.png")
    if directory is not None:
        page.screenshot(path=directory / "11d-lobby-hud.png", scale="css", animations="disabled",
                        clip={"x": box["x"] + 646, "y": box["y"] + 605, "width": 124, "height": 75})
    for entry in entries.all():
        symbol = entry.get_attribute("data-symbol")
        if symbol not in {"btn_b", "btn_h"}:
            expect(entry.locator("button, a[href], [role='button'], [tabindex]")).to_have_count(0)
        up = entry.locator(".lobby-art-up")
        over = entry.locator(".lobby-art-over")
        expect(up).to_be_visible()
        expect(over).to_be_hidden()
        clip = entry.bounding_box()
        resting = page.screenshot(clip=clip, scale="css", animations="disabled")
        entry.hover()
        expect(up).to_be_hidden()
        expect(over).to_be_visible()
        if symbol in LOBBY_HOVER_TIMELINES:
            motion = entry.locator(".lobby-art-motion")
            expect(motion).to_have_count(1)
            expect(motion).to_be_hidden()
        assert page.screenshot(clip=clip, scale="css", animations="disabled") != resting, symbol
        if symbol == "btn_b":
            capture(stage, directory, "11c-lobby-quest-hover.png")
        page.mouse.move(*outside_entries)
        expect(up).to_be_visible()
        expect(over).to_be_hidden()
        assert page.screenshot(clip=clip, scale="css", animations="disabled") == resting, symbol

    quest = page.locator("#lobby-quest-load")
    quest_over = lobby.locator("[data-symbol='btn_b'] .lobby-art-over")
    page.locator("#lobby-title").focus()
    page.keyboard.press("Tab")
    expect(quest).to_be_focused()
    expect(quest_over).to_be_visible()
    expect(page.locator("#lobby-quest")).to_be_hidden()
    page.locator("#lobby-title").focus()
    expect(quest_over).to_be_hidden()

    page.emulate_media(reduced_motion="no-preference")
    for symbol in sorted(LOBBY_HOVER_TIMELINES):
        entry = lobby.locator(f"[data-symbol='{symbol}']")
        motion = entry.locator(".lobby-art-motion")
        entry.hover()
        expect(motion).to_be_visible()
        clip = entry.bounding_box()
        first_frame = page.screenshot(clip=clip, scale="css")
        deadline = monotonic() + 2
        while page.screenshot(clip=clip, scale="css") == first_frame:
            assert monotonic() < deadline, f"{symbol} artwork did not animate on hover"
            page.wait_for_timeout(40)
        assert entry.evaluate("item => item.matches(':hover')"), symbol
        if symbol == "btn_b" and directory is not None:
            stage.screenshot(path=directory / "11e-lobby-quest-motion.png", scale="css")
        check_hover_timing(motion, symbol)
        page.mouse.move(*outside_entries)
        expect(motion).to_be_hidden()
        assert motion.evaluate("image => image.getAnimations().length") == 0, symbol
    page.emulate_media(reduced_motion="reduce")


def check_option_values(page, settings):
    for name in ("bgm", "se", "cv"):
        expect(page.locator(f"#option-{name}")).to_have_value(str(settings[name]))
    assert page.locator("#option-tooltip").is_checked() == settings["toolTip"]
    assert page.locator("#option-arrow").is_checked() == settings["arrow"]


def check_options_scene(page, stage, profile, parts, portrait, directory, *, edit):
    launcher = page.locator("#lobby-option-open")
    audio = page.locator("#stage > audio[data-bgm-scene='lobby']")
    clock = audio.evaluate("""element => {
      window.optionSessionMusic = element;
      window.optionAudioBreaks = [];
      for (const type of ['pause', 'play', 'loadstart', 'seeking', 'emptied']) {
        element.addEventListener(type, () => window.optionAudioBreaks.push(type));
      }
      return element.currentTime;
    }""")
    settings = OPTION_DEFAULTS if edit else OPTION_EDITS
    expect(audio).to_have_js_property("volume", settings["bgm"] / 100)
    if edit:
        page.emulate_media(reduced_motion="no-preference")
    launcher.click()
    if edit:
        expect(stage).to_have_attribute("data-option-transition", "to-options")
        assert page.locator("#lobby-view").evaluate("node => node.inert && node.getAnimations().some(a => "
                                                      "Math.abs(a.effect.getTiming().duration - 800 / 1.7) < .01)")
    screen(stage, "options")
    expect(stage).to_have_attribute("data-soundscape", "lobby")
    expect(page.locator("#lobby-view")).to_be_hidden()
    title = page.locator("#options-title")
    expect(title).to_be_visible()
    assert "Option" in title.inner_text() and "選項設定" in title.inner_text()
    back = page.locator("#options-back")
    assert back.bounding_box() == {"x": 712, "y": 0, "width": 48, "height": 32}
    assert page.locator("#options-help").bounding_box() == {"x": 230, "y": 100, "width": 300, "height": 100}
    assert page.locator("#options-sound").bounding_box() == {"x": 230, "y": 210, "width": 300, "height": 275}
    check_option_values(page, settings)

    canvas = page.locator("#options-avatar")
    expect(canvas).to_have_attribute("data-avatar-state", "ready", timeout=TIMEOUT)
    expect(canvas).to_have_attribute("data-avatar-parts", ",".join(map(str, parts)))
    assert portrait_sha(canvas) == portrait
    _, name, level, gems, exp, ap, ap_max, stars = profile
    for field, value in (("avatar-name", name), ("level", level), ("gems", gems), ("exp", exp),
                         ("energy", f"{ap}/{ap_max}"), ("free-duel-count", stars)):
        expect(page.locator(f"#options-{field}")).to_have_text(str(value))
    expect(page.locator("#options-free-duel-stars")).to_have_attribute("src", f"{LOBBY_ART_PATH}duel-stars-{stars}.png")
    page.wait_for_function("""() => document.querySelector('#options-view').getAnimations({subtree: true})
      .every(a => a.playState !== 'running' || a.effect.getTiming().iterations === Infinity)""", timeout=TIMEOUT)
    assert canvas.bounding_box() == {"x": 525, "y": 230, "width": 290, "height": 450}

    if edit:
        capture(stage, directory, "11f-options-default.png")
        slider = page.locator("#option-bgm")
        box = slider.bounding_box()
        y = box["y"] + box["height"] / 2
        page.mouse.move(box["x"] + box["width"] / 2, y)
        page.mouse.down()
        page.mouse.move(box["x"] + 1, y, steps=9)
        page.mouse.up()
        page.locator("#option-se").press("End")
        page.locator("#option-se").press("ArrowLeft")
        page.locator("#option-cv").press("Home")
        page.locator("#option-cv").press("ArrowRight")
        page.locator("#option-tooltip").uncheck()
        page.locator("#option-arrow").uncheck()
        check_option_values(page, OPTION_EDITS)
        capture(stage, directory, "11g-options-edited.png")
    else:
        capture(stage, directory, "13a-options-persisted.png")
    assert page.evaluate("key => JSON.parse(localStorage.getItem(key))", OPTION_STORAGE) == OPTION_EDITS
    back.press("Enter")
    if edit:
        expect(stage).to_have_attribute("data-option-transition", "to-lobby")
        assert page.locator("#options-view").evaluate("node => node.inert && node.getAnimations().some(a => "
                                                        "Math.abs(a.effect.getTiming().duration - 1000 - 500 / 1.7) < .01)")
    screen(stage, "lobby")
    expect(launcher).to_be_focused()
    expect(page.locator("#lobby-news")).to_be_hidden()
    page.wait_for_function("""time => {
      const audio = window.optionSessionMusic;
      return audio === document.querySelector('#stage > audio[data-bgm-scene=lobby]') && !audio.paused
        && audio.loop && audio.volume === 0 && audio.currentTime > time;
    }""", arg=clock, timeout=TIMEOUT)
    assert not page.evaluate("window.optionAudioBreaks")
    if edit:
        page.emulate_media(reduced_motion="reduce")


def check(page, origin, database, directory, selected_parts, *, verify_login_rose):
    name = "flowqa" + token_hex(5)
    password = token_hex(8)
    avatar_name = "夜行者" + token_hex(3).translate(str.maketrans("0123456789abcdef", "零一二三四五六七八九甲乙丙丁戊己"))
    assert not player(database, name)
    _, sockets, errors = observe(page)
    requests, responses, live = [], [], []
    page.on("request", lambda request: requests.append(request))
    page.on("response", lambda response: responses.append(response))
    page.on("websocket", lambda socket: live.append(socket))
    observe_session_codec(page, origin)
    observe_quest_wire(page)
    assert page.goto(origin + ENTRY, wait_until="domcontentloaded").ok
    stage = page.locator("#stage")
    screen(stage, "title")
    expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
    expect(page.locator("#stage-background")).to_have_attribute("data-title-state", "ready")
    expect(page.locator("#news-content li")).to_have_count(3)
    title = page.locator("#login-title")
    status = page.locator("#login-status")
    username = page.locator("#username")
    secret = page.locator("#password")
    submit = page.locator("#login-submit")
    mode = page.locator("#account-mode")
    confirmation = page.locator("#confirm-password")
    notice = page.locator("#login-alert")
    notice_title = page.locator("#login-alert-title")
    notice_message = page.locator("#login-alert-message")
    notice_ok = page.locator("#login-alert-ok")
    capture(stage, directory, "01-title.png")

    def submit_registration(account_name, account_password):
        username.fill(account_name)
        page.locator("#email").fill("test@example.invalid")
        secret.fill(account_password)
        confirmation.fill(account_password)
        submit.click()

    def account_registered():
        expect(notice).to_have_attribute("data-kind", "registration-success", timeout=TIMEOUT)
        expect(notice).to_be_visible()
        expect(notice_title).to_have_text("登錄完畢")
        expect(notice_message).to_have_text("登錄成功")
        expect(notice_ok).to_be_focused()
        expect(title).to_have_text("Register")
        expect(submit).to_be_disabled()
        expect(secret).to_have_value("")
        expect(confirmation).to_have_value("")

    mode.click()
    expect(title).to_have_text("Register")
    capture(stage, directory, "02-account-registration.png")
    submit_registration(name, password)
    account_registered()
    expect(username).to_have_value(name)
    account_registration_traffic(sockets, live, 0, 0)
    ((player_id, flags),) = player(database, name)
    assert not flags and not avatar(database, player_id)
    capture(stage, directory, "02-account-registration-complete.png")

    def sign_in():
        start = len(sockets)
        username.fill(name)
        secret.fill(password)
        submit.click()
        return start

    def reload_title():
        assert page.reload(wait_until="domcontentloaded").ok
        screen(stage, "title")
        expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
        expect(secret).to_have_value("")
        wait_logout(page, database, player_id)

    if verify_login_rose:
        music(page, "title", "ulbgm01.mp3")
        page.locator("#stage > audio[data-bgm-scene='title']").evaluate("""audio => {
          window.outgoingTitleMusic = audio;
          window.titleFadeVolumes = [audio.volume];
          audio.addEventListener('volumechange', () => window.titleFadeVolumes.push(audio.volume));
        }""")
        page.emulate_media(reduced_motion="no-preference")
    first = len(sockets)
    if verify_login_rose:
        notice_ok.click()
    else:
        notice_ok.press("Escape")
    expect(notice).to_be_hidden()
    if verify_login_rose:
        expect(stage).to_have_attribute("data-login-transition", "rose", timeout=TIMEOUT)
        expect(page.locator("#stage-background[data-loading-frame]")).to_be_visible()
        expect(status).to_be_hidden()
        if directory is not None and stage.get_attribute("data-login-transition") == "rose":
            rose_frame = stage.screenshot(scale="css")
            if stage.get_attribute("data-login-transition") == "rose":
                (directory / "02a-original-login-rose.png").write_bytes(rose_frame)
    screen(stage, "onboarding")
    if verify_login_rose:
        page.emulate_media(reduced_motion="reduce")
    onboarding = page.locator("#onboarding")
    expect(onboarding).to_have_attribute("data-step", "intro")
    expect(page.locator("#login")).to_be_hidden()
    active_session_traffic(sockets, live, first, player_id)
    music(page, "onboarding", "ulbgm01.mp3")
    if verify_login_rose:
        assert page.locator("#stage > audio[data-bgm-scene='onboarding']").evaluate(
            "audio => audio !== window.outgoingTitleMusic && audio.volume === 0.5"
        )
        page.wait_for_function("() => window.outgoingTitleMusic.paused && window.outgoingTitleMusic.volume === 0", timeout=TIMEOUT)
        levels = list(dict.fromkeys(round(level, 2) for level in page.evaluate("window.titleFadeVolumes")))
        assert levels == [round(step / 20, 2) for step in range(10, -1, -1)], levels
    capture(stage, directory, "03-first-login-guidance.png")

    page.locator("#onboarding-start").click()
    expect(onboarding).to_have_attribute("data-step", "name")
    character_name = page.locator("#onboarding-name")
    expect(character_name).to_be_focused()
    capture(stage, directory, "04-character-name.png")
    character_name.fill(avatar_name)
    page.locator("#onboarding-next").click()
    expect(onboarding).to_have_attribute("data-step", "appearance", timeout=TIMEOUT)
    assert not avatar(database, player_id), "A name check created the avatar"
    for index, part in enumerate(selected_parts):
        page.locator(f"#onboarding-part-{index}").select_option(str(part))
        preview = page.locator(f"#onboarding-preview-{index}")
        expect(preview).to_have_attribute("src", f"/source-login/assets/starter-parts/{part}")
        expect(preview).to_be_visible()
        assert preview.evaluate("image => image.complete && image.naturalWidth === 128")
    capture(stage, directory, "05-character-appearance.png")

    page.locator("#onboarding-next").click()
    expect(onboarding).to_have_attribute("data-step", "starter")
    page.locator("#onboarding-card").select_option(str(STARTER_CARD))
    portrait = page.locator("#onboarding-card-portrait")
    expect(portrait).to_have_attribute("src", f"/source-login/assets/starter-cards/{STARTER_CARD}")
    expect(portrait).to_be_visible()
    assert portrait.evaluate("image => image.complete && image.naturalWidth === 379 && image.naturalHeight === 468")
    capture(stage, directory, "06-character-starter.png")
    assert not avatar(database, player_id), "Previewing starter choices created the avatar"
    page.locator("#onboarding-create").click()
    expect(onboarding).to_have_attribute("data-step", "tutorial", timeout=TIMEOUT)
    expect(onboarding).to_have_attribute("data-chapter", "0")
    (profile,) = avatar(database, player_id)
    assert profile[1] == avatar_name
    verify_starter(database, profile[0], selected_parts)
    assert len(sockets) == first + 4 and all(not socket.is_closed() for socket in live[first:])
    music(page, "tutorial", "bgm011.mp3")
    capture(stage, directory, "07-avatar-created-guidance.png")

    tutorial_next = page.locator("#onboarding-tutorial-next")
    for chapter, filename in enumerate(("08-task-guidance.png", "09-battle-guidance.png", "10-guidance-complete.png"), 1):
        tutorial_next.click()
        expect(onboarding).to_have_attribute("data-chapter", str(chapter))
        capture(stage, directory, filename)
    tutorial_next.click()
    screen(stage, "lobby")
    check_lobby(page, player_id, profile)
    expect(onboarding).to_be_hidden()
    close_lobby_news(page, stage, directory)
    assert not quest_inventory(database, profile[0])
    check_quest_scene(page, stage, directory, database, player_id, profile, sockets, live, animate=verify_login_rose)
    parts = equipped_parts(database, profile[0])
    first_portrait = check_avatar_canvas(page, stage, parts, responses)
    assert sorted(page.locator("#lobby-view button:visible").evaluate_all("nodes => nodes.map(node => node.id)")) == [
        "lobby-option-open", "lobby-quest-load",
    ]
    assert len(sockets) == first + 5 and all(not socket.is_closed() for socket in live[first:first + 4])
    assert query(database, "SELECT tutorial FROM players WHERE id = ?", player_id) == [(0,)]
    music(page, "lobby", "ulbgm02.mp3")
    hover_start = len(requests)
    check_lobby_hover(page, stage, directory)
    hover_requests = {urlsplit(request.url).path for request in requests[hover_start:]}
    assert hover_requests <= {"/public/sound/bgm/ulbgm02.mp3"}, sorted(hover_requests)
    assert len(sockets) == first + 5 and all(not socket.is_closed() for socket in live[first:first + 4])

    def verify_options(*, edit, session_start):
        wait_refresh_cooldown(page)
        socket_count = len(sockets)
        # Reload can dispose the observer before the old document reports its closures.
        active = range(session_start, session_start + 4)
        sent_before = [len(sockets[index][1]) for index in active]
        request_start = len(requests)
        page.evaluate("() => { window.refreshQASends = []; }")
        check_options_scene(page, stage, profile, parts, first_portrait, directory, edit=edit)
        assert avatar(database, player_id) == [profile] and equipped_parts(database, profile[0]) == parts
        check_lobby(page, player_id, profile)
        assert check_avatar_canvas(page, stage, parts, responses) == first_portrait
        assert len(sockets) == len(live) == socket_count and all(not live[index].is_closed() for index in active)
        refresh_packets = []
        for start, index in zip(sent_before, active):
            url, sent, _ = sockets[index]
            if urlsplit(url).path == "/socket/12002":
                refresh_packets = sent[start:]
            else:
                assert len(sent) == start
        assert 1 <= len(refresh_packets) <= 2 and all(frame[:2] == b"\x00\x02" and len(frame) == 5
                                                     and frame[-1:] == b"\n" for frame in refresh_packets)
        assert page.evaluate("window.refreshQASends") == [LOBBY_REFRESH] * len(refresh_packets)
        page.evaluate("() => { window.refreshQASends = null; }")
        assert all(request.method == "GET" for request in requests[request_start:])
        if edit:
            capture(stage, directory, "11h-lobby-returned-from-options.png")

    if verify_login_rose:
        verify_options(edit=True, session_start=first)
    reload_title()
    username.click()
    music(page, "title", "ulbgm01.mp3")
    capture(stage, directory, "12-return-to-title.png")

    stage.evaluate("""stage => {
      window.reloginScreens = [stage.dataset.screen];
      new MutationObserver(changes => {
        window.reloginScreens.push(...changes.map(change => change.oldValue), stage.dataset.screen);
      }).observe(stage, { attributes: true, attributeFilter: ['data-screen'], attributeOldValue: true });
    }""")
    second = sign_in()
    screen(stage, "lobby")
    check_lobby(page, player_id, profile)
    expect(onboarding).to_be_hidden()
    close_lobby_news(page, stage, None)
    assert "onboarding" not in page.evaluate("window.reloginScreens")
    active_session_traffic(sockets, live, second, player_id)
    assert avatar(database, player_id) == [profile]
    verify_starter(database, profile[0], selected_parts)
    assert check_avatar_canvas(page, stage, equipped_parts(database, profile[0]), responses) == first_portrait
    music(page, "lobby", "ulbgm02.mp3")
    capture(stage, directory, "13-direct-lobby-after-login.png")
    if verify_login_rose:
        verify_options(edit=False, session_start=second)
        check_quest_position_catalog(page, origin)
    profile = check_instant_quest_search(
        page, stage, directory, database, player_id, profile, live, second, drop_reply=verify_login_rose,
    )
    reload_title()

    checked_passwords = [password]
    if not verify_login_rose:
        start = len(sockets)
        mode.click()
        submit_registration(name, password)
        expect(notice).to_have_attribute("data-kind", "registration-error")
        expect(notice).to_be_visible()
        expect(notice_title).to_have_text("Error")
        expect(notice_message).to_have_text("在以下的註冊項目裏有錯誤\n「名字無效」")
        assert notice.bounding_box()["height"] == 150
        expect(status).to_have_attribute("data-error-kind", "account-name-taken")
        capture(stage, directory, "14-account-registration-rejected.png")
        notice_ok.click()
        expect(notice).to_be_hidden()
        expect(title).to_have_text("Register")
        expect(username).to_be_focused()
        account_registration_traffic(sockets, live, start, 1)
        assert player(database, name) == [(player_id, 0)] and avatar(database, player_id) == [profile]

        abandoned_name, abandoned_password = "flowqa" + token_hex(5), token_hex(8)
        checked_passwords.append(abandoned_password)
        start = len(sockets)
        submit_registration(abandoned_name, abandoned_password)
        account_registered()
        account_registration_traffic(sockets, live, start, 0)
        assert page.reload(wait_until="domcontentloaded").ok
        screen(stage, "title")
        expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
        expect(notice).to_be_hidden()
        expect(title).to_have_text("Login")
        expect(username).to_have_value("")
        expect(secret).to_have_value("")
        account_registration_traffic(sockets, live, start, 0)
        ((abandoned_id, flags),) = player(database, abandoned_name)
        assert not flags and not avatar(database, abandoned_id)

    assert page.url == origin + ENTRY and not errors, errors
    expected_documents = 3 if verify_login_rose else 4
    assert [request.url for request in requests if request.resource_type == "document"] == [origin + ENTRY] * expected_documents
    assert all(urlsplit(request.url).netloc == urlsplit(origin).netloc for request in requests)
    ensure_no_password(requests, sockets, checked_passwords)
    return first_portrait


def check_ap_recovery(page, origin, database, name, password, directory):
    server = database.parent.parent
    if database != server / "data/game_dev2.db" or not (server / ".legacy-server-staging").is_file():
        raise ValueError("AP recovery requires a disposable Ruby stage created by run.py")
    ((player_id, flags),) = player(database, name)
    (before,) = avatar(database, player_id)
    assert flags == 0 and before[5:7] == (4, 5), "Use a signed-out --playtest-first-quest fixture"
    sockets = []
    page.on("websocket", lambda socket: sockets.append(socket))
    observe_session_codec(page, origin)

    assert page.goto(origin + ENTRY, wait_until="domcontentloaded").ok
    stage = page.locator("#stage")
    expect(stage).to_have_attribute("data-entry", "ready", timeout=TIMEOUT)
    page.locator("#username").fill(name)
    page.locator("#password").fill(password)
    page.locator("#login-submit").click()
    screen(stage, "lobby")
    close_lobby_news(page, stage, None)
    expect(page.locator("#lobby-energy")).to_have_text("4/5")
    (before,) = avatar(database, player_id)
    assert before[5:7] == (4, 5)
    parts = equipped_parts(database, before[0])
    portrait = page.locator("#lobby-avatar")
    expect(portrait).to_have_attribute("data-avatar-state", "ready")
    image = portrait_sha(portrait)
    wait_refresh_cooldown(page)

    # Only arm the existing Ruby recovery rule. The next authenticated Lobby command restores AP.
    run(["ruby", "-e", """
        $SERVER_NAME = 'legacy-lobby-refresh-check'
        require ARGV.shift
        include Unlight
        player = Player.first(name: ARGV.fetch(0))
        abort 'Expected an authenticated fixture player.' unless player && (player.state & 1) == 1
        avatar = Avatar.first(player_id: player.id)
        abort 'Expected exactly 4/5 AP.' unless avatar&.energy == 4 && avatar.energy_max == 5
        seconds = avatar.get_recovery_interval
        abort 'Missing original recovery interval.' unless seconds > 0
        avatar.last_recovery_at = Time.now.utc - seconds - 2
        avatar.save_changes
    """, "--", str(Path(__file__).resolve().parents[1] / "legacy-server/isolated_server.rb"), name],
        cwd=server, env={**os.environ, "UNLIGHT_LEGACY_STAGE": str(server), "TZ": "UTC"}, check=True, timeout=30)
    assert avatar(database, player_id) == [before]
    capture(stage, directory, "ap-recovery-before.png")
    page.evaluate("() => { window.refreshQASends = []; }")
    page.locator("#lobby-option-open").click()
    screen(stage, "options")
    expect(page.locator("#options-energy")).to_have_text("5/5", timeout=TIMEOUT)
    assert page.evaluate("window.refreshQASends") == [LOBBY_REFRESH]
    portrait = page.locator("#options-avatar")
    expect(portrait).to_have_attribute("data-avatar-state", "ready")
    assert portrait_sha(portrait) == image
    assert avatar(database, player_id) == [before[:5] + (5,) + before[6:]]
    assert equipped_parts(database, before[0]) == parts
    assert len(sockets) == 4 and {urlsplit(socket.url).path for socket in sockets} == SESSION_PORTS
    assert all(not socket.is_closed() for socket in sockets)
    capture(stage, directory, "ap-recovery-options.png")
    page.locator("#options-back").click()
    screen(stage, "lobby")
    expect(page.locator("#lobby-energy")).to_have_text("5/5")
    assert page.reload(wait_until="domcontentloaded").ok
    wait_logout(page, database, player_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4389)
    parser.add_argument("--database", type=lambda path: Path(path).resolve(), required=True,
                        help="SQLite database of the disposable Ruby stage")
    parser.add_argument("--screens", type=Path, help="Save verified 780×680 screenshots in this directory")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    fixture = parser.add_mutually_exclusive_group()
    fixture.add_argument("--refresh-user", help="Only check AP recovery for a --playtest-first-quest fixture at 4/5 AP")
    fixture.add_argument("--quest-user", help="Only check Quest entry and cancel for a disposable discovered/pending fixture")
    fixture.add_argument("--quest-start-user", help="Check start through first combat exchange for a disposable empty Quest fixture")
    parser.add_argument("--refresh-password-file", type=Path, help="Private password file for --refresh-user")
    parser.add_argument("--quest-password-file", type=Path, help="Private password file for --quest-user")
    parser.add_argument("--quest-start-password-file", type=Path, help="Private password file for --quest-start-user")
    parser.add_argument("--quest-start-fault", choices=("start", "land", "ready", "move", "combat"),
                        help="Withhold the genuine reply to one original request through its timeout")
    parser.add_argument("--quest-next-turn", action="store_true",
                        help="Hold the genuine role switch and next Move through two exchanges on the same Quest")
    parser.add_argument("--quest-next-land", action="store_true",
                        help="Use an owned q3 fixture to verify both encounters on the retained original Quest")
    parser.add_argument("--quest-complete-q3", action="store_true",
                        help="Use an owned q3 fixture to win both battles and hold the genuine fixed treasure reply")
    parser.add_argument("--quest-peaceful", choices=("empty", "gem"),
                        help="Hold the original q4 empty terrain or q32 fixed Gem proof before the next battle")
    parser.add_argument("--quest-peaceful-gem-slot", choices=(3, 5), type=int,
                        help="Choose the left or right authored q32 battle; defaults to slot 5")
    parser.add_argument("--quest-peaceful-complete", choices=("win", "defeat"),
                        help="Complete q4 or either q32 branch with the source-seeded disposable fixture")
    parser.add_argument("--quest-high-low", choices=("get", "high", "low", "item", "terminal-get", "terminal-exit"),
                        help="Verify q568 source bonus receipts, optionally with consumables or terminal Quest failure")
    parser.add_argument("--quest-terminal", choices=("return", "late", "defeat"),
                        help="Complete a stock duel and verify settlement or its delayed original SC24")
    args = parser.parse_args()
    if (args.refresh_user is None) != (args.refresh_password_file is None):
        parser.error("--refresh-user and --refresh-password-file must be supplied together")
    if (args.quest_user is None) != (args.quest_password_file is None):
        parser.error("--quest-user and --quest-password-file must be supplied together")
    if (args.quest_start_user is None) != (args.quest_start_password_file is None):
        parser.error("--quest-start-user and --quest-start-password-file must be supplied together")
    if args.quest_start_fault is not None and args.quest_start_user is None:
        parser.error("--quest-start-fault requires --quest-start-user")
    if args.quest_next_turn and (args.quest_start_user is None or args.quest_start_fault is not None):
        parser.error("--quest-next-turn requires --quest-start-user without --quest-start-fault")
    if args.quest_terminal and (not args.quest_start_user or args.quest_start_fault or args.quest_next_turn):
        parser.error("--quest-terminal requires --quest-start-user and its own case")
    if args.quest_next_land and (not args.quest_start_user or args.quest_start_fault or args.quest_next_turn or args.quest_terminal):
        parser.error("--quest-next-land requires --quest-start-user and its own case")
    if args.quest_complete_q3 and (not args.quest_start_user or args.quest_start_fault or args.quest_next_turn
                                   or args.quest_terminal or args.quest_next_land):
        parser.error("--quest-complete-q3 requires --quest-start-user and its own case")
    if args.quest_peaceful and (not args.quest_start_user or args.quest_start_fault or args.quest_next_turn
                               or args.quest_terminal or args.quest_next_land or args.quest_complete_q3):
        parser.error("--quest-peaceful requires --quest-start-user and its own case")
    if args.quest_peaceful_gem_slot is not None and args.quest_peaceful != "gem":
        parser.error("--quest-peaceful-gem-slot requires --quest-peaceful gem")
    if args.quest_peaceful_complete and not args.quest_peaceful:
        parser.error("--quest-peaceful-complete requires --quest-peaceful")
    if args.quest_peaceful_complete == "defeat" and args.quest_peaceful == "gem":
        parser.error("Full q32 requires --quest-peaceful-complete win")
    if args.quest_high_low and (not args.quest_start_user or args.quest_start_fault or args.quest_next_turn
                                or args.quest_terminal or args.quest_next_land or args.quest_complete_q3 or args.quest_peaceful):
        parser.error("--quest-high-low requires --quest-start-user and its own case")
    origin = f"http://127.0.0.1:{args.port}"
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        ])
        portraits = []
        try:
            if args.refresh_user is not None or args.quest_user is not None or args.quest_start_user is not None:
                if args.screens is not None:
                    args.screens.mkdir(parents=True, exist_ok=True)
                page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1,
                                        reduced_motion="reduce")
                if args.refresh_user:
                    check_ap_recovery(page, origin, args.database, args.refresh_user,
                                      args.refresh_password_file.read_text().rstrip("\r\n"), args.screens)
                    print("Original Ruby AP recovered from 4/5 to 5/5 on the existing Lobby connection.")
                elif args.quest_user:
                    check_owned_quest_inventory(page, origin, args.database, args.quest_user,
                                                args.quest_password_file.read_text().rstrip("\r\n"), args.screens)
                    print("Real Quest certificate cancellation, discovered + pending inventory, and clean Back passed.")
                elif args.quest_high_low:
                    page_errors = []
                    page.on("pageerror", lambda error: page_errors.append(str(error)))
                    try:
                        check_q568_high_low(page, origin, args.database, args.quest_start_user,
                                            args.quest_start_password_file.read_text().rstrip("\r\n"), args.screens,
                                            args.quest_high_low)
                    except AssertionError:
                        if args.screens is not None:
                            snapshot = page.evaluate("""() => {
                              const data = selector => {
                                const node = document.querySelector(selector);
                                return node && {...node.dataset};
                              };
                              return {trace: window.qaQuestWire?.sockets.at(-1), battle: data('#quest-map-battle'),
                                exchange: data('#quest-battle-exchange-result'), result: data('#quest-battle-result'),
                                dice: data('#quest-battle-dice-roll'), reward: data('#quest-battle-bonus')};
                            }""")
                            snapshot["errors"] = page_errors
                            (args.screens / "quest-high-low-partial.json").write_text(json.dumps(snapshot, indent=2) + "\n")
                            capture(page.locator("#stage"), args.screens, "quest-high-low-failure.png")
                        raise
                    print(f"Real Quest 568 High/Low passed ({args.quest_high_low}).")
                elif args.quest_peaceful:
                    check_peaceful_quest(page, origin, args.database, args.quest_start_user,
                                         args.quest_start_password_file.read_text().rstrip("\r\n"), args.screens,
                                         args.quest_peaceful, args.quest_peaceful_gem_slot, args.quest_peaceful_complete)
                    outcome = args.quest_peaceful_complete or "battle opening"
                    print(f"Real retained Quest passed ({args.quest_peaceful} terrain through {outcome}).")
                elif args.quest_next_land or args.quest_complete_q3 or args.quest_terminal == "defeat":
                    check_preowned_quest(page, origin, args.database, args.quest_start_user,
                                         args.quest_start_password_file.read_text().rstrip("\r\n"), args.screens,
                                         continue_land=args.quest_next_land or args.quest_complete_q3, complete=args.quest_complete_q3)
                    mode = "authorized next land" if args.quest_next_land else "one-HP defeat"
                    if args.quest_complete_q3:
                        mode = "two wins, verified fixed treasure and map unlock"
                    print(f"Real retained Quest passed ({mode}).")
                else:
                    check_quest_start(page, origin, args.database, args.quest_start_user,
                                      args.quest_start_password_file.read_text().rstrip("\r\n"),
                                      args.screens, args.quest_start_fault, next_turn=args.quest_next_turn,
                                      terminal=args.quest_terminal)
                    mode = args.quest_start_fault or "first combat exchange"
                    if args.quest_next_turn:
                        mode = "next Draw/Move"
                    if args.quest_terminal:
                        mode = f"terminal {args.quest_terminal}"
                    print(f"Real Quest start and combat passed ({mode}).")
                return
            for number, selected_parts in enumerate(STARTER_CHOICES, 1):
                directory = args.screens / f"avatar-{number}" if args.screens is not None else None
                if directory is not None:
                    directory.mkdir(parents=True, exist_ok=True)
                page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1,
                                        reduced_motion="reduce")
                try:
                    portraits.append(check(page, origin, args.database, directory, selected_parts,
                                           verify_login_rose=number == 1))
                finally:
                    page.close()
        finally:
            browser.close()
    assert len(set(portraits)) == len(STARTER_CHOICES), "Distinct equipped IDs rendered the same avatar"
    print("Real account, Lobby, Options, Quest search/details, deck arrows, and direct relogin passed.")


if __name__ == "__main__":
    main()
