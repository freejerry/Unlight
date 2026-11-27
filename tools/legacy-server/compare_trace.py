#!/usr/bin/env python3
"""Compare a candidate duel trace to the recorded Ruby fixture."""

import argparse
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path


BASELINE = Path(__file__).resolve().parent / "fixtures" / "trace-2026.json"
ROOT_ORDER = {"seed": 0, "trace": 1, "outcome": 2}
MISSING = object()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON property {key!r}")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f"invalid JSON number {value!r}")


def decode_trace(content):
    try:
        return json.loads(
            content,
            parse_float=Decimal,
            parse_constant=reject_constant,
            object_pairs_hook=unique_object,
        )
    except InvalidOperation as error:
        raise ValueError("JSON decimal exponent is out of range") from error


def load_trace(path):
    try:
        return decode_trace(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as error:
        raise ValueError(f"Could not read trace {path}: {error}") from error


def first_difference(expected, actual, path="$"):
    if type(expected) is not type(actual):
        return path, expected, actual
    if isinstance(expected, dict):
        keys = expected.keys() | actual.keys()
        if path == "$":
            keys = sorted(keys, key=lambda key: (ROOT_ORDER.get(key, len(ROOT_ORDER)), key))
        else:
            keys = sorted(keys)
        for key in keys:
            child_path = f"{path}.{key}" if key.isidentifier() else f"{path}[{json.dumps(key)}]"
            difference = first_difference(
                expected.get(key, MISSING), actual.get(key, MISSING), child_path
            )
            if difference:
                return difference
    elif isinstance(expected, list):
        for index, (left, right) in enumerate(zip(expected, actual)):
            difference = first_difference(left, right, f"{path}[{index}]")
            if difference:
                return difference
        index = min(len(expected), len(actual))
        if len(expected) != len(actual):
            left = expected[index] if index < len(expected) else MISSING
            right = actual[index] if index < len(actual) else MISSING
            return f"{path}[{index}]", left, right
    elif expected != actual:
        return path, expected, actual
    return None


def describe_value(value):
    if value is MISSING:
        return "<missing>"
    if isinstance(value, Decimal):
        return f"{value} (decimal)"
    text = json.dumps(value, ensure_ascii=False, default=str)
    if len(text) > 160:
        return text[:157] + "..."
    return text


def describe_difference(expected, actual):
    difference = first_difference(expected, actual)
    if difference is None:
        return None
    path, left, right = difference
    return f"{path}: expected {describe_value(left)}, got {describe_value(right)}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path, help="Candidate trace JSON.")
    parser.add_argument("--baseline", type=Path, default=BASELINE, help="Baseline trace JSON.")
    args = parser.parse_args()
    try:
        expected = load_trace(args.baseline)
        actual = load_trace(args.candidate)
        difference = describe_difference(expected, actual)
    except (ValueError, RecursionError) as error:
        parser.exit(2, f"{error}\n")
    if difference:
        parser.exit(1, f"Duel trace diverged at {difference}.\n")
    print(f"Duel trace matches {args.baseline}.")


if __name__ == "__main__":
    main()
