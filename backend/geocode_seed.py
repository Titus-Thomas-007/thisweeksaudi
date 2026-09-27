"""One-off: geocode every unique venue|city in the seed data via Nominatim.

Run from a machine where Nominatim is reachable (Render's egress IP is
rate-limited, so this runs locally and the results are baked into the
image as backend/venue_coords.json). Respects Nominatim's 1 req/sec policy.
Idempotent: skips keys already in venue_coords.json.

Usage: python3 backend/geocode_seed.py
"""
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "data" / "events.json"
OUT = ROOT / "venue_coords.json"
UA = "ThisWeekSaudi/1.0 (seed geocoding; contact via site)"


def key(venue, city):
    return hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()


def variants(venue, city):
    yield f"{venue}, {city}, Saudi Arabia"
    v = venue
    if v.lower().startswith("the "):
        v = v[4:]
        yield f"{v}, {city}, Saudi Arabia"
    for sep in (" - ", " | ", " in ", " by "):
        if sep in v:
            yield f"{v.split(sep)[0].strip()}, {city}, Saudi Arabia"
            break
    yield f"{v}, Saudi Arabia"


def geocode(venue, city):
    for q in variants(venue, city):
        params = urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "sa"})
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{params}",
            headers={"User-Agent": UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                items = json.loads(r.read().decode("utf-8"))
        except Exception:
            items = []
        time.sleep(1.1)  # Nominatim usage policy
        if items:
            return [float(items[0]["lat"]), float(items[0]["lon"]),
                    items[0].get("name")]
    return None


def main():
    events = json.loads(DATA.read_text())["events"]
    pairs = sorted({(e.get("venue") or "", e.get("city") or "") for e in events})
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    print(f"{len(pairs)} unique venue|city, {len(existing)} already geocoded")
    done, failed = 0, []
    try:
        for venue, city in pairs:
            k = key(venue, city)
            if k in existing:
                continue
            try:
                res = geocode(venue, city)
            except Exception as e:
                print("  ERROR", venue, city, type(e).__name__)
                res = None
            if res:
                existing[k] = res[:2]
                done += 1
                print(f"  ok   {venue} | {city} -> {res[:2]} ({res[2]})")
            else:
                failed.append((venue, city))
                print(f"  miss {venue} | {city}")
    finally:
        OUT.write_text(json.dumps(existing, indent=1))
    print(f"done: {done} new, {len(failed)} misses, {len(existing)} total")
    for v, c in failed:
        print("  MISS:", repr(v), "|", c)


if __name__ == "__main__":
    main()
