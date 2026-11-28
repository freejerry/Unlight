#!/usr/bin/env python3
"""Extract regular quest detail art from the pinned mirror.

Use: python3 -B tools/legacy-web/extract_quest_detail_art.py ASSET_ROOT \
    source-login/quest-art --swfdump /path/to/Flex/bin/swfdump

Requires Pillow, Cairo and librsvg. Input SWFs are pinned;
swfdump reads the original tags and timelines without running ActionScript.
Generate the castle candles with extract_quest_stage0_art.py after this command.
"""

import argparse
import ctypes
import json
import re
import subprocess
from base64 import b64decode, b64encode
from collections import defaultdict
from dataclasses import dataclass
from functools import cache
from hashlib import sha256
from io import BytesIO
from math import ceil
from pathlib import Path
from struct import pack, unpack_from
from tempfile import TemporaryDirectory
from xml.etree import ElementTree
from zlib import compress, decompress

from PIL import Image

from source_stage_art import indexed_png, straight_component, tags


REVISION = "0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e"
QUEST_DIR = Path("data/image/quest")
NS = "{http://macromedia/2003/swfx}"
TWIPS = 20
DEFINITION_TAGS = {
    2: "DefineShape", 22: "DefineShape2", 32: "DefineShape3", 83: "DefineShape4",
    34: "DefineButton2", 39: "DefineSprite", 46: "DefineMorphShape", 84: "DefineMorphShape2",
    6: "DefineBits", 20: "DefineBitsLossless", 35: "DefineBitsJPEG3", 36: "DefineBitsLossless2",
}
SOURCE_DIGESTS = {
    "btn_mapback_ch": "b7fcfdaef7346263f02b5fe5887ec05861a2b24af4fd05669053184059f36804",
    "btn_quest": "3cdd8a9f8cd256058566c581c6813c0d20146172d95a1753960152778ee5b237",
    "map_data": "c8a1784e2202fa4e317482fdd7ece2b93f910fbf220b30aa3dd3a8cb0a2fd81e",
    "map_base": "ad46a98e104990e973acbbda008885f5f6edea70184c9d49514c7b4206b6b0b2",
    "map_pass_left": "7b0ff0c731d731e9281d0cab72ec3582725035b54f4df90307af87b80ffcccd6",
    "map_pass_center": "616902b636e1b3ba84714d0da944ced1326ad9f1150dcb6bce674cd4acba2e32",
    "map_pass_right": "2e2b5d3e2cd95897ba4600317f7739ca994b659de713d6f45e0c56f12bf3f3cf",
    "land_al_arch": "f3bb1f02b2893fdaab92e600634bd70538f47a2c10f32b97de32fff6abe87cbf",
    "land_am_stone": "35a0e8cac598ac45282bf7478abde867b2a78e6cc026bee0c574d0edc4656070",
    "land_am_wasteland": "e9308b1f98ca2fc7891c2576ed9f78d7874dcefddda9ae799b366b8179618683",
    "land_end_throne": "abea4c5b314b9fb89529f7cd1c38925b9fc80a15be51864e5d20058c66111224",
    "land_event": "a027f4784a036a7de5fd649fd489edb2113838e675fe29ff5924ac7e293044e9",
    "land_subevent": "25153e5cf9ee0b0babec7437384d4efde122702a9857a7032fe941dc9285a2d9",
    "land_ml_castle": "8534bb571facbff22927873edc90d9655641ebddd9f899cb49e072b2a4349862",
    "land_sl_gate": "8534bb571facbff22927873edc90d9655641ebddd9f899cb49e072b2a4349862",
    "land_sl_cemetery": "4911aec7b51eecab416ca5fc0f583189db33d56d70b81e330a4a52b562d93a8c",
    "land_sl_forest": "58c8b3e2dc400dee3044364f112c83aee84a4d6e5ea23b8fddec374069fbe5e0",
    "land_sl_lake": "46064debc1f45793462218d136436db4fb28d7e22a8fd535161130ff7b01b44c",
    "land_sl_road": "cd92e79b679c1af7822083b58311d85b054dc1907c5db72b395df4535f22a9fb",
    "land_sl_ruin": "e3d23d732faa68f1960a79ff47b18f5fa4305f861df928593cc5236405381334",
    "land_sl_village": "db90d3151fe0cbfbec795ae93ecb473587c9e5f0602f5c5d1c9c6d55ed8ce4ea",
    "land_sl_wilderness": "caa2df1f24e0afffe26ee6ac19f46fda75d137ca28f2837c3ac01dfe04ff4740",
    "unit_chara01": "b7b6a68cc786ba4ac43ca8c35a9a5cda0935fe0c00fe4382923684658899c41d",
    "unit_chara03": "6cd2e124f7efd8a71e8d332d9da104e6cb191c975222424012e4bb257ea75482",
    "unit_chara04": "b2b425125e5897e0c460f49116d60f7a4354389022a44dfe3c75b27bcdf2cb26",
    "unit_chara11": "f6fdb01b3ff95d95d14f7bc650a102b79f7e0bcf150e01c318bedfaae0e939d2",
    "unit_chara12": "7c67cb97b7e14dfac14d5f54039ce786d91ed4266b04dadcdb1c572485675496",
    "bg_btl00a": "d31ddf773955018d227b9bec7a9b3d40d566e111bde7eef10050792eed1b91b3",
    "bg_btl00a_far": "fc69665706cffedd9ca894d99dfde48a6db2cc0e6de40d4a2a123d54afb32170",
    "bg_btl00a_book": "34615ce7fe027f31b3ff7f858bcb677d457cc698a47fdf857c48dcc2728187ba",
    "bg_btl02a": "6efa988629c9288fecac1b529d6dba7c58c98a5062e9000bf0e9c6c9597fc927",
    "bg_btl03a": "2a46c9649848ac593073f801fd90bb5a8e3414b77c4e88bd38b90feb8fe25f12",
    "bg_btl07a": "ab487378eee6fb1ccaa8b4bd45f60de265d63e4e23a2fc45e5907a4e112b1736",
    "bg_btl11a": "94ed3904e83f1c63821174378456ee10f8ddea1566c2de1219658159d84d910f",
    "bg_btl11a_book": "1e278239f01ed3a2f8fbb4ca695552396ccb2a8ecd769031f62c2b890740c8a5",
    "base": "6289d7c6fe19a62c45692474c692aee1807b59773bb414b9d4b311d87ac9ab5e",
    "phase": "036bf094cb3399748e4da1a6d97ff25f44ccccdf0c6ecd7a58ee4ce856bcceda",
    "space": "8a8dcd9442e9eba116d7b2ca9a573e889975bd391107ce7e317e00063e452bf4",
    "num_btl_p": "abc058c11d47d6c5c4909bf2839780490c1f3482cc180db6db0f9ad5ba4a2f35",
    "range_ch": "6be85aa381b5f4f81a021a305debf917886ca01c716f145dbfe694c7332a5b26",
    "time_base": "a16ffb0cb4bc501b5d7f78ecbb87bc59bf4ab183e62e74550dec3ba5d050cbd4",
    "life_base": "217aa172fbd85e2fb7d64345f6281092936572ca8a7d6bdd3301a9ebe4734fda",
    "card_base": "59c6cd2e1637dc302e2ae423092d3c92314b17b32bb7c276568fb910a81ca29e",
    "cardempty": "943d74df0c7faf73380ede1e5df57aad429af53cc33b0ea9ce158878abba9607",
    "ok": "1f922ef2962b911de12634d77093e354e0b91b7c5366e5f0fa44c491aeb2dbe9",
    "move_f_ch": "98f7db32be64da08584cf3c2ff9d0a8e45a667cae94b08ed8be84643da92ad1b",
    "move_b_ch": "dba99568071ad722a4f7996186041a21da1c8d92789d48983db3083ae3187165",
    "move_s_ch": "a55557039b4eeb0479d0ae1cc58454a142e7ec399b779eafe34fbf8c08f4828e",
    "move_c_ch": "54a06dda09947e654f121b85dfca50fee32acc66721741dd050f919bc2dc85a0",
    "op_hukidashi": "c0b01b089a7063a6f16745856cfefff8cdb5db5ee884e73fa89753155f882dd8",
    "op_up": "8f4bf50b306088735ace0106c0dff5b9c21d9ead42d90f77e70e8a54e38774dd",
    "op_down": "bd53b99f51594d8198d31ab5239b19801367161540603242dce6365bfc7d5dd1",
    "op_name": "124e52af274046f3830d6499f72db87390ade8fe3a7c91d7de761f9206c15694",
    "chat_base": "44b00703d2ae7ffb6d9c10eb655d3dbf95070509cbb35e0509dfb3be25cb947b",
    "skill_base": "00a20be5b6ef005c8d2b734296f769f2c002acda3e942ad6e788cc38c66c9d6a",
    "avatar_ch": "bd27e6476cd9ba96467a367880c8701db8743a29a6594d5e20d36157f2b69d58",
    "arrow_move": "3625dd0e19b5fc282d3b0943cfff306a580615acc594f68100430494e1109e4d",
    "standchara01_f": "da50c2905bf55ff8603de47f0305959d37c32104a57682d337836696adf97424",
    "standchara03_f": "0acbabbd8ce9f3483893cdad1c0961dcab3dd54cd548c5bcc47ec84cc98be881",
    "standchara04_f": "ff548ffac53b20005c5fd69372e5d32c1c4c74fb0bbdf8916480ca0476df98df",
    "standchara11_f": "fe03d041aa5442d51c61c8a40a81a0debdd92a49ce9c3001957a9c1ca3476e7a",
    "standchara12_f": "22ed984b92efc0a0cba84e6b667300d7b4e5f5083f31fc433f1e8b2cfcf9b36f",
    "standmon001_00_f": "6358207e01180f6b35ba118dbd611ae4813ae7ac8af7162c7d71bae543ab9152",
    "standmon002_00_f": "c43e7eeb9d71a86279fe796f9a2e1884ab564998c8440908a1c13065e363813f",
    "standmon003_00_f": "63d67d31585cddce6f3582956bf722ad00bd3353afc3d27356d77af09ad31e5a",
    "standmon028_00_f": "8cfbf8b27f1d026c91c544cd0b98137ead7cbf41d941b5d2f59be6d539582ea2",
    "standchara10_f": "455ec578878e539508cad752907fbfc9702abf930c4d0356c766640cd6cd2659",
    "standmon012_02_f": "de21836f609c798ec5990d44fc97277a9ba4292842d150cca9304ea083afa264",
    "standmon011_00_f": "b84a9dde353d2ecb9de6c5a78b9303d202510f2e247b3b28598e16cd33a03971",
}
BATTLE_SOURCE_DIRS = {
    **dict.fromkeys(("bg_btl00a", "bg_btl00a_far", "bg_btl00a_book", "bg_btl02a", "bg_btl03a",
                     "bg_btl07a", "bg_btl11a", "bg_btl11a_book"), "bg"),
    **dict.fromkeys(("base", "phase", "space", "range_ch", "time_base", "life_base", "card_base", "cardempty", "ok",
                     "chat_base", "skill_base", "avatar_ch", "arrow_move", "num_btl_p"), "game"),
    **dict.fromkeys(("op_hukidashi", "op_up", "op_down", "op_name"), "game/opening"),
    **dict.fromkeys(("move_f_ch", "move_b_ch", "move_s_ch", "move_c_ch"), ""),
}
MOVE_FACE_SOURCES = {
    "1": "standchara01_f", "21": "standchara03_f", "31": "standchara04_f",
    "101": "standchara11_f", "111": "standchara12_f", "1004": "standmon002_00_f",
    "1001": "standmon001_00_f", "1007": "standmon003_00_f",
    "1079": "standmon028_00_f", "94": "standchara10_f",
    "1033": "standmon012_02_f", "1034": "standmon011_00_f",
}
# The original CharaCards.csv uses standchara03 for all three Grunwald variants.
STAND_ALIASES = {"25": "21", "30": "21"}

# Source vector order in MapStageImage.as. Stages 8, 9 and 12 use the lake SWF.
TERRAIN = (
    "land_sl_gate", "land_sl_forest", "land_sl_road", "land_sl_lake",
    "land_sl_cemetery", "land_sl_village", "land_sl_wilderness", "land_sl_ruin",
    "land_sl_lake", "land_sl_lake", "land_ml_castle", "land_am_wasteland",
    "land_sl_lake", "land_am_stone", "land_al_arch", "land_end_throne",
)
# Label indexing in MapEventImage.as and MapSubEventImage.as.
EVENTS = ("enemy", "tbox_red_g", "tbox_green_s", "tbox_blue_s", "tbox_white_s", "jem_g", "enemy", "enemy_hl")
SUB_EVENTS = ("tbox_red_s", "tbox_red_g", "tbox_green_s", "tbox_blue_s", "tbox_white_s", "jem_g", "exp_s", "highlow")
# The normal starter CharaCards (1,21,31,101,111) have these character IDs.
STARTER_CHARACTERS = (1, 3, 4, 11, 12)
QUEST_STAGE_FRAME_RATE = 24 * 1.7  # QuestView.show and Unlight.SPEED in Main.as
QUEST_TURN_LIMIT = 18  # QuestController passes the original BATTLE_TIMEOUT_TURN.


def kind(tag):
    return tag.tag.removeprefix(NS)


def translation(matrix):
    match = re.fullmatch(r"t(-?\d+),(-?\d+)", matrix)
    if not match:
        raise ValueError(f"Unsupported detail placement matrix {matrix!r}")
    return tuple(map(int, match.groups()))


def bounds(tag):
    value = tag.get("bounds")
    if re.fullmatch(r"\d+x\d+", value):
        return (0, 0, *map(int, value.split("x")))
    return tuple(map(int, re.findall(r"-?\d+", value)))


def timeline(container):
    """Follow PlaceObject2 replacements/retained attributes at each depth."""
    display = {}
    label = None
    for tag in container:
        name = kind(tag)
        if name in ("PlaceObject2", "PlaceObject3"):
            depth = int(tag.attrib["depth"])
            display[depth] = display.get(depth, {}) | tag.attrib
        elif name == "RemoveObject2":
            del display[int(tag.attrib["depth"])]
        elif name == "FrameLabel":
            label = tag.attrib["label"]
        elif name == "ShowFrame":
            yield label, [display[depth] for depth in sorted(display)]
            label = None


def nested_tags(data):
    offset = 4  # DefineSprite ID and frame count
    while offset + 2 <= len(data):
        header = unpack_from("<H", data, offset)[0]
        offset += 2
        tag, size = header >> 6, header & 63
        if size == 63:
            size = unpack_from("<I", data, offset)[0]
            offset += 4
        if tag == 0:
            return
        yield tag, data[offset:offset + size]
        offset += size


def color_flags(tag, data):
    flags = data[0]
    if not flags & 8:
        raise ValueError("SWF dump claims a color transform missing from PlaceObject")
    offset = 4 if tag == 70 else 3
    if tag == 70 and (data[1] & 8 or (data[1] & 16 and flags & 2)):
        offset = data.index(b"\0", offset) + 1  # optional class name
    if flags & 2:
        offset += 2  # optional character ID
    bit = offset * 8

    def read(count):
        nonlocal bit
        result = 0
        for _ in range(count):
            result = result * 2 + ((data[bit // 8] >> (7 - bit % 8)) & 1)
            bit += 1
        return result

    if flags & 4:
        for _ in range(2):  # optional scale and rotation
            if read(1):
                size = read(5)
                bit += 2 * size
        size = read(5)
        bit += 2 * size  # translation
        bit = ((bit + 7) // 8) * 8
    return read(2)  # HasAddTerms, HasMultTerms


def restore_empty_color_transforms(container, raw_tags):
    placements = [tag for tag in container if kind(tag) in ("PlaceObject2", "PlaceObject3")]
    if not any(tag.get("cxform") == "0r+0 0g+0 0b+0 0a+0" for tag in placements):
        return
    originals = ((tag, data) for tag, data in raw_tags if tag in (26, 70))
    for node, (tag, data) in zip(placements, originals, strict=True):
        if node.get("cxform") == "0r+0 0g+0 0b+0 0a+0" and color_flags(tag, data) == 0:
            # swfdump prints zero multipliers for omitted terms. In SWF they mean identity.
            node.set("cxform", "256r+0 256g+0 256b+0 256a+0")


CHAT_DUPLICATE_BITMAPS = {7: 5, 14: 12, 21: 19}


def chat_dump(source, raw_tags, swfdump):
    """Disambiguate Flex's duplicate bitmap objects without altering any visible pixels."""
    raw = source.read_bytes()
    body = decompress(raw[8:]) if raw[:3] == b"CWS" else raw[8:]
    first_tag = (5 + 4 * (body[0] >> 3) + 7) // 8 + 4
    xrgb = {unpack_from("<H", data)[0]: data for tag, data in raw_tags if tag == 20}
    contents = bytearray(body[:first_tag])
    for tag, data in raw_tags:
        if tag == 20:
            symbol = unpack_from("<H", data)[0]
            if symbol in CHAT_DUPLICATE_BITMAPS:
                duplicate = xrgb[CHAT_DUPLICATE_BITMAPS[symbol]]
                if data[2] != 5 or data[2:] != duplicate[2:]:
                    raise ValueError("Unexpected original chat bitmap alias")
                pixels = bytearray(decompress(data[7:]))
                pixels[0] ^= 1  # XRGB's reserved first byte is not a displayed channel.
                data = data[:7] + compress(pixels)
        size = len(data)
        contents.extend(pack("<H", (tag << 6) | min(size, 63)))
        if size >= 63:
            contents.extend(pack("<I", size))
        contents.extend(data)
    contents.extend(b"\0\0")  # End tag
    with TemporaryDirectory() as directory:
        path = Path(directory) / source.name
        path.write_bytes(b"FWS" + raw[3:4] + pack("<I", 8 + len(contents)) + contents)
        return subprocess.check_output([swfdump, "-encode", path])


@dataclass(frozen=True)
class Primitive:
    # Coordinates and bounds are kept in original twips until writing the PNG.
    bounds: tuple
    markup: str
    bitmap_id: int | None = None
    image: Image.Image | None = None


class Movie:
    def __init__(self, asset_root, name, swfdump, *, pin=None):
        if pin is None:
            directory = (Path("public/image/standchara") if name in MOVE_FACE_SOURCES.values()
                         else QUEST_DIR.parent / BATTLE_SOURCE_DIRS.get(name, "quest"))
            pin = (directory / f"{name}.swf", SOURCE_DIGESTS[name])
        path, digest = pin
        self.path = Path(path)
        self.source = source = asset_root / self.path
        self.digest = sha256(source.read_bytes()).hexdigest()
        if self.digest != digest:
            raise ValueError(f"Incorrect pinned digest for {self.path}")
        raw_tags = list(tags(source))
        layout = chat_dump(source, raw_tags, swfdump) if name == "chat_base" else subprocess.check_output([swfdump, "-encode", source])
        self.root = ElementTree.fromstring(layout)
        self.symbols = {tag.get("id"): tag for tag in self.root if "id" in tag.attrib}
        self.classes = {
            tag.attrib["className"]: tag.attrib["idref"]
            for tag in self.root.findall(f"{NS}SymbolClass/{NS}Symbol")
        }
        self.bitmaps, self.binary_ids = {}, {}
        # Flex renumbers display IDs in land_event.swf. Keep original binary IDs in the manifest.
        xml_definitions = (tag for tag in self.root if kind(tag) in DEFINITION_TAGS.values())
        binary_definitions = ((tag, data) for tag, data in raw_tags if tag in DEFINITION_TAGS)
        for node, (tag, data) in zip(xml_definitions, binary_definitions, strict=True):
            if kind(node) != DEFINITION_TAGS[tag]:
                raise ValueError(f"Definition order differs in SWF dump of {self.path}")
            xml_id = node.attrib["id"]
            self.binary_ids[xml_id] = unpack_from("<H", data)[0]
            if tag == 39:
                restore_empty_color_transforms(node, nested_tags(data))
            if tag not in (6, 20, 35, 36):
                continue
            if tag in (20, 36):
                if data[2] == 5:
                    original = decompress(data[7:])
                elif data[2] == 3:
                    color_bytes = 4 if tag == 36 else 3
                    original = decompress(data[8:])[color_bytes * (data[7] + 1):]
                else:
                    raise ValueError(f"Unsupported lossless bitmap in {self.path}")
            elif tag == 35:
                jpeg_length = unpack_from("<I", data, 2)[0]
                original = data[6:6 + jpeg_length]
            else:
                original = data[2:]
            xml_bytes = b"".join(b64decode(line) for line in node.text.split())
            if name == "chat_base" and self.binary_ids[xml_id] in CHAT_DUPLICATE_BITMAPS:
                xml_bytes = bytes([xml_bytes[0] ^ 1]) + xml_bytes[1:]
            if original != xml_bytes:
                raise ValueError(f"Bitmap contents differ in SWF dump of {self.path}")
            self.bitmaps[xml_id] = (tag, data)
        restore_empty_color_transforms(self.root, raw_tags)

    @cache
    def bitmap(self, bitmap_id):
        tag, data = self.bitmaps[bitmap_id]
        if tag == 6:
            return Image.open(BytesIO(data[2:])).convert("RGBA")
        if tag == 35:
            jpeg_length = unpack_from("<I", data, 2)[0]
            image = Image.open(BytesIO(data[6:6 + jpeg_length])).convert("RGB")
            rgb = image.tobytes()
            alpha = decompress(data[6 + jpeg_length:])
            pixels = zip(rgb[::3], rgb[1::3], rgb[2::3], alpha, strict=True)
            size = image.size
        else:
            size = unpack_from("<HH", data, 3)
            if data[2] == 3:
                original_id = self.binary_ids[bitmap_id]
                return Image.open(BytesIO(indexed_png(self.source, size=size, bitmap_id=original_id,
                                                       with_alpha=(tag == 36)))).convert("RGBA")
            argb = decompress(data[7:])
            if tag == 20:
                return Image.frombytes("RGB", size, argb, "raw", "XRGB").convert("RGBA")
            pixels = zip(argb[1::4], argb[2::4], argb[3::4], argb[::4], strict=True)
        straight = bytes(
            component
            for red, green, blue, alpha in pixels
            for component in (*[min(255, straight_component(value, alpha)) for value in (red, green, blue)], alpha)
        )
        if len(straight) != size[0] * size[1] * 4:
            raise ValueError(f"Unexpected bitmap byte count for {self.path} bitmap {bitmap_id}")
        return Image.frombytes("RGBA", size, straight)

    def instance(self, name):
        _, placements = next(timeline(self.root))
        if name is None:
            (only,) = placements
            return only
        return next(placement for placement in placements if placement.get("name") == name)

    def symbol(self, placement):
        reference = placement["idref"]
        return self.symbols[self.classes.get(reference, reference)]

    def original_id(self, placement):
        return self.binary_ids[self.symbol(placement).attrib["id"]]

    def frame(self, placement, selector):
        for index, (label, contents) in enumerate(timeline(self.symbol(placement)), 1):
            if selector in (index, label):
                return index, [self.offset(child, placement) for child in contents]
        raise ValueError(f"Missing frame {selector!r} in {self.path}")

    @staticmethod
    def offset(child, parent):
        x, y = translation(child["matrix"])
        dx, dy = translation(parent["matrix"])
        return child | {"matrix": f"t{x + dx},{y + dy}"}

    def state(self, button, state):
        return [
            self.offset(record.attrib, button) for record in self.symbol(button)
            if kind(record) == "buttonRecord" and state in record.attrib["states"].split(",")
        ]

    def primitives(self, placements):
        pieces, shapes = [], []
        for placement in placements:
            shape = self.symbol(placement)
            if kind(shape) == "DefineSprite":
                _, first_frame = self.frame(placement, 1)
                layers, nested_shapes = self.primitives(first_frame)
                pieces.extend(layers)
                shapes.extend(nested_shapes)
            else:
                shapes.append(self.original_id(placement))
                pieces.extend(self.shape(shape, translation(placement["matrix"])))
        return pieces, shapes

    def shape(self, shape, offset, ratio=0, *, outline_behind_fill=False, preserve_stroke_alpha=False):
        name = kind(shape)
        if name == "DefineMorphShape":
            if shape.find(f"{NS}fillstyle").get("type") == "0":
                return [solid_morph(shape, offset, ratio)]
            return [morph_start(shape, offset)]
        if name not in ("DefineShape", "DefineShape2", "DefineShape3", "DefineShape4"):
            raise ValueError(f"Unsupported detail shape {name}")
        x0, y0, x1, y1 = bounds(shape)
        dx, dy = offset
        extent = (x0 + dx, y0 + dy, x1 + dx, y1 + dy)
        pieces = []
        paths = shape_paths(shape)
        if outline_behind_fill:
            paths = sorted(paths, key=lambda item: kind(item[0]) != "linestyle")
        for style, path in paths:
            if kind(style) == "linestyle":
                flags = style.get("flags", "0")
                if flags not in ("0", "320"):
                    raise ValueError(f"Unexpected line style {style.attrib}")
                stroke = 'stroke-linecap="butt"' if flags == "320" else 'stroke-linecap="round" stroke-linejoin="round"'
                color = style.attrib["color"]
                opacity = f' stroke-opacity="{hex_alpha(color)}"' if preserve_stroke_alpha else ""
                markup = (
                    f'<path d="{path}" fill="none" stroke="{color[:7]}"{opacity} '
                    f'stroke-width="{int(style.attrib["width"])}" {stroke} '
                    f'transform="translate({dx} {dy})"/>'
                )
            elif style.attrib["type"] == "0":
                markup = color_path(path, style.attrib["color"], dx, dy)
            elif style.attrib["type"] in ("16", "18"):
                markup = gradient_path(path, style.attrib, dx, dy)
            elif style.attrib["type"] == "67":
                bitmap_id = style.attrib["idref"]
                image = self.bitmap(bitmap_id)
                matrix = re.fullmatch(r"s[\d.]+,[\d.]+ (t-?\d+,-?\d+)", style.attrib["matrix"])
                if not matrix:
                    raise ValueError(f"Unexpected bitmap fill matrix {style.attrib}")
                bx, by = translation(matrix[1])
                def matches_bitmap(rect):
                    return rect is not None and rect[:2] == (bx, by) and (
                        0 <= bx + image.width * TWIPS - rect[2] <= 2
                        and 0 <= by + image.height * TWIPS - rect[3] <= 2
                    )

                if not matches_bitmap((x0, y0, x1, y1)) and not matches_bitmap(bitmap_rectangle(path)):
                    raise ValueError(f"Unexpected rectangular image area in shape {shape.attrib}")
                left, top = bx + dx, by + dy
                width, height = image.width * TWIPS, image.height * TWIPS
                url = b64encode(png_bytes(image)).decode("ascii")
                markup = (
                    f'<image x="{left}" y="{top}" width="{width}" height="{height}" '
                    f'xlink:href="data:image/png;base64,{url}"/>'
                )
                pieces.append(Primitive((left, top, left + width, top + height), markup, self.binary_ids[bitmap_id], image))
                continue
            else:
                raise ValueError(f"Unexpected fill {style.attrib}")
            pieces.append(Primitive(extent, markup))
        return pieces


def bitmap_rectangle(path):
    if not re.fullmatch(r"M-?\d+,-?\d+(?: L-?\d+,-?\d+){4} Z", path):
        return None
    coords = tuple(map(int, re.findall(r"-?\d+", path)))
    x, y = sorted(set(coords[::2])), sorted(set(coords[1::2]))
    if len(x) == len(y) == 2 and len(set(zip(coords[::2], coords[1::2]))) == 4:
        return x[0], y[0], x[1], y[1]
    return None


def shape_paths(shape):
    """Turn the pinned SWF edge records into closed fills and open strokes."""
    styles = {"fillstyle": [], "linestyle": []}
    pending = defaultdict(list)
    sections = []
    left = right = stroke = None
    point = (0, 0)

    def flush():
        sections.extend((style, edges) for key, values in styles.items()
                        for index, style in enumerate(values) if (edges := pending.get((key, index))))

    for record in shape:
        name = kind(record)
        if name in styles:
            styles[name].append(record)
            continue
        if name == "styleChange":
            attrs = record.attrib
            if "dx" in attrs or "dy" in attrs:
                point = (int(attrs.get("dx", 0)), int(attrs.get("dy", 0)))
            if "fillStyle0" in attrs:
                left = int(attrs["fillStyle0"]) - 1
            if "fillStyle1" in attrs:
                right = int(attrs["fillStyle1"]) - 1
            if "lineStyle" in attrs:
                stroke = int(attrs["lineStyle"]) - 1
            if len(record):
                flush()
                pending.clear()
                styles = {key: record.findall(f"{NS}{key}") for key in styles}
            continue
        if name not in ("line", "curve"):
            raise ValueError(f"Unexpected edge record {name}")
        attrs = record.attrib
        control = (point[0] + int(attrs["cdx"]), point[1] + int(attrs["cdy"])) if name == "curve" else None
        end = ((control or point)[0] + int(attrs["dx"]), (control or point)[1] + int(attrs["dy"]))
        pending["fillstyle", left].append((end, point, control))
        pending["fillstyle", right].append((point, end, control))
        pending["linestyle", stroke].append((point, end, control))
        point = end
    flush()
    for style, segments in sections:
        yield style, edge_path(segments, closed=(kind(style) == "fillstyle"))


def edge_path(segments, *, closed):
    remaining = list(segments)
    commands = []
    while remaining:
        start, end, control = remaining.pop(0)
        commands.append(f"M{start[0]},{start[1]}")
        while True:
            commands.append(f"Q{control[0]},{control[1]} {end[0]},{end[1]}" if control else f"L{end[0]},{end[1]}")
            if end == start:
                if closed:
                    commands.append("Z")
                break
            index = next((index for index, item in enumerate(remaining) if item[0] == end), None)
            if index is None:
                if closed:
                    raise ValueError("Open fill in pinned quest art")
                break
            _, end, control = remaining.pop(index)
    return " ".join(commands)


def color_path(path, color, dx, dy):
    alpha = int(color[7:9], 16) / 255 if len(color) == 9 else 1
    return (
        f'<path d="{path}" fill="{color[:7]}" fill-opacity="{alpha}" fill-rule="evenodd" '
        f'transform="translate({dx} {dy})"/>'
    )


def gradient_path(path, style, dx, dy):
    matrix = " ".join(str(value) for value in swf_affine(style["matrix"]))
    radial = style["type"] == "18"
    tag = "radialGradient" if radial else "linearGradient"
    geometry = 'cx="0" cy="0" r="16384"' if radial else 'x1="-16384" y1="0" x2="16384" y2="0"'
    gradient = f"gradient-{sha256(repr(style).encode()).hexdigest()[:12]}"
    stops = style["gradient"].split()
    markup = "".join(
        f'<stop offset="{int(position) / 255}" stop-color="{color[:7]}" stop-opacity="{hex_alpha(color)}"/>'
        for position, color in zip(stops[::2], stops[1::2], strict=True)
    )
    return (
        f'<g transform="translate({dx} {dy})"><defs><{tag} id="{gradient}" gradientUnits="userSpaceOnUse" '
        f'{geometry} gradientTransform="matrix({matrix})">{markup}</{tag}></defs>'
        f'<path fill="url(#{gradient})" d="{path}"/></g>'
    )


def hex_alpha(color):
    return int(color[7:9], 16) / 255 if len(color) == 9 else 1


def solid_morph(shape, offset, ratio):
    """The TimeBase warning changes color with identical start/end outlines."""
    start, end = (shape.find(f"{NS}{edge}") for edge in ("start", "end"))
    coords = ("dx", "dy", "cdx", "cdy")
    start_edges = [(kind(edge), [edge.get(axis) for axis in coords]) for edge in start]
    end_edges = [(kind(edge), [edge.get(axis) for axis in coords]) for edge in end]
    if start_edges != end_edges:
        raise ValueError("Unsupported solid morph with moving edges")
    fill = shape.find(f"{NS}fillstyle")
    colors = [bytes.fromhex(fill.attrib[f"{edge}Color"][1:]) for edge in ("start", "end")]
    color = "#" + bytes(round(a + (b - a) * ratio / 65535) for a, b in zip(*colors, strict=True)).hex()
    outline = ElementTree.Element("outline")
    ElementTree.SubElement(outline, f"{NS}fillstyle")
    outline.extend(start)
    ((_, path),) = shape_paths(outline)
    dx, dy = offset
    x0, y0, x1, y1 = bounds({"bounds": shape.attrib["startBounds"]})
    return Primitive((x0 + dx, y0 + dy, x1 + dx, y1 + dy), color_path(path, color, dx, dy))


def clip_path(symbol, ratio, matrix):
    if kind(symbol) == "DefineMorphShape":
        # The localized distance indicators use axis-aligned rectangular reveals.
        if any([kind(edge) for edge in symbol.find(f"{NS}{side}")] != ["styleChange", *(["line"] * 4)]
               for side in ("start", "end")):
            raise ValueError("Unsupported distance mask outline")
        start = bounds({"bounds": symbol.attrib["startBounds"]})
        end = bounds({"bounds": symbol.attrib["endBounds"]})
        x0, y0, x1, y1 = (a + (b - a) * ratio / 65535 for a, b in zip(start, end, strict=True))
        return f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" transform="matrix({matrix})"/>'
    return "".join(f'<path d="{path}" transform="matrix({matrix})"/>' for _, path in shape_paths(symbol))


def morph_start(shape, offset):
    """Render the true first frame of the nested chest sparkle (morph ratio 0)."""
    fill = shape.find(f"{NS}fillstyle")
    match = re.fullmatch(r"s([\d.]+),([\d.]+) t0,0", fill.attrib["startMatrix"])
    if fill.attrib["type"] != "18" or not match:
        raise ValueError("Unexpected original chest sparkle gradient")
    sx, sy = map(float, match.groups())
    colors = fill.attrib["gradient"].split()
    stops = "".join(
        f'<stop offset="{int(position.split(",")[0]) / 255}" stop-color="{color[:7]}"/>'
        for position, color in zip(colors[::2], colors[1::2], strict=True)
    )
    # All source stroke widths and alphas are zero. The first edge record selects the radial fill.
    start = ElementTree.Element("start")
    ElementTree.SubElement(start, f"{NS}fillstyle")
    start.extend(shape.find(f"{NS}start"))
    ((_, outline),) = shape_paths(start)
    dx, dy = offset
    x0, y0, x1, y1 = bounds({"bounds": shape.attrib["startBounds"]})
    gradient = f'gradient-{shape.attrib["id"]}'
    markup = (
        f'<g transform="translate({dx} {dy})"><defs><radialGradient id="{gradient}" gradientUnits="userSpaceOnUse" '
        f'cx="0" cy="0" r="16384" gradientTransform="scale({sx} {sy})">{stops}</radialGradient></defs>'
        f'<path fill="url(#{gradient})" d="{outline}"/></g>'
    )
    return Primitive((x0 + dx, y0 + dy, x1 + dx, y1 + dy), markup)


def png_bytes(image):
    stream = BytesIO()
    image.save(stream, format="PNG", optimize=True)
    return stream.getvalue()


def native_function(library, name, result, *arguments):
    function = getattr(library, name)
    function.restype = result
    function.argtypes = arguments
    return function


def rasterize_svg(markup, width, height):
    pointer, integer = ctypes.c_void_p, ctypes.c_int
    cairo = ctypes.CDLL("libcairo.so.2")
    rsvg = ctypes.CDLL("librsvg-2.so.2")
    gobject = ctypes.CDLL("libgobject-2.0.so.0")
    new_svg = native_function(rsvg, "rsvg_handle_new_from_data", pointer, ctypes.c_char_p, ctypes.c_size_t, pointer)
    draw = native_function(rsvg, "rsvg_handle_render_cairo", integer, pointer, pointer)
    release_svg = native_function(gobject, "g_object_unref", None, pointer)
    new_surface = native_function(cairo, "cairo_image_surface_create", pointer, integer, integer, integer)
    new_context = native_function(cairo, "cairo_create", pointer, pointer)
    destroy_surface = native_function(cairo, "cairo_surface_destroy", None, pointer)
    destroy_context = native_function(cairo, "cairo_destroy", None, pointer)
    callback = ctypes.CFUNCTYPE(integer, pointer, pointer, ctypes.c_uint)
    write_png = native_function(cairo, "cairo_surface_write_to_png_stream", integer, pointer, callback, pointer)
    output = BytesIO()

    @callback
    def collect(_, chunk, length):
        output.write(ctypes.string_at(chunk, length))
        return 0

    svg = new_svg(markup, len(markup), None)
    if not svg:
        raise ValueError("Unable to decode SVG for original quest vectors")
    surface = new_surface(0, width, height)  # CAIRO_FORMAT_ARGB32
    context = new_context(surface)
    try:
        if not draw(svg, context) or write_png(surface, collect, None):
            raise ValueError("Unable to rasterize original quest vectors")
    finally:
        destroy_context(context)
        destroy_surface(surface)
        release_svg(svg)
    return Image.open(output).convert("RGBA")


def rasterize(pieces, crop=None):
    if crop is not None:
        x0, y0, x1, y1 = crop
    elif len(pieces) == 1 and pieces[0].image is not None:
        first = pieces[0]
        return first.image, first.bounds[0] / TWIPS, first.bounds[1] / TWIPS
    else:
        x0 = min(piece.bounds[0] for piece in pieces)
        y0 = min(piece.bounds[1] for piece in pieces)
        x1 = max(piece.bounds[2] for piece in pieces)
        y1 = max(piece.bounds[3] for piece in pieces)
    width, height = ceil((x1 - x0) / TWIPS), ceil((y1 - y0) / TWIPS)
    markup = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width}" height="{height}" viewBox="{x0} {y0} {width * TWIPS} {height * TWIPS}">'
        + "".join(piece.markup for piece in pieces) + "</svg>"
    )
    image = rasterize_svg(markup.encode(), width, height)
    if image.size != (width, height) or not image.getbbox():
        raise ValueError("Quest detail vector rasterization failed")
    return image, x0 / TWIPS, y0 / TWIPS


def transformed(primitives, sx, sy, dx, dy):
    """Apply the source static frame's horizontal flip or trim-scale in twips."""
    for primitive in primitives:
        left, top, right, bottom = primitive.bounds
        x0, x1 = sorted((left * sx + dx, right * sx + dx))
        y0, y1 = sorted((top * sy + dy, bottom * sy + dy))
        markup = f'<g transform="matrix({sx} 0 0 {sy} {dx} {dy})">{primitive.markup}</g>'
        yield Primitive((x0, y0, x1, y1), markup, primitive.bitmap_id)


def swf_affine(matrix):
    kwargs = {term[0]: tuple(map(float, term[1:].split(","))) for term in matrix.split()}
    if set(kwargs) - {"s", "r", "t"}:
        raise ValueError(f"Unsupported HUD transform {matrix}")
    a, d = kwargs.get("s", (1, 1))
    b, c = kwargs.get("r", (0, 0))
    x, y = kwargs.get("t", (0, 0))
    return a, b, c, d, x, y


def placed_primitives(primitives, matrix):
    if matrix == "t0,0":
        return primitives
    a, b, c, d, dx, dy = swf_affine(matrix)
    if b == c == 0:
        return list(transformed(primitives, a, d, dx, dy))
    markup_matrix = f"matrix({a} {b} {c} {d} {dx} {dy})"
    result = []
    for primitive in primitives:
        left, top, right, bottom = primitive.bounds
        corners = [(a * x + c * y + dx, b * x + d * y + dy) for x in (left, right) for y in (top, bottom)]
        xx, yy = zip(*corners, strict=True)
        markup = f'<g transform="{markup_matrix}">{primitive.markup}</g>'
        result.append(Primitive((min(xx), min(yy), max(xx), max(yy)), markup, primitive.bitmap_id))
    return result


def color_transform(pieces, attributes):
    channels = re.fullmatch(r"(-?\d+)r([+-]\d+) (-?\d+)g([+-]\d+) (-?\d+)b([+-]\d+) (-?\d+)a([+-]\d+)", attributes)
    if not channels:
        raise ValueError(f"Unsupported HUD color transform {attributes}")
    values = tuple(map(int, channels.groups()))
    if values[6:] == (0, 0):
        return []
    if values[:6] == (256, 0, 256, 0, 256, 0) and values[7] == 0:
        if values[6] == 256:
            return pieces
        start, end = f'<g opacity="{values[6] / 256}">', "</g>"
    else:
        identifier = f"cx-{sha256(attributes.encode()).hexdigest()[:12]}"
        transfers = "".join(
            f'<feFunc{letter} type="linear" slope="{slope / 256}" intercept="{offset / 255}"/>'
            for letter, slope, offset in zip("RGBA", values[::2], values[1::2], strict=True)
        )
        start = (f'<defs><filter id="{identifier}" color-interpolation-filters="sRGB">'
                 f'<feComponentTransfer>{transfers}</feComponentTransfer></filter></defs>'
                 f'<g filter="url(#{identifier})">')
        end = "</g>"
    return [Primitive(piece.bounds, f"{start}{piece.markup}{end}", piece.bitmap_id) for piece in pieces]


def authored_primitives(source, placements, *, outline_behind_fill=False, preserve_stroke_alpha=False):
    """Resolve HUD sprites and Flash depth masks, preserving color transforms."""
    pieces, shapes = [], []
    clip = None
    for part in placements:
        symbol = source.symbol(part)
        depth = int(part["depth"])
        if clip and depth > clip[0]:
            clip = None
        if "clipDepth" in part:
            svg_matrix = " ".join(str(value) for value in swf_affine(part["matrix"]))
            paths = clip_path(symbol, int(part.get("ratio", 0)), svg_matrix)
            name = f"mask-{source.original_id(part)}-{depth}"
            clip = (int(part["clipDepth"]), name,
                    f'<defs><clipPath id="{name}" clipPathUnits="userSpaceOnUse">{paths}</clipPath></defs>')
            shapes.append(source.original_id(part))
            continue
        symbol_kind = kind(symbol)
        if symbol_kind == "DefineSprite":
            child_frame = part.get("spriteFrame", 1)
            children = list(timeline(symbol))[child_frame - 1][1]
            originals, nested_shapes = authored_primitives(source, children, outline_behind_fill=outline_behind_fill,
                                                           preserve_stroke_alpha=preserve_stroke_alpha)
            shapes.extend(nested_shapes)
        elif symbol_kind == "DefineButton2":
            children = [button.attrib for button in symbol if kind(button) == "buttonRecord"
                        and part.get("buttonState", "up") in button.attrib["states"].split(",")]
            originals, nested_shapes = authored_primitives(source, children, outline_behind_fill=outline_behind_fill,
                                                           preserve_stroke_alpha=preserve_stroke_alpha)
            shapes.extend(nested_shapes)
        elif symbol_kind == "DefineText" and all(hex_alpha(text.attrib["color"]) == 0 for text in symbol):
            continue
        else:
            originals = source.shape(symbol, (0, 0), int(part.get("ratio", 0)), outline_behind_fill=outline_behind_fill,
                                     preserve_stroke_alpha=preserve_stroke_alpha)
            shapes.append(source.original_id(part))
        transformed_parts = placed_primitives(originals, part["matrix"])
        if "cxform" in part:
            transformed_parts = color_transform(transformed_parts, part["cxform"])
        if clip:
            _, name, definitions = clip
            transformed_parts = [Primitive(piece.bounds, f'{definitions}<g clip-path="url(#{name})">{piece.markup}</g>',
                                           piece.bitmap_id) for piece in transformed_parts]
        pieces.extend(transformed_parts)
    return pieces, shapes


def extract(asset_root, art, swfdump, move_faces=(), battle_stages=()):
    manifest_path = art / "sources.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest["assetRevision"] != REVISION:
        raise ValueError("Quest art manifest uses a different asset revision")
    # The separate stage 0 tool exports its original radial morph with FFDec.
    castle = manifest.get("battle", {}).get("stages", {}).get("0")
    castle_art = {name: layer for name, layer in manifest["layers"].items()
                  if castle and name.startswith("quest-battle-stage00-")}
    if not move_faces and not battle_stages:
        manifest["layers"] = {
            name: layer for name, layer in manifest["layers"].items()
            if not name.startswith(("quest-detail-", "quest-battle-"))
        }

    @cache
    def movie(name):
        return Movie(asset_root, name, swfdump)

    def publish(source, name, content, geometry, coordinate_space, frame, **evidence):
        manifest["layers"][name] = dict(
            source=source.path.as_posix(), sourceSha256=source.digest, sourceFrame=frame,
            coordinateSpace=coordinate_space, **evidence, **geometry, sha256=sha256(content).hexdigest(),
        )
        (art / name).write_bytes(content)
        return dict(file=name, **geometry)

    def add(source, filename, placements, coordinate_space, frame=1, *, art_set="detail", **extra):
        pieces, shapes = source.primitives(placements)
        return add_pieces(source, filename, pieces, shapes, coordinate_space, frame, art_set, **extra)

    def add_pieces(source, filename, pieces, shapes, coordinate_space, frame, art_set, *, crop=None, **extra):
        image, x, y = rasterize(pieces, crop)
        geometry = dict(x=x, y=y, width=image.width, height=image.height)
        return publish(source, f"quest-{art_set}-{filename}.png", png_bytes(image), geometry,
                       coordinate_space, frame, shapeIds=shapes,
                       bitmapIds=[piece.bitmap_id for piece in pieces if piece.bitmap_id is not None], **extra)

    def battle_far_jpeg(far, filename):
        _, placements = next(timeline(far.root))
        (placed,) = placements
        (fill,) = far.symbol(placed).findall(f"{NS}fillstyle")
        bitmap_id = fill.attrib["idref"]
        format_tag, data = far.bitmaps[bitmap_id]
        if format_tag != 6:
            raise ValueError("Expected original complete JPEG stream for battle FarBG")
        image = far.bitmap(bitmap_id)
        dx, dy = translation(placed["matrix"])
        return publish(far, f"quest-battle-{filename}.jpg", data[2:],
                       dict(x=dx / TWIPS, y=dy / TWIPS, width=image.width, height=image.height), "stage", 1,
                       shapeIds=[far.original_id(placed)], bitmapIds=[far.binary_ids[bitmap_id]],
                       representation="unchanged SWF JPEG stream", sourceDepth=int(placed["depth"]))

    def stage11_battle_layers():
        far_art = battle_far_jpeg(movie("bg_btl11a"), "stage11-far")
        near = movie("bg_btl11a_book")
        _, placements = next(timeline(near.root))
        near_parts = [
            add(near, f"stage11-{name}", [placed], "stage", art_set="battle", sourceDepth=int(placed["depth"]))
            for name, placed in zip(("near-bottom", "near-foreground"), placements, strict=True)
        ]
        return [dict(far_art, depth=0), *(dict(part, depth=3) for part in near_parts)]

    def stage2_battle_layers():
        far = movie("bg_btl00a_far")
        _, far_placements = next(timeline(far.root))
        pieces, shapes = far.primitives(far_placements)
        # FarBG draws the raw 760×273 picture into a transparent 760×350 BitmapData.
        (band,) = pieces
        if band.bounds != (0, 0, 15200, 5460) or band.image.size != (760, 273):
            raise ValueError("Unexpected original stage 2 far band")
        bitmap = Image.new("RGBA", (760, 350))
        bitmap.paste(band.image, (0, 0))
        motion = {"direction": -1, "stepsPerSecond": QUEST_STAGE_FRAME_RATE / 2}
        far_art = publish(far, "quest-battle-stage02-far.png", png_bytes(bitmap),
                          dict(x=0, y=0, width=760, height=350), "stage", 1,
                          shapeIds=shapes, bitmapIds=[band.bitmap_id], sourceDepth=1, scroll=motion)
        road = movie("bg_btl02a")
        _, road_placements = next(timeline(road.root))
        road_art = add(road, "stage02-road", road_placements, "stage", art_set="battle", sourceDepth=3)
        return [dict(far_art, depth=0, scroll=motion), dict(road_art, depth=0)]

    def stage3_battle_layers():
        lake = movie("bg_btl03a")
        _, placements = next(timeline(lake.root))
        layer = add(lake, "stage03-lake", placements, "stage", art_set="battle", sourceDepth=3)
        return [dict(layer, depth=0)]

    stage_extractors = {
        "2": (stage2_battle_layers, "002"),
        "3": (stage3_battle_layers, "003"),
        "7": (lambda: [dict(battle_far_jpeg(movie("bg_btl07a"), "stage07-far"), depth=0)], "007"),
        "11": (stage11_battle_layers, "000"),
    }

    def stage_art(stages):
        return {stage: {"layers": stage_extractors[stage][0](),
                        "bgm": f"/public/sound/bgm/bgm{stage_extractors[stage][1]}.mp3"} for stage in stages}

    def battle_static_frame():
        source = movie("base")
        _, contents = next(timeline(source.root))
        pieces, shapes = [], []
        for part in contents:
            if int(part["depth"]) > 7:
                continue  # turn and turn_raid are live child sprites, apart from the base chrome.
            matrix = part["matrix"]
            scale = re.fullmatch(r"s(-?[\d.]+),(-?[\d.]+) (t-?\d+,-?\d+)", matrix)
            if scale:
                sx, sy = float(scale[1]), float(scale[2])
                dx, dy = translation(scale[3])
                objects, shape_ids = source.primitives([part | {"matrix": "t0,0"}])
                pieces.extend(transformed(objects, sx, sy, dx, dy))
            else:
                objects, shape_ids = source.primitives([part])
                pieces.extend(objects)
            shapes.extend(shape_ids)
        frame = add_pieces(source, "base-frame", pieces, shapes, "stage", 1, "battle", crop=(0, 0, 15200, 13600),
                           sourceDepths=list(range(1, 8)))
        return dict(frame, depth=4)

    def battle_art(source, filename, placements, frame=1, *, crop=None, outline_behind_fill=False, **evidence):
        pieces, shape_ids = authored_primitives(source, placements, outline_behind_fill=outline_behind_fill)
        if crop:
            x0, y0, x1, y1 = crop
            pieces = [piece for piece in pieces if piece.bounds[0] < x1 and piece.bounds[1] < y1
                      and piece.bounds[2] > x0 and piece.bounds[3] > y0]
        if not pieces:
            return None
        return add_pieces(source, filename, pieces, shape_ids, "stage", frame, "battle", crop=crop, **evidence)

    def opening_art():
        opening = {}
        for key, name in (("up", "op_up"), ("down", "op_down")):
            source = movie(name)
            unique = {}
            track = []
            for frame, (_, placements) in enumerate(list(timeline(source.root))[:-1], 1):
                # Quest's Opening(false) hides the opposing avatar's smear.
                layers = [part for part in placements if part.get("name") != "blood_e"]
                signature = repr(layers)
                if signature not in unique:
                    unique[signature] = battle_art(source, f"opening-{key}-{frame:02}", layers, frame,
                                                    crop=(0, 0, 15200, 1120 if key == "up" else 13600))
                track.append(unique[signature])
            opening[key] = {"frames": track, "framesPerSecond": QUEST_STAGE_FRAME_RATE}
        source = movie("op_hukidashi")
        _, placements = next(timeline(source.root))
        opening["bubbles"] = {
            key: battle_art(source, f"opening-bubble-{key}", [{k: v for k, v in part.items() if k != "cxform"}],
                            sourceInstance=part["name"])
            for key, part in zip(("player", "foe"), placements, strict=True)
        }
        opening["dialogue"] = {
            "player": {"x": 50, "y": 30, "width": 290, "height": 180, "delayMs": 300},
            "foe": {"x": 435, "y": 30, "width": 290, "height": 180, "delayMs": 500},
        }
        source = movie("op_name")
        timeline_frames = list(timeline(source.root))
        opening["names"] = {}
        for key, number in (("3on3", 26), ("1on1", 55)):
            _, placements = timeline_frames[number - 1]
            lines = [part | {"spriteFrame": 6} if kind(source.symbol(part)) == "DefineSprite" else part
                     for part in placements]
            opening["names"][key] = battle_art(source, f"opening-name-{key}", lines, number, sourceLabel=key)
        return opening

    def chat_art():
        source = movie("chat_base")
        chat = source.instance("chat_base")
        _, contents = next(timeline(source.symbol(chat)))
        # Quest constructs ChatArea(false), hiding the three separate input buttons.
        (plate,) = (part for part in contents if int(part["depth"]) == 1)
        return {
            "base": battle_art(source, "chat-base", [source.offset(plate, chat)], sourceInstance="chat_base"),
            "log": {"x": 168, "y": 560, "width": 285, "height": 68, "color": "#000000", "opacity": 0.63},
            "labels": [{"text": label, "x": 450, "y": y, "width": 60, "height": 20, "color": color}
                       for label, y, color in (("All", 565, "#ff3030"), ("Chat", 588, "#000000"),
                                               ("Game", 611, "#000000"))],
        }

    def skill_art():
        source = movie("skill_base")
        base = source.instance("base")
        icon = source.instance("type")
        types = {}
        for label in ("atk", "deff", "mov"):
            frame, layers = source.frame(icon, label)
            types[label] = battle_art(source, f"skill-type-{label}", layers, frame,
                                      sourceInstance="type", sourceLabel=label)

        return {
            "base": battle_art(source, "skill-base", [base], sourceInstance="base", sourceLabel="dis"),
            "types": types,
            "player": {"x": 168, "y": 439, "step": 148}, "foe": {"x": 444, "y": 32, "step": -148},
            "labelOffset": {"x": 12, "y": 2, "width": 130, "height": 30},
        }

    def battle_button(source, filename, placement, *, layers=None):
        symbol = source.symbol(placement)
        records = {state: [part.attrib for part in symbol if kind(part) == "buttonRecord"
                           and state in part.attrib["states"].split(",")]
                   for state in ("up", "over", "down", "hitTest")}
        art = dict(layers or ())
        for state in ("up", "over", "down"):
            if state == "down" and records[state] == records["over"]:
                art[state] = art["over"]
            elif state not in art:
                art[state] = battle_art(source, f"{filename}-{state}", [placement | {"buttonState": state}],
                                        sourceInstance=placement.get("name"), sourceState=state)
        footprint, _ = authored_primitives(source, [placement | {"buttonState": "hitTest"}])
        x0 = min(part.bounds[0] for part in footprint)
        y0 = min(part.bounds[1] for part in footprint)
        x1 = max(part.bounds[2] for part in footprint)
        y1 = max(part.bounds[3] for part in footprint)
        art["hit"] = [x0 / TWIPS, y0 / TWIPS, (x1 - x0) / TWIPS, (y1 - y0) / TWIPS]
        return art

    def move_face_art(card_ids):
        faces = {}
        for card_id in card_ids:
            source = movie(MOVE_FACE_SOURCES[card_id])
            face = source.instance("face")
            pivot = [value / TWIPS for value in translation(face["matrix"])]
            frame_data = list(timeline(source.symbol(face)))
            assert len(frame_data) == 23 and frame_data[0][0] == "face_in" and frame_data[12][0] == "face_out"
            (_, (first,)) = frame_data[0]
            layer = battle_art(source, f"move-face-{card_id}", [first | {"matrix": "t0,0"}],
                               sourceInstance="face", spriteId=source.original_id(face), sourceLabel="face_in")
            positions = []
            for _, contents in frame_data:
                if not contents:
                    positions.append(None)
                    continue
                (placed,) = contents
                if placed["idref"] != first["idref"]:
                    raise ValueError(f"Unexpected replacement of a move cut-in bitmap in {source.path}")
                x, y = translation(placed["matrix"])
                positions.append({"x": x / TWIPS, "y": y / TWIPS})
            faces[card_id] = {"image": layer, "pivot": pivot, "enter": positions[:12], "exit": positions[12:],
                              "framesPerSecond": QUEST_STAGE_FRAME_RATE}
        return faces

    if move_faces or battle_stages:
        if move_faces:
            faces = manifest["battle"]["hud"]["movePresentation"]["cutIns"]
            faces.update(move_face_art(move_faces))
            faces.update({alias: faces[original] for alias, original in STAND_ALIASES.items()})
        if battle_stages:
            manifest["battle"]["stages"].update(stage_art(battle_stages))
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        return

    def move_presentation():
        avatar = movie("avatar_ch")
        _, avatar_root = next(timeline(avatar.root))
        # AvatarBase hides watch UI and the raid score in an ordinary Quest duel.
        (avatar_layer,) = [placement for placement in avatar_root if int(placement["depth"]) == 1]
        avatar_base = battle_art(avatar, "avatar-base", [avatar_layer], sourceDepth=1)

        arrow = movie("arrow_move")
        arrow_child = arrow.instance("arrow_right")
        arrows = {
            side: battle_art(arrow, f"move-result-{side}", [arrow_child | {"matrix": matrix}],
                             crop=(0, 0, 800, 1060), sourceInstance="arrow_right", sourceLabel="normal")
            for side, matrix in (("right", "t400,500"), ("left", "s-1.0,1.0 t400,500"))
        }
        faces = move_face_art(MOVE_FACE_SOURCES)
        faces.update({alias: faces[original] for alias, original in STAND_ALIASES.items()})
        return {
            "avatarBase": dict(avatar_base, depth=11), "avatarOrigin": [590, 473],
            "cutIns": faces,
            "arrows": arrows,
            "arrowLayout": {"playerX": 162, "foeX": 598, "y": 260, "step": 20,
                            "staggerMs": 100, "showMs": 200, "holdMs": 800, "hideMs": 200,
                            "cancelTargetX": 380},
            "distance": {"playerX": [288, 184, 80, 184], "foeX": [472, 576, 680, 576], "y": 416,
                         "durationMs": 300, "easing": "quadratic-in"},
        }

    def table_animation(source, key, placement, frame):
        frames = [contents for _, contents in timeline(source.symbol(placement))]
        # The root label stops; its child plays continuously, holding each drawing for two ticks.
        if len(frames) != 50 or frames[::2] != frames[1::2]:
            raise ValueError(f"Unexpected combat table animation in {source.path}: {key}")
        columns, width, height = 5, 760, 80
        x, y = 0, 256
        crop = tuple(n * TWIPS for n in (x, y, x + width, y + height))
        atlas = Image.new("RGBA", (columns * width, columns * height))
        shape_ids, bitmap_ids, sprite_frames = set(), set(), []
        for i in range(len(frames) // 2):
            child_frame = 2 * i + 1
            pieces, shapes = authored_primitives(source, [placement | {"spriteFrame": child_frame}])
            image, _, _ = rasterize(pieces, crop)
            atlas.paste(image, (i % columns * width, i // columns * height))
            shape_ids.update(shapes)
            bitmap_ids.update(piece.bitmap_id for piece in pieces if piece.bitmap_id is not None)
            sprite_frames.append(child_frame)
        sheet = publish(source, f"quest-battle-table-{key}-atlas.png", png_bytes(atlas),
                        {"x": x, "y": y, "width": atlas.width, "height": atlas.height}, "stage-atlas", frame,
                        shapeIds=sorted(shape_ids), bitmapIds=sorted(bitmap_ids), sourceLabel=key,
                        sourceDepth=1, spriteId=source.original_id(placement), sourceSpriteFrames=sprite_frames)
        return {"file": sheet["file"], "x": x, "y": y, "width": width, "height": height, "columns": columns,
                "frameCount": len(sprite_frames), "framesPerSecond": QUEST_STAGE_FRAME_RATE / 2,
                "loop": True, "layerIndex": 0}

    def battle_hud():
        phase = movie("phase")
        phase_frames = list(timeline(phase.root))
        phase_animation = {}
        # Each label plays through its authored MainTimeline stop() frame.
        phase_sections = (("blk", 1, 1), ("drw", 2, 13), ("mov", 14, 25),
                          ("atk_a", 26, 37), ("atk_b", 38, 49), ("atk_c", 50, 61),
                          ("def_a", 62, 73), ("def_b", 74, 85), ("def_c", 86, 96))
        for key, start, end in phase_sections:
            if phase_frames[start - 1][0] != key:
                raise ValueError(f"Unexpected Quest phase label: {key}")
            refs = [battle_art(phase, f"phase-{key}-{frame:02}", phase_frames[frame - 1][1], frame,
                               crop=(2640, 1160, 12560, 1480), sourceLabel=key) for frame in range(start, end + 1)]
            phase_animation[key] = {"frames": refs, "framesPerSecond": QUEST_STAGE_FRAME_RATE}

        space = movie("space")
        tables = {}
        combat_tables = ("atk", "atk_l", "atk_all", "def", "wait_atk", "wait_def")
        for frame, (key, placements) in enumerate(timeline(space.root), 1):
            if key not in ("blank", "drw_act", "drw_evt", "mov", "mov3on3", *combat_tables):
                continue
            layers = []
            for placement in placements:
                depth = int(placement["depth"])
                image = battle_art(space, f"table-{key}-{depth:02}", [placement], frame,
                                   sourceLabel=key, sourceDepth=depth)
                if image is not None:
                    if placement.get("blendmode") == "13":
                        image["blend"] = "overlay"
                    elif "blendmode" in placement:
                        raise ValueError("Unsupported Quest table blend mode")
                    layers.append(image)
            tables[key] = {"layers": layers}
            if key in combat_tables:
                if placements[0]["depth"] != "1" or layers[0].get("blend"):
                    raise ValueError(f"Unexpected base depth in Quest combat table: {key}")
                tables[key]["animation"] = table_animation(space, key, placements[0], frame)

        range_movie = movie("range_ch")
        middle = range_movie.instance("middle") | {"spriteFrame": 17}
        range_art = battle_art(range_movie, "range-middle", [middle], 17, sourceInstance="middle",
                               spriteId=range_movie.original_id(middle))
        ranges = {"middle": range_art}
        for name, frame in (("short", 21), ("long", 17), ("hiding", 17)):
            placement = range_movie.instance(name) | {"spriteFrame": frame}
            ranges[name] = battle_art(range_movie, f"range-{name}", [placement], frame,
                                      sourceInstance=name, spriteId=range_movie.original_id(placement))

        timer = movie("time_base")
        timer_shell = timer.instance("time_base")
        time_base = battle_art(timer, "time-base", [timer_shell], sourceInstance="time_base")
        time_warning = [battle_art(timer, f"time-warning-{frame:02}", [timer_shell | {"spriteFrame": frame}],
                                   frame, sourceInstance="time_base", sourceLabel="warning") for frame in range(2, 30)]
        life = movie("life_base")
        _, contents = next(timeline(life.root))
        health_base = battle_art(life, "health-base", contents)
        base = movie("base")
        turn = base.instance("turn")
        # The original black stroke surrounds the colored glyph instead of covering it.
        turns = {
            str(number): battle_art(base, f"turn-{number:02}", [turn | {"spriteFrame": number}], number,
                                    outline_behind_fill=True, sourceInstance="turn", spriteId=base.original_id(turn))
            for number in range(1, QUEST_TURN_LIMIT + 1)
        }

        hand = movie("card_base")
        _, contents = list(timeline(hand.root))[1]
        hand_base = battle_art(hand, "hand-base", contents, 2, sourceLabel="dis")
        empty = movie("cardempty")
        _, contents = next(timeline(empty.root))
        hand_slot = battle_art(empty, "hand-empty-slot", contents, sourceLabel="normal")

        done_movie = movie("ok")
        _, contents = next(timeline(done_movie.root))
        plate, done_button = contents
        done = {
            "plate": battle_art(done_movie, "done-plate", [plate]),
            **{state: battle_art(done_movie, f"done-{state}", [done_button | {"buttonState": state}],
                                  sourceInstance="button_ok", sourceState=state) for state in ("up", "over")},
        }
        done = battle_button(done_movie, "done", done_button, layers=done)
        buttons = {}
        for direction, key, x1, x3 in (("forward", "f", 412, 440), ("back", "b", 300, 272),
                                       ("stay", "s", 356, 328), ("change", "c", -1000, 384)):
            source = movie(f"move_{key}_ch")
            (_, (enabled,)), (_, (disabled,)) = list(timeline(source.root))[:2]
            buttons[direction] = {
                **{state: battle_art(source, f"button-{direction}-{state}", [enabled | {"buttonState": state}],
                                      sourceState=state) for state in ("up", "over")},
                "disabled": battle_art(source, f"button-{direction}-disabled", [disabled], 2, sourceState="disabled"),
                "x1v1": x1, "x3v3": x3, "y": 258,
            }
            buttons[direction] = battle_button(source, f"button-{direction}", enabled, layers=buttons[direction])
        points = movie("num_btl_p")
        digits = [battle_art(points, f"combat-point-{number}", placements, number + 1)
                  for number, (_, placements) in enumerate(list(timeline(points.root))[:10])]
        return {
            "phase": {key: assets["frames"][-1] for key, assets in phase_animation.items()},
            "phaseAnimation": phase_animation,
            "phaseSound": "/public/sound/se/ulse12.mp3",
            "turn": turns,
            "table": tables,
            "range": ranges,
            "time": {
                "base": time_base, "durationMs": 60000,
                "gauges": [{"x": x, "y": 338, "width": 353, "height": 2, "direction": direction}
                           for x, direction in ((355, -1), (405, 1))],
                "colors": ["#64ff32", "#ffcd32", "#ff0000"], "colorStops": [0, 0.6, 0.9], "warningAt": 0.33,
                "warning": {"frames": time_warning, "framesPerSecond": QUEST_STAGE_FRAME_RATE, "loop": True},
            },
            "health": {
                "base": health_base,
                "gauges": [{"x": x, "y": 436, "width": 354, "height": 3, "direction": direction}
                           for x, direction in ((0, 1), (760, -1))],
                "labels": {"player": {"x": 10, "y": 397, "width": 150, "height": 40, "align": "left"},
                           "foe": {"x": 600, "y": 397, "width": 150, "height": 40, "align": "right"}},
                "color": "#ff0000",
            },
            "hand": {"base": hand_base, "slot": hand_slot},
            "done": done,
            "moveButtons": buttons,
            "movePresentation": move_presentation(),
            "combat": {"points": {"digits": digits, "playerX": 219, "foeX": 543, "y": 263, "digitWidth": 40}},
            "chat": chat_art(),
            "skills": skill_art(),
            "bonus": {"initial": 0, "x": 10, "y": 150, "width": 170, "height": 100,
                      "color": "#e0e0e0", "fontSize": 18, "letterSpacing": 2},
        }
    def hit_rect(source, placement):
        x0, y0, x1, y1 = bounds(source.symbol(placement))
        dx, dy = translation(placement["matrix"])
        return [(x0 + dx) / TWIPS, (y0 + dy) / TWIPS, (x1 - x0) / TWIPS, (y1 - y0) / TWIPS]

    def button(source, instance, filename):
        source_button = source.instance(instance)
        (hit,) = source.state(source_button, "hitTest")
        states = {
            state: add(source, f"{filename}-{state}", source.state(source_button, state), "stage",
                       sourceInstance=instance, buttonId=source.original_id(source_button), sourceState=state)
            for state in ("up", "over")
        }
        return dict(**states, hit=hit_rect(source, hit))

    def terrain_art(source, filename):
        disabled = source.instance("dis")
        _, (disabled_hit,) = source.frame(disabled, 1)
        enabled = source.instance("en")
        up, pulse = source.state(enabled, "up")
        over = source.state(enabled, "over")
        (hit,) = source.state(enabled, "hitTest")
        alpha = []
        for _, (part,) in timeline(source.symbol(pulse)):
            transform = re.fullmatch(r"256r\+0 256g\+0 256b\+0 (\d+)a\+0", part["cxform"])
            if not transform:
                raise ValueError(f"Unexpected terrain color transform in {source.path}")
            alpha.append(int(transform[1]) / 256)
        if len(alpha) != 31:
            raise ValueError(f"Unexpected terrain pulse duration in {source.path}")
        return {
            "dis": add(source, f"{filename}-dis", [disabled], "terrain", sourceInstance="dis"),
            "disabledHit": hit_rect(source, disabled_hit),
            "up": add(source, f"{filename}-up", [up], "terrain", sourceInstance="en", sourceState="up"),
            "over": add(source, f"{filename}-over", over, "terrain", sourceInstance="en", sourceState="over"),
            "hit": hit_rect(source, hit),
            "pulse": {
                "layer": add(source, f"{filename}-pulse", [pulse], "terrain", sourceInstance="en", sourceState="up",
                             spriteId=source.original_id(pulse)),
                "alpha": alpha,
                "framesPerSecond": QUEST_STAGE_FRAME_RATE,
            },
        }

    def pawn_art(character_id):
        source = movie(f"unit_chara{character_id:02}")
        frames = list(timeline(source.root))
        if len(frames) != 1:
            raise ValueError(f"Expected one frame in starter pawn {source.path}")
        return {"frames": [add(source, f"pawn-{character_id:02}", frames[0][1], "pawn")]}

    def frames(source, instance, selectors, filename, coordinate_space):
        placed = source.instance(instance)
        selected = {}
        for selector in selectors:
            index, objects = source.frame(placed, selector)
            selected[str(selector)] = add(
                source, f"{filename}-{selector}", objects, coordinate_space, index,
                sourceInstance=instance, spriteId=source.original_id(placed),
                **({"nestedAnimationFrame": 1} if any(kind(source.symbol(item)) == "DefineSprite" for item in objects) else {}),
                **({"sourceLabel": selector} if isinstance(selector, str) else {}),
            )
        return selected

    panel = movie("map_data")
    _, data = next(timeline(panel.root))
    detail = {
        "back": button(movie("btn_mapback_ch"), None, "back"),
        "commands": {
            key: button(movie("btn_quest"), instance, key)
            for key, instance in (
                ("start", "btn_map_start"), ("drop", "btn_map_drop"),
                ("present", "btn_map_pres"), ("quit", "btn_map_give"),
            )
        },
        "data": [
            add(panel, f"data-{key}", [placement], "stage", sourceDepth=int(placement["depth"]))
            for key, placement in zip(("plate", "label"), data, strict=True)
        ],
        "bases": frames(movie("map_base"), "map_base", range(1, 6), "base", "cell"),
        "terrain": {},
        "pawns": {str(character_id): pawn_art(character_id) for character_id in STARTER_CHARACTERS},
        "movement": {
            "x": [128, 224, 320], "startY": 76, "yByColumn": [140, 220, 300, 380, 460],
            "durationMs": 900 / 1.7, "easing": "sine-in-out",
        },
        "paths": {
            side: frames(movie(f"map_pass_{side}"), f"map_pass_{side}", range(1, count + 1),
                         f"path-{side}", "path")
            for side, count in (("left", 4), ("center", 11), ("right", 4))
        },
        "events": frames(movie("land_event"), "event", dict.fromkeys(EVENTS), "event", "terrain"),
        "subEvents": frames(movie("land_subevent"), "subevent", dict.fromkeys(SUB_EVENTS), "sub-event", "terrain"),
        "eventByTreasure": list(EVENTS),
        "subEventByTreasure": list(SUB_EVENTS),
    }
    terrains = {}
    for stage, stem in enumerate(TERRAIN):
        if stem not in terrains:
            terrains[stem] = terrain_art(movie(stem), stem.replace("_", "-"))
        detail["terrain"][str(stage)] = terrains[stem]

    manifest["detail"] = detail
    stages = stage_art(stage_extractors)
    if castle:
        stages = {"0": castle, **stages}
    manifest["battle"] = {
        "stages": stages,
        "common": [battle_static_frame()],
        "commonEntry": {"durationMs": 500, "easing": "sine-out"},
        "hud": battle_hud(),
        "opening": opening_art(),
        "transition": {
            "source": "app/client/src/view/scene/common/Transition.as",
            "width": 760, "height": 680, "framesPerSecond": QUEST_STAGE_FRAME_RATE,
            "mask": {"baseX": 100, "baseY": 100, "octaves": 5, "stitch": False, "fractal": True,
                     "channel": 1, "grayScale": True, "seedUpperBound": 10000},
            "thresholdFactor": 0.06, "thresholdMax": 0xffffff, "lastThresholdTest": 0xdfffff, "thresholdUpdates": 34,
            "delayAfterDetermineMs": 1100,
        },
    }
    manifest["layers"].update(castle_art)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    count = sum(name.startswith(("quest-detail-", "quest-battle-")) for name in manifest["layers"])
    print(f"Extracted {count} quest detail and battle images.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("art_dir", type=Path)
    parser.add_argument("--swfdump", default="swfdump", help="Apache Flex SDK swfdump")
    parser.add_argument("--move-face", action="append", choices=MOVE_FACE_SOURCES,
                        help="refresh only this cut-in in an existing output (repeatable)")
    parser.add_argument("--battle-stage", action="append", choices=("2", "3", "7", "11"),
                        help="refresh only this battle stage in an existing output (repeatable)")
    args = parser.parse_args()
    extract(args.asset_root, args.art_dir, args.swfdump, args.move_face, args.battle_stage)
