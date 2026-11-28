#!/usr/bin/env python3
"""Extract the pinned q1 standing, opening and first-hand artwork."""

import argparse
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image

from extract_character_card_art import DisplayList, REVISION, checked_source, matrix, timeline
from extract_quest_detail_art import png_bytes, rasterize_svg


STANDS = {
    "21": ("public/image/standchara/standchara03.swf", "eae5c64037ec904ed201848294505ef9b063eaf8aa53047785c1fff17a28d09f"),
    "1004": ("public/image/standchara/standmon002_00.swf", "197fdd0e24b0b7036a9d89acfe3bed7e5cdb938cd588f204893ab26e4b981f9e"),
}
FRAME = ("data/image/game/acframe.swf", "180d95f8ef1455a59c284dbe4a125ab4c1a2ad9e1eeb4e65e0a863d979663bd9")
VALUES = {
    "1": ("data/image/game/acswd.swf", "5ff0efceca5172942e75086d7e9afe8fadc93f1e8c6737cfe8c2c4c17fcc558a"),
    "2": ("data/image/game/acbow.swf", "e1067ace938650908ed1928d25b1f221c822570a077f8fd2bf28e2e3df1a6f1c"),
    "3": ("data/image/game/acdef.swf", "781c11f438fce6cda971ce20a304dff87039d5a8fe412da37a7210a84620d8f1"),
    "4": ("data/image/game/acmove.swf", "932720486c28fca32cec2cc75c17f96c40e2de89b10b24296353c532d54674a3"),
    "5": ("data/image/game/acstar.swf", "7a4ee5ce1752ab436e6e46c17528d6b8ec240c991c2ccb57e49b619e99fa2a89"),
    "6": ("data/image/game/acchance.swf", "c89edb994cac01fe12748e607cf8d220506fdded5ace01ab3e89183eb3a904d7"),
}
# Stock event fillers for the original fresh role: sword 1, gun 1 and defense 1.
EVENTS = {
    "card_ev_100.swf": ("public/image/card_event/card_ev_100.swf", "bdf74d43abfbba00b4d1484a97591c5eac862dbe86bbbc369f97e645bec6e095"),
    "card_ev_110.swf": ("public/image/card_event/card_ev_110.swf", "e2ad6f0981fcb4eb782432777e4cfe357a2c87aba03e32c74110b650e3d9a66a"),
    "card_ev_130.swf": ("public/image/card_event/card_ev_130.swf", "45d1d30b19d0748256efd6c5599d51e8affb2f4d45a6fd20eef575c1af8d872b"),
}
CARD_VIEW = (-28, -43, 56, 86)
LARGE_CARD_VIEW = (-86, -121, 172, 242)
MARKS = ("on_atk", "on_bow", "on_def", "on_mov", "on_str", "on_mov_u")


def render(movie, placements, bounds, *, skip=()):
    x, y, w, h = bounds
    markup = movie.placements(placements, skip=skip)
    viewport = " ".join(str(value * 20) for value in bounds)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w}" height="{h}" viewBox="{viewport}">{markup}</svg>'
    )
    return rasterize_svg(svg.encode(), w, h)


def positive(image):
    if not image.getbbox():
        raise ValueError("An authored battle artwork layer was unexpectedly empty")
    return image


def atlas(frames, bounds):
    _, _, w, h = bounds
    columns = 4
    sprite = Image.new("RGBA", (columns * w, ((len(frames) + columns - 1) // columns) * h))
    for i, frame in enumerate(frames):
        sprite.paste(positive(frame), (i % columns * w, i // columns * h))
    return sprite, columns


def generate(args):
    args.output.mkdir(parents=True, exist_ok=True)
    provenance = {}
    def save(filename, image, pin, **details):
        data = png_bytes(positive(image))
        (args.output / filename).write_bytes(data)
        provenance[filename] = {"source": pin[0], "sourceSha256": pin[1],
                                "sha256": sha256(data).hexdigest(), **details}
        return filename

    def open_movie(pin):
        return DisplayList(checked_source(args.assets, pin), args.swfdump)

    def save_actor(id, name, movie, pin, shapes, view, **details):
        layer = positive(render(movie, shapes, view))
        x0, y0, x1, y1 = layer.getbbox()
        file = save(f"stand-{id}-{name}.png", layer.crop((x0, y0, x1, y1)), pin, **details)
        return {"file": file, "x": view[0] + x0, "y": view[1] + y0, "width": x1 - x0, "height": y1 - y0}

    stands = {}
    for id, pin in STANDS.items():
        movie = open_movie(pin)
        root = {node.get("name"): node for node in movie.frame(movie.movie, 1)}
        actor_view = (-250, -560, 510, 650)
        layers = {}
        for name in ("shadow", "stand"):
            symbol = root[name]["idref"]
            layer = movie.frame(movie.symbols[symbol], 1)
            layers[name] = save_actor(id, name, movie, pin, layer, actor_view,
                                      sourceInstance=name, sourceFrame=1)
        symbol = root["up"]["idref"]
        sequence = list(timeline(movie.symbols[symbol]))
        drawable = next(frame[0]["idref"] for frame in sequence if frame)
        layer = [{"idref": drawable, "matrix": "t0,0"}]
        layers["opening"] = save_actor(id, "opening", movie, pin, layer, actor_view,
                                       sourceInstance="up", sourceShape=int(drawable))
        layers["opening"]["origin"] = list(matrix(root["up"]["matrix"])[4:])
        layers["opening"]["origin"] = [coordinate / 20 for coordinate in layers["opening"]["origin"]]
        layers["opening"]["frames"] = [
            [sx, sy, x / 20, y / 20] if placements else None
            for placements in sequence
            for sx, _, _, sy, x, y in [matrix(placements[0]["matrix"] if placements else "")]
        ]
        layers["opening"]["settledFrame"] = 14
        stands[id] = layers

    frames = open_movie(FRAME)
    action_frames = {}
    # ActionCardClip's visible-value state calls onReverse (frame 1).
    for frame_no, name in enumerate(("front", "back", "back-large", "back-locked", "back-large-locked"), 1):
        view = LARGE_CARD_VIEW if name in ("back-large", "back-large-locked") else CARD_VIEW
        picture = positive(render(frames, frames.frame(frames.movie, frame_no), view))
        action_frames[name] = {"file": save(f"action-{name}.png", picture, FRAME, sourceFrame=frame_no),
                               "width": view[2], "height": view[3]}
    values = {}
    for type_id, pin in VALUES.items():
        movie = open_movie(pin)
        images = [render(movie, frame, CARD_VIEW, skip=MARKS) for frame in timeline(movie.movie)]
        picture, columns = atlas(images, CARD_VIEW)
        values[type_id] = {"file": save(f"value-{type_id}.png", picture, pin, sourceFrames=len(images)),
                           "columns": columns, "frameCount": len(images)}

    events = {}
    for name, pin in EVENTS.items():
        movie = open_movie(pin)
        first_frame = render(movie, movie.frame(movie.movie, 1), CARD_VIEW, skip=MARKS)
        events[name] = {"file": save(f"{Path(name).stem}.png", first_frame, pin, sourceFrame=1), "frame": 1}
    index = {"assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
             "assetLicense": "CC-BY-ND-4.0", "stands": stands, "actionFrames": action_frames,
             "actionValues": values, "eventValues": events, "provenance": provenance}
    (args.output / "index.json").write_text(json.dumps(index, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    generate(parser.parse_args())
