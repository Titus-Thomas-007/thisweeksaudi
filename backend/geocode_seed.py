"""One-off: geocode every unique venue|city in the seed data via Nominatim.

Run from a machine where Nominatim is reachable (Render's egress IP is
rate-limited, so this runs locally and the results are baked into the
image as backend/venue_coords.json). Respects Nominatim's 1 req/sec policy.
Idempotent: skips keys already in venue_coords.json.

Usage: python3 backend/geocode_seed.py
"""
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "data" / "events.json"
OUT = ROOT / "venue_coords.json"
UA = "ThisWeekSaudi/1.0 (seed geocoding; contact via site)"

# City centers for sanity-checking Nominatim hits: a "precise" pin in the
# wrong city is worse than no pin. Reject anything >60km from its city.
CITY_COORDS = {
    "Riyadh": (24.6389, 46.7160), "Jeddah": (21.4858, 39.1925),
    "Dammam": (26.4207, 50.0888), "Khobar": (26.2172, 50.1971),
    "Mecca": (21.3891, 39.8579), "Medina": (24.5247, 39.5692),
    "Taif": (21.2703, 40.4158), "Abha": (18.2164, 42.5053),
    "Tabuk": (28.3835, 36.5662), "Buraydah": (26.3260, 43.9750),
    "Buraidah": (26.3260, 43.9750), "Al Qassim": (26.3260, 43.9750),
    "Unaizah": (26.0840, 43.9934), "Al Ahsa": (25.3643, 49.5875),
    "Al Majma'a": (25.9042, 45.3428), "Jubail": (27.0046, 49.6455),
    "Khamis Mushait": (18.3000, 42.7333), "Hail": (27.5219, 41.6907),
    "AlUla": (26.6086, 37.9235), "Yanbu": (24.0232, 38.0472),
    "Jazan": (16.8892, 42.5706), "Najran": (17.4933, 44.1277),
}


def _km(a, b):
    from math import radians, sin, cos, asin, sqrt
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 12742 * asin(sqrt(h))


def _near_city(lat, lon, city):
    base = CITY_COORDS.get((city or "").strip())
    return base is None or _km((lat, lon), base) <= 60


def key(venue, city):
    return hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()


def variants(venue, city):
    v0 = venue.strip()
    yield f"{v0}, {city}, Saudi Arabia"
    v = v0
    if v.lower().startswith("the "):
        v = v[4:]
        yield f"{v}, {city}, Saudi Arabia"
    if "," in v:
        first = v.split(",")[0].strip()
        if first and first != v:
            yield f"{first}, {city}, Saudi Arabia"
    # Strip parenthetical qualifiers, then generic venue-type suffixes,
    # to reach the core place name Nominatim knows.
    core = re.sub(r"\s*\([^)]*\)", "", v).strip()
    for suf in ("Exhibition & Conference Center", "Exhibition and Conference Center",
                "Exhibition & Convention Center", "Exhibition and Convention Center",
                "Convention Center", "Conference Center", "Exhibition Center"):
        if core.lower().endswith(suf.lower()):
            core = core[: -len(suf)].strip(" -,")
            break
    if core and core.lower() != v.lower():
        yield f"{core}, {city}, Saudi Arabia"
    for sep in (" - ", " | ", " in ", " by "):
        if sep in v:
            parts = v.split(sep)
            before, after = parts[0].strip(), parts[-1].strip()
            if before and before != v:
                yield f"{before}, {city}, Saudi Arabia"
            if sep == " in " and after and after != v:
                yield f"{after}, {city}, Saudi Arabia"
            break
    yield f"{v}, Saudi Arabia"


# Nominatim result types that mean "this is a city/town, not the venue" —
# baking those would fabricate venue pins at city centers.
_CITY_TYPES = {("place", "city"), ("place", "town"), ("place", "village"),
               ("boundary", "administrative")}


def _is_city_match(item):
    return (item.get("class"), item.get("type")) in _CITY_TYPES


def geocode(venue, city):
    if not (venue or "").strip():
        return None  # no venue name: never bake a city-center pin for it
    for q in variants(venue, city):
        params = urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "sa",
             "addressdetails": 1})
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
            item = items[0]
            if _is_city_match(item):
                continue  # resolved to the city itself: not a venue pin
            lat, lon = float(item["lat"]), float(item["lon"])
            if not _near_city(lat, lon, city):
                continue  # wrong-city match: reject, try next variant
            return [lat, lon, item.get("name")]
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
