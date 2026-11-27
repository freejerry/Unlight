"""Sample Chromium compositor output via CDP in Playwright's synchronous API."""

from math import ceil, isfinite
from statistics import median
from time import perf_counter

from playwright.sync_api import Error


def measure_rendered_cadence(page, duration_ms=1000, *, max_width=320, max_height=240):
    """Observe visible viewport changes at the screencast's delivery cadence.

    Chromium downscales to fit the requested bounds and emits lossless PNGs.
    Consecutive identical PNG data only count once, including the first sample
    as the baseline. The observer holds only the most recent image in memory.

    Each sample records arrival time relative to capture start and the CDP
    swap time relative to the first available swap time. Interval statistics
    are calculated between consecutive distinct samples, using swap times
    when available and strictly increasing, or arrival times otherwise.

    The screencast can skip or coalesce frames, including during capture and
    acknowledgement. Downscaling can hide small changes and the viewport can
    include unrelated activity. The results describe this sample stream, not
    display refreshes, authored frame rate, or every rendering update.
    """
    if not 0 < duration_ms <= 10000:
        raise ValueError("The observation duration must be greater than 0 and at most 10000 ms")
    if any(type(limit) is not int or limit <= 0 for limit in (max_width, max_height)):
        raise ValueError("Screencast dimensions must be positive integers")

    session = page.context.new_cdp_session(page)
    samples = []
    previous_image = None
    swap_origin = None
    ack_failures = 0
    accepting = True
    started = False
    start = perf_counter()

    def receive(event):
        nonlocal previous_image, swap_origin, ack_failures
        try:
            if accepting:
                arrival_ms = (perf_counter() - start) * 1000
                image = event["data"]
                stamp = event["metadata"].get("timestamp")
                swap_ms = None
                if isinstance(stamp, (int, float)) and isfinite(stamp):
                    if swap_origin is None:
                        swap_origin = stamp
                    swap_ms = (stamp - swap_origin) * 1000
                samples.append({
                    "arrival_ms": arrival_ms,
                    "swap_ms": swap_ms,
                    "changed": previous_image is not None and image != previous_image,
                })
                previous_image = image
        finally:
            try:
                session.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})
            except Error:
                ack_failures += 1

    session.on("Page.screencastFrame", receive)
    try:
        session.send("Page.startScreencast", {
            "format": "png",
            "maxWidth": max_width,
            "maxHeight": max_height,
            "everyNthFrame": 1,
        })
        started = True
        page.wait_for_timeout(duration_ms)
        window_ms = (perf_counter() - start) * 1000
    finally:
        accepting = False
        try:
            if started and not page.is_closed():
                session.send("Page.stopScreencast")
        except Error:
            if not page.is_closed():
                raise
        finally:
            session.remove_listener("Page.screencastFrame", receive)
            try:
                session.detach()
            except Error:
                if not page.is_closed():
                    raise

    distinct = [sample for index, sample in enumerate(samples) if index == 0 or sample["changed"]]
    swap_times = [sample["swap_ms"] for sample in distinct]
    if not distinct:
        clock, times = None, []
    elif None not in swap_times and all(before < after for before, after in zip(swap_times, swap_times[1:])):
        clock, times = "cdp-swap", swap_times
    else:
        clock, times = "playwright-arrival", [sample["arrival_ms"] for sample in distinct]
    intervals = sorted(after - before for before, after in zip(times, times[1:]))
    return {
        "samples": len(samples),
        "distinct_samples": len(distinct),
        "duplicate_samples": len(samples) - len(distinct),
        "changes": len(intervals),
        "requested_window_ms": duration_ms,
        "window_ms": window_ms,
        "capture_bounds": {"max_width": max_width, "max_height": max_height},
        "p50_ms": median(intervals) if intervals else None,
        "p95_ms": intervals[ceil(0.95 * len(intervals)) - 1] if intervals else None,
        "max_ms": intervals[-1] if intervals else None,
        "clock": clock,
        "ack_failures": ack_failures,
        "samples_log": samples,
    }
