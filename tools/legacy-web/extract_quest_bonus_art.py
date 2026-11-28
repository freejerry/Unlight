#!/usr/bin/env python3
"""Append the original TCN High/Low artwork to an existing Quest result index.

Usage: python3 -B tools/legacy-web/extract_quest_bonus_art.py ASSETS OUTPUT \
    --swfdump /path/to/swfdump --ffdec /path/to/ffdec.jar --mincho-font /path/to/wt004.ttf
"""

import argparse
import csv
from hashlib import sha256
import json
from pathlib import Path
from struct import unpack_from
from subprocess import check_output
from tempfile import TemporaryDirectory

from PIL import Image

from extract_battle_card_art import FFDEC_SHA256, dice_mesh
from extract_character_card_art import FONT_REVISION, FONT_SHA, REVISION, checked_source, write_font
from extract_quest_detail_art import (
    QUEST_STAGE_FRAME_RATE, TWIPS, Movie, authored_primitives, kind, nested_tags, png_bytes, rasterize, timeline,
)
from extract_quest_result_art import PINS, STAGE, item_icon_movie, stage_movie
from extract_quest_hit_art import swf_tag
from source_stage_art import tags


RESULT_ROLL = ("data/image/game/result/result_roll.swf", "2acd656a25a6fe56d7a1ba31c468f3af9d53e42a9a4443a53b6cc68a4db93669")
RANK = ("data/image/game/result/itemrank.swf", "051a7b600edf1f6e2562e06ad312521ee1ea99701dba96b5e90196e0520dbc62")
CARD_BACKDROP = ("data/image/game/result/frame_card.swf", "0e4bef638b10ce8531b21a768cd4431b8410367e26485eaacb7458c15a5d4e44")
EXP_ICON = ("public/image/avatar_items/item_a_a000.swf", "7687463a3d029608a7a79433f8c9db3c8c63aac4c22963d78d3d149f0dec6b84")
DICE_MODEL = ("public/image/sixdice.dae", "c13ac9ee6ffd9d56c6be3c73cfb1dc10c7facef6e7efc9ed9c4a2084312601b7")
DICE_TEXTURE = ("public/image/tex/sixdice.png", "bb9266928b75d8304c520cb2fd9eb9fc4dd5e9e69000c8f8c7f39f94840f4a65")
HITS = {"high": [340, 80, 80, 80], "low": [340, 218, 80, 80], "next": [272, 149, 80, 80],
        "get": [408, 149, 80, 80], "exit": [408, 149, 80, 80]}
CARD_LABELS = {"exp": "獲得EXP增加", "gem": "獲得GEM增加"}
# Normal Quest reward candidates observed on the stock q568 fixture.
ITEMS = {
    "11": ("public/image/avatar_items/item_c_b004.swf", "3cfb2f92c2c383406080936d0ae30814096e7ee2a7ed8dc56a2066432aacc739", 1),
    "15": ("public/image/avatar_items/item_e_b000.swf", "14f16a2cc2ef98e2c50e5a1ff2e29569198e6bd964595e9d142b2fbe871af269", 3),
}
ITEM_CSV = Path(__file__).resolve().parents[2] / "app/server/data/csv/ja/AvatarItems.csv"


def rectangle(pieces):
    bounds = [piece.bounds for piece in pieces]
    left = min(box[0] for box in bounds)
    top = min(box[1] for box in bounds)
    right = max(box[2] for box in bounds)
    bottom = max(box[3] for box in bounds)
    return [value / TWIPS for value in (left, top, right - left, bottom - top)]


def result_position(placement):
    # ResultScene mounts ResultFrame at (0,5).
    prefix, _, suffix = placement["matrix"].rpartition("t")
    x, y = map(int, suffix.split(","))
    return placement | {"matrix": f"{prefix}t{x},{y + 5 * TWIPS}"}


def filtered_plate(source):
    records = list(tags(source))
    if sum(code == 1 for code, _ in records) != 1 or sum(code == 9 for code, _ in records) != 1:
        raise ValueError("Unexpected original reward card backdrop")
    (sprite,) = [data for code, data in records if code == 39
                 and any(tag == 43 and label == b"get\0" for tag, label in nested_tags(data))]
    symbol, frame_count = unpack_from("<HH", sprite)
    frame = 1
    labels = {}
    for code, data in nested_tags(sprite):
        if code == 43:
            labels[data.rstrip(b"\0").decode("ascii")] = frame
        elif code == 1:
            frame += 1
    if labels != {"normal": 1, "get": 2} or frame_count != 16 or frame != frame_count + 1:
        raise ValueError("Unexpected original Get timeline")
    # The source SWF's gray stage color is not part of an embedded ResultCardFrame.
    # Advance the original nested clip one frame at a time while keeping the same root display list.
    content = b"".join(swf_tag(code, data) for code, data in records if code not in (0, 9))
    return stage_movie(source, frame_count, content + swf_tag(1) * (frame_count - 1)), symbol, frame_count


def render_filtered(ffdec, movie_bytes, frame_count=1):
    with TemporaryDirectory(prefix="unlight-bonus-art-") as directory:
        scratch = Path(directory)
        movie = scratch / "art.swf"
        movie.write_bytes(movie_bytes)
        check_output(["java", "-Xmx192m", "-XX:ActiveProcessorCount=2", "-Djava.awt.headless=true",
                      f"-Duser.home={scratch}", "-jar", ffdec,
                      "-onerror", "abort", "-format", "frame:png", "-export", "frame", scratch, movie])
        for frame in range(1, frame_count + 1):
            with Image.open(scratch / f"{frame}.png") as raw:
                image = raw.convert("RGBA")
            if image.size != STAGE or image.getpixel((0, 0))[3] or image.getpixel((759, 679))[3]:
                raise ValueError("Unexpected size or background in original reward art")
            crop = image.getchannel("A").getbbox()
            if not crop:
                raise ValueError("Original reward art is empty")
            yield image.crop(crop), *crop[:2]


def generate(args):
    if sha256(args.ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
        raise ValueError("Expected ffdec.jar from the JPEXS 26.6.0 ZIP release")
    if sha256(args.mincho_font.read_bytes()).hexdigest() != FONT_SHA:
        raise ValueError("Expected the original wt004.ttf")
    index_path = args.output / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if index.get("assetRevision") != REVISION:
        raise ValueError("Quest result index uses a different asset revision")

    provenance = index["provenance"]
    # Check all pinned raw dependencies before replacing any output files.
    pins = (PINS["rewards"], RESULT_ROLL, RANK, CARD_BACKDROP, EXP_ICON, DICE_MODEL, DICE_TEXTURE,
            *(item[:2] for item in ITEMS.values()))
    paths = {pin[0]: checked_source(args.assets, pin) for pin in pins}
    with ITEM_CSV.open(newline="", encoding="utf-8-sig") as source:
        item_rows = {row["id"]: row for row in csv.DictReader(source) if row["id"] in ITEMS}
    if item_rows.keys() != ITEMS.keys():
        raise ValueError("Missing original reward item metadata")
    for id, (path, _, frame) in ITEMS.items():
        row = item_rows[id]
        if (row["image"], int(row["image_frame"])) != (Path(path).name, frame) or not row["name_tcn"] or not row["caption_tcn"]:
            raise ValueError(f"Unexpected original item metadata for #{id}")

    def publish_bytes(file, content, pin, **selectors):
        (args.output / file).write_bytes(content)
        provenance[file] = {"source": pin[0], "sourceSha256": pin[1],
                            "sha256": sha256(content).hexdigest(), **selectors}
        return file

    def publish(file, pin, image, x, y, **selectors):
        return {"file": publish_bytes(file, png_bytes(image), pin, **selectors),
                "x": x, "y": y, "width": image.width, "height": image.height}

    def select(source, placement, file, *, frame=None, state=None, preserve_stroke_alpha=False):
        pieces, shapes = authored_primitives(source, [placement], preserve_stroke_alpha=preserve_stroke_alpha)
        selectors = {"sourceInstance": placement["name"], "sourceSymbol": source.original_id(placement),
                     "shapeIds": shapes, "bitmapIds": [piece.bitmap_id for piece in pieces if piece.bitmap_id is not None]}
        if frame is not None:
            selectors["sourceFrame"] = frame
        if state is not None:
            selectors["sourceStates"] = state
        if file is None:
            return pieces, selectors
        return publish(file, (source.path.as_posix(), source.digest), *rasterize(pieces), **selectors)

    def button_states(panel, placement):
        symbol = panel.symbol(placement)
        if kind(symbol) != "DefineButton2":
            raise ValueError("Unexpected original High/Low button tag")
        states = ("up", "over", "down", "hitTest")
        button_records = [record.attrib for record in symbol if kind(record) == "buttonRecord"]
        return {state: [record for record in button_records if state in record["states"].split(",")]
                for state in states}

    panel = Movie(args.assets, "result_ch", args.swfdump, pin=PINS["rewards"])
    controls, selected = {}, {}
    for name, expected in HITS.items():
        placement = result_position(panel.instance(f"b_{name}"))
        records = button_states(panel, placement)
        if not all(records.values()) or records["over"] != records["down"] or records["up"] == records["over"]:
            raise ValueError(f"Unexpected {name} button states")
        up = select(panel, placement | {"buttonState": "up"}, f"bonus-{name}-up.png", state=["up"])
        over = select(panel, placement | {"buttonState": "over"}, f"bonus-{name}-over.png", state=["over", "down"])
        pieces, hit_selector = select(panel, placement | {"buttonState": "hitTest"}, None)
        hit = rectangle(pieces)
        if hit != expected:
            raise ValueError(f"Unexpected {name} hit rectangle")
        provenance[up["file"]]["hitShapeIds"] = hit_selector["shapeIds"]
        controls[name] = {"up": up, "over": over, "down": over, "hit": hit}
        if name in ("high", "low"):
            on = result_position(panel.instance(f"b_{name}_on"))
            on_pieces, on_selector = select(panel, on, None)
            on_image, x, y = rasterize(on_pieces)
            if ((x, y, *on_image.size) != (over["x"], over["y"], over["width"], over["height"])
                    or sha256(png_bytes(on_image)).hexdigest() != provenance[over["file"]]["sha256"]):
                raise ValueError(f"Original selected {name} art differs from its Over state")
            selected[name] = over
            provenance[over["file"]]["selectedInstance"] = on_selector["sourceInstance"]
            provenance[over["file"]]["selectedSymbol"] = on_selector["sourceSymbol"]

    number = result_position(panel.instance("num_roll"))
    if len(list(timeline(panel.symbol(number)))) != 13:
        raise ValueError("Unexpected original High/Low number timeline")
    numbers = {str(value): select(panel, number | {"spriteFrame": value}, f"bonus-number-{value}.png", frame=value)
               for value in range(2, 13)}

    rank = Movie(args.assets, "itemrank", args.swfdump, pin=RANK)
    rank_mask, _ = select(rank, rank.instance("star_mask"), None)
    roll = Movie(args.assets, "result_roll", args.swfdump, pin=RESULT_ROLL)
    animations = {}
    for role, instance in (("success", "roll_suc"), ("failure", "roll_fail")):
        placement = roll.instance(instance)
        if len(list(timeline(roll.symbol(placement)))) != 5:
            raise ValueError(f"Unexpected original {role} timeline")
        animations[role] = [select(roll, placement | {"spriteFrame": frame}, f"bonus-{role}-{frame}.png", frame=frame)
                            for frame in range(1, 5)]

    frame_source = paths[CARD_BACKDROP[0]]
    movie_bytes, symbol, count = filtered_plate(frame_source)
    stages = render_filtered(args.ffdec, movie_bytes, count)
    frame = publish("bonus-card-backdrop.png", CARD_BACKDROP, *next(stages),
                    sourceFrame=1, sourceInstance="frame_card", sourceSymbol=symbol, sourceLabel="normal")
    get = []
    exported = {}
    for frame_no, (image, x, y) in enumerate(stages, 2):
        key = sha256(image.tobytes()).digest(), x, y, image.size
        if key not in exported:
            exported[key] = publish(f"bonus-card-get-{frame_no:02}.png", CARD_BACKDROP, image, x, y,
                                    sourceFrame=frame_no, sourceInstance="frame_card", sourceSymbol=symbol,
                                    sourceLabel="get")
        get.append(exported[key])
    if len(exported) < 2:
        raise ValueError("Original Get timeline did not advance")
    exp_source = paths[EXP_ICON[0]]
    (exp_image,) = render_filtered(args.ffdec, item_icon_movie(exp_source, list(tags(exp_source))))
    exp = publish("bonus-exp-icon.png", EXP_ICON,
                  *exp_image,
                  sourceFrame=1, anchor=[83, 100])
    font = args.output / "bonus-card-name.woff"
    glyphs = "".join(CARD_LABELS.values()) + "".join(
        row["name_tcn"] + row["caption_tcn"] for row in item_rows.values()
    )
    write_font(args.mincho_font, font, [{"name_tcn": glyphs}])
    provenance[font.name] = {"source": "res/data/wt004.ttf", "sourceRevision": FONT_REVISION, "sourceSha256": FONT_SHA,
                             "sha256": sha256(font.read_bytes()).hexdigest(), "glyphs": glyphs}

    gem = index["treasure"]["gem"]
    cards = {"frame": frame, "get": {"frames": get, "framesPerSecond": QUEST_STAGE_FRAME_RATE}}
    for kind_name, icon, offset in (("exp", exp, -62), ("gem", gem["icon"], -56)):
        cards[kind_name] = {
            "frame": gem["frame"], "icon": icon,
            "title": {"text": CARD_LABELS[kind_name], "font": font.name, "x": 0, "y": 5, "width": 164, "height": 100},
            "caption": {"x": offset, "y": 185, "width": 200, "height": 100},
        }
    items = {}
    for id, (path, digest, frame_no) in ITEMS.items():
        source = paths[path]
        image = item_icon_movie(source, list(tags(source)), frame_no)
        (filtered,) = render_filtered(args.ffdec, image)
        icon = publish(f"bonus-item-{id}.png", (path, digest), *filtered,
                       sourceFrame=frame_no, anchor=[83, 100])
        row = item_rows[id]
        items[id] = {
            "frame": gem["frame"], "icon": icon,
            "title": {"text": row["name_tcn"], "font": font.name, "x": 0, "y": 5, "width": 164, "height": 100},
            "caption": {"text": row["caption_tcn"], "font": font.name, "x": 15, "y": 180, "width": 144, "height": 90},
        }

    index["bonus"] = {
        "panel": select(panel, result_position(panel.instance("frame_base")), "bonus-panel.png"),
        "controls": controls, "selected": selected, "numbers": numbers,
        "rank": {"plate": select(rank, rank.instance("premiumrank"), "bonus-rank.png", preserve_stroke_alpha=True),
                 "stars": select(rank, rank.instance("star"), "bonus-stars.png"), "mask": rectangle(rank_mask)},
        "roll": {"framesPerSecond": QUEST_STAGE_FRAME_RATE, "stopFrame": 4, "leadInMs": 2000 / 6, **animations},
        "dice": {
            "mesh": dice_mesh(paths[DICE_MODEL[0]]), "source": DICE_MODEL[0], "sourceSha256": DICE_MODEL[1],
            "texture": publish_bytes("bonus-sixdice.png", paths[DICE_TEXTURE[0]].read_bytes(), DICE_TEXTURE),
            "camera": {"position": [0, 60, 27], "focus": 500, "zoom": 1, "rotation": [90, 90, 0]},
            # Viewport3D(300,300,true,true) uses the attached 780×680 stage size.
            "viewport": [60, 35, 780, 680],
            "sourceViewport": [300, 300],
        },
        "cards": cards,
        "items": items,
    }
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--ffdec", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    generate(parser.parse_args())
