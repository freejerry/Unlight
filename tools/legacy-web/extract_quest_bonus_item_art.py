#!/usr/bin/env python3
"""Append the pinned Flash High/Low item window to an existing Quest result index.

Usage: python3 -B tools/legacy-web/extract_quest_bonus_item_art.py ASSETS OUTPUT \
    --swfdump /path/to/swfdump --mincho-font /path/to/wt004.ttf
"""

import argparse
import csv
from hashlib import sha256
import json
from pathlib import Path

from extract_character_card_art import FONT_REVISION, FONT_SHA, REVISION, write_font
from extract_quest_detail_art import (
    TWIPS, Movie, authored_primitives, bounds, kind, png_bytes, rasterize, timeline, translation,
)
from extract_quest_result_art import PINS


WINDOW = ("data/image/item/itemwindow_ch.swf", "c82efd9969992f1a6ebdad31b5e87c772fb3bb271bf261d87666ec7147c9c150")
ROW = ("data/image/item/itemwin_itembase.swf", "04959dea5b9989232eff51ec2ce460efbacba424306cf44cbf89c0e67a51cd86")
CLOVER = ("public/image/avatar_items/item_c_b000.swf", "de45574d19402c10a7721f34989fef80caab2b545fb5f473518a3116898e5a4b")
HEATH = ("public/image/avatar_items/item_c_b001.swf", "0406261daca46859ca7faf1b8b82e64f12161fa4a8fec2592dfd6a44137e85ee")
STAR = ("public/image/avatar_items/item_c_b003.swf", "0aacc0ca52032cc31c34a45d6aa99b427279bc6b389a0a549fef224daef79b70")
ICONS = {"4": (CLOVER, 1), "5": (HEATH, 1), "6": (HEATH, 2), "7": (HEATH, 3), "8": (STAR, 1)}
ITEM_CSV = Path(__file__).resolve().parents[2] / "app/server/data/csv/ja/AvatarItems.csv"


def button_records(movie, node):
    symbol = movie.symbol(node)
    if kind(symbol) != "DefineButton2":
        raise ValueError(f"Unexpected source button in {movie.path}")
    records = [child.attrib for child in symbol if kind(child) == "buttonRecord"]
    states = {state: [record for record in records if state in record["states"].split(",")]
              for state in ("up", "over", "down", "hitTest")}
    if not all(states.values()):
        raise ValueError(f"Missing original button states in {movie.path}")
    return states


def hit_rect(movie, node, records):
    points = []
    dx, dy = translation(node["matrix"])
    for record in records:
        x, y = translation(record["matrix"])
        x0, y0, x1, y1 = bounds(movie.symbol(record))
        points.append((x0 + x + dx, y0 + y + dy, x1 + x + dx, y1 + y + dy))
    left = min(box[0] for box in points)
    top = min(box[1] for box in points)
    right = max(box[2] for box in points)
    bottom = max(box[3] for box in points)
    return [value / TWIPS for value in (left, top, right - left, bottom - top)]


def item_master_rows():
    with ITEM_CSV.open(newline="", encoding="utf-8-sig") as source:
        rows = {row["id"]: row for row in csv.DictReader(source) if row["id"] in ICONS}
    if rows.keys() != ICONS.keys():
        raise ValueError("Missing original High/Low item metadata")
    for id, (pin, frame) in ICONS.items():
        row = rows[id]
        if ((row["image"], int(row["image_frame"]), row["kind"]) != (Path(pin[0]).name, frame, "2")
                or not row["name_tcn"] or not row["caption_tcn"]):
            raise ValueError(f"Unexpected original item definition {id}")
    return rows


def append_item_panel(assets, output, swfdump, mincho_font, index, result):
    source_rows = item_master_rows()
    panel = Movie(assets, "itemwindow_ch", swfdump, pin=WINDOW)
    row = Movie(assets, "itemwin_itembase", swfdump, pin=ROW)

    def save(filename, content, source, **evidence):
        (output / filename).write_bytes(content)
        index["provenance"][filename] = {"source": source.path.as_posix(), "sourceSha256": source.digest,
                                         "sha256": sha256(content).hexdigest(), **evidence}

    def draw(source, filename, placements, **evidence):
        pieces, shapes = authored_primitives(source, placements, preserve_stroke_alpha=True)
        image, x, y = rasterize(pieces)
        save(filename, png_bytes(image), source, shapeIds=shapes,
             bitmapIds=[piece.bitmap_id for piece in pieces if piece.bitmap_id is not None], **evidence)
        return {"file": filename, "x": x, "y": y, "width": image.width, "height": image.height}

    def button(source, filename, node, *, underlay=()):
        states = button_records(source, node)
        hit = hit_rect(source, node, states["hitTest"])
        variants = {}
        result = {}
        for state in ("up", "over", "down"):
            selector = tuple(tuple(sorted(record.items())) for record in states[state])
            if selector not in variants:
                variants[selector] = draw(
                    source, f"{filename}-{state}.png", [*underlay, node | {"buttonState": state}],
                    sourceInstance=node["name"], sourceButton=source.original_id(node),
                    sourceStates=[key for key in ("up", "over", "down") if states[key] == states[state]],
                    hitShapeIds=[source.original_id(original) for original in states["hitTest"]],
                )
            result[state] = variants[selector]
        return result | {"hit": hit}

    _, panel_root = next(timeline(panel.root))
    fixed = [obj for obj in panel_root if "name" not in obj]
    if [panel.original_id(obj) for obj in fixed] != [1, 3, 5, 7, 9]:
        raise ValueError("Unexpected original panel backing")
    plate = draw(panel, "bonus-item-panel.png", fixed, sourceDepths=[int(obj["depth"]) for obj in fixed])
    if (plate["x"], plate["y"], plate["width"], plate["height"]) != (0, 0, 208, 360):
        raise ValueError(f"Unexpected original Item drawer geometry: {plate}")
    controls = {name: button(panel, f"bonus-item-panel-{name}", panel.instance(f"btn_{name}"))
                for name in ("close", "use", "back", "next")}

    _, row_root = next(timeline(row.root))
    underlay = [obj for obj in row_root if "name" not in obj]
    if [row.original_id(obj) for obj in underlay] != [2]:
        raise ValueError("Unexpected original Item tile backing")
    row_art = button(row, "bonus-item-row", row.instance("btn_base"), underlay=underlay)
    row_art["selected"] = draw(row, "bonus-item-row-selected.png", underlay, sourceState="btn_base hidden")

    # ResultFrame is mounted five pixels below these SWF-local button positions.
    item = result.instance("b_item")
    x, y = translation(item["matrix"])
    item_art = button(result, "bonus-item", item | {"matrix": f"t{x},{y + 5 * TWIPS}"})
    if item_art["hit"] != [272, 149, 80, 80]:
        raise ValueError("Unexpected original Item entry button hit")

    font = "bonus-item-panel-mincho.woff"
    glyphs = "0123456789/-x" + "".join(row["name_tcn"] + row["caption_tcn"] for row in source_rows.values())
    write_font(mincho_font, output / font, [{"name_tcn": glyphs}])
    index["provenance"][font] = {
        "source": "res/data/wt004.ttf", "sourceRevision": FONT_REVISION, "sourceSha256": FONT_SHA,
        "sha256": sha256((output / font).read_bytes()).hexdigest(), "glyphs": glyphs,
    }

    movies = {pin: Movie(assets, Path(pin[0]).stem, swfdump, pin=pin) for pin in (CLOVER, HEATH, STAR)}
    items = {}
    for id, (pin, frame) in ICONS.items():
        source = movies[pin]
        row = source_rows[id]
        _, contents = list(timeline(source.root))[frame - 1]
        icon = draw(source, f"bonus-item-panel-icon-{id}.png", contents, sourceFrame=frame)
        items[id] = {"name": row["name_tcn"], "caption": row["caption_tcn"], "icon": icon}

    index["bonus"]["controls"]["item"] = item_art
    index["bonus"]["itemPanel"] = {
        "origin": [25, 25],
        "plate": plate,
        "controls": controls,
        "row": row_art,
        "list": {"x": 152, "y": 56, "step": 48, "maxRows": 6},
        "labels": {
            "name": [10, 5, 200, 30], "count": [5, 154, 135, 30], "duration": [5, 189, 135, 30],
            "caption": [5, 227, 130, 100], "rowCount": [10, 32, 40, 20], "page": [156, 342, 30, 20],
        },
        "iconAnchors": {"detail": {"x": 73, "y": 86, "scale": 0.7}, "row": {"x": 20, "y": 20, "scale": 0.2}},
        "items": items,
        "font": font,
        "motion": {"initialX": -125, "hiddenX": -250, "durationMs": 60, "easing": "sine-out"},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    args = parser.parse_args()
    index_path = args.output / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if index.get("assetRevision") != REVISION or not index.get("bonus"):
        parser.error("An existing pinned Quest result index with High/Low is required")
    result = Movie(args.assets, "result_ch", args.swfdump, pin=PINS["rewards"])
    append_item_panel(args.assets, args.output, args.swfdump, args.mincho_font, index, result)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
