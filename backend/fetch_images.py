#!/usr/bin/env python3
"""Bake hero images for seed events into backend/event_images.json.

Runs the same extractor as /api/preview, offline, so swipe cards render
images instantly instead of waiting on a cold backend + slow scrape per card.
Idempotent: only event IDs missing from the JSON are fetched.
Blocked hosts (WeBook/Platinumlist/10times bot protection) resolve to null.

Usage: python3 backend/fetch_images.py [--refresh]   # --refresh re-tries nulls
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
try:
    from backend.image_extract import fetch_og_image
except ImportError:
    sys.path.insert(0, str(HERE))
    from image_extract import fetch_og_image

SEED = HERE.parent / "data" / "events.json"
OUT = HERE / "event_images.json"

REFRESH_NULLS = "--refresh" in sys.argv

events = json.loads(SEED.read_text())["events"]
baked = json.loads(OUT.read_text()) if OUT.exists() else {}
print(f"{len(events)} seed events, {len(baked)} already baked")

todo = [e for e in events
        if e.get("url") and (e["id"] not in baked
                             or (REFRESH_NULLS and not baked[e["id"]]))]
print(f"{len(todo)} to fetch")
hits = 0
try:
    for i, e in enumerate(todo):
        img = fetch_og_image(e["url"])
        baked[e["id"]] = img
        if img:
            hits += 1
        if (i + 1) % 10 == 0:
            OUT.write_text(json.dumps(baked))
            print(f"  {i + 1}/{len(todo)}  hits={hits}")
        time.sleep(1.0)  # be polite to source sites
finally:
    OUT.write_text(json.dumps(baked))
    print(f"done: {len(baked)} baked, {hits} new hits this run -> {OUT}")
