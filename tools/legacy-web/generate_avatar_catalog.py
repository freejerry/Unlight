#!/usr/bin/env python3
"""Generate the equipment catalog from original client code, CSV and pinned SWF blobs."""

import argparse
import csv
from hashlib import sha256
import json
from pathlib import Path
import re

from package_avatar_assets import MANIFEST, PART_DIRECTORY, PART_NAME, REPO, asset_objects, read_originals


REVISION = "0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e"
CSV = REPO / "app/server/data/csv/ja/AvatarParts.csv"
RIG_SOURCE = REPO / "app/client/src/view/image/common/AvatarImage.as"
CLIP_SOURCE = REPO / "app/client/src/view/scene/common/AvatarPartClip.as"
RIG_PATH = "data/image/avatar_rig.swf"
LICENSE_PATH = "LICENSE"


def anchor_tables():
    rig = RIG_SOURCE.read_text(encoding="utf-8")
    names = dict(re.findall(r'const INS_(\w+)\s*:\s*String\s*=\s*"([^"]+)"', rig))
    indices = [(int(index), name) for name, index in re.findall(r"const (\w+)\s*:\s*int\s*=\s*(\d+)", rig)
               if name in names]
    indices.sort()
    if [index for index, _ in indices] != list(range(15)):
        raise ValueError("Unexpected AvatarImage rig anchors")
    anchor_names = [names[name] for _, name in indices]

    clip = CLIP_SOURCE.read_text(encoding="utf-8")
    priority = clip.split("const TYPE_PRIORITY:Array = [", 1)[1].split("];", 1)[0]
    slots = re.findall(r"(?:AvatarImage\.(\w+)|null),\s*//\s*(\d+)", priority)
    if [int(depth) for _, depth in slots] != list(range(128)):
        raise ValueError("Unexpected AvatarPartClip depth table")
    return anchor_names, [names[name] if name else None for name, _ in slots]


def color_multipliers(value):
    # AvatarPart.setColorTransform interprets each three-digit group as a percentage.
    if value <= 0:
        return [1, 1, 1, 1]
    return [value // 1_000_000 / 100, value // 1_000 % 1_000 / 100, value % 1_000 / 100, 1]


def generate(mirror):
    anchor_names, depth_anchors = anchor_tables()
    with CSV.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    part_names = {name for row in rows for name in row["image"].split("+") if name}
    if not part_names or any(not PART_NAME.fullmatch(name) for name in part_names):
        raise ValueError("Unexpected AvatarParts.csv image name")
    paths = {f"{PART_DIRECTORY}/{name}.swf" for name in part_names}
    objects = asset_objects(mirror, REVISION, paths | {RIG_PATH, LICENSE_PATH}, RIG_PATH, LICENSE_PATH)
    originals = {path: {"sha256": sha256(raw).hexdigest(), "bytes": len(raw)}
                 for path, raw in read_originals(mirror, objects)}
    license_info = originals.pop(LICENSE_PATH)
    if RIG_PATH not in originals:
        raise ValueError("Missing original avatar rig")

    parts = {}
    for row in rows:
        names = row["image"].split("+")
        layers = []
        for name in names:
            if not name:
                continue
            path = f"{PART_DIRECTORY}/{name}.swf"
            depth = int(name.rsplit("_p", 1)[1])
            layers.append({
                "depth": depth, "anchor": depth_anchors[depth], "path": path,
                "availability": "present" if path in originals else "missing",
            })
        part_id = int(row["id"])
        if part_id in parts:
            raise ValueError(f"Duplicate AvatarParts.csv ID: {part_id}")
        parts[part_id] = {
            "type": int(row["parts_type"]), "name": row["name_tcn"],
            "color": color_multipliers(int(row["color"])),
            "emptyImageReference": "" in names, "layers": layers,
        }
    missing = sorted(paths - originals.keys())
    return {
        "assetRevision": REVISION,
        "assetRepository": "https://github.com/ni-light/Unlight-Images",
        "assetLicense": {"spdx": "CC-BY-ND-4.0", "originalPath": LICENSE_PATH, **license_info},
        "rig": {"path": RIG_PATH, **originals[RIG_PATH]},
        "anchorNames": anchor_names,
        "depthAnchors": depth_anchors,
        "parts": parts,
        "assets": originals,
        "coverage": {
            "catalogPath": CSV.relative_to(REPO).as_posix(),
            "catalogSha256": sha256(CSV.read_bytes()).hexdigest(),
            "partDefinitions": len(parts), "namedSwfReferences": len(paths),
            "presentNamedSwfs": len(paths) - len(missing),
            "completePartDefinitions": sum(not part["emptyImageReference"] and all(
                layer["availability"] == "present" for layer in part["layers"]
            ) for part in parts.values()),
            "emptyImageReferenceIds": [id for id, part in parts.items() if part["emptyImageReference"]],
            "missingSwfPaths": missing,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mirror", type=Path, help="Unlight-Images git checkout containing the pinned revision")
    parser.add_argument("--output", type=Path, default=MANIFEST)
    args = parser.parse_args()
    try:
        catalog = generate(args.mirror)
        args.output.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except (OSError, ValueError) as error:
        parser.error(str(error))
    coverage = catalog["coverage"]
    print(f"Wrote {coverage['partDefinitions']} equipment entries to {args.output}")


if __name__ == "__main__":
    main()
