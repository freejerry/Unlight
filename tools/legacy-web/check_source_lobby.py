"""Exercise a fresh fixed-stage player lifecycle against an isolated original Ruby server."""

import argparse
import re
import sqlite3
import struct
from contextlib import closing
from pathlib import Path
from secrets import token_hex
from time import monotonic
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import observe
from check_native_session import command_ids, ensure_no_password, frames_for, verify_exchange

ENTRY = "/source-login/"
SESSION_PORTS = {"/socket/12001", "/socket/12002", "/socket/12003", "/socket/12020"}
STARTER_PARTS = (1, 5, 24, 27)
STARTER_CARD = 21
TIMEOUT = 16000


def query(database, statement, *parameters):
    with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True, timeout=5)) as db:
        return db.execute(statement, parameters).fetchall()


def player(database, name):
    return query(database, "SELECT id, state & 3 FROM players WHERE name = ?", name)


def avatar(database, player_id):
    return query(database, """
        SELECT id, name, level, gems, exp, energy, energy_max
        FROM avatars WHERE player_id = ?
    """, player_id)


def capture(stage, directory, name):
    if directory is not None:
        stage.screenshot(path=directory / name, scale="css", animations="disabled")


def screen(stage, name):
    expect(stage).to_have_attribute("data-screen", name, timeout=TIMEOUT)
    assert stage.evaluate("stage => [stage.offsetWidth, stage.offsetHeight]") == [780, 680]


def music(page, filename):
    page.wait_for_function("""filename => {
      const audio = document.querySelector('#stage > audio');
      return audio?.currentSrc.endsWith('/sound/bgm/' + filename) && audio.loop
        && !audio.paused && audio.currentTime > 0.2;
    }""", arg=filename, timeout=TIMEOUT)


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


def wait_logout(page, live, database, name, player_id):
    deadline = monotonic() + 3
    # Ruby can finish its unbind after Chromium observes the WebSocket closure.
    while not all(socket.is_closed() for socket in live) or player(database, name) != [(player_id, 0)]:
        assert monotonic() < deadline, "Original session did not close after logout"
        page.wait_for_timeout(50)


def verify_starter(database, avatar_id):
    decks = dict(query(database, "SELECT name, id FROM chara_card_decks WHERE avatar_id = ?", avatar_id))
    assert set(decks) == {"Binder", "Deck 1", "Deck 2", "Deck 3"}
    starter = query(database, """
        SELECT chara_card_id, position FROM card_inventories
        WHERE chara_card_deck_id = ? ORDER BY position
    """, decks["Deck 1"])
    assert starter == [(STARTER_CARD, 0)], "The original first deck does not contain the chosen starter"
    parts = query(database, "SELECT avatar_part_id FROM part_inventories WHERE avatar_id = ? AND used = 1", avatar_id)
    assert set(STARTER_PARTS) <= {part_id for (part_id,) in parts}


def check_lobby(page, player_id, profile):
    avatar_id, name, level, gems, exp, energy, energy_max = profile
    expect(page.locator("#lobby-view")).to_be_visible()
    expect(page.locator("#lobby-title")).to_have_text("大廳")
    for field, value in (("player-id", player_id), ("avatar-id", avatar_id), ("avatar-name", name),
                         ("level", level), ("gems", gems), ("exp", exp)):
        expect(page.locator(f"#lobby-{field}")).to_have_text(str(value))
    expect(page.locator("#lobby-player-id")).to_be_hidden()
    expect(page.locator("#lobby-avatar-id")).to_be_hidden()
    expect(page.locator("#lobby-deck-name")).to_have_text("Deck 1")
    expect(page.locator("#lobby-energy")).to_have_text(re.compile(rf"{energy}\s*[/／]\s*{energy_max}"))
    entries = page.locator("#lobby-entries")
    quest_entry = entries.get_by_role("button", name="任務", exact=True)
    news_entry = entries.get_by_role("button", name="最新消息", exact=True)
    expect(quest_entry).to_be_visible()
    expect(news_entry).to_be_visible()
    shell = page.locator("#lobby-view").bounding_box()
    quest = quest_entry.bounding_box()
    news = news_entry.bounding_box()
    logout = page.locator("#lobby-logout").bounding_box()
    status = page.locator("#lobby-profile").bounding_box()
    assert (quest["x"] + quest["width"] / 2 - shell["x"], quest["y"] + quest["height"] / 2 - shell["y"]) == (460, 245), quest
    assert news["x"] + news["width"] <= logout["x"] and news["y"] - shell["y"] == 12, news
    assert (status["x"] - shell["x"], status["y"] - shell["y"], status["width"], status["height"]) == (20, 596, 740, 64), status


def check_lobby_dialogs(page, stage, directory):
    news = page.locator("#lobby-news")
    news_open = page.locator("#lobby-news-open")
    news_close = page.locator("#lobby-news-close")
    quest = page.locator("#lobby-quest")
    quest_open = page.locator("#lobby-quest-load")
    quest_close = page.locator("#lobby-quest-close")

    expect(news).to_have_attribute("data-state", "ready")
    expect(news).to_be_visible()
    expect(news_close).to_be_focused()
    news_box = news.bounding_box()
    assert tuple(news_box[key] for key in ("x", "y", "width", "height")) == (246, 158, 378, 342), news_box
    expect(page.locator("#lobby-news-content li")).to_have_count(3)
    expect(quest).to_be_hidden()
    capture(stage, directory, "11a-lobby-news.png")
    news_close.press("Escape")
    expect(news).to_be_hidden()
    expect(news_open).to_be_focused()

    quest_open.press("Enter")
    expect(quest).to_be_visible()
    expect(quest).to_have_attribute("data-state", "empty")
    quest_box = quest.bounding_box()
    assert tuple(quest_box[key] for key in ("x", "y", "width", "height")) == (164, 170, 452, 340), quest_box
    expect(page.locator("#lobby-quest-status")).to_have_text("持有 0／4 筆任務")
    expect(quest_close).to_be_focused()
    capture(stage, directory, "11b-lobby-quest.png")
    quest_close.click()
    expect(quest).to_be_hidden()
    expect(quest_open).to_be_focused()

    news_open.click()
    expect(news).to_be_visible()
    news_close.click()
    expect(news).to_be_hidden()
    expect(news_open).to_be_focused()


def check(page, origin, database, directory):
    name = "flowqa" + token_hex(5)
    password = token_hex(8)
    avatar_name = "夜行者" + token_hex(3).translate(str.maketrans("0123456789abcdef", "零一二三四五六七八九甲乙丙丁戊己"))
    assert not player(database, name)
    _, sockets, errors = observe(page)
    requests, live = [], []
    page.on("request", lambda request: requests.append(request))
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
    capture(stage, directory, "01-title.png")

    mode.click()
    expect(title).to_have_text("Register")
    capture(stage, directory, "02-account-registration.png")
    username.fill(name)
    page.locator("#email").fill("test@example.invalid")
    secret.fill(password)
    page.locator("#confirm-password").fill(password)
    submit.click()
    expect(status).to_have_text("帳號建立成功。請輸入密碼登入。", timeout=TIMEOUT)
    expect(title).to_have_text("Login")
    expect(username).to_have_value(name)
    expect(secret).to_have_value("")
    assert len(sockets) == 1 and live[0].is_closed()
    assert urlsplit(live[0].url).path == "/socket/12001"
    assert command_ids(frames_for(sockets[0][1], 2, 1, exact=True)) == [5]
    assert frames_for(sockets[0][2], 4, 1, exact=True) == [struct.pack("!Hi", 0, 0)]
    ((player_id, flags),) = player(database, name)
    assert not flags and not avatar(database, player_id)

    def sign_in():
        start = len(sockets)
        username.fill(name)
        secret.fill(password)
        submit.click()
        return start

    first = sign_in()
    screen(stage, "onboarding")
    onboarding = page.locator("#onboarding")
    expect(onboarding).to_have_attribute("data-step", "intro")
    expect(page.locator("#login")).to_be_hidden()
    active_session_traffic(sockets, live, first, player_id)
    music(page, "ulbgm01.mp3")
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
    for index, part in enumerate(STARTER_PARTS):
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
    verify_starter(database, profile[0])
    assert len(sockets) == first + 4 and all(not socket.is_closed() for socket in live[first:])
    music(page, "bgm011.mp3")
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
    assert len(sockets) == first + 4 and all(not socket.is_closed() for socket in live[first:])
    assert query(database, "SELECT tutorial FROM players WHERE id = ?", player_id) == [(0,)]
    music(page, "ulbgm02.mp3")
    capture(stage, directory, "11-lobby.png")
    page.locator("#lobby-logout").click()
    screen(stage, "title")
    expect(secret).to_have_value("")
    wait_logout(page, live, database, name, player_id)
    music(page, "ulbgm01.mp3")
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
    expect(page.locator("#lobby-news")).to_have_attribute("data-state", "ready")
    expect(page.locator("#lobby-news")).to_be_hidden()
    assert "onboarding" not in page.evaluate("window.reloginScreens")
    active_session_traffic(sockets, live, second, player_id)
    assert avatar(database, player_id) == [profile]
    verify_starter(database, profile[0])
    music(page, "ulbgm02.mp3")
    capture(stage, directory, "13-direct-lobby-after-login.png")
    page.locator("#lobby-logout").click()
    screen(stage, "title")
    wait_logout(page, live, database, name, player_id)
    assert page.url == origin + ENTRY and not errors, errors
    assert all(urlsplit(request.url).netloc == urlsplit(origin).netloc for request in requests)
    ensure_no_password(requests, sockets, [password])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4389)
    parser.add_argument("--database", type=lambda path: Path(path).resolve(), required=True,
                        help="Read-only verification of the disposable Ruby SQLite fixture")
    parser.add_argument("--screens", type=Path, help="Save verified 780×680 screenshots in this directory")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    if args.screens is not None:
        args.screens.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        ])
        try:
            page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1)
            page.emulate_media(reduced_motion="reduce")
            check(page, f"http://127.0.0.1:{args.port}", args.database, args.screens)
        finally:
            browser.close()
    print("Real account creation, guided avatar setup, starter inventory, live lobby and direct relogin passed.")


if __name__ == "__main__":
    main()
