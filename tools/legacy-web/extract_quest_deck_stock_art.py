#!/usr/bin/env python3
"""Render the pinned original DeckObject stock at each signed-byte deck count.

python3 -B tools/legacy-web/extract_quest_deck_stock_art.py ASSETS OUTPUT
"""

import argparse
from hashlib import sha256
import json
from math import ceil, cos, floor, radians, sin
from pathlib import Path

from PIL import Image, ImageFilter

from extract_battle_card_art import dice_mesh
from extract_character_card_art import REVISION, checked_source
from extract_quest_detail_art import png_bytes


MESH = ("public/image/deck.dae", "7bdc32477de6341dbeea69ecaad46fa02581bb4b5f274454acacf5ddf955b925")
TEXTURE = ("public/image/tex/deck.png", "29c4f41605161be31bfb22a30fd72a7156d04bddd8cbb183f1aef18df1650890")
FRAME = (8, 42, 56, 59)
ATLAS_COLUMNS = 16
MAX_COUNT = 127
SAMPLE_SCALE = 2
VIEWPORT_ORIGIN = (-83, -59)
VIEWPORT_SIZE = (200, 200)
CAMERA_POSITION = (-5, 40, 40)
CAMERA_ROTATION = (30, 80)
FOCUS = 500
ZOOM = .57
DECK_POSITION = (45, 0, 45)
DECK_ROTATION = (0, 140)
STACK_SCALE = .03
GLOW_SIZE = 2
GLOW_STRENGTH = 16


def rotation(x_degrees, y_degrees):
    """Papervision Quaternion.setFromEuler with roll zero."""
    x, y = radians(x_degrees), radians(y_degrees)
    sx, cx, sy, cy = sin(x), cos(x), sin(y), cos(y)
    return ((cy, sy * sx, sy * cx), (0, cx, -sx), (-sy, cy * sx, cy * cx))


def multiply(matrix, vector):
    return tuple(sum(a * b for a, b in zip(row, vector, strict=True)) for row in matrix)


def project(positions, count):
    dae_basis = rotation(-90, 180)
    object_rotation = rotation(*DECK_ROTATION)
    inverse_camera = tuple(zip(*rotation(*CAMERA_ROTATION), strict=True))
    centre_x, centre_y = (start + size / 2 for start, size in zip(VIEWPORT_ORIGIN, VIEWPORT_SIZE, strict=True))
    relative = tuple(a - b for a, b in zip(DECK_POSITION, CAMERA_POSITION, strict=True))
    focus_zoom = FOCUS * ZOOM
    points = []
    for x, y, z in positions:
        x, y, z = multiply(dae_basis, (-x, y, z))  # DAE.as flips the source X and rotates its Z_UP root.
        oriented = multiply(object_rotation, (x, y * STACK_SCALE * count, z))
        vx, vy, vz = multiply(inverse_camera, tuple(a + b for a, b in zip(oriented, relative, strict=True)))
        if vz <= 0:
            raise ValueError("Pinned DeckObject is behind the source camera")
        # Camera3D's focusFix cancels the additional focus in its perspective
        # denominator. CameraObject3D inverts the display-space Y.
        points.append((centre_x + focus_zoom * vx / vz, centre_y - focus_zoom * vy / vz, 1 / vz))
    return points


def render_stock(mesh, texture, count):
    left, top, width, height = FRAME
    if count == 0:
        return Image.new("RGBA", (width, height))
    high_width, high_height = width * SAMPLE_SCALE, height * SAMPLE_SCALE
    stock = Image.new("RGBA", (high_width, high_height))
    pixels, colors = stock.load(), texture.load()
    zbuffer = [0] * (high_width * high_height)
    positions = list(zip(mesh["positions"][::3], mesh["positions"][1::3], mesh["positions"][2::3], strict=True))
    points = [((x - left) * SAMPLE_SCALE, (y - top) * SAMPLE_SCALE, z) for x, y, z in project(positions, count)]
    uv = list(zip(mesh["uv"][::2], mesh["uv"][1::2], strict=True))
    indices = mesh["indices"]
    for start in range(0, len(indices), 3):
        a, b, c = indices[start:start + 3]
        x0, y0, z0 = points[a]
        x1, y1, z1 = points[b]
        x2, y2, z2 = points[c]
        denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(denominator) < 1e-9:
            continue
        imin, imax = max(0, floor(min(x0, x1, x2))), min(high_width, ceil(max(x0, x1, x2)))
        jmin, jmax = max(0, floor(min(y0, y1, y2))), min(high_height, ceil(max(y0, y1, y2)))
        u0, v0 = uv[a]
        u1, v1 = uv[b]
        u2, v2 = uv[c]
        for j in range(jmin, jmax):
            dy = j + .5 - y2
            for i in range(imin, imax):
                dx = i + .5 - x2
                w0 = ((y1 - y2) * dx + (x2 - x1) * dy) / denominator
                w1 = ((y2 - y0) * dx + (x0 - x2) * dy) / denominator
                w2 = 1 - w0 - w1
                if min(w0, w1, w2) < -1e-9:
                    continue
                z = w0 * z0 + w1 * z1 + w2 * z2
                offset = j * high_width + i
                if z <= zbuffer[offset]:
                    continue
                # Default BitmapMaterial interpolates UV affinely per projected triangle.
                u = (w0 * u0 + w1 * u1 + w2 * u2) * texture.width
                v = (1 - (w0 * v0 + w1 * v1 + w2 * v2)) * texture.height
                pixels[i, j] = colors[int(u), int(v)]
                zbuffer[offset] = z
    stock = stock.resize((width, height), Image.Resampling.BOX)
    outline = Image.new("RGBA", stock.size)
    alpha = stock.getchannel("A").filter(ImageFilter.BoxBlur(GLOW_SIZE / 2))
    outline.putalpha(alpha.point(lambda value: min(255, value * GLOW_STRENGTH)))
    outline.alpha_composite(stock)
    return outline


def extract(assets, output):
    mesh = dice_mesh(checked_source(assets, MESH))
    if len(mesh["indices"]) != 28 * 3:
        raise ValueError("Expected the 28 original DeckObject triangles")
    with Image.open(checked_source(assets, TEXTURE)) as raw_texture:
        texture = raw_texture.convert("RGBA")
    _, _, width, height = FRAME
    rows = ceil((MAX_COUNT + 1) / ATLAS_COLUMNS)
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * width, rows * height))
    for count in range(MAX_COUNT + 1):
        card_stack = render_stock(mesh, texture, count)
        atlas.paste(card_stack, (count % ATLAS_COLUMNS * width, count // ATLAS_COLUMNS * height))
    output.mkdir(parents=True, exist_ok=True)
    filename = "deck-stock.png"
    data = png_bytes(atlas)
    (output / filename).write_bytes(data)
    x, y, width, height = FRAME
    index = {
        "assetRevision": REVISION,
        "atlas": {"file": filename, "width": atlas.width, "height": atlas.height, "columns": ATLAS_COLUMNS,
                  "sha256": sha256(data).hexdigest()},
        "frame": {"x": x, "y": y, "width": width, "height": height},
        "minCount": 0, "maxCount": MAX_COUNT,
        "source": [{"file": file, "sha256": digest} for file, digest in (MESH, TEXTURE)],
        "projection": {
            "viewportOrigin": VIEWPORT_ORIGIN, "viewportSize": VIEWPORT_SIZE,
            "camera": {"position": CAMERA_POSITION, "rotation": [*CAMERA_ROTATION, 0], "focus": FOCUS, "zoom": ZOOM},
            "deck": {"position": DECK_POSITION, "rotation": [*DECK_ROTATION, 0], "scaleYPerCard": STACK_SCALE},
            "glow": {"color": "#000000", "size": GLOW_SIZE, "strength": GLOW_STRENGTH},
        },
    }
    (output / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    extract(args.assets, args.output)


if __name__ == "__main__":
    main()
