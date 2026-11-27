"""Verify Chromium login and logout against a disposable original Ruby account."""

import argparse
import getpass
import json
import os
import re
import secrets
import sqlite3
import struct
import sys
from contextlib import ExitStack, closing
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote, quote_plus, urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import TIMEOUT, check_native_requests, load_diagnostics, observe


FIELD_PATTERN = r"[A-Za-z0-9_.\-]{1,16}"
SESSION_SERVICES = {"lobby": 12002, "data": 12003, "chat": 12020}
AVATAR_VALUES = ("id", "name", "level", "gems", "exp", "energy")
STARTER_VALUES = ("parts", "cards")
QUEST_SUMMARY = ("count", "capacity", "flag", "clear-count")


def read_password(options):
    if options.password_file:
        return options.password_file.read_text(encoding="utf-8").rstrip("\r\n")
    if options.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    return getpass.getpass("Disposable test account password: ")


def submit(page, username, password, state):
    form = page.locator("#session-form")
    form.locator("#session-username").fill(username)
    form.locator("#session-password").fill(password)
    form.locator('button[type="submit"]').click()
    status = page.locator("#session-status")
    expect(status).to_have_attribute("data-state", state, timeout=TIMEOUT)
    if state == "failed":
        expect(status).to_have_attribute("data-error-kind", "credentials")
    expect(form.locator("#session-password")).to_have_value("")


def frames_for(chunks, size_width, count, *, exact=False):
    assert chunks and all(isinstance(chunk, bytes) for chunk in chunks), "Expected binary WebSocket payloads"
    data = b"".join(chunks)
    packets = []
    cursor = 0
    for _ in range(count):
        length = int.from_bytes(data[cursor : cursor + size_width], "big")
        start = cursor + size_width
        end = start + length
        assert length >= 2 and data[end : end + 1] == b"\n", "Original frame boundaries did not match"
        packets.append(data[start:end])
        cursor = end + 1
    if exact:
        assert cursor == len(data), "Unexpected additional command during read-only session setup"
    return packets


def command_ids(packets):
    return [int.from_bytes(packet[:2], "big") for packet in packets]


def verify_exchange(sockets, challenge, result, player_id=None):
    expected_paths = {"/socket/12001"}
    if player_id is not None:
        expected_paths.update(f"/socket/{port}" for port in SESSION_SERVICES.values())
    paths = [urlsplit(socket[0]).path for socket in sockets]
    assert paths[:1] == ["/socket/12001"] and len(paths) == len(expected_paths) and set(paths) == expected_paths, "Unexpected session sockets"
    _, sent, received = sockets[0]
    expected_sent = [1, 2] if challenge else [1]
    expected_received = [1, result] if challenge else [result]
    outgoing = frames_for(sent, 2, len(expected_sent), exact=True)
    incoming = frames_for(received, 4, len(expected_received))
    assert command_ids(outgoing) == expected_sent, "Auth commands did not match the original"
    assert command_ids(incoming) == expected_received, "Auth result did not match the original"
    if challenge:
        proof = outgoing[1][2:]
        assert proof[:2] == b"\x00\x28" and re.fullmatch(b"[a-f0-9]{40}", proof[2:]), "Expected a canonical SRP proof"
    for url, sent, received in sockets[1:]:
        outgoing = frames_for(sent, 2, 2, exact=True)
        # Data replies with negotiation, login certificate, versions, and one initial-data branch.
        is_data = urlsplit(url).path == f"/socket/{SESSION_SERVICES['data']}"
        frames_for(received, 4, 4 if is_data else 2)
        assert outgoing[0] == struct.pack("!HI", 0, player_id), "Service negotiation used a different player ID"


def signed_in_player(page):
    for service in SESSION_SERVICES:
        expect(page.locator(f"#session-{service}")).to_have_attribute("data-verified", "true")
    player = page.locator("#session-player-id")
    expect(player).to_have_text(re.compile("^[1-9][0-9]*$"))
    return int(player.inner_text())


def initial_data(page, branch, fixture):
    bootstrap = page.locator("#session-bootstrap")
    expect(bootstrap).to_be_visible()
    expect(bootstrap).to_have_attribute("data-state", branch)
    avatar = page.locator("#session-avatar-data")
    registration = page.locator("#session-registration-data")
    if branch == "avatar":
        expect(avatar).to_be_visible()
        expect(registration).to_be_hidden()
        fields = {name: avatar.locator(f"#session-avatar-{name}") for name in AVATAR_VALUES}
        expect(fields["name"]).not_to_be_empty()
        expect(fields["id"]).to_have_text(re.compile(r"^[1-9][0-9]*$"))
        expect(fields["energy"]).to_have_text(re.compile(r"^[0-9]+\s*/\s*[0-9]+$"))
    else:
        expect(avatar).to_be_hidden()
        expect(registration).to_be_visible()
        fields = {name: registration.locator(f"#session-starter-{name}") for name in STARTER_VALUES}

    values = {}
    for name, field in fields.items():
        expect(field).to_be_visible()
        if name == "name":
            values[name] = field.inner_text()
        elif name == "energy":
            values[name] = [int(value) for value in field.inner_text().split("/")]
        else:
            expect(field).to_have_text(re.compile(r"^[0-9]+$"))
            values[name] = int(field.inner_text())
    for name, expected in fixture.get(branch, {}).items():
        assert name in values and values[name] == expected, f"Initial {branch} field {name} differed from the fixture"
    return values


def quest_database_snapshot(database, username):
    """Read the fixture's quest records and rewards without changing the live database."""
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=3)) as db:
        db.execute("PRAGMA query_only = ON")
        db.execute("BEGIN")
        avatar = db.execute(
            """SELECT a.id, a.quest_inventory_max, a.quest_flag, a.quest_clear_num,
                      a.quest_point, a.gems, a.exp, a.level, a.energy
               FROM players p LEFT JOIN avatars a ON a.player_id = p.id
               WHERE p.name = ? ORDER BY a.id LIMIT 1""",
            (username,),
        ).fetchone()
        assert avatar is not None, "Could not find the disposable player in the original database"
        avatar_id, capacity, flag, cleared, *_ = avatar
        if avatar_id is None:
            return None, None
        records = db.execute(
            """SELECT i.id, i.quest_id, i.status, q.name, m.name,
                      i.progress, i.deck_index, i.hp0, i.hp1, i.hp2, i.find_at,
                      i.before_avatar_id
               FROM avatar_quest_inventories i LEFT JOIN quests q ON q.id = i.quest_id
               LEFT JOIN quest_maps m ON m.id = q.quest_map_id
               WHERE i.avatar_id = ? ORDER BY i.id""",
            (avatar_id,),
        ).fetchall()
        clear_logs = db.execute(
            """SELECT id, quest_inventory_id, result, finish_point, quest_point
               FROM quest_clear_logs WHERE avatar_id = ? ORDER BY id""",
            (avatar_id,),
        ).fetchall()
        # QuestClearGauge.as opens QuestMap.ID(questFlag + 1). TCN hides it at QUEST_CAP (35).
        current_map = None
        if 0 <= flag < 35:
            current_map = db.execute(
                "SELECT id, name, difficulty FROM quest_maps WHERE id = ?",
                (flag + 1,),
            ).fetchone()
    rows = []
    for inventory_id, quest_id, status, name, map_name, *_ in records:
        # Data leaves a still-pending quest unidentified, even when its internal ID is set.
        rows.append((inventory_id, 0, status, None, None) if status == 4
                    else (inventory_id, quest_id, status, name, map_name))
    summary = dict(zip(QUEST_SUMMARY, (len(rows), capacity, flag, cleared), strict=True))
    return (summary, rows, current_map), (avatar, records, clear_logs)


def expect_quest_cleared(page):
    expect(page.locator("#session-quest")).to_be_hidden()
    expect(page.locator("#session-quest-status")).to_have_attribute("data-state", "idle")
    expect(page.locator("#session-quest-inventory tr[data-inventory-id]")).to_have_count(0)
    for field in QUEST_SUMMARY:
        expect(page.locator(f"#session-quest-{field}")).to_be_empty()
    expect(page.locator("#session-quest-map-progress")).to_be_hidden()
    expect(page.locator("#session-quest-map-name")).to_be_empty()
    expect(page.locator("#session-quest-map-count")).to_be_empty()


def verify_quest_inventory(page, database, username, sockets):
    expected, unchanged = quest_database_snapshot(database, username)
    if expected is None:
        expect_quest_cleared(page)
        return None

    summary, rows, current_map = expected
    expect(page.locator("#session-quest")).to_be_visible()
    expect(page.locator("#session-quest-status")).to_have_attribute("data-state", "idle")
    expect(page.locator("#session-quest-progress")).to_be_hidden()
    outbound = [(url, len(sent)) for url, sent, _ in sockets]
    page.locator("#session-quest-load").click()
    expect(page.locator("#session-quest-status")).to_have_attribute(
        "data-state", "success" if rows else "empty", timeout=TIMEOUT,
    )
    expect(page.locator("#session-quest-progress")).to_be_visible()
    for field, value in summary.items():
        expect(page.locator(f"#session-quest-{field}")).to_have_text(str(value))
    inventory = page.locator("#session-quest-inventory tr[data-inventory-id]")
    expect(inventory).to_have_count(len(rows))
    for inventory_id, quest_id, status, name, map_name in rows:
        row = page.locator(f'#session-quest-inventory tr[data-inventory-id="{inventory_id}"]')
        expect(row).to_be_visible()
        expect(row).to_have_attribute("data-quest-id", str(quest_id))
        expect(row).to_have_attribute("data-quest-status", str(status))
        for index, value in enumerate((inventory_id, quest_id, status)):
            expect(row.get_by_role("cell").nth(index)).to_have_text(str(value))
        if quest_id == 0:
            expect(row.locator(".quest-name")).to_have_text("尚未發現")
        if name:
            expect(row.locator(".quest-name")).to_have_text(name)
        if map_name:
            map_label = row.locator(".quest-map")
            expect(map_label).to_have_text(map_name)
            expect(map_label).to_be_visible()
    gauge = page.locator("#session-quest-map-progress")
    if current_map:
        map_id, name, target = current_map
        expect(gauge).to_be_visible()
        expect(gauge).to_have_attribute("data-map-id", str(map_id))
        expect(page.locator("#session-quest-map-name")).to_have_text(name)
        expect(page.locator("#session-quest-map-count")).to_have_text(f"{min(summary['clear-count'], target)} / {target}")
    else:
        expect(gauge).to_be_hidden()
    assert outbound == [(url, len(sent)) for url, sent, _ in sockets], "Quest read sent a Ruby socket command"
    assert quest_database_snapshot(database, username) == (expected, unchanged), "Quest read changed original game records"
    return expected


def expect_bootstrap_cleared(page):
    bootstrap = page.locator("#session-bootstrap")
    expect(bootstrap).to_have_attribute("data-state", "idle")
    expect(bootstrap).to_be_hidden()
    for field in bootstrap.locator("dd").all():
        expect(field).to_be_empty()
    expect_quest_cleared(page)


def sign_out(page, live_sockets):
    expect(page.locator("#session-signout")).to_be_enabled()
    assert len(live_sockets) == len(SESSION_SERVICES) + 1, "Unexpected active socket count"
    assert not any(socket.is_closed() for socket in live_sockets), "Expected all session sockets to remain active"
    with ExitStack() as events:
        for socket in live_sockets:
            events.enter_context(socket.expect_event("close", timeout=TIMEOUT))
        page.locator("#session-signout").click()
    expect(page.locator("#session-status")).to_have_attribute("data-state", "idle")
    expect(page.locator("#session-password")).to_have_value("")
    expect_bootstrap_cleared(page)
    for service in SESSION_SERVICES:
        expect(page.locator(f"#session-{service}")).not_to_have_attribute("data-verified", "true")


def secret_forms(value):
    return {value, quote(value, safe=""), quote_plus(value, safe=""), json.dumps(value)[1:-1]}


def ensure_no_password(requests, sockets, passwords):
    for request in requests:
        assert request.method == "GET" and not request.post_data_buffer, "Login sent an HTTP payload"
        metadata = [request.url, *request.all_headers().values()]
        for password in passwords:
            if len(password.encode()) >= 8:
                assert not any(secret in field for secret in secret_forms(password) for field in metadata), "Password leaked in HTTP metadata"
    for _, sent, received in sockets:
        for chunks in (sent, received):
            data = b"".join(chunk.encode() if isinstance(chunk, str) else chunk for chunk in chunks)
            for password in passwords:
                if len(password.encode()) >= 8:
                    assert password.encode() not in data, "Plaintext password leaked over WebSocket"


def save_session(page, screenshot):
    if not screenshot:
        return
    screenshot.parent.mkdir(parents=True, exist_ok=True)
    page.get_by_role("region", name="本機登入驗證").screenshot(
        path=screenshot,
        mask=[page.locator("#session-username"), page.locator("#session-password")],
    )


def check_session(browser, origin, options, password, wrong_password, no_avatar_password, fixture):
    page = browser.new_page(viewport={"width": 1360, "height": 1100})
    try:
        traffic = observe(page)
        _, sockets, _ = traffic
        requests = []
        live_sockets = []
        page.on("request", lambda request: requests.append(request))
        page.on("websocket", lambda socket: live_sockets.append(socket))
        load_diagnostics(page, origin)
        assert not sockets, "Login opened a socket before submission"
        expect(page.locator("#session-status")).to_have_attribute("data-state", "idle")
        expect_bootstrap_cleared(page)
        for selector in ("#session-username", "#session-password"):
            field = page.locator(selector)
            expect(field).to_have_attribute("maxlength", "16")
            expect(field).to_have_attribute("pattern", FIELD_PATTERN)

        missing_name = "qa" + secrets.token_hex(6)
        submit(page, missing_name, wrong_password, "failed")
        verify_exchange(sockets, challenge=False, result=3)
        expect_bootstrap_cleared(page)

        offset = len(sockets)
        submit(page, options.wrong_username or options.username, wrong_password, "failed")
        verify_exchange(sockets[offset:], challenge=True, result=9)
        expect_bootstrap_cleared(page)

        offset = len(sockets)
        submit(page, options.username, password, "signed-in")
        player_id = signed_in_player(page)
        branch = page.locator("#session-bootstrap").get_attribute("data-state")
        assert branch in {"avatar", "registration"}, "Expected an initial Data response after login"
        if options.no_avatar_username or "avatar" in fixture:
            assert branch == "avatar", "Expected the primary account to have a character"
        expected_values = initial_data(page, branch, fixture)
        verify_exchange(sockets[offset:], challenge=True, result=2, player_id=player_id)
        if options.quest_database:
            first_quest = verify_quest_inventory(page, options.quest_database, options.username, sockets)
        sign_out(page, live_sockets[offset:])

        offset = len(sockets)
        submit(page, options.username, password, "signed-in")
        assert signed_in_player(page) == player_id, "Re-login returned a different player"
        assert initial_data(page, branch, fixture) == expected_values, "Re-login returned different initial data"
        verify_exchange(sockets[offset:], challenge=True, result=2, player_id=player_id)
        if options.quest_database:
            assert (
                verify_quest_inventory(page, options.quest_database, options.username, sockets) == first_quest
            ), "Re-login returned different original quest data"
        ensure_no_password(requests, sockets, [password, wrong_password])
        save_session(page, options.screenshot)
        sign_out(page, live_sockets[offset:])

        if options.no_avatar_username:
            offset = len(sockets)
            submit(page, options.no_avatar_username, no_avatar_password, "signed-in")
            registration_id = signed_in_player(page)
            assert registration_id != player_id, "Both branches used the same player"
            starter_values = initial_data(page, "registration", fixture)
            verify_exchange(sockets[offset:], challenge=True, result=2, player_id=registration_id)
            expect_quest_cleared(page)
            if options.quest_database:
                assert verify_quest_inventory(page, options.quest_database, options.no_avatar_username, sockets) is None
            ensure_no_password(requests, sockets, [password, wrong_password, no_avatar_password])
            save_session(page, options.no_avatar_screenshot)
            sign_out(page, live_sockets[offset:])
            print(f"No-character login showed {starter_values['parts']} starter parts and {starter_values['cards']} starter cards.")

        check_native_requests(page, origin, traffic)
        ensure_no_password(requests, sockets, [password, wrong_password, no_avatar_password])
    finally:
        page.close()
    print("Chromium matched the original unknown-user and wrong-password responses.")
    print("Original Ruby SRP and Lobby, Data, and GlobalChat passed on login and re-login; all four sockets closed on sign-out.")
    print("Initial Data service replies were displayed and cleared on sign-out.")
    if options.quest_database:
        print("Quest inventory and progress matched the original database. Reading them sent no Ruby command and changed no observed game records.")
    print("The password field cleared, and inspected traffic stayed on the native origin.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4342, help="Loopback port serving native diagnostics")
    parser.add_argument("--username", required=True, help="Disposable seeded account for valid login")
    parser.add_argument("--wrong-username", help="Optional separate disposable account for the rejection test")
    input_mode = parser.add_mutually_exclusive_group()
    input_mode.add_argument("--password-file", type=Path, help="Read the password from a private text file")
    input_mode.add_argument("--password-stdin", action="store_true", help="Read one password line from stdin")
    parser.add_argument("--screenshot", type=Path, help="Save the verified signed-in view with form fields masked")
    parser.add_argument("--no-avatar-username", help="Optional second disposable account without a character")
    parser.add_argument("--no-avatar-password-file", type=Path, help="Read the second account password from a private file")
    parser.add_argument("--no-avatar-screenshot", type=Path, help="Save the verified no-character view")
    parser.add_argument("--expected-initial-data", type=Path, help="JSON file with expected avatar and registration fields")
    parser.add_argument("--quest-database", type=Path, help="Compare quest data with this isolated Traditional Chinese Ruby SQLite database, opened read-only")
    options = parser.parse_args()
    if not (options.password_file or options.password_stdin or sys.stdin.isatty()):
        parser.error("use --password-file or --password-stdin without an interactive terminal")

    if bool(options.no_avatar_username) != bool(options.no_avatar_password_file):
        parser.error("use --no-avatar-username and --no-avatar-password-file together")
    if options.no_avatar_screenshot and not options.no_avatar_username:
        parser.error("--no-avatar-screenshot requires a second account")
    if options.no_avatar_username == options.username:
        parser.error("choose different accounts for the character and no-character cases")

    wrong_password = secrets.token_hex(7)
    password = read_password(options)
    no_avatar_password = options.no_avatar_password_file.read_text(encoding="utf-8").rstrip("\r\n") if options.no_avatar_password_file else ""
    inputs = [options.username, options.wrong_username or options.username, password]
    if options.no_avatar_username:
        inputs += [options.no_avatar_username, no_avatar_password]
    if any(not re.fullmatch(FIELD_PATTERN, value) for value in inputs):
        parser.error("test account inputs must match the original 1–16 character field format")
    while wrong_password in (password, no_avatar_password):
        wrong_password = secrets.token_hex(7)

    # Playwright debug and tracing output must never record passwords passed to fill().
    for setting in ("DEBUG", "PWDEBUG"):
        os.environ.pop(setting, None)
    origin = f"http://127.0.0.1:{options.port}"
    try:
        fixture = json.loads(options.expected_initial_data.read_text(encoding="utf-8")) if options.expected_initial_data else {}
        assert isinstance(fixture, dict) and set(fixture) <= {"avatar", "registration"}, "Invalid initial-data fixture"
        with TemporaryDirectory(prefix="unlight-session-chromium-") as profile, sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=options.chromium,
                env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
            )
            try:
                check_session(browser, origin, options, password, wrong_password, no_avatar_password, fixture)
            finally:
                browser.close()
    except Exception as error:
        message = str(error).split("\n\nCall log:", 1)[0]
        redactions = set().union(*(secret_forms(value) for value in [*inputs, wrong_password]))
        for value in sorted(redactions, key=len, reverse=True):
            message = message.replace(value, "[redacted]")
        sys.exit(f"Native session acceptance failed ({type(error).__name__}): {message}")


if __name__ == "__main__":
    main()
