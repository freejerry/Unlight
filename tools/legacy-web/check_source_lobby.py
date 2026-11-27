"""Exercise a fresh fixed-stage player lifecycle against an isolated original Ruby server."""

import argparse
import json
import os
import re
import sqlite3
import struct
from contextlib import closing
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


def capture(stage, directory, name):
    if directory is not None:
        stage.screenshot(path=directory / name, scale="css", animations="disabled")


def screen(stage, name):
    expect(stage).to_have_attribute("data-screen", name, timeout=TIMEOUT)
    assert stage.evaluate("stage => [stage.offsetWidth, stage.offsetHeight]") == [780, 680]


def music(page, scene, filename):
    page.wait_for_function("""({scene, filename}) => {
      const audio = document.querySelector(`#stage > audio[data-bgm-scene='${scene}']`);
      return audio?.currentSrc.endsWith('/sound/bgm/' + filename) && audio.loop
        && !audio.paused && audio.currentTime > 0.2;
    }""", arg={"scene": scene, "filename": filename}, timeout=TIMEOUT)


def observe_scene_music_fade(page, scene):
    audio = page.locator(f'#stage > audio[data-bgm-scene="{scene}"]')
    assert audio.evaluate("""(audio, scene) => {
      window.qaSceneMusic ??= {};
      const trace = {audio, steps: []};
      window.qaSceneMusic[scene] = trace;
      document.getElementById('stage').addEventListener('game-screen-change', function boundary() {
        if (this.dataset.soundscape !== 'silent' || trace.started) return;
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
    }""", scene)


def check_scene_music_fade(page, scene):
    page.wait_for_function("""scene => {
      const {audio, steps} = window.qaSceneMusic[scene];
      return audio.paused && !audio.isConnected && steps.at(-1)?.volume === 0;
    }""", arg=scene, timeout=TIMEOUT)
    started, steps = page.evaluate("scene => [window.qaSceneMusic[scene].started, window.qaSceneMusic[scene].steps]", scene)
    assert [round(step["volume"], 2) for step in steps] == [round(step / 20, 2) for step in range(10, -1, -1)], steps
    assert not any(step["paused"] for step in steps[:-1]), steps
    # Source schedules the first gain change at 200ms and the last at 2000ms.
    duration = steps[-1]["at"] - started
    assert 1800 <= duration <= 2800, (started, steps)
    assert 1650 <= steps[-1]["at"] - steps[1]["at"] <= 2600, steps
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
      export function encodeCommand(command, fields, key) {
        const frame = encode(command, fields, key);
        const isRefresh = command === 17 && fields?.length === 0;
        if (isRefresh) window.qaLastLobbyRefresh = performance.now();
        window.refreshQASends?.push(isRefresh ? [...encode(command, [])] : command);
        const confirm = command === 12 && fields?.length === 2
          ? [fields[0], fields[1]?.value] : null;
        const deck = command === 12 && fields?.length === 1 ? fields[0] : null;
        window.qaQuestWire?.encoded.set(frame, {command, confirm, deck});
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
            : reply.command === 17 && body.byteLength === 11 ? [bytes.getInt32(2), bytes.getInt8(6), bytes.getInt32(7)]
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
      wire.holdDetail = () => {{
        const peer = wire.sockets.at(-1);
        wire.detail = {{ peer, start: peer.sent.length, queued: [] }};
      }};
      wire.endDetailHold = (deliver) => {{
        const {{ queued }} = wire.detail;
        wire.detail = null;
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
          const trace = this.questTrace = {{ sent: [], confirms: [], replies: [], close: null, held: false, overlaps }};
          wire.sockets.push(trace);
          this.addEventListener('close', event => {{ trace.close = [event.code, event.wasClean]; }});
        }}
        send(frame) {{
          const encoded = wire.encoded.get(frame);
          if (this.questTrace) {{
            const {{ command, confirm }} = encoded;
            this.questTrace.sent.push([command, frame.byteLength]);
            if (confirm) this.questTrace.confirms.push(confirm);
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
            const receive = () => {{
              wire.receiving = trace;
              try {{ handler.call(this, event); }} finally {{ wire.receiving = null; }}
            }};
            const detail = wire.detail;
            if (detail?.peer === trace && trace.sent.slice(detail.start).some(([command]) => command === 12)) {{
              detail.queued.push(receive);
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
    page.evaluate("window.qaQuestWire.holdDetail()")
    select_row.click()
    expect(detail).to_be_visible(timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-inventory-id", str(inventory_id))
    expect(page.locator("#quest-map-detail-title")).to_have_text("落日大蝙蝠")
    expect(page.locator("#quest-map-detail-caption")).to_have_text("飛舞於山谷間的大蝙蝠，今晚也要搜尋犧牲者")
    expect(land).to_be_visible()
    expect(detail.locator('[data-quest-command="start"]')).to_be_disabled()
    page.wait_for_function("() => window.qaQuestWire.detail.queued.length > 0", timeout=TIMEOUT)
    expect(detail).to_have_attribute("data-quest-status", "0")
    expect(row).to_have_attribute("data-quest-status", "0")
    assert page.evaluate("window.qaQuestWire.sockets.at(-1).confirms") == [[inventory_id, 1]]
    confirmed = quest[:2] + (1,) + quest[3:]
    assert quest_inventory(database, avatar_id) == [confirmed]
    wait_quest_art(page)
    capture(stage, directory, "15a-quest-detail-held.png")

    if drop_reply:
        expect(detail).to_have_attribute("data-confirmation-state", "uncertain", timeout=TIMEOUT)
        assert page.evaluate("window.qaQuestWire.endDetailHold(false)") > 0
        expect(detail).to_have_attribute("data-quest-status", "0")
        capture(stage, directory, "15b-quest-detail-uncertain.png")
    else:
        assert page.evaluate("window.qaQuestWire.endDetailHold(true)") > 0
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


def check_instant_quest_search(page, stage, directory, database, player_id, profile, live, session_start, *, drop_reply):
    avatar_id = profile[0]
    assert not quest_inventory(database, avatar_id) and profile[5:7] == (5, 5)
    parts, decks = equipped_parts(database, avatar_id), quest_deck(database, avatar_id)
    core = live[session_start:]
    assert len(core) == 4 and all(not socket.is_closed() for socket in core)
    launcher = page.locator("#lobby-quest-load")
    launcher.press("Enter")
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
    assert len(live[session_start:]) == 5 and all(not socket.is_closed() for socket in live[session_start:])
    capture(stage, directory, "15-quest-search-immediate.png")
    page.locator("#quest-map-search-result-ok").press("Enter")
    expect(landmark).to_be_focused()
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
    positions = {
        quest["id"]: [(land["slot"], land["id"], land["nextMask"], land["nextSlots"],
                       land["stage"], land["treasureType"]) for land in quest["positions"]]
        for quest in response.json()["quests"]
    }
    assert positions == {1: [(1, 201, 0, [], 11, 0)], 3: [(1, 201, 2, [4], 11, 0), (4, 210, 0, [], 11, 1)]}


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
    parser.add_argument("--refresh-password-file", type=Path, help="Private password file for --refresh-user")
    parser.add_argument("--quest-password-file", type=Path, help="Private password file for --quest-user")
    args = parser.parse_args()
    if (args.refresh_user is None) != (args.refresh_password_file is None):
        parser.error("--refresh-user and --refresh-password-file must be supplied together")
    if (args.quest_user is None) != (args.quest_password_file is None):
        parser.error("--quest-user and --quest-password-file must be supplied together")
    origin = f"http://127.0.0.1:{args.port}"
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        ])
        portraits = []
        try:
            if args.refresh_user is not None or args.quest_user is not None:
                if args.screens is not None:
                    args.screens.mkdir(parents=True, exist_ok=True)
                page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1,
                                        reduced_motion="reduce")
                if args.quest_user is None:
                    check_ap_recovery(page, origin, args.database, args.refresh_user,
                                      args.refresh_password_file.read_text().rstrip("\r\n"), args.screens)
                    print("Original Ruby AP recovered from 4/5 to 5/5 on the existing Lobby connection.")
                else:
                    check_owned_quest_inventory(page, origin, args.database, args.quest_user,
                                                args.quest_password_file.read_text().rstrip("\r\n"), args.screens)
                    print("Real Quest certificate cancellation, discovered + pending inventory, and clean Back passed.")
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
