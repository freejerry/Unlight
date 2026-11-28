#!/usr/bin/env python3
"""Build the original Main ItemView catalogue and bitmap sheets from the pinned mirror.

Run with `python3 -B tools/legacy-web/extract_item_inventory_art.py ASSETS OUTPUT
    --swfdump /path/to/Flex/bin/swfdump`. Existing original starter, quick drawer
and reward art are referenced in place. Flex is only used to read vector tags.
"""

import argparse
from copy import deepcopy
from csv import DictReader
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from struct import unpack_from
from subprocess import SubprocessError
from xml.etree.ElementTree import ParseError

from PIL import Image

from extract_character_card_art import bitmap, checked_source
from extract_lobby_item_art import ItemMovie
from extract_quest_detail_art import REVISION, authored_primitives, kind, png_bytes, rasterize, timeline
from pack_avatar_wardrobe import sheet_layout
from source_stage_art import starter_icon_sources, tags


ROOT = Path(__file__).resolve().parents[2]
SOURCE_UI = ROOT / "source-login"
OUTPUT_URL = "/source-login/item-inventory-art/"
ITEM_DIR = "public/image/avatar_items/"
PART_DIR = "public/image/avatar_parts/icon/"
MASTER = {
    "items": ("app/server/data/csv/ja/AvatarItems.csv", "4621c7cf928cb37c289637cfc632f7dac7c1deb36e1bbdcc60fe88f143d936f9"),
    "parts": ("app/server/data/csv/ja/AvatarParts.csv", "173518d3d7e1dcb75130ef1f1808d282bb5c4252c46d8bca2c7c5c3133eaa084"),
    "partIcons": ("app/client/src/view/image/common/AvatarPartIconImage.as", "9ea75c61e53b46102ddb3468b7afe0d36841119d58296cafd5228c743b058e7b"),
}
TABS = {
    "items": [(0, "虛擬人物"), (1, "任務"), (2, "對戰"), (4, "突擊"), (3, "特殊")],
    "body": list(enumerate(("身體顏色", "眼睛", "嘴", "髮型"))),
    "clothes": list(enumerate(("上衣", "下衣", "禮服", "鞋"), 10)),
    "accessories": list(enumerate(("頭", "手臂", "臉", "ETC"), 20)),
}


class Bits:
    def __init__(self, data):
        self.data = data
        self.offset = 0

    def read(self, n, signed=False):
        value = 0
        for bit in range(self.offset, self.offset + n):
            value = value * 2 + ((self.data[bit // 8] >> (7 - bit % 8)) & 1)
        self.offset += n
        return value - (1 << n) if signed and n and value >> (n - 1) else value

    def pair(self):
        n = self.read(5)
        return self.read(n, True), self.read(n, True)

    def matrix(self):
        scale = self.pair() if self.read(1) else (65536, 65536)
        skew = self.pair() if self.read(1) else (0, 0)
        return scale, skew, self.pair()

    def rect(self):
        n = self.read(5)
        return tuple(self.read(n, True) for _ in range(4))

    def byte_offset(self):
        return (self.offset + 7) // 8


def read_bitmap_movie(path, records):
    """Decode a single rectangular bitmap fill while respecting the two authored transforms."""
    active = [(code, data) for code, data in records if code not in (1, 8, 9, 69, 76, 82, 86)]
    if len(active) != 3 or sum(code == 1 for code, _ in records) != 1:
        return None
    (image_type, data), (shape_type, shape), (place_type, place) = active
    if image_type not in (6, 20, 21, 35, 36) or shape_type not in (2, 22, 32) or place_type != 26 or place[0] != 6:
        return None
    if shape[:2] != place[3:5]:
        return None
    shape_bits = Bits(shape[2:])
    left, right, top, bottom = shape_bits.rect()
    fills = shape[2 + shape_bits.byte_offset():]
    if fills[:1] != b"\x01" or fills[1] not in (64, 65, 66, 67) or fills[2:4] != data[:2]:
        return None
    (bx, by), skew, (tx, ty) = Bits(fills[4:]).matrix()
    (sx, sy), outer_skew, (px, py) = Bits(place[5:]).matrix()
    if skew != (0, 0) or outer_skew != (0, 0) or min(bx, by, sx, sy) <= 0:
        return None
    if image_type == 21:
        with Image.open(BytesIO(data[2:])) as original:
            image = original.convert("RGBA")
    else:
        image = bitmap(path, image_type, data)
    if max(abs(left - tx), abs(top - ty), abs(right - tx - bx * image.width / 65536),
           abs(bottom - ty - by * image.height / 65536)) > 1.1:
        return None  # A clipped or nonrectangular image needs the timeline renderer.
    if max(abs((right - left) * sx / 65536 / 20 - image.width),
           abs((bottom - top) * sy / 65536 / 20 - image.height)) > .055:
        return None  # Pack direct pixels only at their authored scale.
    return image, (left * sx / 65536 + px) / 20, (top * sy / 65536 + py) / 20


class InventoryMovie(ItemMovie):
    def shape(self, shape, offset, ratio=0, **options):
        def invisible_with_extra_flag(style):
            return kind(style) == "linestyle" and style.get("color") == "#00000000" and int(style.get("flags", 0)) & 8

        if any(invisible_with_extra_flag(style) for style in shape.iter()):
            # The shared renderer handles visible flags precisely. Bit 8 has no visible effect in zero-alpha paths.
            shape = deepcopy(shape)
            for style in filter(invisible_with_extra_flag, shape.iter()):
                style.set("flags", str(int(style.get("flags")) & ~8))
        return super().shape(shape, offset, ratio, **options)


def master_rows(key):
    with checked_source(ROOT, MASTER[key]).open(encoding="utf-8-sig", newline="") as source:
        return list(DictReader(source))


def existing_item_icons(assets):
    icons = {}
    for folder in ("quest-result-art", "lobby-achievement-art", "lobby-item-art"):
        base = SOURCE_UI / folder
        manifest = json.loads((base / "index.json").read_text(encoding="utf-8"))
        if manifest["assetRevision"] != REVISION:
            raise ValueError(f"Unexpected shared art revision: {folder}")
        if folder == "lobby-item-art":
            groups = [manifest["items"]]
        elif folder == "lobby-achievement-art":
            groups = [manifest["card"]["items"]]
        else:
            bonus = manifest["bonus"]
            groups = [bonus["items"], bonus["itemPanel"]["items"]]
        for entries in groups:
            for entry in entries.values():
                icon = entry["icon"]
                name = icon["file"]
                source = manifest["provenance"][name]
                path, digest, frame = (source[k] for k in ("source", "sourceSha256", "sourceFrame"))
                checked_source(base, (name, source["sha256"]))
                checked_source(assets, (path, digest))
                x, y = source.get("anchor", [0, 0])
                icons[path, frame] = {"url": f"/source-login/{folder}/{name}",
                                      "x": icon["x"] - x, "y": icon["y"] - y,
                                      "width": icon["width"], "height": icon["height"]}
    return icons


def pack_art(sprites, output, stock_layers):
    identifiers, aliases, metrics = {}, {}, {}
    for key, (image, _, _) in sprites.items():
        digest = (image.size, sha256(image.tobytes()).digest())
        original = identifiers.setdefault(digest, key)
        if original == key:
            metrics[key] = {"width": image.width, "height": image.height}
        else:
            aliases[key] = original
    placed_icons = {}
    sheets = []
    # Fresh characters show both starter clothes without loading a broad inventory sheet.
    stock = {key: value for key, value in metrics.items() if key[0] in stock_layers}
    additional = {key: value for key, value in metrics.items() if key not in stock}
    for index, (width, height, placements) in enumerate(sheet_layout(stock) + sheet_layout(additional)):
        name = f"sheet-{index:02d}.png"
        with Image.new("RGBA", (width, height)) as sheet:
            for key, x, y in placements:
                image, left, top = sprites[key]
                sheet.paste(image, (x, y))
                placed_icons[key] = {"url": OUTPUT_URL + name, "x": left, "y": top,
                                     "width": image.width, "height": image.height,
                                     "atlas": {"x": x, "y": y, "width": image.width, "height": image.height,
                                               "sheetWidth": width, "sheetHeight": height}}
            content = png_bytes(sheet)
        (output / name).write_bytes(content)
        sheets.append({"file": name, "width": width, "height": height, "sha256": sha256(content).hexdigest()})
    for key, original in aliases.items():
        _, x, y = sprites[key]
        placed_icons[key] = placed_icons[original] | {"x": x, "y": y}
    return placed_icons, sheets


def extract(assets, output, swfdump, stock_only=False):
    item_rows, part_rows = master_rows("items"), master_rows("parts")
    mapping = checked_source(ROOT, MASTER["partIcons"]).read_text(encoding="utf-8").split("URLSet:Object = {")[1].split("};")[0]
    part_files = dict(re.findall(r'^\s*(\d+)\s*:\s*"([\w.]+\.swf)"', mapping, re.M))
    starter = {source: id for id, (source, _) in starter_icon_sources.items()}
    stock_layers = {PART_DIR + part_files[id] for id in ("42", "43")}
    shared = existing_item_icons(assets)
    icons, sprites, sources, uncovered, movies, frames = {}, {}, {}, {}, {}, {}

    def icon_for(relative, frame, direct=None):
        key = (relative, frame)
        if key in icons or key in sprites or key in uncovered:
            return key
        path = assets / relative
        if not path.is_file():
            uncovered[key] = "Pinned source file absent"
            return key
        sources[relative] = sha256(path.read_bytes()).hexdigest()
        if direct or key in shared:
            icons[key] = direct or shared[key]
            return key
        if stock_only and relative not in stock_layers:
            uncovered[key] = "Outside the prepared stock icon bundle"
            return key
        records = list(tags(path))
        raw_frames = sum(code == 1 for code, _ in records)
        if frame > raw_frames > 0:
            frames[key] = raw_frames  # MovieClip's numeric frame is capped to the last authored frame.
        direct_image = read_bitmap_movie(path, records)
        if direct_image:
            sprites[key] = direct_image
            return key
        if swfdump is None:
            uncovered[key] = "Timeline extraction pending"
            return key
        try:
            if relative not in movies:
                movie = InventoryMovie(assets, path.stem, swfdump, pin=(relative, sources[relative]))
                movies[relative] = movie, [placements for _, placements in timeline(movie.root)]
            movie, layers = movies[relative]
            actual_frame = min(frame, len(layers))
            if actual_frame != frame:
                frames[key] = actual_frame
            primitives, _ = authored_primitives(movie, layers[actual_frame - 1], preserve_stroke_alpha=True)
            sprites[key] = rasterize(primitives)
        except (IndexError, KeyError, OSError, ValueError, ParseError, SubprocessError) as error:
            uncovered[key] = f"Pinned timeline extraction failed ({type(error).__name__})"
            print(f"{relative} frame {frame}: {error}")
        return key

    item_defs = {}
    for row in item_rows:
        id = row["id"]
        icon = icon_for(ITEM_DIR + row["image"], int(row["image_frame"]))
        item_defs[id] = {"name": row["name_tcn"], "caption": row["caption_tcn"], "kind": int(row["kind"]),
                         "subTypes": [int(kind) for kind in row["sub_kind"].split("+") if kind], "icon": icon}

    part_defs = {}
    for row in part_rows:
        id = row["id"]
        relative = PART_DIR + part_files.get(id, part_files["1"])
        reuse = None
        if relative in starter:
            reuse = {"url": f"/source-login/assets/starter-parts/{starter[relative]}",
                     "x": 0, "y": 0, "width": 128, "height": 128}
        icon = icon_for(relative, 1, reuse)
        part_defs[id] = {"name": row["name_tcn"], "caption": row["caption_tcn"], "kind": int(row["parts_type"]),
                         "durationMinutes": int(row["duration"]), "icon": icon}

    output.mkdir(parents=True, exist_ok=True)
    packed, sheets = pack_art(sprites, output, stock_layers)
    icons.update(packed)
    for definitions in (item_defs, part_defs):
        for definition in definitions.values():
            definition["icon"] = icons.get(definition["icon"])
    index = {"assetRevision": REVISION, "items": item_defs, "parts": part_defs,
             "tabs": {name: [{"kind": kind, "label": label} for kind, label in tabs] for name, tabs in TABS.items()},
             "sheets": sheets, "provenance": {"master": MASTER, "sourceFiles": sources,
                                              "resolvedFrames": {f"{p}#{f}": n for (p, f), n in frames.items()}},
             "unavailable": {f"{p}#{f}": reason for (p, f), reason in uncovered.items()}}
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(icons)} icon sources in {len(sheets)} sheets or reused routes; {len(uncovered)} unavailable")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path)
    parser.add_argument("--stock-only", action="store_true", help="Reuse installed stock icons and extract the two starting clothes")
    args = parser.parse_args()
    if args.swfdump is None and not args.stock_only:
        parser.error("--swfdump is required for the complete original icon catalogue")
    extract(args.assets, args.output, args.swfdump, args.stock_only)
