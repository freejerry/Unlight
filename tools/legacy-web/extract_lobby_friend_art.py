#!/usr/bin/env python3
"""Extract the pinned Traditional Chinese Friend List window and button states.

python3 -B tools/legacy-web/extract_lobby_friend_art.py ASSETS OUTPUT \
    --swfdump /path/to/Flex/bin/swfdump --tcn-device-font /path/to/cwming.ttf \
    --mincho-font /path/to/wt004.ttf
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path

from extract_character_card_art import FONT_REVISION, FONT_SHA, REVISION
from extract_lobby_record_art import DEVICE_FONT
from extract_quest_bonus_item_art import button_records, hit_rect
from extract_quest_detail_art import Movie, TWIPS, authored_primitives, png_bytes, rasterize, timeline, translation


SOURCE_DIR = Path("data/image/friend")
PINS = {
    "friendlist_ch": "c2f94f9e58b9a97eb2a9b00bd565023dcaa33e6bc139779a94ce9bdb48d6bb7e",
    "btn_f_list": "539b4fb71fade2e190a20a1120ed02970d7d922aef85427e0ac6dcbccc765a6a",
    "friendlist_state": "8e85d69f780a8e23ccd405ded00857a49264069c8ee876610b35114ea4718d56",
    "btn_delete": "35b47ad7c76560a1328b80ff9597d2e456c126ceb73d908bd4d8fdf4e079abb8",
    "btn_invite": "c66d17febcbbcb905209010be1aa2b1324e423e25e54e8efd4c5e4a1257ee65c",
}
SOURCE_LOGIN = Path(__file__).resolve().parents[2] / "source-login"
SHARED_HOVER = "/source-login/lobby-art/hover/"
NORMAL_ENTRY_DIGESTS = {
    "up": "f8d90475b710a02425b6f629ac5d6950052efd36ca14e2a2db09a922aad41da3",
    "over": "7e9f71f9dfb5a3133f5373482ebdb52d1d14542b0d8676ba294058baa00cc627",
}
BRADLEY = ("res/data/nbr.ttf", "fd3f93f469227f2c796f60cf9984baa351f5ed13e1e7d86dedae0241efa83520")
WORDING = {
    "friendPrefix": "Friend ", "blockedPrefix": "Blocked ", "levelPrefix": "Level: ",
    "waiting": "認證中", "approve": "認證", "request": "申請", "delete": "刪除",
    "unblock": "解除", "confirm": "確認", "selection": "選擇", "mail": "送信",
}
SEARCH_WORDING = {"label": "搜索", "pending": "檢索中", "minimumPrefix": "最少需要", "minimumSuffix": "個字"}
INVITE_LABELS = {"sns": "邀請", "code": "邀請Code"}


def extract(assets, output, swfdump, device_font, mincho_font):
    output.mkdir(parents=True, exist_ok=True)
    provenance = {}
    sources = {name: Movie(assets, name, swfdump, pin=(SOURCE_DIR / f"{name}.swf", digest))
               for name, digest in PINS.items()}

    def save(file, content, source, **evidence):
        (output / file).write_bytes(content)
        provenance[file] = {
            "source": source.path.as_posix(), "sourceSha256": source.digest,
            "sha256": sha256(content).hexdigest(), **evidence,
        }

    def draw(source, file, placement, **evidence):
        pieces, shapes = authored_primitives(source, [placement], preserve_stroke_alpha=True)
        image, x, y = rasterize(pieces)
        save(file, png_bytes(image), source, sourceFrame=1, shapeIds=shapes,
             bitmapIds=[part.bitmap_id for part in pieces if part.bitmap_id is not None], **evidence)
        return {"file": file, "x": x, "y": y, "width": image.width, "height": image.height}

    def plate(source, file, shape_id):
        _, placements = next(timeline(source.root))
        node = placements[0]
        if node["depth"] != "1" or source.original_id(node) != shape_id:
            raise ValueError(f"Unexpected plate shape in {source.path}")
        return draw(source, file, node, sourceDepth=1)

    def button(source, file, instance, offset=(0, 0)):
        node = source.instance(instance)
        states = button_records(source, node)
        x, y = translation(node["matrix"])
        node = node | {"matrix": f"t{x + offset[0] * TWIPS},{y + offset[1] * TWIPS}"}
        if states["over"] != states["down"]:
            raise ValueError(f"Unexpected distinct down state for {source.path}:{instance}")
        hit = hit_rect(source, node, states["hitTest"])
        evidence = {
            "sourceInstance": instance, "sourceButton": source.original_id(node),
            "hitShapeIds": [source.original_id(item) for item in states["hitTest"]],
        }
        up = draw(source, f"{file}-up.png", node | {"buttonState": "up"}, sourceStates=["up"], **evidence)
        over = draw(source, f"{file}-over.png", node | {"buttonState": "over"},
                    sourceStates=["over", "down"], **evidence)
        return {"up": up, "over": over, "down": over, "hit": hit}

    def shifted(button, dx, dy):
        def move(layer):
            return layer | {"x": round(layer["x"] + dx, 2), "y": round(layer["y"] + dy, 2)}

        x, y, width, height = button["hit"]
        return {key: move(button[key]) for key in ("up", "over", "down")} | {
            "hit": [round(x + dx, 2), round(y + dy, 2), width, height],
        }

    def existing_entry():
        source = sources["btn_f_list"]
        node = source.instance("btn_f_list")
        states = button_records(source, node)
        hit = hit_rect(source, node, states["hitTest"])
        original = json.loads((SOURCE_LOGIN / "lobby-art/hover/index.json").read_text(encoding="utf8"))
        previous = original["buttons"]["friend"]
        geometry = {key: value for key, value in zip(("x", "y", "width", "height"), hit, strict=True)}
        if previous["sourceSha256"] != source.digest or previous["sourceSymbol"] != node["name"] or any(
            previous[key] != value for key, value in geometry.items()
        ):
            raise ValueError("Existing normal Friend entry uses different art")

        reused = {}
        for state in ("up", "over"):
            file = previous[state]
            path = SOURCE_LOGIN / "lobby-art/hover" / file
            digest = sha256(path.read_bytes()).hexdigest()
            if digest != NORMAL_ENTRY_DIGESTS[state]:
                raise ValueError(f"Changed pinned shared Friend entry art for {state}")
            url = SHARED_HOVER + file
            reused[state] = {"file": file, "url": url, **geometry}
            provenance[url] = {
                "source": source.path.as_posix(), "sourceSha256": source.digest, "sourceFrame": 1,
                "sha256": digest, "sourceInstance": node["name"],
                "sourceButton": source.original_id(node), "sourceStates": [state] if state == "up" else ["over", "down"],
            }
        return reused | {"down": reused["over"], "hit": hit}

    panel = sources["friendlist_ch"]
    online = sources["friendlist_state"]
    action = button(sources["btn_invite"], "card-action", "btn_act_a", (8, 122))
    search = shifted(action, 272, 259)
    index = {
        "assetRevision": REVISION,
        "origin": [125, 150],
        "motion": {"initialY": -120, "openMs": 300, "closeMs": 150, "openEasing": "quad-out", "closeEasing": "sine-out"},
        "panel": plate(panel, "panel.png", 2),
        "tabs": [button(panel, f"tab-{key}", instance) for key, instance in (
            ("friend", "tab_a"), ("waiting", "tab_c"), ("blocking", "tab_d"), ("search", "tab_f"),
        )],
        "buttons": {key: button(panel, key, instance) for key, instance in (
            ("close", "btn_close"), ("previous", "btn_back"), ("next", "btn_next"),
        )},
        "entry": {"normal": existing_entry(), "alert": button(sources["btn_f_list"], "entry-alert", "btn_f_list_m")},
        "grid": {"x": 32, "y": 70, "columns": 5, "rows": 2, "stepX": 94, "stepY": 145},
        "card": {
            "online": plate(online, "card-online.png", 2),
            "action": action,
            "remove": button(sources["btn_delete"], "card-remove", "btn_delete", (75, 0)),
            "labels": {"name": [0, 100, 87, 28], "level": [2, 15, 88, 16], "waiting": [2, 48, 88, 24]},
            "namePlate": [0, 102, 87, 15],
            "namePlateStyle": {"color": "#eeeeee", "opacity": 0.5},
            "actionText": [8, 125, 78, 20],
        },
        "search": {
            "input": [170, 381, 100, 21], "maxLength": 12,
            "button": search, "buttonText": [280, 384, 78, 20],
            **SEARCH_WORDING,
        },
        # Both invitation controls use FriendButton. The SNS instance keeps its default origin;
        # the invite-code instance shares the search button's origin and is hidden on Search.
        "invites": {
            "sns": {"button": shifted(action, -8, -122), "label": INVITE_LABELS["sns"], "buttonText": [0, 3, 78, 20]},
            "code": {"button": search, "label": INVITE_LABELS["code"], "buttonText": [280, 384, 78, 20]},
        },
        "page": [253, 360, 50, 20],
        "count": [432, 50, 90, 32],
        "wording": WORDING,
        "layoutSources": [
            "app/client/src/view/FriendListView.as",
            "app/client/src/view/image/common/FriendListImage.as",
            "app/client/src/view/scene/common/FriendListContainer.as",
            "app/client/src/view/image/common/FriendButton.as",
            "app/client/data/css/UL.css.cn",
        ],
    }
    glyphs = "".join(map(chr, range(32, 127))) + "".join(
        (*WORDING.values(), *SEARCH_WORDING.values(), *INVITE_LABELS.values())
    )
    index["fonts"] = {
        "mincho": font_subset(device_font, output, "friend-mincho.woff", DEVICE_FONT, glyphs, provenance),
        "minchoBold": font_subset(mincho_font, output, "friend-mincho-bold.woff",
                                  ("res/data/wt004.ttf", FONT_SHA), WORDING["waiting"], provenance),
        "bradley": {"file": "bradley-gratis.ttf", "url": "/source-login/fonts/bradley-gratis.ttf"},
    }
    bradley_path = SOURCE_LOGIN / "fonts/bradley-gratis.ttf"
    if sha256(bradley_path.read_bytes()).hexdigest() != BRADLEY[1]:
        raise ValueError("Expected the exact historical nbr.ttf for Friend List levels")
    provenance[index["fonts"]["bradley"]["url"]] = {
        "source": BRADLEY[0], "sourceSha256": BRADLEY[1], "sourceRevision": FONT_REVISION, "sha256": BRADLEY[1],
    }
    index["provenance"] = provenance
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def font_subset(source, output, file, pin, text, provenance):
    from fontTools import subset

    if sha256(source.read_bytes()).hexdigest() != pin[1]:
        raise ValueError(f"Expected the historical {pin[0]}")
    glyphs = "".join(sorted(set(text)))
    options = subset.Options()
    options.name_IDs += [0, 13, 14]
    font = subset.load_font(source, options)
    missing = set(map(ord, glyphs)) - font.getBestCmap().keys()
    if missing:
        raise ValueError(f"Missing Friend List source glyphs {missing} in {pin[0]}")
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=glyphs)
    subsetter.subset(font)
    font.flavor = "woff"
    font.recalcTimestamp = False
    font.save(output / file)
    provenance[file] = {"source": pin[0], "sourceSha256": pin[1], "sourceRevision": FONT_REVISION,
                        "sha256": sha256((output / file).read_bytes()).hexdigest(), "glyphs": glyphs}
    return {"file": file}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", required=True)
    parser.add_argument("--tcn-device-font", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    args = parser.parse_args()
    extract(args.assets, args.output, args.swfdump, args.tcn_device_font, args.mincho_font)


if __name__ == "__main__":
    main()
