#!/usr/bin/env python3
"""Extract the pinned Quest standing, card and battle dice artwork."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from subprocess import check_output
from tempfile import TemporaryDirectory
from xml.etree import ElementTree

from PIL import Image, ImageChops

from extract_character_card_art import DisplayList, REVISION, bitmap, checked_source, matrix, timeline
from extract_quest_detail_art import STAND_ALIASES, kind, png_bytes, rasterize_svg


STANDS = {
    "21": ("public/image/standchara/standchara03.swf", "eae5c64037ec904ed201848294505ef9b063eaf8aa53047785c1fff17a28d09f"),
    "1004": ("public/image/standchara/standmon002_00.swf", "197fdd0e24b0b7036a9d89acfe3bed7e5cdb938cd588f204893ab26e4b981f9e"),
    "1001": ("public/image/standchara/standmon001_00.swf", "c5a506de29a9f7b20267dc2bbc8a45b4219cf3f212dc05867ecab63c1a58dd6c"),
    "1007": ("public/image/standchara/standmon003_00.swf", "0a19be4040f63c9d9084c45eb950845b1fbefbca263fbeda77e2cc0074817133"),
    "1079": ("public/image/standchara/standmon028_00.swf", "612f16d0a1020ced7e7415e89963b8e46bc56f7e0882ced28e6f8ad37cdeee36"),
    "94": ("public/image/standchara/standchara10.swf", "78f0cdbec2ed5a1bd1d40222daced9a471503458ff8711a9eca11dbf24316496"),
    "1033": ("public/image/standchara/standmon012_02.swf", "63c711be1ef980383a840ab2ab6b4722ef22430dd435a9c11e9b1eac7b6a6331"),
    "1034": ("public/image/standchara/standmon011_00.swf", "e7461ee4e85f105e0dd55b40a27fc9ed123fcbaa195a907c1513070bc03c49e5"),
}
FRAME = ("data/image/game/acframe.swf", "180d95f8ef1455a59c284dbe4a125ab4c1a2ad9e1eeb4e65e0a863d979663bd9")
CONTROLS = ("data/image/cardaction.swf", "6a4fe69814a98332b45cb3860f288027483b269ca69922ab575022e311a4e220")
DICE_MODEL = ("public/image/dice.dae", "c2d6b5e9544be41661d677fc189584d4f65aba1be1bf6618c49ed2d43fb71240")
DICE_TEXTURES = {
    "attack": ("public/image/tex/dice.png", "223b9af344df9d802f32e3a10c63e9e07008d0cf551a22c699ca1c7ab5582439"),
    "defense": ("public/image/tex/dice_red.png", "159b5a44fb7ca3c5151a020fa05a8dab189994bca8f9e45639ada2e5db60c57e"),
    "attackSpecial": ("public/image/tex/dice_c.png", "a3473f86b6eb16fcd9fcf662024db9d29a478128c891f4cf929dc532d5041db0"),
    "defenseSpecial": ("public/image/tex/dice_f.png", "8192e6b832e1dfc733d74420dac5feb1135e379a3688625af09fb58e70d8211b"),
}
DICE_RESULT = {
    "attack": ("data/image/dice_atk.swf", "75fe841271bdee34bfe86817c12d56ca6b7e22bd69c99dca4bf4421dfbbbc73f"),
    "defense": ("data/image/dice_def.swf", "7c96801ff3e9a51d93bef2c7667a1f0c5440a4837a92f469ef9c6da0fea4ef20"),
}
DAMAGE_LABEL = ("data/image/game/text_damage.swf", "2e167ac663df760cdfd2ee7022be0e4ff6b9fbfad32e5c2b09aac0d4f711fcfa")
# ffdec.jar in the published ffdec_26.6.0.zip release.
FFDEC_SHA256 = "3f1b1993a8ab34d4910192931236074d2c69db23e23d69cd16848c851b1995c3"
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


def card_controls(movie, save):
    root = {placement["name"]: placement for placement in movie.frame(movie.movie, 1)}

    def extract(name, placement, x, y, **details):
        shape = movie.symbols[placement["idref"]]
        fills = [node for node in shape if kind(node) == "fillstyle"]
        if kind(shape) != "DefineShape" or len(fills) != 1 or fills[0].get("type") != "67":
            raise ValueError(f"Unexpected original card control shape: {name}")
        bitmap_id = fills[0].attrib["idref"]
        image = bitmap(movie.source, *movie.bitmaps[bitmap_id])
        # The drawing clips the bitmap to the authored rectangle, one twip shy of its pixel dimensions.
        actual_bounds = f"{image.width * 20 - 1}x{image.height * 20 - 1}"
        if shape.get("bounds") != actual_bounds:
            raise ValueError(f"Unexpected original card control bounds: {name}")
        file = save(f"control-{name}.png", image, CONTROLS, sourceShape=int(shape.attrib["id"]),
                    sourceBitmap=int(bitmap_id), **details)
        return {"file": file, "x": x, "y": y, "width": image.width, "height": image.height}

    button = movie.symbols[root["rotate"]["idref"]]
    if kind(button) != "DefineButton2" or matrix(root["rotate"]["matrix"]) != matrix(""):
        raise ValueError("Unexpected original rotate button placement")
    rotate = {}
    for record in button:
        if kind(record) != "buttonRecord":
            continue
        states = record.attrib["states"].split(",")
        x, y = matrix(record.attrib["matrix"])[4:]
        layer = extract(f"rotate-{states[-1]}", record.attrib, x / 20, y / 20,
                        sourceInstance="rotate", sourceStates=states)
        for state in states:
            rotate["hit" if state == "hitTest" else state] = layer
    if rotate.keys() != {"up", "over", "down", "hit"}:
        raise ValueError("Missing original rotate button states")

    arrow = root["arrow"]
    (shape,) = movie.frame(movie.symbols[arrow["idref"]], 1)
    x = matrix(arrow["matrix"])[4] / 20
    return {"rotate": rotate, "arrow": extract("arrow", shape, x, -40, sourceInstance="arrow", sourceFrame=1)}


def dice_mesh(path):
    ns = {"d": "http://www.collada.org/2005/11/COLLADASchema"}
    root = ElementTree.parse(path)
    mesh = root.find("d:library_geometries/d:geometry/d:mesh", ns)
    faces = mesh.find("d:triangles", ns)
    if root.findtext("d:asset/d:up_axis", namespaces=ns) != "Z_UP" or faces.attrib["material"] != "_Default":
        raise ValueError("Unexpected original dice coordinate system or material")
    inputs = {node.attrib["semantic"]: (node.attrib["source"][1:], int(node.attrib["offset"]))
              for node in faces.findall("d:input", ns)}
    if set(inputs) != {"VERTEX", "NORMAL", "TEXCOORD"} or {index for _, index in inputs.values()} != {0, 1, 2}:
        raise ValueError("Unexpected original dice triangle attributes")
    vertices = mesh.find("d:vertices/d:input[@semantic='POSITION']", ns)
    if mesh.find("d:vertices", ns).attrib["id"] != inputs["VERTEX"][0]:
        raise ValueError("Unexpected original dice vertex reference")

    def read_source(id):
        value = mesh.find(f"d:source[@id='{id}']", ns)
        array = value.find("d:float_array", ns)
        positions = tuple(map(float, array.text.split()))
        accessor = value.find("d:technique_common/d:accessor", ns)
        if (accessor.attrib["source"] != f'#{array.attrib["id"]}' or accessor.attrib["stride"] != "3"
                or len(positions) != int(array.attrib["count"]) or len(positions) % 3):
            raise ValueError("Unexpected original dice vertex stride")
        return list(zip(positions[::3], positions[1::3], positions[2::3], strict=True))

    vertices = read_source(vertices.attrib["source"][1:])
    texture_coords = read_source(inputs["TEXCOORD"][0])
    indices = list(map(int, faces.findtext("d:p", namespaces=ns).split()))
    if len(indices) != int(faces.attrib["count"]) * 9:
        raise ValueError("Invalid original dice triangle count")
    pairs = {}
    positions, uv, triangles = [], [], []
    for offset in range(0, len(indices), 3):
        key = (indices[offset + inputs["VERTEX"][1]], indices[offset + inputs["TEXCOORD"][1]])
        if key not in pairs:
            pairs[key] = len(pairs)
            positions.extend(vertices[key[0]])
            uv.extend(texture_coords[key[1]][:2])
        triangles.append(pairs[key])
    return {"positions": positions, "uv": uv, "indices": triangles}


def dice_result_sprite(movie):
    instance = movie.frame(movie.movie, 1)[0]
    (symbol,) = [node for group in movie.movie if kind(group) == "SymbolClass" for node in group
                 if node.get("className") == instance["idref"]]
    return instance, movie.symbols[symbol.attrib["idref"]]


def dice_success(movie, instance, sprite, role, pin, save):
    (normal,) = movie.frame(sprite, 1)
    shape = movie.symbols[normal["idref"]]
    (fill,) = [node for node in shape if kind(node) == "fillstyle"]
    if shape.get("bounds") != "1000x1000" or fill.get("matrix") != "s20.0,20.0 t0,0":
        raise ValueError("Unexpected original normal dice artwork")
    source = fill.attrib["idref"]
    image = bitmap(movie.source, *movie.bitmaps[source])
    if image.size != (50, 50):
        raise ValueError("Unexpected original normal dice bitmap size")
    x, y = matrix(instance["matrix"])[4:]
    file = save(f"dice-result-{role}.png", image, pin, sourceInstance=instance["name"],
                sourceFrame=1, sourceLabel="normal", sourceBitmap=int(source))
    return {"file": file, "x": x / 20, "y": y / 20, "width": image.width, "height": image.height}


def dice_hit(args, movie, sprite, normal, save):
    cursor = 1
    first = None
    for tag in sprite:
        if kind(tag) == "FrameLabel" and tag.get("label") == "hit":
            first = cursor
        elif kind(tag) == "ShowFrame":
            cursor += 1
    last = cursor - 1
    if first != 8 or last != 22:
        raise ValueError("Unexpected authored Hit timeline")
    sprite_id = sprite.attrib["id"]
    # The nested hit-letter sprite starts at parent frame 10 and stops on its
    # own frame 12. FFDec's static exporter wraps the child once at parent 22.
    nested, = [node for node in movie.frame(sprite, 10) if node["idref"] == "21"]
    if len(list(timeline(movie.symbols[nested["idref"]]))) != 12 or movie.frame(sprite, 21) != movie.frame(sprite, 22):
        raise ValueError("Unexpected authored Hit hold")
    last_image = 21
    with TemporaryDirectory(prefix="unlight-dice-hit-") as directory:
        check_output([
            "java", "-Djava.awt.headless=true", f"-Duser.home={directory}", "-jar", args.ffdec,
            "-onerror", "abort", "-selectid", sprite_id, "-select", f"{sprite_id}:1,{first}-{last_image}",
            "-format", "sprite:png", "-export", "sprite", directory, movie.source,
        ])
        (neutral_path,) = Path(directory).glob("DefineSprite_*/1.png")
        neutral = Image.open(neutral_path).convert("RGBA")
        base = Image.open(args.output / normal["file"]).convert("RGBA")
        left, top, _, _ = neutral.getbbox()
        base_left, base_top, _, _ = base.getbbox()
        left, top = left - base_left, top - base_top
        if ImageChops.difference(neutral.crop((left, top, left + base.width, top + base.height)),
                                 base).getbbox(alpha_only=False):
            raise ValueError("Exported dice timeline is misaligned with the original bitmap")
        frames = []
        unique = {}
        for number in range(first, last + 1):
            image = Image.open(neutral_path.with_name(f"{min(number, last_image)}.png")).convert("RGBA")
            if image.size != neutral.size:
                raise ValueError("Inconsistent Hit sprite stage size")
            key = sha256(image.tobytes()).digest()
            if key not in unique:
                unique[key] = save(f"dice-result-hit-{number:02d}.png", image, DICE_RESULT["attack"],
                                   sourceSprite=int(sprite_id), sourceFrame=number, sourceLabel="hit",
                                   renderer="JPEXS FFDec 26.6.0", rendererSha256=FFDEC_SHA256)
            frames.append({"file": unique[key], "x": normal["x"] - left, "y": normal["y"] - top,
                           "width": image.width, "height": image.height, "sourceFrame": number})
    return {"framesPerSecond": 24 * 1.7, "frames": frames}


def generate(args):
    args.output.mkdir(parents=True, exist_ok=True)
    index_path = args.output / "index.json"
    if args.stand:
        index = json.loads(index_path.read_text())
        if index.get("assetRevision") != REVISION:
            raise ValueError("Battle art manifest uses a different asset revision")
        provenance = index["provenance"]
    else:
        if sha256(args.ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
            raise ValueError("Expected ffdec.jar from the JPEXS 26.6.0 ZIP release")
        provenance = {}

    def save_bytes(filename, data, pin, **details):
        (args.output / filename).write_bytes(data)
        provenance[filename] = {"source": pin[0], "sourceSha256": pin[1],
                                "sha256": sha256(data).hexdigest(), **details}
        return filename

    def save(filename, image, pin, **details):
        return save_bytes(filename, png_bytes(positive(image)), pin, **details)

    def open_movie(pin):
        return DisplayList(checked_source(args.assets, pin), args.swfdump)

    def save_actor(id, name, movie, pin, shapes, **details):
        # Opening portraits may extend outside the old 510px actor view.
        for view in ((-250, -560, 510, 650), (-640, -700, 1280, 900)):
            layer = positive(render(movie, shapes, view))
            x0, y0, x1, y1 = layer.getbbox()
            if x0 == 0 or y0 == 0 or x1 == view[2] or y1 == view[3]:
                continue
            file = save(f"stand-{id}-{name}.png", layer.crop((x0, y0, x1, y1)), pin, **details)
            return {"file": file, "x": view[0] + x0, "y": view[1] + y0, "width": x1 - x0, "height": y1 - y0}
        raise ValueError(f"Original actor {id} {name} exceeds the export view")

    stands = {}
    for id in args.stand or STANDS:
        pin = STANDS[id]
        movie = open_movie(pin)
        root = {node.get("name"): node for node in movie.frame(movie.movie, 1)}
        layers = {}
        for name in ("shadow", "stand"):
            # StandCharaImage sets the stand/shadow positions and scale at runtime.
            symbol = root[name]["idref"]
            layer = movie.frame(movie.symbols[symbol], 1)
            layers[name] = save_actor(id, name, movie, pin, layer,
                                      sourceInstance=name, sourceFrame=1)
        symbol = root["up"]["idref"]
        sequence = list(timeline(movie.symbols[symbol]))
        drawable = next(frame[0]["idref"] for frame in sequence if frame)
        layer = [{"idref": drawable, "matrix": "t0,0"}]
        layers["opening"] = save_actor(id, "opening", movie, pin, layer,
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
    if args.stand:
        index["stands"].update(stands)
        index["stands"].update({alias: index["stands"][original] for alias, original in STAND_ALIASES.items()})
        index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
        return
    stands.update({alias: stands[original] for alias, original in STAND_ALIASES.items()})

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
    controls = card_controls(open_movie(CONTROLS), save)
    dice_result = {}
    for role, pin in DICE_RESULT.items():
        movie = open_movie(pin)
        instance, sprite = dice_result_sprite(movie)
        normal = dice_success(movie, instance, sprite, role, pin, save)
        dice_result[role] = {"normal": normal}
        if role == "attack":
            dice_result[role]["hit"] = dice_hit(args, movie, sprite, normal, save)
    dice_roll = {
        "mesh": dice_mesh(checked_source(args.assets, DICE_MODEL)),
        "source": DICE_MODEL[0], "sourceSha256": DICE_MODEL[1],
        "textures": {role: save_bytes(f"dice-roll-{role.lower()}.png", checked_source(args.assets, pin).read_bytes(), pin)
                     for role, pin in DICE_TEXTURES.items()},
    }
    movie = open_movie(DAMAGE_LABEL)
    damage_label = render(movie, movie.frame(movie.movie, 1), (0, 0, 48, 26))
    damage = {"label": {"file": save("dice-damage-label.png", damage_label, DAMAGE_LABEL, sourceFrame=1),
                        "x": 0, "y": 0, "width": 48, "height": 26}}
    index = {"assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
             "assetLicense": "CC-BY-ND-4.0", "stands": stands, "actionFrames": action_frames,
             "actionValues": values, "eventValues": events, "actionControls": controls,
             "exchange": {"diceResult": dice_result, "diceRoll": dice_roll, "damage": damage},
             "provenance": provenance}
    (args.output / "index.json").write_text(json.dumps(index, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--ffdec", type=Path, help="ffdec.jar from the JPEXS 26.6.0 ZIP release")
    parser.add_argument("--stand", action="append", choices=STANDS,
                        help="refresh only this actor in an existing output (repeatable)")
    args = parser.parse_args()
    if not args.stand and args.ffdec is None:
        parser.error("--ffdec is required for a full export")
    generate(args)
