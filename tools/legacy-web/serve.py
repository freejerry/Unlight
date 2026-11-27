"""Serve the original Unlight client or native diagnostics with a loopback relay."""

import argparse
import asyncio
from contextlib import suppress
from csv import DictReader
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree

from aiohttp import WSMsgType, web
from yarl import URL


HOST = "127.0.0.1"
SERVICES = (
    ("Auth", 12001, 6, 7),
    ("Lobby", 12002, 3, 35),
    ("Data", 12003, 3, 3),
    ("Game", 12004, 3, 3),
    ("Quest", 12005, 3, 3),
    ("GlobalChat", 12020, 3, 3),
)
PORTS = tuple(port for _, port, _, _ in SERVICES)
ROOT = Path(__file__).resolve().parent
PUBLIC_CONFIG = ROOT.parents[1] / "app/client/public"
NATIVE_ROOT = ROOT.parents[1] / "web-client"
SOURCE_LOGIN_ROOT = ROOT.parents[1] / "source-login"
REPLAY_BASELINE = ROOT.parent / "legacy-server/fixtures/trace-2026.json"
SERVER_CSV = ROOT.parents[1] / "app/server/data/csv"
MAX_QUEST_IDS = 127
MAX_ACTION_CARD_IDS = 64  # One 32-card orientation bitmap for each draw kind.
MAX_QUEST_CHARACTER_CARD_IDS = 6  # Two rosters have at most three slots each.
MAX_DECK_CHARACTER_CARD_IDS = 64
REBORN_CHARACTER_CARD_KIND = 8  # CC_KIND_REBORN_CHARA
REBORN_CHARACTER_ID_OFFSET = 4000  # CHARACTOR_ID_OFFSET_REBORN
# REGIST_PARTS and REGIST_CARDS in app/server/src/constants/constants.rb.
AVATAR_STARTER_PART_IDS = (1, 2, 3, 5, 6, 7, 10, 11, 12, 15, 16, 17, 24, 25, 26,
                           27, 28, 29, 32, 33, 34, 37, 38, 39)
AVATAR_STARTER_CARD_IDS = (1, 21, 31, 101, 111)
TCN_NORMAL_MAP_COUNT = 35  # QUEST_CAP in app/client/lib/Const.as
QUEST_LAND_FIELDS = tuple(
    f"quest_land_id_{column}_{row}" for column in range(5) for row in range(3)
)  # Same slot order as Quest#land_set.
NATIVE_ASSETS = {
    "image": "image/rm_shop/item_id020.png",
    "audio": "sound/bgm/ulbgm01.mp3",
}
PANEL_SKIN_URL = "/public/panel_gene.png"
PANEL_SKIN_SHA256 = "81038be00fa27a1143ac651a789d0a665d51a7be326f322685c7f6cddb85ee3b"
SOURCE_LOGIN_SWFS = {
    "data/image/title/event_title.swf": "1beaf454eb37ed427c17efe8c631c95336a6f94c2a577fae9b96a1a755102fe8",
    "data/image/title/logo.swf": "0d71262469a6c6bb3f27667b97a96bc2d73d108b985e0d5ee5441f4b18178b9d",
    "data/image/title/loading.swf": "759d3d3472b6af37946400ee31e997be92706f80e14f11bcb92f7d4aefbe3d37",
    "data/image/ageha.swf": "6057434e0237674ba226dd7b98ee1c9be65eb684ae9a5bf0186a0e28469e0320",
}
SOURCE_LOGIN_BGM_SHA256 = "82924cf090817ea98e5c6b524f46a90e6dbe3cb79ee6413ab1010aebcd085f89"
SOURCE_LOGIN_SOUND_EFFECTS = {
    "public/sound/se/ulse01.mp3": "2f67cac2f64df9a516984f9d2d579b2e3da26e58ae8545001ce0a34bdcfa6b51",
    "public/sound/se/ulse02.mp3": "a18e72cdaab4ba75d76dedbbe32ff08e460a45b5a28120da63e977c7dc5fe195",
}
# Historical cwming.ttf pin from tools/legacy-build/build.sh.
TCN_FONT_SHA256 = "094a5c7340f181059baf2c574da05f558a3dfe6b12d6323349354c64c0ecbb5e"
TCN_FONT_URL = "/tcn-device-font.ttf"


def native_asset_files(assets):
    if assets is None:
        return {}

    assets = assets.resolve()
    files = {}
    for kind, filename in NATIVE_ASSETS.items():
        path = (assets / filename).resolve()
        if not path.is_relative_to(assets) or not path.is_file():
            raise ValueError(f"--assets must contain a regular file at {filename}")
        files[kind] = path
    return files


def pinned_native_asset(assets, filename, digest):
    if assets is None:
        return None
    # The build's original asset checkout has public/ and data/ next to each other.
    root = assets.resolve().parent
    try:
        path = (root / filename).resolve()
        if (path.is_relative_to(root) and path.is_file()
                and sha256(path.read_bytes()).hexdigest() == digest):
            return path
    except (OSError, RuntimeError):
        pass
    return None


def native_panel_skin(assets):
    return pinned_native_asset(assets, "data/image/panel_gene.png", PANEL_SKIN_SHA256)


def validate_source_login_wasm(path):
    try:
        path = path.resolve()
        if path.is_file():
            with path.open("rb") as file:
                if file.read(8) == b"\x00asm\x01\x00\x00\x00":
                    return path
    except (OSError, RuntimeError):
        pass
    raise ValueError("--source-login-wasm must point to a WebAssembly module")


def native_quest_catalog():
    with (SERVER_CSV / "ja/QuestMaps.csv").open(encoding="utf-8-sig", newline="") as source:
        maps = {
            int(row["id"]): {
                "id": int(row["id"]), "name": row["name_tcn"] or row["name"],
                "clearTarget": int(row["difficulty"]), "caption": row["caption_tcn"] or "",
                "ap": int(row["ap"]),
            }
            for row in DictReader(source)
        }
    fixed_gem_treasures = {}
    with suppress(OSError):
        with (SERVER_CSV / "ja/TreasureDatas.csv").open(encoding="utf-8-sig", newline="") as source:
            for row in DictReader(source):
                with suppress(TypeError, ValueError):
                    treasure_id, allocation, treasure_type, slot_type, value = (
                        int(row.get(key)) for key in ("id", "allocation_type", "treasure_type", "slot_type", "value")
                    )
                    # Source TREASURE_ALLOC_TYPE_NONE and TG_GEM.
                    if (allocation == 0 and treasure_type == 5 and 0 <= slot_type <= 0x7fffffff
                            and 0 < treasure_id <= 0x7fffffff and 0 < value <= 0x7fffffff):
                        fixed_gem_treasures[treasure_id] = {
                            "treasureId": treasure_id, "type": treasure_type, "slotType": slot_type, "value": value,
                        }
    land_rows = []
    with suppress(OSError):
        with (SERVER_CSV / "ja/QuestLands.csv").open(encoding="utf-8-sig", newline="") as source:
            land_rows = list(DictReader(source))
    lands = {}
    land_contents = {}
    for row in land_rows:
        land_id = int(row["id"])
        lands[land_id] = {
            "id": land_id, "name": row["name_tcn"] or "", "caption": row["caption_tcn"] or "",
        }
        contents = land_contents[land_id] = {}
        with suppress(TypeError, ValueError):
            enemy_id = int(row.get("monstar_no"))
            if 0 <= enemy_id <= 0x7fffffff:
                contents["enemyId"] = enemy_id
                treasure_id = int(row.get("treasure_no"))
                event_id = int(row.get("event_no"))
                if all(0 <= value <= 0x7fffffff for value in (treasure_id, event_id)):
                    contents["emptyTerrain"] = (enemy_id, treasure_id, event_id) == (0, 0, 0)
                    if enemy_id == 0 and event_id == 0 and treasure_id in fixed_gem_treasures:
                        contents["fixedGemTreasure"] = fixed_gem_treasures[treasure_id]
    quests = {}
    with (SERVER_CSV / "tcn/Quests.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            if row["name"]:
                quest_id = int(row["id"])
                map_id = int(row["quest_map_id"])
                area = maps.get(map_id, {})
                slots = [int(row[field] or 0) for field in QUEST_LAND_FIELDS]
                land_ids = dict.fromkeys(slots)
                # Quest.startRow takes the last occupied slot in the first column.
                first_slot = next((slot for slot in (2, 1, 0) if slots[slot] > 0), None)
                first = lands.get(slots[first_slot]) if first_slot is not None else None
                first_land = None
                if first and first["name"].strip() and first["caption"].strip():
                    first_land = {"slot": first_slot, **first, **land_contents.get(first["id"], {})}
                positions = []
                for slot, land_id in enumerate(slots):
                    if land_id <= 0:
                        continue
                    column, lane = divmod(slot, 3)
                    mask = int(row[f"next_{column}_{lane}"] or 0)
                    # Quest#check_road_exist? addresses the next column using lane bits 4, 2, 1.
                    next_start = (column + 1) * 3
                    next_slots = [
                        target for target, bit in zip(range(next_start, next_start + 3), (4, 2, 1))
                        if target < len(slots) and slots[target] > 0 and mask & bit
                    ]
                    land = lands.get(land_id, {"id": land_id, "name": "", "caption": ""})
                    position = {"slot": slot, **land, "nextSlots": next_slots, **land_contents.get(land_id, {})}
                    positions.append(position)
                quests[quest_id] = {
                    "id": quest_id, "name": row["name"], "map": area.get("name", ""),
                    "mapId": map_id,
                    "caption": row["caption"] or "",
                    "ap": int(row["ap"]),
                    "lands": [lands[land_id] for land_id in land_ids if land_id > 0 and land_id in lands],
                    "firstLand": first_land,
                    "positions": positions,
                }
    return quests, {key: area for key, area in maps.items() if 1 <= key <= TCN_NORMAL_MAP_COUNT}


def native_action_card_catalog():
    filler_ids = set()
    with (SERVER_CSV / "ja/EventCards.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            if row["filler"] == "1":
                # Ruby allocates physical IDs within each band across both entrants' event decks.
                first_id = int(row["event_no"])
                filler_ids.update(range(first_id, first_id + 2 * int(row["max_in_deck"])))

    cards = {}
    with (SERVER_CSV / "tcn/ActionCards.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            card_id = int(row["id"])
            event_no = int(row["event_no"])
            cards[card_id] = {
                "id": card_id,
                "upper": {"type": int(row["u_type"]), "value": int(row["u_value"])},
                "lower": {"type": int(row["b_type"]), "value": int(row["b_value"])},
                "caption": row["caption"],
                "eventNo": event_no,
                "stockEventFiller": card_id in filler_ids and event_no == 0,
            }
    return cards


def native_quest_character_card_catalog():
    # The Traditional Chinese import uses this shared master when no TCN override exists.
    with (SERVER_CSV / "ja/CharaCards.csv").open(encoding="utf-8-sig", newline="") as source:
        return {int(row["id"]): int(row["hp"]) for row in DictReader(source)}


def native_deck_character_card_catalog():
    with (SERVER_CSV / "ja/Charactors.csv").open(encoding="utf-8-sig", newline="") as source:
        parents = {int(row["id"]): int(row["parent_id"] or 0) for row in DictReader(source)}

    cards = {}
    with (SERVER_CSV / "ja/CharaCards.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            card_id = int(row["id"])
            character_id = int(row["charactor_id"])
            name = row["name_tcn"] or ""
            if character_id not in parents or not name.strip():
                continue
            kind = int(row["kind"])
            # Match CharaCard#parent_id and #unlight_charactor_id independently.
            unlight_id = character_id
            if kind == REBORN_CHARACTER_CARD_KIND and character_id > REBORN_CHARACTER_ID_OFFSET:
                unlight_id -= REBORN_CHARACTER_ID_OFFSET
            cards[card_id] = {
                "id": card_id,
                "name": name,
                "kind": kind,
                "characterId": character_id,
                "unlightCharacterId": unlight_id,
                "parentId": parents[character_id] or character_id,
            }
    return cards


def native_avatar_starter_catalog():
    parts = {}
    with (SERVER_CSV / "ja/AvatarParts.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            part_id = int(row["id"])
            name = row["name_tcn"] or ""
            if part_id in AVATAR_STARTER_PART_IDS and name.strip():
                role = int(row["parts_type"])
                if 0 <= role <= 3:
                    parts[part_id] = {"id": part_id, "type": role, "name": name}

    cards = {}
    with (SERVER_CSV / "ja/CharaCards.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            card_id = int(row["id"])
            name = row["name_tcn"] or ""
            if card_id in AVATAR_STARTER_CARD_IDS and name.strip():
                cards[card_id] = {"id": card_id, "name": name}

    return {
        "parts": [parts[part_id] for part_id in AVATAR_STARTER_PART_IDS if part_id in parts],
        "cards": [cards[card_id] for card_id in AVATAR_STARTER_CARD_IDS if card_id in cards],
    }


def client_config(server_offset, direct_sockets):
    root = ElementTree.parse(PUBLIC_CONFIG / "config.xml.orig").getroot()
    for node in root.findall(".//host/*/*/name"):
        node.text = HOST
    for node in root.findall(".//host/data_servers/*/port"):
        node.text = "12003"
    if direct_sockets:
        for node in root.findall(".//host/*/*/port"):
            port = int(node.text)
            if port in PORTS:
                node.text = str(port + server_offset)
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def https_origin(value):
    try:
        url = URL(value)
        if url.scheme == "https" and url.host and url.user is None:
            return str(url.origin())
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("use the HTTPS URL from the authenticated preview")


def validate_news(path):
    try:
        feed = ElementTree.parse(path).getroot()
    except (OSError, ElementTree.ParseError) as error:
        raise ValueError(f"--news must point to a readable news XML file: {error}") from error
    if feed.find("news") is None:
        raise ValueError("--news XML must have the original client's news element")
    return path.resolve()


def create_app(
    client, assets, ruffle, listen_port, server_offset,
    preview_origin=None, direct_sockets=False, *, native=False, news=None,
    tcn_device_font=None, source_login_wasm=None,
):
    if native and (preview_origin or direct_sockets):
        raise ValueError("native mode uses loopback WebSocket clients")
    if native and tcn_device_font is not None:
        raise ValueError("--tcn-device-font is only available in Ruffle mode")
    if source_login_wasm is not None:
        if not native:
            raise ValueError("--source-login-wasm requires --native")
        source_login_wasm = validate_source_login_wasm(source_login_wasm)
        if news is None:
            news = SOURCE_LOGIN_ROOT / "news.example.xml"
    if news is not None:
        news = validate_news(news)
    origins = {f"http://{HOST}:{listen_port}"}
    socket_sources = [f"ws://{HOST}:{listen_port}"]
    if preview_origin:
        origins.add(preview_origin)
        socket_sources.append("wss://" + URL(preview_origin).host_port_subcomponent)
    csp = "; ".join((
        "default-src 'self'",
        "script-src 'self'" if native else "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self'" if native else "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "connect-src 'self' " + " ".join(socket_sources),
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
    ))

    async def add_headers(request, response):
        policy = csp
        if source_login_wasm is not None and request.path == "/source-login/":
            policy = csp.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
        response.headers["Content-Security-Policy"] = policy
        response.headers["X-Content-Type-Options"] = "nosniff"

    async def static_asset(request):
        filename = (assets / request.match_info["filename"]).resolve()
        if not filename.is_relative_to(assets):
            raise web.HTTPNotFound()
        if filename.suffix.lower() == ".swf" and not filename.stem.endswith("_ch"):
            chinese = filename.with_stem(f"{filename.stem}_ch").resolve()
            if chinese.is_relative_to(assets) and chinese.is_file():
                filename = chinese
        if not filename.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(filename)

    async def relay(request):
        port = int(request.match_info["port"])
        if port not in PORTS:
            raise web.HTTPNotFound()
        if request.headers.get("Origin") not in origins:
            raise web.HTTPForbidden()

        socket = web.WebSocketResponse(max_msg_size=1024 * 1024)
        if not socket.can_prepare(request).ok:
            raise web.HTTPBadRequest()
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(HOST, port + server_offset), timeout=3
            )
        except (OSError, TimeoutError) as error:
            raise web.HTTPServiceUnavailable() from error

        async def forward():
            try:
                while data := await reader.read(65536):
                    await socket.send_bytes(data)
            finally:
                await socket.close()

        receiver = None
        try:
            await socket.prepare(request)
            receiver = asyncio.create_task(forward())
            async for message in socket:
                if message.type != WSMsgType.BINARY:
                    break
                writer.write(message.data)
                await writer.drain()
        finally:
            if receiver is not None:
                receiver.cancel()
                with suppress(asyncio.CancelledError, OSError):
                    await receiver
            writer.close()
            with suppress(OSError):
                await writer.wait_closed()
        return socket

    def serve_file(path, headers=None):
        async def handle_file(_request):
            return web.FileResponse(path, headers=headers)
        return handle_file

    async def config(_request):
        return web.Response(
            body=client_config(server_offset, direct_sockets), content_type="application/xml"
        )

    app = web.Application()
    app.on_response_prepare.append(add_headers)
    app.router.add_get(r"/socket/{port:\d+}", relay)
    news_path = news if native else news or PUBLIC_CONFIG / "news.xml.orig"
    if news_path is not None:
        app.router.add_get(
            "/public/news.xml", serve_file(news_path, {"Content-Type": "application/xml"})
        )

    if native:
        app.router.add_get("/", serve_file(NATIVE_ROOT / "index.html"))
        app.router.add_get("/replay/", serve_file(NATIVE_ROOT / "replay.html"))
        app.router.add_get("/api/replay-baseline", serve_file(REPLAY_BASELINE))
        for filename in (
            "client.js", "style.css", "transport.js", "session.js",
            "wire.js", "srp.js", "login.js", "panel.js", "panel-webgl.js", "data-bootstrap.js", "quest-data.js",
            "replay.js", "replay-model.js", "replay.css", "news.js",
        ):
            app.router.add_get(f"/{filename}", serve_file(NATIVE_ROOT / filename))

        asset_urls = dict.fromkeys(NATIVE_ASSETS)
        for kind, path in native_asset_files(assets).items():
            url = f"/public/{NATIVE_ASSETS[kind]}"
            asset_urls[kind] = url
            app.router.add_get(url, serve_file(path))
        panel = native_panel_skin(assets)
        asset_urls["panel"] = PANEL_SKIN_URL if panel else None
        if panel:
            app.router.add_get(PANEL_SKIN_URL, serve_file(panel))
        if source_login_wasm is not None:
            if panel is None:
                raise ValueError("--source-login-wasm requires the pinned panel in the original --assets mirror")
            bgm = f"public/{NATIVE_ASSETS['audio']}"
            if pinned_native_asset(assets, bgm, SOURCE_LOGIN_BGM_SHA256) is None:
                raise ValueError(f"--source-login-wasm requires the pinned {bgm} in the original --assets mirror")
            for filename, digest in SOURCE_LOGIN_SOUND_EFFECTS.items():
                path = pinned_native_asset(assets, filename, digest)
                if path is None:
                    raise ValueError(f"--source-login-wasm requires the pinned {filename} in the original --assets mirror")
                app.router.add_get(f"/{filename}", serve_file(path, {"Content-Type": "audio/mpeg"}))
            for filename, digest in SOURCE_LOGIN_SWFS.items():
                path = pinned_native_asset(assets, filename, digest)
                if path is None:
                    raise ValueError(f"--source-login-wasm requires the pinned {filename} in the original --assets mirror")
                app.router.add_get(f"/source-login/assets/{Path(filename).name}", serve_file(path))
            app.router.add_get("/source-login/", serve_file(SOURCE_LOGIN_ROOT / "index.html"))
            for filename in (
                "style.css", "login.js", "stage.js", "swf-vector.js", "title-motion.js", "news.js", "bgm.js",
            ):
                app.router.add_get(f"/source-login/{filename}", serve_file(SOURCE_LOGIN_ROOT / filename))
            app.router.add_get("/source-login/assets/panel_gene.png", serve_file(panel))
            app.router.add_get("/source-login/fonts/bradley-gratis.ttf", serve_file(
                SOURCE_LOGIN_ROOT / "fonts/bradley-gratis.ttf", {"Content-Type": "font/ttf"},
            ))
            app.router.add_get("/source-login/asset-decoder.wasm", serve_file(
                source_login_wasm, {"Content-Type": "application/wasm"},
            ))

        async def services(_request):
            return web.json_response({"services": [
                {"name": name, "port": port, "ping": ping, "pong": pong}
                for name, port, ping, pong in SERVICES
            ]})

        async def assets_info(_request):
            return web.json_response(asset_urls)

        quests, maps = {}, {}
        with suppress(OSError):
            quests, maps = native_quest_catalog()
        cards = {}
        with suppress(OSError):
            cards = native_action_card_catalog()
        character_hp = {}
        with suppress(OSError):
            character_hp = native_quest_character_card_catalog()
        deck_characters = None
        with suppress(OSError):
            deck_characters = native_deck_character_card_catalog()
        avatar_starters = None
        with suppress(OSError):
            avatar_starters = native_avatar_starter_catalog()

        async def quest_catalog(request):
            values = request.query.getall("id", [])
            map_values = request.query.getall("map", [])
            requested = values + map_values
            if not requested or len(values) > MAX_QUEST_IDS or len(map_values) > 1 or any(
                not value.isascii() or not value.isdecimal() or len(value) > 10
                for value in requested
            ):
                raise web.HTTPBadRequest(text="Pass positive quest IDs or one map ID.")
            if any(not 0 < int(value) <= 2**31 - 1 for value in requested):
                raise web.HTTPBadRequest(text="Pass positive quest IDs or one map ID.")
            ids = dict.fromkeys(map(int, values))
            area = maps.get(int(map_values[0])) if map_values else None
            return web.json_response({
                "quests": [quests[quest_id] for quest_id in ids if quest_id in quests],
                "map": area,
            })

        async def action_card_catalog(request):
            values = request.query.getall("id", [])
            if not 1 <= len(values) <= MAX_ACTION_CARD_IDS or any(
                not value.isascii() or not value.isdecimal() or len(value) > 10
                or not 0 < int(value) <= 2**31 - 1 for value in values
            ):
                raise web.HTTPBadRequest(text="Pass positive action card IDs.")
            ids = dict.fromkeys(map(int, values))
            return web.json_response({"cards": [cards[card_id] for card_id in ids if card_id in cards]})

        async def quest_character_cards(request):
            query = request.query.getall("ids", [])
            if len(query) != 1:
                raise web.HTTPBadRequest(text="Pass one comma-separated list of character card IDs.")
            values = query[0].split(",", MAX_QUEST_CHARACTER_CARD_IDS)
            if len(values) > MAX_QUEST_CHARACTER_CARD_IDS or any(
                not value.isascii() or not value.isdecimal() or len(value) > 10
                or not 0 < int(value) <= 2**31 - 1 for value in values
            ):
                raise web.HTTPBadRequest(text="Pass up to six positive character card IDs.")
            definitions = deck_characters or {}
            cards = []
            for card_id in dict.fromkeys(map(int, values)):
                if card_id not in character_hp:
                    continue
                card = {"id": card_id, "hp": character_hp[card_id]}
                definition = definitions.get(card_id)
                if definition:
                    card["name"] = definition["name"]
                cards.append(card)
            return web.json_response({"cards": cards}, headers={"Cache-Control": "no-store"})

        async def avatar_starter_catalog(_request):
            headers = {"Cache-Control": "no-store"}
            if avatar_starters is None:
                raise web.HTTPServiceUnavailable(text="Avatar starter metadata is unavailable.", headers=headers)
            return web.json_response(avatar_starters, headers=headers)

        async def deck_character_catalog(request):
            headers = {"Cache-Control": "no-store"}
            query = request.query.getall("ids", [])
            if len(query) != 1:
                raise web.HTTPBadRequest(text="Pass one comma-separated list of character card IDs.", headers=headers)
            values = query[0].split(",", MAX_DECK_CHARACTER_CARD_IDS)
            if len(values) > MAX_DECK_CHARACTER_CARD_IDS or any(
                not value.isascii() or not value.isdecimal() or len(value) > 10
                or not 0 < int(value) <= 2**31 - 1 for value in values
            ):
                raise web.HTTPBadRequest(text="Pass up to 64 positive character card IDs.", headers=headers)
            if deck_characters is None:
                raise web.HTTPServiceUnavailable(text="Deck character metadata is unavailable.", headers=headers)
            ids = dict.fromkeys(map(int, values))
            return web.json_response(
                {"cards": [deck_characters[card_id] for card_id in ids if card_id in deck_characters]},
                headers=headers,
            )

        app.router.add_get("/api/services", services)
        app.router.add_get("/api/assets", assets_info)
        app.router.add_get("/api/quest-catalog", quest_catalog)
        app.router.add_get("/api/action-card-catalog", action_card_catalog)
        app.router.add_get("/api/quest-character-cards", quest_character_cards)
        app.router.add_get("/api/avatar-starter-catalog", avatar_starter_catalog)
        app.router.add_get("/api/deck-character-catalog", deck_character_catalog)
        return app

    index_path = ROOT / "index.html"
    head_tags = []
    if news is not None:
        head_tags.append('<meta name="unlight-title-news" content="1">')
    if tcn_device_font is not None:
        try:
            font_bytes = tcn_device_font.read_bytes()
        except OSError as error:
            raise ValueError(f"--tcn-device-font must point to a readable cwming.ttf: {error}") from error
        if sha256(font_bytes).hexdigest() != TCN_FONT_SHA256:
            raise ValueError("--tcn-device-font must match the pinned historical cwming.ttf SHA-256")
        head_tags.append(f'<meta name="unlight-tcn-device-font" content="{TCN_FONT_URL}">')

        async def device_font(_request):
            return web.Response(body=font_bytes, content_type="font/ttf")

        app.router.add_get(TCN_FONT_URL, device_font)
    if head_tags:
        tags = "".join(f"  {tag}\n" for tag in head_tags)
        index = index_path.read_text(encoding="utf-8").replace("</head>", tags + "</head>", 1)

        async def classic_index(_request):
            return web.Response(text=index, content_type="text/html")

        app.router.add_get("/", classic_index)
    else:
        app.router.add_get("/", serve_file(index_path))
    for filename in ("player.css", "player.js"):
        app.router.add_get(f"/{filename}", serve_file(ROOT / filename))
    app.router.add_get("/Unlight.swf", serve_file(client))
    app.router.add_get("/public/config.xml", config)
    app.router.add_get("/public/{filename:.*}", static_asset)
    app.router.add_static("/ruffle/", ruffle)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, help="Compiled Unlight SWF")
    parser.add_argument("--assets", type=Path, help="Original assets' public directory")
    parser.add_argument("--ruffle", type=Path, help="Extracted Ruffle Web release")
    parser.add_argument("--news", type=Path, help="An existing original-client news.xml feed")
    parser.add_argument("--tcn-device-font", type=Path, help="Use the pinned historical cwming.ttf for Ruffle device text")
    parser.add_argument("--source-login-wasm", type=Path, help="Serve the opt-in source login page with this WASM decoder")
    parser.add_argument("--port", type=int, default=4330, help="HTTP port")
    parser.add_argument("--server-offset", type=int, default=0, help="Offset of legacy TCP ports")
    parser.add_argument("--preview-origin", type=https_origin, help="URL of an authenticated HTTP preview")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--direct-sockets", action="store_true", help="Use TCP ports for Ruffle Desktop")
    modes.add_argument("--native", action="store_true", help="Serve loopback native diagnostics")
    args = parser.parse_args()
    if args.preview_origin and args.direct_sockets:
        parser.error("--direct-sockets is for a loopback Ruffle Desktop session")
    if not 0 < args.port <= 65535 or any(not 0 < port + args.server_offset <= 65535 for port in PORTS):
        parser.error("ports must be between 1 and 65535")
    if args.source_login_wasm is not None and not args.native:
        parser.error("--source-login-wasm requires --native")
    if args.native:
        if args.client or args.ruffle or args.preview_origin:
            parser.error("--native cannot use --client, --ruffle, or --preview-origin")
        try:
            app = create_app(
                None, args.assets, None, args.port, args.server_offset,
                native=True, news=args.news, tcn_device_font=args.tcn_device_font,
                source_login_wasm=args.source_login_wasm,
            )
        except ValueError as error:
            parser.error(str(error))
    else:
        if not all((args.client, args.assets, args.ruffle)):
            parser.error("--client, --assets, and --ruffle are required in Ruffle mode")
        if not args.client.is_file():
            parser.error("--client must point to a compiled SWF")
        with args.client.open("rb") as file:
            if file.read(3) not in (b"FWS", b"CWS", b"ZWS"):
                parser.error("--client must point to a compiled SWF")
        if not (args.assets / "sound/bgm/ulbgm01.mp3").is_file():
            parser.error("--assets must point to the original public assets")
        if not (args.ruffle / "ruffle.js").is_file():
            parser.error("--ruffle must point to an extracted Ruffle Web release")
        try:
            app = create_app(
                args.client.resolve(), args.assets.resolve(), args.ruffle.resolve(),
                args.port, args.server_offset, args.preview_origin, args.direct_sockets,
                news=args.news, tcn_device_font=args.tcn_device_font,
            )
        except ValueError as error:
            parser.error(str(error))
    web.run_app(app, host="0.0.0.0" if args.preview_origin else HOST, port=args.port)


if __name__ == "__main__":
    main()
