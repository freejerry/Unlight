"""Serve the original Unlight client or native diagnostics with a loopback relay."""

import argparse
import asyncio
from contextlib import suppress
from csv import DictReader
from functools import lru_cache
from hashlib import sha256
from json import loads
from pathlib import Path
from xml.etree import ElementTree

from aiohttp import WSCloseCode, WSMsgType, web
from yarl import URL

import source_stage_art


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
CHARACTER_CARD_KIND = 0  # CC_KIND_CHARA
REBORN_CHARACTER_CARD_KIND = 8  # CC_KIND_REBORN_CHARA
EPISODE_CHARACTER_CARD_KIND = 13  # CC_KIND_EPISODE
REBORN_CHARACTER_ID_OFFSET = 4000  # CHARACTOR_ID_OFFSET_REBORN
RENAMED_CHARACTER_IDS = {9}  # Avatar::RENAME_CHARACTORS
# REGIST_PARTS and REGIST_CARDS in app/server/src/constants/constants.rb.
AVATAR_STARTER_PART_IDS = (1, 2, 3, 5, 6, 7, 10, 11, 12, 15, 16, 17, 24, 25, 26,
                           27, 28, 29, 32, 33, 34, 37, 38, 39)
AVATAR_STARTER_CARD_IDS = (1, 21, 31, 101, 111)
TCN_NORMAL_MAP_COUNT = 36  # QUEST_CAP 35 is the zero-based last ordinary progression flag.
TCN_TUTORIAL_MAP_IDS = range(2009, 2014)
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
SOURCE_QUEST_BATTLE_SOUND_EFFECTS = {
    "public/sound/se/ulse06.mp3": "b0655a05ef946fe47671a2bbf67768545ed02a59f084c93d3f951773a57abde0",
    "public/sound/se/ulse07.mp3": "752ae4ec5ab51843bbf311d149c451d2fefb1b04f968e58cef232da0c43ab1f7",
    "public/sound/se/ulse08.mp3": "3140c532a2f6471fd4d3d5cf278077aebd04a691a0837d327652a8e84d6db2d7",
    "public/sound/se/ulse09.mp3": "1e9ccf21bdb3c9f9c937fc31dfeb08838b29c1e570eefca2034477027e8f2395",
    "public/sound/se/ulse10_f.mp3": "25992bf771fbd92beb3d7a44b4241721121105119959a7d20f60c76926844d61",
    "public/sound/se/ulse12.mp3": "8310c5703786e71f0599fbf86aad4fdda663bda3095c9c03ba5574287d6f07b1",
    "public/sound/se/ulse15.mp3": "d97f878eaa31eee16dd00f478d1889da16b662673f422d4a0e7e1c2f2e796203",
    "public/sound/se/ulse16.mp3": "493b8b0ed2c64cff4fbf401f44d4fce971518e5a23106267ec4edfdbace7bea3",
    "public/sound/se/ulse23.mp3": "35144255330e5f81d9445b831f4df7e0ee769191eaed509e6c7d53c5a594a430",
    "public/sound/se/ulse28.mp3": "6345735fa4f8686ac3c1bd093e008bcbc5d6308bbf86539c7d055c42f3de0024",
    "public/sound/se/ulse29.mp3": "78623927f2591f3ff6fe5afac445e7e6c661f485b02638a7bb49f539d3c4052a",
}
SOURCE_SCENE_TRACKS = {
    "public/sound/bgm/ulbgm02.mp3": "7ed9b16414f8691f080cc592830f0d120b372bb3aa77f183106a8c7fe6bbfbfd",
    "public/sound/bgm/ulbgm03.mp3": "ebb719112de8cc37999a487ebe13f69c5dd84f77fbc96a7adfc64df453d34ab8",
    "public/sound/bgm/bgm000.mp3": "7074134ca9d72caec00ce4251fe23d754211216e42e78c115d7dcb9e536e3b4f",
    "public/sound/bgm/bgm001.mp3": "966a1de504451efdaea5a8a86fe975ab377b19d152799c57398c8ae24931bdf2",
    "public/sound/bgm/bgm002.mp3": "7c0c2e0d453649f367f9bd15d9ae5b0477d92878b7d5f652a9847fb5567fed5d",
    "public/sound/bgm/bgm003.mp3": "6674fffd1801f8c331e6ed3a3679f64d73fb84114ffe87cd92bab47388d38acc",
    "public/sound/bgm/bgm004.mp3": "7891d31cda2657b16b327ad24176f5d0108900aa591be0ded0997a1501a9ef50",
    "public/sound/bgm/bgm005.mp3": "706cf0cc4d4b46823d5e2e2484d383e41623a4ecb92852677ddad68d111303b1",
    "public/sound/bgm/bgm006.mp3": "edf97c5cd11373b43708d09b72d763a882c806e3c780ef9b1213b7f55980c44a",
    "public/sound/bgm/bgm007.mp3": "566d624716eb337862044dc8f1389d0f3e378abe66a5fbea95189533bf3e9508",
    "public/sound/bgm/bgm008.mp3": "43244c9edb20a18a65fb4976eab27bd2717ded59ed2ae0c6806b2b72b2030838",
    "public/sound/bgm/bgm009.mp3": "2f179e7fe7b42a06f832fea02595d43cb0663e45753f7e02e838d81c66172915",
    "public/sound/bgm/bgm010.mp3": "e61f2b2c75ff54f8a8bfb01f40d678f3a551ae681f13a517881cc3d4ece22b36",
    "public/sound/bgm/bgm011.mp3": "95971edab9cab6e762ac8d59b207fc82696fcf510c544ad7a6db787ceae31789",
}
SOURCE_SCENE_ART = {
    "onboarding-opening.jpg": (
        "data/image/regist/prestory_ch.swf", "b543be147b194c5e572c9c58e2494bfe3e23f4cc591b8d2f9c55168c5c2504b2",
        source_stage_art.jpeg, "image/jpeg",
    ),
    "onboarding-create.jpg": (
        "data/image/regist/make_bg.swf", "82fc4b98f75214e32544ce170f1af182c44ccae24e5abd40716f3551f5493ca8",
        source_stage_art.jpeg, "image/jpeg",
    ),
    "lobby-background.png": (
        "data/image/lobby/entrance_bg.swf", "04b573b540a394e2e2377fffed42809a7826fb936900b6badf30dbc6d2c67827",
        source_stage_art.indexed_png, "image/png",
    ),
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


def source_avatar_levels():
    # Avatar.nextExp indexes the original client table up to LEVEL_MAX.
    source = (ROOT.parents[1] / "app/client/lib/Const.as").read_text(encoding="utf-8")
    level_max = int(source.split("const LEVEL_MAX:int", 1)[1].split(";", 1)[0].split("=", 1)[1])
    table = source.split("const LEVEL_EXP_TABLE:Array", 1)[1].split("[", 1)[1].split("]", 1)[0]
    values = " ".join(line.partition("//")[0] for line in table.splitlines())
    thresholds = [int(value) for value in values.split(",") if value.strip()]
    if level_max < 1 or len(thresholds) < level_max or thresholds[0] != 0:
        raise ValueError("Invalid avatar level progression in Const.as")
    return {"levelMax": level_max, "thresholds": thresholds[:level_max]}


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
    treasure_types = {}
    fixed_gem_treasures = {}
    fixed_character_treasures = {}
    own_card_treasures = {}
    character_cards = {}
    with suppress(OSError):
        character_cards = native_quest_character_card_catalog()
    with suppress(OSError):
        with (SERVER_CSV / "ja/TreasureDatas.csv").open(encoding="utf-8-sig", newline="") as source:
            for row in DictReader(source):
                with suppress(TypeError, ValueError):
                    treasure_id, treasure_type = (int(row.get(key)) for key in ("id", "treasure_type"))
                    if not (0 < treasure_id <= 0x7fffffff and 0 <= treasure_type <= 0x7fffffff):
                        continue
                    treasure_types[treasure_id] = treasure_type
                    allocation, slot_type, value = (
                        int(row.get(key)) for key in ("allocation_type", "slot_type", "value")
                    )
                    if allocation != 0 or not (0 <= slot_type <= 0x7fffffff and 0 < value <= 0x7fffffff):
                        continue
                    fixed = {"treasureId": treasure_id, "type": treasure_type, "slotType": slot_type, "value": value}
                    # Source TREASURE_ALLOC_TYPE_NONE, TG_CHARA_CARD and TG_GEM.
                    if treasure_type == 1 and value in character_cards:
                        fixed_character_treasures[treasure_id] = fixed
                    elif treasure_type == 5:
                        fixed_gem_treasures[treasure_id] = fixed
                    elif treasure_type == 6 and slot_type == 1 and value == 1:
                        # TG_OWN_CARD stores a level. Avatar#get_own_card resolves the grant at runtime.
                        own_card_treasures[treasure_id] = fixed
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
            stage = int(row.get("stage"))
            if 0 <= stage <= 0x7fffffff:
                contents["stage"] = stage
        with suppress(TypeError, ValueError):
            enemy_id = int(row.get("monstar_no"))
            if 0 <= enemy_id <= 0x7fffffff:
                contents["enemyId"] = enemy_id
                treasure_id = int(row.get("treasure_no"))
                event_id = int(row.get("event_no"))
                if all(0 <= value <= 0x7fffffff for value in (treasure_id, event_id)):
                    contents["eventNo"] = event_id
                    # QuestLand#treasure_genre uses the master type and falls back to the stored ID.
                    contents["treasureType"] = treasure_types.get(treasure_id, treasure_id)
                    contents["emptyTerrain"] = (enemy_id, treasure_id, event_id) == (0, 0, 0)
                    if event_id == 0 and (gem_treasure := fixed_gem_treasures.get(treasure_id)):
                        if enemy_id == 0:
                            contents["fixedGemTreasure"] = gem_treasure
                        elif gem_treasure["slotType"] == 1:
                            contents["fixedBattleGemTreasure"] = gem_treasure
                    if treasure_id in fixed_character_treasures:
                        contents["fixedCharacterTreasure"] = fixed_character_treasures[treasure_id]
                    if enemy_id > 0 and event_id == 0 and treasure_id in own_card_treasures:
                        contents["ownCardTreasure"] = own_card_treasures[treasure_id]
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
                    position = {
                        "slot": slot, **land, "nextMask": mask, "nextSlots": next_slots,
                        **land_contents.get(land_id, {}),
                    }
                    positions.append(position)
                quests[quest_id] = {
                    "id": quest_id, "name": row["name"], "map": area.get("name", ""),
                    "mapId": map_id, "mapClearTarget": area.get("clearTarget"),
                    "caption": row["caption"] or "",
                    "ap": int(row["ap"]),
                    "difficulty": int(row["difficulty"]), "rarity": int(row["rarity"]),
                    "kind": int(row["kind"]), "storyNo": int(row["story_no"] or 0),
                    "lands": [lands[land_id] for land_id in land_ids if land_id > 0 and land_id in lands],
                    "firstLand": first_land,
                    "positions": positions,
                }
    return quests, {
        key: area for key, area in maps.items()
        if 1 <= key <= TCN_NORMAL_MAP_COUNT or key in TCN_TUTORIAL_MAP_IDS
    }


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
                "image": row["image"] or "",
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
        characters = {int(row["id"]): row for row in DictReader(source)}

    # CharaCard#feats_id uses FeatInventory order. Feat.as derives the type from the caption phase.
    phase_types = {"攻撃": "atk", "防御": "deff", "移動": "mov"}
    feats = {}
    with (SERVER_CSV / "ja/Feats.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in DictReader(source):
            name = row["name_tcn"] or row["name"]
            caption = row["caption_tcn"] or row["caption"]
            phase = caption.partition("[")[2].partition("]")[0].partition(":")[0]
            feats[int(row["id"])] = {"name": name, "kind": phase_types.get(phase, "atk")}
    skills = {}
    with (SERVER_CSV / "ja/FeatInventories.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in sorted(DictReader(source), key=lambda row: int(row["id"])):
            if feat := feats.get(int(row["feat_id"])):
                skills.setdefault(int(row["chara_card_id"]), []).append(feat)

    with (SERVER_CSV / "ja/CharaCards.csv").open(encoding="utf-8-sig", newline="") as source:
        master_cards = list(DictReader(source))

    level_one_cards = {}
    for row in master_cards:
        if int(row["level"]) == 1 and 1 <= int(row["rarity"]) <= 5:
            key = (int(row["charactor_id"]), row["name_tcn"] or row["name"])
            level_one_cards.setdefault(key, []).append(int(row["id"]))

    cards = {}
    for row in master_cards:
        card_id = int(row["id"])
        character_id = int(row["charactor_id"])
        name = row["name_tcn"] or ""
        if character_id not in characters or not name.strip():
            continue
        kind = int(row["kind"])
        parent_id = int(characters[character_id]["parent_id"] or 0) or character_id
        # Match CharaCard#parent_id and #unlight_charactor_id independently.
        unlight_id = character_id
        if kind == REBORN_CHARACTER_CARD_KIND and character_id > REBORN_CHARACTER_ID_OFFSET:
            unlight_id -= REBORN_CHARACTER_ID_OFFSET
        card = {
            "id": card_id,
            "name": name,
            "abName": row["ab_name_tcn"] or "",
            "skills": skills.get(card_id, []),
            "kind": kind,
            "level": int(row["level"]),
            "slot": int(row["slot"]),
            "hp": int(row["hp"]),
            "ap": int(row["ap"]),
            "dp": int(row["dp"]),
            "characterId": character_id,
            "unlightCharacterId": unlight_id,
            "parentId": parent_id,
        }
        if kind in (CHARACTER_CARD_KIND, REBORN_CHARACTER_CARD_KIND, EPISODE_CHARACTER_CARD_KIND):
            # Avatar#get_own_card uses the vanguard's base character, with one renamed character.
            base_id = unlight_id if kind in (CHARACTER_CARD_KIND, REBORN_CHARACTER_CARD_KIND) else parent_id
            own_card_name = name
            if base_id in RENAMED_CHARACTER_IDS and base_id in characters:
                base = characters[base_id]
                own_card_name = base["name_tcn"] or base["name"]
            matches = level_one_cards.get((base_id, own_card_name), ())
            if len(matches) == 1:
                card["ownCardLevel1Id"] = matches[0]
        cards[card_id] = card
    return cards


def native_card_illustration_refs():
    with (SERVER_CSV / "ja/CharaCards.csv").open(encoding="utf-8-sig", newline="") as source:
        return {int(row["id"]): row["chara_image"] for row in DictReader(source)}


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

        async def forward_to_browser():
            while data := await reader.read(65536):
                await socket.send_bytes(data)

        async def forward_to_upstream():
            async for message in socket:
                if message.type != WSMsgType.BINARY:
                    break
                writer.write(message.data)
                await writer.drain()

        try:
            await socket.prepare(request)
            pipes = (asyncio.create_task(forward_to_browser()), asyncio.create_task(forward_to_upstream()))
            close_code = WSCloseCode.OK
            try:
                await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for pipe in pipes:
                    pipe.cancel()
                for pipe in pipes:
                    try:
                        await pipe
                    except asyncio.CancelledError:
                        pass
                    except OSError:
                        close_code = WSCloseCode.INTERNAL_ERROR
            # Stop both forwarding tasks before completing the WebSocket close handshake.
            await socket.close(code=close_code)
        finally:
            writer.close()
            with suppress(OSError):
                await writer.wait_closed()
        return socket

    def serve_file(path, headers=None):
        async def handle_file(_request):
            return web.FileResponse(path, headers=headers)
        return handle_file

    def serve_bytes(data, content_type):
        async def handle_bytes(_request):
            return web.Response(body=data, content_type=content_type)
        return handle_bytes

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
            for filename, digest in (SOURCE_SCENE_TRACKS | SOURCE_QUEST_BATTLE_SOUND_EFFECTS).items():
                if path := pinned_native_asset(assets, filename, digest):
                    app.router.add_get(f"/{filename}", serve_file(path, {"Content-Type": "audio/mpeg"}))
            for target, (filename, digest, decode, content_type) in SOURCE_SCENE_ART.items():
                if path := pinned_native_asset(assets, filename, digest):
                    app.router.add_get(f"/source-login/assets/{target}", serve_bytes(decode(path), content_type))
            for part_id, (filename, digest) in source_stage_art.starter_icon_sources.items():
                if path := pinned_native_asset(assets, filename, digest):
                    body, content_type = source_stage_art.decode_starter_icon(part_id, path)
                    app.router.add_get(f"/source-login/assets/starter-parts/{part_id}", serve_bytes(body, content_type))
            if path := pinned_native_asset(assets, *source_stage_art.starter_portrait_source):
                for card_id in source_stage_art.starter_portrait_ids:
                    body = source_stage_art.decode_starter_portrait(card_id, path)
                    app.router.add_get(f"/source-login/assets/starter-cards/{card_id}", serve_bytes(body, "image/png"))
            for filename, digest in SOURCE_LOGIN_SWFS.items():
                path = pinned_native_asset(assets, filename, digest)
                if path is None:
                    raise ValueError(f"--source-login-wasm requires the pinned {filename} in the original --assets mirror")
                app.router.add_get(f"/source-login/assets/{Path(filename).name}", serve_file(path))
            app.router.add_get("/source-login/", serve_file(SOURCE_LOGIN_ROOT / "index.html"))
            avatar_levels = source_avatar_levels()

            async def avatar_level_curve(_request):
                return web.json_response(avatar_levels)

            app.router.add_get("/source-login/avatar-levels.json", avatar_level_curve)
            for filename in (
                "style.css", "login.js", "stage.js", "panel-skin.js", "swf-vector.js", "title-motion.js", "news.js", "bgm.js",
                "onboarding.js", "onboarding.css", "lobby.js", "lobby.css", "options.js", "options.css",
                "quest-map.js", "quest-map.css", "quest-preview-data.js", "quest-battle-entry.js",
                "quest-battle-move.js", "quest-battle-exchange.js", "quest-dice-roll.js", "quest-hit-effect.js",
                "quest-battle-result.js", "quest-treasure-panel.js",
                "character-card.js", "battle-card.js",
                "lobby-avatar.js", "avatar-layer.js", "preferences.js", "avatar-catalog.json", "avatar-wardrobe/index.json",
            ):
                app.router.add_get(f"/source-login/{filename}", serve_file(SOURCE_LOGIN_ROOT / filename))
            for name in (
                "ap", "ap-fill", "ap-frame", "ap-mask", "background", "entrances", "favorite", "friend", "header",
                "item", "ranking", "record", "status", *(f"duel-stars-{count}" for count in range(4)),
            ):
                filename = f"lobby-art/{name}.png"
                app.router.add_get(f"/source-login/{filename}", serve_file(SOURCE_LOGIN_ROOT / filename))
            hover_root = SOURCE_LOGIN_ROOT / "lobby-art/hover"
            app.router.add_get("/source-login/lobby-art/hover/index.json", serve_file(hover_root / "index.json"))
            for image in sorted(hover_root.glob("*.png")):
                app.router.add_get(f"/source-login/lobby-art/hover/{image.name}", serve_file(image))
            for name in ("background.jpg", "back.png", "back-over.png"):
                filename = f"option-art/{name}"
                app.router.add_get(f"/source-login/{filename}", serve_file(SOURCE_LOGIN_ROOT / filename))
            quest_art = SOURCE_LOGIN_ROOT / "quest-art"
            for document in ("sources.json", "worlds.json"):
                app.router.add_get(f"/source-login/quest-art/{document}", serve_file(quest_art / document))
            for image in sorted(quest_art.glob("*")):
                if image.suffix in (".png", ".jpg"):
                    app.router.add_get(f"/source-login/quest-art/{image.name}", serve_file(image))
            card_art = SOURCE_LOGIN_ROOT / "card-art"
            app.router.add_get("/source-login/card-art/index.json", serve_file(card_art / "index.json"))
            for artifact in sorted(card_art.glob("*")):
                if artifact.suffix in (".png", ".woff"):
                    app.router.add_get(f"/source-login/card-art/{artifact.name}", serve_file(artifact))
            battle_card_art = SOURCE_LOGIN_ROOT / "battle-card-art"
            app.router.add_get("/source-login/battle-card-art/index.json", serve_file(battle_card_art / "index.json"))
            for artifact in sorted(battle_card_art.glob("*.png")):
                app.router.add_get(f"/source-login/battle-card-art/{artifact.name}", serve_file(artifact))
            quest_hit_art = SOURCE_LOGIN_ROOT / "quest-hit-art"
            app.router.add_get("/source-login/quest-hit-art/index.json", serve_file(quest_hit_art / "index.json"))
            for image in sorted(quest_hit_art.glob("*.png")):
                app.router.add_get(f"/source-login/quest-hit-art/{image.name}", serve_file(image))
            quest_result_art = SOURCE_LOGIN_ROOT / "quest-result-art"
            app.router.add_get("/source-login/quest-result-art/index.json", serve_file(quest_result_art / "index.json"))
            for artifact in sorted(quest_result_art.glob("*")):
                if artifact.suffix in (".png", ".woff"):
                    headers = {"Content-Type": "font/woff"} if artifact.suffix == ".woff" else None
                    app.router.add_get(f"/source-login/quest-result-art/{artifact.name}", serve_file(artifact, headers))

            illustration_hashes = {}
            with suppress(OSError):
                illustration_hashes = loads((card_art / "illustration-sources.json").read_bytes())["files"]
            if illustration_hashes:
                illustration_refs = native_card_illustration_refs()

                @lru_cache(maxsize=64)
                def card_illustration(filename):
                    digest = illustration_hashes.get(filename)
                    if not digest or Path(filename).name != filename or not filename.endswith(".swf"):
                        return None
                    path = pinned_native_asset(assets, f"public/image/{filename}", digest)
                    if not path:
                        return None
                    from extract_character_card_art import decode_card_illustration

                    return decode_card_illustration(path)

                async def source_card_illustration(request):
                    card_id = request.match_info["card_id"]
                    if not card_id.isascii() or not card_id.isdecimal() or len(card_id) > 10:
                        raise web.HTTPNotFound()
                    filename = illustration_refs.get(int(card_id))
                    try:
                        image = await asyncio.to_thread(card_illustration, filename) if filename else None
                    except ModuleNotFoundError as error:
                        if error.name != "PIL":
                            raise
                        raise web.HTTPServiceUnavailable(text="On-demand character art requires Pillow.") from error
                    if image is None:
                        raise web.HTTPNotFound()
                    return web.Response(body=image, content_type="image/png")

                app.router.add_get("/source-login/card-illustration/{card_id}.png", source_card_illustration)
            for sheet in sorted((SOURCE_LOGIN_ROOT / "avatar-wardrobe").glob("sheet-*.png")):
                app.router.add_get(f"/source-login/avatar-wardrobe/{sheet.name}", serve_file(sheet))
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
                    for field in ("name", "abName", "kind", "level", "slot", "ap", "dp"):
                        card[field] = definition[field]
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
