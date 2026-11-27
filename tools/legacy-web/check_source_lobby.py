"""Exercise a fresh fixed-stage player lifecycle against an isolated original Ruby server."""

import argparse
import sqlite3
import struct
from contextlib import closing
from math import isclose
from pathlib import Path
from secrets import token_hex
from time import monotonic
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import observe
from check_native_session import command_ids, ensure_no_password, frames_for, verify_exchange

ENTRY = "/source-login/"
SESSION_PORTS = {"/socket/12001", "/socket/12002", "/socket/12003", "/socket/12020"}
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
    expect(page.locator("#lobby-quest")).to_be_hidden()
    capture(stage, directory, "11a-lobby-news.png")
    check_button_hover(page, news_close)
    news_close.press("Escape")
    expect(news).to_be_hidden()
    expect(page.locator("#lobby-title")).to_be_focused()


def check_lobby_dialogs(page, stage, directory):
    close_lobby_news(page, stage, directory)
    quest = page.locator("#lobby-quest")
    quest_open = page.locator("#lobby-quest-load")
    quest_close = page.locator("#lobby-quest-close")

    quest_open.press("Enter")
    expect(quest).to_be_visible()
    expect(quest).to_have_attribute("data-state", "empty")
    quest_box = quest.bounding_box()
    assert tuple(quest_box[key] for key in ("x", "y", "width", "height")) == (164, 170, 452, 340), quest_box
    expect(page.locator("#lobby-quest-status")).to_have_text("持有 0／4 筆任務")
    expect(quest_close).to_be_focused()
    capture(stage, directory, "11b-lobby-quest.png")
    check_button_hover(page, quest_close)
    quest_close.click()
    expect(quest).to_be_hidden()
    expect(quest_open).to_be_focused()


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
    check_lobby_dialogs(page, stage, directory)
    parts = equipped_parts(database, profile[0])
    first_portrait = check_avatar_canvas(page, stage, parts, responses)
    assert sorted(page.locator("#lobby-view button:visible").evaluate_all("nodes => nodes.map(node => node.id)")) == [
        "lobby-option-open", "lobby-quest-load",
    ]
    assert len(sockets) == first + 4 and all(not socket.is_closed() for socket in live[first:])
    assert query(database, "SELECT tutorial FROM players WHERE id = ?", player_id) == [(0,)]
    music(page, "lobby", "ulbgm02.mp3")
    hover_start = len(requests)
    check_lobby_hover(page, stage, directory)
    hover_requests = {urlsplit(request.url).path for request in requests[hover_start:]}
    assert hover_requests <= {"/public/sound/bgm/ulbgm02.mp3"}, sorted(hover_requests)
    assert len(sockets) == first + 4 and all(not socket.is_closed() for socket in live[first:])

    def verify_options(*, edit):
        active = len(sockets) - 4
        sent_before = [len(sent) for _, sent, _ in sockets[active:]]
        request_start = len(requests)
        check_options_scene(page, stage, profile, parts, first_portrait, directory, edit=edit)
        assert len(sockets) == len(live) == active + 4 and all(not socket.is_closed() for socket in live[active:])
        assert [len(sent) for _, sent, _ in sockets[active:]] == sent_before
        assert all(request.method == "GET" for request in requests[request_start:])
        assert avatar(database, player_id) == [profile] and equipped_parts(database, profile[0]) == parts
        check_lobby(page, player_id, profile)
        assert check_avatar_canvas(page, stage, parts, responses) == first_portrait
        if edit:
            capture(stage, directory, "11h-lobby-returned-from-options.png")

    if verify_login_rose:
        verify_options(edit=True)
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
        verify_options(edit=False)
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4389)
    parser.add_argument("--database", type=lambda path: Path(path).resolve(), required=True,
                        help="Read-only verification of the disposable Ruby SQLite fixture")
    parser.add_argument("--screens", type=Path, help="Save verified 780×680 screenshots in this directory")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        ])
        portraits = []
        try:
            for number, selected_parts in enumerate(STARTER_CHOICES, 1):
                directory = args.screens / f"avatar-{number}" if args.screens is not None else None
                if directory is not None:
                    directory.mkdir(parents=True, exist_ok=True)
                page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1,
                                        reduced_motion="reduce")
                try:
                    portraits.append(check(page, f"http://127.0.0.1:{args.port}", args.database, directory, selected_parts,
                                           verify_login_rose=number == 1))
                finally:
                    page.close()
        finally:
            browser.close()
    assert len(set(portraits)) == len(STARTER_CHOICES), "Distinct equipped IDs rendered the same avatar"
    print("Real account creation, equipped lobby art, AP and free-duel stars, entrance hover, and direct relogin passed.")


if __name__ == "__main__":
    main()
