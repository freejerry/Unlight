#!/usr/bin/env python3
"""Extract the original TCN quick drawer's basic-item catalogue and icon frames.

python3 -B tools/legacy-web/extract_lobby_item_art.py ASSETS OUTPUT \
    --swfdump /path/to/Flex/bin/swfdump --mincho-font /path/to/wt004.ttf

The drawer and its tile skins are shared with the established Quest result bundle.
The generated catalogue contains public item definitions alone.
"""

import argparse
from copy import deepcopy
from csv import DictReader
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path

from extract_character_card_art import FONT_REVISION, FONT_SHA, REVISION, checked_source, write_font
from extract_quest_bonus_item_art import ROW, WINDOW
from extract_quest_detail_art import Movie, authored_primitives, kind, png_bytes, rasterize, timeline


REPO = Path(__file__).resolve().parents[2]
ITEM_CSV = ("app/server/data/csv/ja/AvatarItems.csv",
            "4621c7cf928cb37c289637cfc632f7dac7c1deb36e1bbdcc60fe88f143d936f9")
RESULT_ART = REPO / "source-login/quest-result-art"
RESULT_URL = "/source-login/quest-result-art/"
SOURCE_DIR = "public/image/avatar_items/"
ICON_PINS = {
    "item_c_a000.swf": "589c5ba7c05d521907c6ad6996fd4898cf0352f076446f6cdf737b24ef62712c",
    "item_c_a001.swf": "2f366600de8aabdcf70e5484558e18c1b282b250c515ba49524933382dc10332",
    "item_c_b100.swf": "75f51b8dfd6acd75b7b182542e56b093bf15d164fc71d8e57fd68bf9ef957dcf",
    "item_c_b150.swf": "a8b38d19f6ae90d6512be40262ccd194fc3b4595cc0e901e5d15c2658ba02f3d",
    "item_c_b160.swf": "af3932cde799ade058f44d9de5a408561635cb49d36d966bddb5005ba433e37a",
    "item_c_b200.swf": "92748c3c44559c02afdd61a6021a3fec8e8b967ab9c224fe42aba5a27a3b7c7e",
    "item_c_b201.swf": "e7a2bd4968a2ac88943c784774e1040ce1837bd35e46324277f8b4479f871ba3",
    "item_c_b300.swf": "f0a48915be3fba429ecff33b53a70d363672950f4832076b9aec1776c9566cf3",
    "item_c_e000.swf": "748c02ee16c36cb0c894dceac1106311927337b28e50462a9d98fd57e7819243",
    "item_c_e001.swf": "650752b8f5ac319a1fc84792c35fd602a1275a324797c0acc51c49a9e3ae93ad",
    "item_c_e002.swf": "3c5db4039a6a4f8132efde1efe7971fe3766aa8aa3a82b9b606d945e33c18198",
    "item_c_e028.swf": "a6faedf9ea743e8fcb40bbdbfee8c414ba876e9c62c958c76902db12f36ee18f",
    "item_c_e049.swf": "4bbb0bc075ed303d5966d8ac90de8eb963d896dff0adda97b617bb27f20ce10b",
    "item_c_f000.swf": "52e692e5a5edd62f216dba3727204914818b0b8262dbbd7fabadb9c209e53c19",
}
WORDING = {
    "heading": "道具", "close": "關閉", "use": "使用", "previous": "上一頁", "next": "下一頁",
    "count": "擁有數", "durationLabel": "效果時間", "caption": "效果", "duration": "-",
}


class ItemMovie(Movie):
    def shape(self, shape, offset, ratio=0, **options):
        def is_focal(node):
            return kind(node) == "fillstyle" and node.get("type") == "19"

        if not any(map(is_focal, shape.iter())):
            return super().shape(shape, offset, ratio, **options)

        # The original Gem bags have a focal radial gradient. Flex prints FIXED8 as unsigned.
        shape = deepcopy(shape)
        focal_points = {}
        for style in filter(is_focal, shape.iter()):
            raw = round(float(style.attrib["focalPoint"]) * 256)
            signed = ((raw + 32768) % 65536) - 32768
            style.set("type", "18")
            gradient = sha256(repr(style.attrib).encode()).hexdigest()[:12]
            focal_points[f'id="gradient-{gradient}"'] = signed * 64  # Convert FIXED8 to a 16384-twip radius.

        pieces = []
        for piece in super().shape(shape, offset, ratio, **options):
            markup = piece.markup
            for identifier, focus in focal_points.items():
                markup = markup.replace(identifier, f'{identifier} fx="{focus}" fy="0"', 1)
            pieces.append(replace(piece, markup=markup))
        return pieces


def item_rows():
    with checked_source(REPO, ITEM_CSV).open(encoding="utf-8-sig", newline="") as source:
        rows = [row for row in DictReader(source) if row["kind"] == "0"]
    if len(rows) != 32 or {row["image"] for row in rows} != ICON_PINS.keys():
        raise ValueError("Unexpected original AvatarItem basic-kind catalogue")
    return rows


def shared_drawer(provenance):
    result = json.loads((RESULT_ART / "index.json").read_text(encoding="utf-8"))
    if result["assetRevision"] != REVISION:
        raise ValueError("Quest shared item artwork uses a different asset revision")
    drawer = result["bonus"]["itemPanel"]
    shared = {}

    def sprite(data, pin):
        filename = data["file"]
        record = result["provenance"][filename]
        checked_source(RESULT_ART, (filename, record["sha256"]))
        if (record["source"], record["sourceSha256"]) != pin:
            raise ValueError(f"Unexpected source for shared drawer layer {filename}")
        shared[RESULT_URL + filename] = record
        return data | {"url": RESULT_URL + filename}

    controls = {key: {state: sprite(data, WINDOW) if state != "hit" else data
                      for state, data in control.items()}
                for key, control in drawer["controls"].items()}
    row = {state: sprite(data, ROW) if state != "hit" else data for state, data in drawer["row"].items()}
    provenance["shared"] = shared
    plate = sprite(drawer["plate"], WINDOW)
    return {"plate": plate, "controls": controls, "row": row, "list": drawer["list"],
            "labels": drawer["labels"], "iconAnchors": drawer["iconAnchors"]}


def item_art(rows, assets, output, swfdump, provenance):
    movies = {}
    icons = {}
    items = {}
    for row in rows:
        basename, frame, id = row["image"], int(row["image_frame"]), row["id"]
        source_frame = (basename, frame)
        if source_frame not in icons:
            if basename not in movies:
                source = (SOURCE_DIR + basename, ICON_PINS[basename])
                movie = ItemMovie(assets, Path(basename).stem, swfdump, pin=source)
                movies[basename] = movie, [placements for _, placements in timeline(movie.root)]
            movie, frames = movies[basename]
            if frame < 1 or frame > len(frames):
                raise ValueError(f"Missing original {basename} frame {frame}")
            primitives, shapes = authored_primitives(movie, frames[frame - 1], preserve_stroke_alpha=True)
            image, x, y = rasterize(primitives)
            file = f"item-{id}.png"
            data = png_bytes(image)
            (output / file).write_bytes(data)
            provenance[file] = {"source": movie.path.as_posix(), "sourceSha256": movie.digest,
                                "sha256": sha256(data).hexdigest(), "sourceFrame": frame, "sourceShapes": shapes,
                                "sourceBitmaps": [part.bitmap_id for part in primitives if part.bitmap_id is not None],
                                "itemIds": []}
            icons[source_frame] = {"file": file, "x": x, "y": y, "width": image.width, "height": image.height}
        icon = icons[source_frame]
        provenance[icon["file"]]["itemIds"].append(int(id))
        items[id] = {"name": row["name_tcn"], "caption": row["caption_tcn"], "kind": 0,
                     "subTypes": [int(value) for value in row["sub_kind"].split("+") if value], "icon": icon}
    return items


def extract(assets, output, swfdump, mincho_font):
    output.mkdir(parents=True, exist_ok=True)
    provenance = {"catalogue": {"source": ITEM_CSV[0], "sourceSha256": ITEM_CSV[1], "kind": 0,
                                 "fields": ["name_tcn", "caption_tcn", "image", "image_frame", "sub_kind"]}}
    shared = shared_drawer(provenance)
    rows = item_rows()
    items = item_art(rows, assets, output, swfdump, provenance)
    glyphs = "0123456789/-x" + "".join(WORDING.values()) + "".join(item["name"] + item["caption"] for item in items.values())
    font = "lobby-item-mincho.woff"
    write_font(mincho_font, output / font, [{"name_tcn": glyphs}])
    provenance[font] = {"source": "res/data/wt004.ttf", "sourceRevision": FONT_REVISION, "sourceSha256": FONT_SHA,
                        "sha256": sha256((output / font).read_bytes()).hexdigest(), "glyphs": "".join(sorted(set(glyphs)))}
    manifest = {"assetRevision": REVISION, "origin": [498, 107],
                "motion": {"initialX": 798, "openMs": 200, "closeMs": 150,
                           "openEasing": "quad-out", "closeEasing": "sine-out"},
                **shared, "items": items, "wording": WORDING, "font": {"file": font}, "provenance": provenance}
    (output / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    args = parser.parse_args()
    extract(args.assets, args.output, args.swfdump, args.mincho_font)
