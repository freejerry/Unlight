#!/usr/bin/env python3
"""Pack the offline avatar render into lossless, fixed-size-bounded PNG sheets."""

import argparse
from hashlib import sha256
import json
from math import isfinite
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from package_avatar_assets import MANIFEST, PART_DIRECTORY, PART_NAME


SHEET_LIMIT = 2048
GUTTER = 1
COORDINATES = ("x", "y", "width", "height")


def read_cache(rendered, catalogue):
    expected = {Path(path).stem for path in catalogue["assets"] if path.startswith(f"{PART_DIRECTORY}/")}
    index = json.loads((rendered / "index.json").read_text(encoding="utf-8"))
    anchors, parts, errors = index["anchors"], index["parts"], index.get("errors", {})
    if set(catalogue["anchorNames"]) != anchors.keys() or any(
        len(position) != 2 or any(type(value) not in (int, float) or not isfinite(value) for value in position)
        for position in anchors.values()
    ):
        raise ValueError("Avatar anchor export is incomplete")
    if parts.keys() & errors.keys() or (parts.keys() | errors.keys()) != expected:
        raise ValueError("Raster cache must report every catalogued file exactly once")
    for name, part in parts.items():
        if not PART_NAME.fullmatch(name) or any(type(part.get(key)) is not int for key in COORDINATES):
            raise ValueError(f"Invalid raster geometry: {name}")
        if part["width"] == part["height"] == 0 and part["src"] is None:
            continue
        if not 0 < part["width"] <= 512 or not 0 < part["height"] <= 512:
            raise ValueError(f"Invalid raster dimensions: {name}")
        if part["src"] != f"./avatar-rendered/parts/{name}.png":
            raise ValueError(f"Invalid raster source: {name}")
    if any(not isinstance(reason, str) or not reason.strip() for reason in errors.values()):
        raise ValueError("A raster export error is missing its reason")
    return anchors, parts, errors


def sheet_layout(parts):
    """Place naturally sized crops in deterministic rows with transparent spacing."""
    visible = sorted((name for name, part in parts.items() if part["width"] > 0),
                     key=lambda name: (-parts[name]["height"], -parts[name]["width"], name))
    sheets = []
    used_width = used_height = row_height = 0
    x = y = GUTTER
    placed = []
    for name in visible:
        width, height = parts[name]["width"], parts[name]["height"]
        if x + width + GUTTER > SHEET_LIMIT:
            x = GUTTER
            y += row_height + 2 * GUTTER
            row_height = 0
        if y + height + GUTTER > SHEET_LIMIT:
            sheets.append((used_width, used_height, placed))
            x = y = GUTTER
            row_height = used_width = used_height = 0
            placed = []
        placed.append((name, x, y))
        used_width = max(used_width, x + width + GUTTER)
        used_height = max(used_height, y + height + GUTTER)
        x += width + 2 * GUTTER
        row_height = max(row_height, height)
    if placed:
        sheets.append((used_width, used_height, placed))
    return sheets


def pack(rendered, destination, catalogue):
    if destination.exists():
        raise ValueError(f"Destination already exists: {destination}")
    anchors, parts, errors = read_cache(rendered, catalogue)
    packed_parts = {
        name: {**{key: part[key] for key in COORDINATES}, "sheet": None, "sx": 0, "sy": 0}
        for name, part in parts.items()
    }
    sheet_info = []
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".avatar-wardrobe-", dir=destination.parent) as temporary:
        folder = Path(temporary)
        for number, (width, height, placed) in enumerate(sheet_layout(parts)):
            with Image.new("RGBA", (width, height)) as sheet:
                for name, x, y in placed:
                    with Image.open(rendered / "parts" / f"{name}.png") as layer:
                        if layer.mode != "RGBA" or layer.size != (parts[name]["width"], parts[name]["height"]):
                            raise ValueError(f"Unexpected raster pixel format: {name}")
                        sheet.paste(layer, (x, y))
                    packed_parts[name].update(sheet=number, sx=x, sy=y)
                file = folder / f"sheet-{number:02d}.png"
                sheet.save(file)
                sheet_info.append({"file": file.name, "width": width, "height": height,
                                   "sha256": sha256(file.read_bytes()).hexdigest()})
        index = {"anchors": anchors, "sheets": sheet_info, "parts": packed_parts, "errors": errors}
        (folder / "index.json").write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        folder.rename(destination)
    transparent = sum(info["sheet"] is None for info in packed_parts.values())
    return len(packed_parts) - transparent, transparent, len(errors), len(sheet_info)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rendered", type=Path, help="export_lobby_avatar.py output")
    parser.add_argument("destination", type=Path, help="new avatar-wardrobe directory")
    parser.add_argument("--catalogue", type=Path, default=MANIFEST)
    args = parser.parse_args()
    try:
        catalogue = json.loads(args.catalogue.read_text(encoding="utf-8"))
        visible, blank, errors, sheets = pack(args.rendered, args.destination, catalogue)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(f"Packed {visible} visible and {blank} transparent clips in {sheets} sheets; {errors} unavailable.")


if __name__ == "__main__":
    main()
