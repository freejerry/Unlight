#!/usr/bin/env python3
"""Extract the pinned Lobby Record notice and its q3 reward art.

Usage: python3 -B tools/legacy-web/extract_lobby_achievement_art.py ASSETS OUTPUT \
    --swfdump /path/to/swfdump --mincho-font /path/to/wt004.ttf
"""

import argparse
from csv import DictReader
from hashlib import sha256
import json
from pathlib import Path
from struct import unpack_from

from PIL import Image

from extract_character_card_art import (
    BITMAP_TAGS, FONT_REVISION, FONT_SHA, REVISION, bitmap, checked_source, decode_card_illustration, write_font,
)
from extract_quest_detail_art import Movie, authored_primitives, png_bytes, rasterize, timeline
from source_stage_art import tags


REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / "app/server/data/csv"
QUEST_ART = REPO / "source-login/quest-result-art"
INFO = ("data/image/common/info_login.swf", "c97822f2e6a53d7111112be13d82d736b4034a2592aa3346e5a3e5a9906c5b2a")
ITEMS = {
    "3": ("public/image/avatar_items/item_c_a000.swf", "589c5ba7c05d521907c6ad6996fd4898cf0352f076446f6cdf737b24ef62712c", 3),
    "9": ("public/image/avatar_items/item_c_d000.swf", "97cbf340ad3d39279f5928e44b2efa918a94fcbd59272fb57cb4b781dfe4ec18", 1),
}
TITLE = "Record"
NOVICE_ACHIEVEMENTS = ("180", "181", "182")
CHALLENGE_MESSAGE = "追加了新的成就「__ARCHIEVEMENT_CAPTION__」。請您務必挑戰看看。"
SELECTABLE_MESSAGE = "恭喜。達成了「__ARCHIEVEMENT_CAPTION__」成就。請選擇獎勵。"
SELECTION_PROMPT = "請選擇"
CONFIRMATION_TITLE = "情報"
CONFIRMATION_MESSAGE = "獲得了__NAME__。"


def master_rows(file, ids):
    with (MASTER / file).open(encoding="utf-8-sig", newline="") as source:
        rows = {row["id"]: row for row in DictReader(source) if row["id"] in ids}
    if rows.keys() != set(ids):
        raise ValueError(f"Missing pinned master rows in {file}")
    return rows


def reused_art(index, layer):
    file = layer["file"]
    data = (QUEST_ART / file).read_bytes()
    if sha256(data).hexdigest() != index["provenance"][file]["sha256"]:
        raise ValueError(f"Reused Quest artwork digest changed: {file}")
    return layer | {"url": f"/source-login/quest-result-art/{file}"}


def notice_skin(assets, publish):
    source = checked_source(assets, INFO)
    bitmaps = {unpack_from("<H", data)[0]: (code, data) for code, data in tags(source) if code in BITMAP_TAGS}

    def layer(filename, bitmap_id, x, y, size, scaling=(65536, 65536), **selectors):
        image = bitmap(source, *bitmaps[bitmap_id])
        if image.size != size:
            raise ValueError(f"Unexpected bitmap size for {filename}")
        publish(filename, png_bytes(image), INFO, sourceBitmap=bitmap_id, **selectors)
        sx, sy = scaling
        return {"file": filename, "x": x, "y": y, "width": image.width * sx / 65536, "height": image.height * sy / 65536}

    # Root PlaceObject2 transforms and bitmap fills of pinned info_login.swf.
    panel = layer("information-panel.png", 1, 116, 144, (528, 416), sourceShape=2, sourceDepth=1, sourceFrame=1)
    portrait = layer("braw.png", 8, 147, 264, (99, 248), (65569, 65525), sourceInstance="braw", sourceShape=9,
                     sourceSprite=10, sourceFrame=1)
    scale = (65513, 65399)
    up = layer("ok-up.png", 3, 308, 529, (144, 24), scale, sourceInstance="btn_ok",
               sourceShape=4, sourceButton=7, sourceStates=["up"])
    over = layer("ok-over.png", 5, 308, 529, (144, 24), scale, sourceInstance="btn_ok",
                 sourceShape=6, sourceButton=7, sourceStates=["over", "down", "hitTest"])
    # The authored hit covers shape 6's exact 2879×479 twip clip.
    hit = [308, 529, 2879 * scale[0] / (20 * 65536), 479 * scale[1] / (20 * 65536)]
    return panel, portrait, {"up": up, "over": over, "down": over, "hit": hit}


def challenge_skin(assets, publish):
    source = checked_source(assets, INFO)
    bitmaps = {unpack_from("<H", data)[0]: bitmap(source, code, data)
               for code, data in tags(source) if code == 36 and unpack_from("<H", data)[0] in {11, 14}}
    challenge, novice_label = bitmaps[11], bitmaps[14]
    if challenge.size != (300, 160) or novice_label.size != (498, 88):
        raise ValueError("Unexpected original New Challenge sizes")
    publish("new-challenge.png", png_bytes(challenge), INFO, sourceBitmap=11, sourceShape=12,
            sourceSprite=13, sourceDepth=6, sourceInstance="record", sourceFrame=1)
    # Root novice is (380,416), containing its label at (-249,0) and the record at (-150,-152).
    novice = Image.new("RGBA", (498, 240))
    novice.alpha_composite(novice_label, (0, 152))
    novice.alpha_composite(challenge, (99, 0))
    publish("new-challenge-novice.png", png_bytes(novice), INFO, sourceBitmaps=[14, 11], sourceShapes=[15, 12],
            sourceSprites=[16, 13], sourceDepth=8, sourceInstance="novice", sourceFrame=1)
    return {
        "art": {"file": "new-challenge.png", "x": 230, "y": 264, "width": 300, "height": 160},
        "beginnerArt": {"file": "new-challenge-novice.png", "x": 131, "y": 264, "width": 498, "height": 240},
        "beginnerIds": [int(id) for id in NOVICE_ACHIEVEMENTS],
        "messageTemplate": CHALLENGE_MESSAGE,
    }


def selectable_card_ids(achievement):
    groups = [items[1:] for items in achievement["items"].split("+") if items.startswith("S")]
    if len(groups) != 1:
        raise ValueError("Expected one original selectable award group")
    ids = []
    for entry in groups[0].split("|"):
        kind, id, count, slot_type = map(int, entry.split("/"))
        if (kind, count, slot_type) != (1, 1, 0) or id <= 0 or id in ids:
            raise ValueError(f"Unexpected original selectable character award {entry}")
        ids.append(id)
    return ids


def character_faces(assets, ids):
    cards = master_rows("ja/CharaCards.csv", {str(id) for id in ids})
    known = json.loads((REPO / "source-login/card-art/illustration-sources.json").read_text())["files"]
    faces = {}
    sources = {}
    for id, card in cards.items():
        name = card["name_tcn"]
        file = card["chara_image"]
        if not name or file not in known or card["kind"] not in {"0", "3"}:
            raise ValueError(f"Unexpected original character card definition {id}")
        relative = f"public/image/{file}"
        digest = known[file]
        illustration = checked_source(assets, (relative, digest))
        if decode_card_illustration(illustration) is None:
            raise ValueError(f"Existing original card illustration is not renderable: {file}")
        faces[id] = {"id": int(id), "name": name,
                     **{key: int(card[key]) for key in ("kind", "level", "slot", "hp", "ap", "dp")}}
        sources[id] = {"source": relative, "sourceSha256": digest}
    return faces, sources


def item_icon(assets, swfdump, source_path, digest, frame):
    source = Movie(assets, Path(source_path).stem, swfdump, pin=(source_path, digest))
    _, parts = list(timeline(source.root))[frame - 1]
    artwork, shape_ids = authored_primitives(source, parts, preserve_stroke_alpha=True)
    image, x, y = rasterize(artwork)
    return image, x, y, shape_ids


def extract(args):
    if sha256(args.mincho_font.read_bytes()).hexdigest() != FONT_SHA:
        raise ValueError("Expected the original wt004.ttf")
    items = master_rows("ja/AvatarItems.csv", ITEMS)
    achievements = master_rows("tcn/Achievements.csv", {"1", "2", "3", "31", "32", *NOVICE_ACHIEVEMENTS})
    choice_ids = selectable_card_ids(achievements["2"])
    characters, illustrations = character_faces(args.assets, [10006, 10007, *choice_ids])
    if (characters["10006"]["kind"], characters["10007"]["kind"]) != (3, 3) or any(
        characters[str(id)]["kind"] != 0 for id in choice_ids
    ):
        raise ValueError("Unexpected character-card kinds in the Lobby rewards")

    for id, (path, _, frame) in ITEMS.items():
        info = items[id]
        if (info["image"], int(info["image_frame"])) != (Path(path).name, frame) or not info["name_tcn"] or not info["caption_tcn"]:
            raise ValueError(f"Unexpected original item definition {id}")

    existing = json.loads((QUEST_ART / "index.json").read_text(encoding="utf-8"))
    if existing["assetRevision"] != REVISION:
        raise ValueError("Quest artwork uses a different asset revision")
    treasure = existing["treasure"]
    gem = {
        "frame": reused_art(existing, treasure["gem"]["frame"]),
        "icon": reused_art(existing, treasure["gem"]["icon"]),
        "title": dict(treasure["gem"]["title"]),
        "caption": treasure["gem"]["caption"],
    }
    font_ref = reused_art(existing, {"file": gem["title"]["font"]})
    gem["title"]["fontUrl"] = font_ref["url"]
    back = reused_art(existing, treasure["card"]["back"])
    # NoticePanel's pivot is (375,383). The existing Quest back was exported for (224,260).
    px, py = (375, 383)
    qx, qy = treasure["card"]["pivot"]
    back = back | {"x": back["x"] + px - qx, "y": back["y"] + py - qy}

    args.output.mkdir(parents=True, exist_ok=True)
    provenance = {}

    def publish(filename, content, pin, **selectors):
        (args.output / filename).write_bytes(content)
        provenance[filename] = {
            "source": pin[0], "sourceSha256": pin[1],
            "sha256": sha256(content).hexdigest(), **selectors,
        }

    panel, portrait, ok = notice_skin(args.assets, publish)
    new_challenge = challenge_skin(args.assets, publish)

    font = "achievement-mincho.woff"
    glyphs = TITLE + "0123456789x Lv." + "".join(row["name"] for row in characters.values()) + "".join(
        row["name_tcn"] + row["caption_tcn"] for row in items.values()
    ) + "".join(row["caption"] for row in achievements.values()) + SELECTION_PROMPT + CONFIRMATION_TITLE
    glyphs += CHALLENGE_MESSAGE + SELECTABLE_MESSAGE + CONFIRMATION_MESSAGE
    write_font(args.mincho_font, args.output / font, [{"name_tcn": glyphs}])
    provenance[font] = {"source": "res/data/wt004.ttf", "sourceRevision": FONT_REVISION, "sourceSha256": FONT_SHA,
                         "sha256": sha256((args.output / font).read_bytes()).hexdigest(), "glyphs": glyphs}

    faces = {}
    for id, (path, digest, frame) in ITEMS.items():
        # ItemCardClip positions AvatarItemImage at the same original local anchor as GemCardClip.
        icon, x, y, shape_ids = item_icon(args.assets, args.swfdump, path, digest, frame)
        filename = f"item-{id}.png"
        publish(filename, png_bytes(icon), (path, digest), sourceFrame=frame, shapeIds=shape_ids, anchor=[83, 100])
        faces[id] = {
            "frame": gem["frame"],
            "icon": {"file": filename, "x": x + 83, "y": y + 100, "width": icon.width, "height": icon.height},
            "title": {"text": items[id]["name_tcn"], "font": font, "x": 0, "y": 5, "width": 164, "height": 100},
            "caption": {"text": items[id]["caption_tcn"], "font": font, "x": 15, "y": 180, "width": 144, "height": 90},
        }

    index = {
        "assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
        "assetLicense": "CC-BY-ND-4.0", "panel": panel, "portrait": portrait, "ok": ok, "font": font,
        "title": {"text": TITLE, "x": 300, "y": 166, "width": 150, "height": 30},
        "achievements": {key: row["caption"] for key, row in achievements.items()},
        "newChallenge": new_challenge,
        "selectable": {
            "pivot": [375, 371], "face": [295, 251], "messageTemplate": SELECTABLE_MESSAGE,
            "dropdown": {"x": 300, "y": 493, "width": 160, "height": 18,
                         "dropdownWidth": 125, "rowCount": 7, "prompt": SELECTION_PROMPT},
            "choices": {"2": choice_ids},
            "confirmation": {"delayMs": 399, "height": 100, "title": CONFIRMATION_TITLE,
                             "messageTemplate": CONFIRMATION_MESSAGE},
        },
        "card": {
            "back": back, "pivot": [px, py], "width": 168, "height": 240, "face": [px - 80, py - 120],
            "gem": gem, "items": faces,
            "characters": characters,
            "quantity": [30, 80, 96, 48],
            "motion": {"backHoldMs": 200, "flipDurationMs": 300, "flipDegrees": 180, "showFaceAtDeg": 94},
        },
        "references": {
            file: existing["provenance"][file] for file in (
                back["file"], gem["frame"]["file"], gem["icon"]["file"], gem["title"]["font"],
            )
        } | {"memoryIllustration": illustrations["10006"], "characterIllustrations": illustrations},
        "provenance": provenance,
    }
    (args.output / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    extract(parser.parse_args())
