#!/usr/bin/env python3
"""Check the original quest text against a compiled compatibility SWF.

Usage: python3 tools/legacy-build/check_quest_text.py PATH/Unlight-local-runtime.swf
"""

import argparse
import csv
from pathlib import Path
import struct
import zlib


CSV_ROOT = Path(__file__).resolve().parents[2] / "app/server/data/csv"
TABLES = (
    ("tcn/Quests.csv", ("name", "caption"), "minchoB"),
    ("ja/QuestMaps.csv", ("name_tcn", "caption_tcn"), "minchoB"),
    ("ja/QuestLands.csv", ("name_tcn", "caption_tcn"), "mincho"),
)
FONTS = {font.encode("ascii"): font for _, _, font in TABLES}
MAX_SWF_SIZE = 128 * 1024 * 1024
MAX_SAMPLE_ROWS = 5
MAX_SAMPLE_GLYPHS = 8


def read_swf_body(path):
    with path.open("rb") as stream:
        header = stream.read(8)
        if len(header) != 8 or header[:3] not in {b"FWS", b"CWS"} or header[3] == 0:
            raise ValueError("Expected an FWS or CWS Flash header.")
        (file_size,) = struct.unpack_from("<I", header, 4)
        if not 15 <= file_size <= MAX_SWF_SIZE:
            raise ValueError(f"Unsupported declared SWF length {file_size} bytes.")
        body_size = file_size - 8
        if header[:3] == b"FWS":
            body = stream.read(body_size + 1)
        else:
            inflater = zlib.decompressobj()
            body = bytearray()
            while chunk := stream.read(65536):
                body.extend(inflater.decompress(chunk, body_size - len(body) + 1))
                if len(body) > body_size:
                    raise ValueError("Compressed SWF exceeds its declared length.")
                if inflater.eof:
                    if inflater.unused_data or stream.read(1):
                        raise ValueError("Unexpected data after the compressed SWF body.")
                    break
            if not inflater.eof:
                raise ValueError("Truncated compressed SWF body.")
        if len(body) != body_size:
            raise ValueError("SWF body length does not match its header.")
        return memoryview(body)


def swf_tags(body):
    rect_size = (5 + 4 * (body[0] >> 3) + 7) // 8
    offset = rect_size + 4  # Skip frame rate and frame count after the RECT.
    while offset + 2 <= len(body):
        (header,) = struct.unpack_from("<H", body, offset)
        offset += 2
        code, size = divmod(header, 64)
        if size == 63:
            if offset + 4 > len(body):
                raise ValueError("Truncated SWF long tag length.")
            (size,) = struct.unpack_from("<I", body, offset)
            offset += 4
        end = offset + size
        if end > len(body):
            raise ValueError(f"SWF tag {code} extends past the end of the movie.")
        if code == 0:
            if size or end != len(body):
                raise ValueError("Invalid SWF End tag.")
            return
        yield code, body[offset:end]
        offset = end
    raise ValueError("Missing or truncated SWF End tag.")


def font_codes(tag, offset, flags, name):
    (glyph_count,) = struct.unpack_from("<H", tag, offset)
    start = offset + 2
    offset_width = 4 if flags & 0x08 else 2
    offset_format = "<I" if offset_width == 4 else "<H"
    offsets_end = start + glyph_count * offset_width
    table_end = offsets_end + offset_width
    if table_end > len(tag):
        raise ValueError(f"Truncated {name} font offset table.")

    (code_offset,) = struct.unpack_from(offset_format, tag, offsets_end)
    code_start = start + code_offset
    code_width = 2 if flags & 0x04 else 1
    code_end = code_start + glyph_count * code_width
    if code_start < table_end or code_end > len(tag):
        raise ValueError(f"Invalid {name} font code table offsets.")
    previous = table_end - start
    for (glyph_offset,) in struct.iter_unpack(offset_format, tag[start:offsets_end]):
        if not previous <= glyph_offset < code_offset:
            raise ValueError(f"Invalid {name} glyph offset.")
        previous = glyph_offset
    code_format = "<H" if code_width == 2 else "<B"
    return {point for (point,) in struct.iter_unpack(code_format, tag[code_start:code_end])}


def embedded_coverage(path):
    coverage = {}
    for code, tag in swf_tags(read_swf_body(path)):
        if code not in {48, 75}:  # DefineFont2 and DefineFont3
            continue
        if len(tag) < 7 or 7 + tag[4] > len(tag):
            raise ValueError(f"Truncated SWF font definition (tag {code}).")
        name_end = 5 + tag[4]
        name = FONTS.get(bytes(tag[5:name_end]).rstrip(b"\0"))
        if name is not None:
            if name in coverage:
                raise ValueError(f"More than one embedded font uses the name {name}.")
            coverage[name] = font_codes(tag, name_end, tag[2], name)
    for name in FONTS.values():
        if not coverage.get(name):
            raise ValueError(f"Missing embedded code table for {name}.")
    return coverage


def sample_glyphs(points):
    sample = ", ".join(f"U+{point:04X} {chr(point)!r}" for point in sorted(points)[:MAX_SAMPLE_GLYPHS])
    remaining = len(points) - MAX_SAMPLE_GLYPHS
    if remaining > 0:
        sample += f" (+{remaining} more)"
    return sample


def check_table(relative_path, fields, font, coverage):
    count = 0
    blanks = dict.fromkeys(fields, 0)
    missing = set()
    affected_rows = 0
    samples = []
    with (CSV_ROOT / relative_path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        if not set(("id", *fields)).issubset(reader.fieldnames or ()):
            raise ValueError(f"{relative_path} is missing expected CSV columns.")
        for row in reader:
            count += 1
            problems = []
            for field in fields:
                value = row[field]
                if value is None:
                    raise ValueError(f"Missing {relative_path} value for {field} at line {reader.line_num}.")
                if not value.strip():
                    blanks[field] += 1
                    continue
                absent = {ord(char) for char in value if not char.isspace()} - coverage
                if absent:
                    missing.update(absent)
                    problems.append((field, absent))
            if problems:
                affected_rows += 1
                if len(samples) < MAX_SAMPLE_ROWS:
                    row_id = f"id={row['id']}" if row["id"] else f"line {reader.line_num}"
                    samples.append((row_id, problems))

    blank_fields = ", ".join(f"{field}={blanks[field]}" for field in fields)
    print(f"{relative_path} ({font}): {count} rows; blank fields {blank_fields}; "
          f"{len(missing)} missing code points in {affected_rows} rows.")
    for row_id, problems in samples:
        print(f"  {row_id}: " + "; ".join(f"{field}: {sample_glyphs(points)}" for field, points in problems))
    return count, sum(blanks.values()), missing


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("swf", type=Path, help="Compiled FWS or CWS Flash client.")
    args = parser.parse_args()
    try:
        coverage = embedded_coverage(args.swf)
        for name, points in coverage.items():
            print(f"{name}: {len(points)} embedded code points.")
        total_rows = total_blanks = 0
        missing_points = set()
        for relative_path, fields, font in TABLES:
            rows, blanks, missing = check_table(relative_path, fields, font, coverage[font])
            total_rows += rows
            total_blanks += blanks
            missing_points.update(missing)
    except (OSError, ValueError, csv.Error, zlib.error) as error:
        parser.exit(2, f"Unable to check quest text in {args.swf}: {error}\n")
    print(f"Total: {total_rows} rows, {total_blanks} blank fields, "
          f"{len(missing_points)} missing code points.")
    return 1 if missing_points else 0


if __name__ == "__main__":
    raise SystemExit(main())
