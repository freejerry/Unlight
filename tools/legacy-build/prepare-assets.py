from pathlib import Path
import sys


assets = Path(sys.argv[1]).resolve(strict=True)
client = Path(sys.argv[2]).resolve(strict=True)

linked = aliases = models = 0
for relative_root in ("data/image", "public/image", "public/sound"):
    source_root = assets / relative_root
    if not source_root.is_dir():
        raise SystemExit(f"Source assets are unavailable at {source_root}")

    for source in sorted(source_root.rglob("*")):
        if not source.is_file() or source.name.startswith("."):
            continue
        destination = client / source.relative_to(assets)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() and not destination.is_symlink():
            destination.symlink_to(source)
            linked += 1

        if source.name.endswith("_ch.swf") and relative_root.endswith("/image"):
            alias = destination.with_name(destination.name.removesuffix("_ch.swf") + ".swf")
            alias.unlink(missing_ok=True)
            alias.symlink_to(source)
            aliases += 1

        if source.suffix == ".dae" and relative_root == "public/image":
            original = source.read_bytes()
            adjusted = original.replace(b"_1_-_Default", b"_Default")
            if original != adjusted:
                destination.unlink()
                destination.write_bytes(adjusted)
                models += 1

print(f"{linked} source asset links created, {aliases} TCN aliases, {models} DAE adjustments")
