"""Saudi Events Directory - public backend.

FastAPI app serving the events API, og:image preview proxy (cached),
Nominatim geocoding (cached), and a keyed ingest endpoint used by the
3x-daily radar crons. Serves the static frontend from ../frontend.
"""
import hashlib
import html.parser
import json
import os
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
try:
    from backend.image_extract import fetch_og_image
except ImportError:  # local dev runs from backend/
    from image_extract import fetch_og_image

HERE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", HERE))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "events.db"
FRONTEND_DIR = HERE.parent / "frontend"
KEY_PATH = DATA_DIR / ".ingest_key"
SEED_SNAPSHOT = os.environ.get("SEED_SNAPSHOT", "")

REQUIRED_FIELDS = ["id", "title", "city", "venue", "price", "url",
                   "organizer", "sources", "start", "end", "category"]

app = FastAPI(title="ThisWeekSaudi")
_db_lock = threading.Lock()


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _db_lock, db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS events(
            id TEXT PRIMARY KEY, data TEXT NOT NULL)""")
        con.execute("""CREATE TABLE IF NOT EXISTS kv(
            k TEXT PRIMARY KEY, v TEXT NOT NULL, ts REAL NOT NULL)""")


# Static city coordinates — instant fallback so the map always plots markers,
# even when Nominatim blocks or rate-limits the server's egress IP.
# (Venue-precision is attempted first via Nominatim; this is the backstop.)
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


def city_fallback(city: str) -> tuple[float, float] | None:
    # No jitter: an approximate-but-honest city-center pin beats a
    # confidently-wrong one.
    base = CITY_COORDS.get((city or "").strip())
    return (float(base[0]), float(base[1])) if base else None


# Precise venue coordinates, geocoded offline (backend/geocode_seed.py) and
# baked into the image — Render's egress IP is rate-limited by Nominatim,
# so live venue geocoding from the server is unreliable.
def _load_venue_coords():
    try:
        p = Path(__file__).resolve().parent / "venue_coords.json"
        if p.exists():
            return json.loads(p.read_text())
    except Exception as e:
        print("venue_coords load failed:", e)
    return {}


VENUE_COORDS = _load_venue_coords()
print(f"loaded {len(VENUE_COORDS)} baked venue coordinates")


# Hero images baked offline (backend/fetch_images.py) so cards render
# instantly. Missing IDs fall back to the live /api/preview scrape.
def _load_event_images():
    try:
        p = Path(__file__).resolve().parent / "event_images.json"
        if p.exists():
            return json.loads(p.read_text())
    except Exception as e:
        print("event_images load failed:", e)
    return {}


EVENT_IMAGES = _load_event_images()
print(f"loaded {len(EVENT_IMAGES)} baked event images")


def _with_image(ev: dict) -> dict:
    img = EVENT_IMAGES.get(ev.get("id"))
    if img:
        ev["image"] = img
    return ev


def geocode_nominatim(venue: str, city: str) -> tuple[float, float] | None:
    q = f"{venue}, {city}, Saudi Arabia" if venue else f"{city}, Saudi Arabia"
    try:
        params = urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1})
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{params}",
            headers={"User-Agent": "ThisWeekSaudi/1.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            items = json.loads(r.read().decode("utf-8"))
        if items:
            time.sleep(1.1)  # Nominatim usage policy
            return float(items[0]["lat"]), float(items[0]["lon"])
    except Exception as e:
        print("geocode failed:", type(e).__name__, e)
    return None


def kv_get(key: str):
    with _db_lock, db() as con:
        row = con.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()
        return row["v"] if row else None


def kv_set(key: str, value: str):
    with _db_lock, db() as con:
        con.execute("INSERT OR REPLACE INTO kv(k,v,ts) VALUES(?,?,?)",
                    (key, value, time.time()))


def row_to_event(row) -> dict:
    return json.loads(row["data"])


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/meta")
def meta():
    with _db_lock, db() as con:
        rows = con.execute("SELECT data FROM events").fetchall()
    events = [json.loads(r["data"]) for r in rows]
    cities = sorted({e["city"] for e in events if e.get("city")})
    cats = sorted({e["category"] for e in events if e.get("category")})
    starts = sorted(e["start"] for e in events if e.get("start"))
    ends = sorted(e["end"] for e in events if e.get("end"))
    return {"count": len(events), "cities": cities,
            "categories": cats,
            "window": [starts[0] if starts else None,
                       ends[-1] if ends else None]}


@app.get("/api/events")
def list_events(city: str | None = None, category: str | None = None,
                q: str | None = None, limit: int = 500):
    with _db_lock, db() as con:
        rows = con.execute("SELECT data FROM events").fetchall()
    events = [json.loads(r["data"]) for r in rows]
    if city:
        want = {c.strip().lower() for c in city.split(",")}
        events = [e for e in events if e.get("city", "").lower() in want]
    if category:
        want = {c.strip().lower() for c in category.split(",")}
        events = [e for e in events if e.get("category", "").lower() in want]
    if q:
        ql = q.lower()
        events = [e for e in events if ql in
                  f"{e.get('title','')} {e.get('venue','')} {e.get('organizer','')}".lower()]
    events.sort(key=lambda e: (e.get("start") or "", e.get("title") or ""))
    events = [_with_image(e) for e in events[:limit]]
    return {"count": len(events), "events": events}


@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    with _db_lock, db() as con:
        row = con.execute("SELECT data FROM events WHERE id=?",
                          (event_id,)).fetchone()
    if not row:
        raise HTTPException(404, "event not found")
    return _with_image(json.loads(row["data"]))


@app.get("/api/preview")
def preview(url: str = Query(...)):
    """Return a cached hero image for a destination URL ({} when none).

    Misses are re-fetched after 24h so extractor improvements and newly
    published pages get picked up."""
    key = "preview:" + hashlib.sha256(url.encode()).hexdigest()
    with _db_lock, db() as con:
        row = con.execute("SELECT v, ts FROM kv WHERE k=?", (key,)).fetchone()
    if row and (row["v"] or time.time() - row["ts"] < 86400):
        return {"image": row["v"] or None}
    img = fetch_og_image(url)
    kv_set(key, img or "")
    return {"image": img}


@app.get("/api/geocode")
def geocode(venue: str = Query(""), city: str = Query("")):
    """Return cached {lat, lng} for a venue.

    Resolution order: baked offline-geocoded venue table -> kv cache ->
    live Nominatim (venue precision) -> city-center fallback. Precise hits
    cache forever; fallback/null results are retried after 24h."""
    key = "geo:" + hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()
    # VENUE_COORDS (baked by geocode_seed.py) uses raw sha256 keys, no prefix.
    raw = key[4:]
    if raw in VENUE_COORDS:
        lat, lng = VENUE_COORDS[raw]
        return {"lat": lat, "lng": lng}
    with _db_lock, db() as con:
        row = con.execute("SELECT v, ts FROM kv WHERE k=?", (key,)).fetchone()
    if row:
        d = json.loads(row["v"])
        if d.get("lat") is not None and not d.get("fb"):
            return {"lat": d["lat"], "lng": d["lng"]}
        if time.time() - row["ts"] < 86400:
            return {"lat": d.get("lat"), "lng": d.get("lng")}
    res = geocode_nominatim(venue, city)
    if res:
        payload = {"lat": res[0], "lng": res[1]}
    else:
        fb = city_fallback(city)
        payload = {"lat": fb[0] if fb else None,
                   "lng": fb[1] if fb else None,
                   **({"fb": True} if fb else {})}
    kv_set(key, json.dumps(payload))
    return {"lat": payload["lat"], "lng": payload["lng"]}


class Patch(BaseModel):
    id: str
    fields: dict


class IngestBody(BaseModel):
    key: str
    patches: list[Patch]


def _valid_iso(s) -> bool:
    if not isinstance(s, str):
        return False
    try:
        y, m, d = s.split("-")
        date(int(y), int(m), int(d))
        return True
    except Exception:
        return False


@app.post("/api/ingest")
def ingest(body: IngestBody):
    if not INGEST_KEY or body.key != INGEST_KEY:
        raise HTTPException(403, "bad ingest key")
    patched, not_found = 0, []
    with _db_lock, db() as con:
        for p in body.patches:
            row = con.execute("SELECT data FROM events WHERE id=?",
                              (p.id,)).fetchone()
            if row:
                ev = json.loads(row["data"])
                ev.update(p.fields)
                con.execute("UPDATE events SET data=? WHERE id=?",
                            (json.dumps(ev, ensure_ascii=False), p.id))
                patched += 1
            else:
                f = dict(p.fields)
                f["id"] = p.id
                if all(f.get(k) not in (None, "") or k in ("venue", "organizer", "url")
                       for k in REQUIRED_FIELDS) and \
                   _valid_iso(f.get("start")) and _valid_iso(f.get("end")):
                    for k in REQUIRED_FIELDS:
                        f.setdefault(k, "" if k != "sources" else [])
                    con.execute("INSERT INTO events(id,data) VALUES(?,?)",
                                (p.id, json.dumps(f, ensure_ascii=False)))
                    patched += 1
                else:
                    not_found.append(p.id)
    return {"patched_count": patched, "not_found": not_found}


init_db()
INGEST_KEY = os.environ.get("INGEST_KEY", "")
if not INGEST_KEY:
    if not KEY_PATH.exists():
        import secrets
        KEY_PATH.write_text(secrets.token_urlsafe(32))
        os.chmod(KEY_PATH, 0o600)
    INGEST_KEY = KEY_PATH.read_text().strip()


def _table_count() -> int:
    with _db_lock, db() as con:
        return con.execute("SELECT COUNT(*) FROM events").fetchone()[0]


# Auto-seed on first boot (fresh persistent disk): the seed snapshot is baked
# into the image outside the disk mount, so a redeploy never loses the dataset.
if _table_count() == 0 and SEED_SNAPSHOT and Path(SEED_SNAPSHOT).exists():
    try:
        from backend.seed import seed_db
    except ImportError:  # local dev runs from backend/
        from seed import seed_db
    seed_db(DB_PATH, Path(SEED_SNAPSHOT))
    print(f"seeded {_table_count()} events from snapshot")
# Cache-busting: index.html references assets as app.js?v=__V__ / styles.css?v=__V__.
# __V__ is a hash of the asset contents, so every deploy with changed JS/CSS
# gets fresh URLs and phones stop showing stale cached code.
def _asset_version():
    h = hashlib.sha256()
    for name in ("app.js", "styles.css"):
        p = FRONTEND_DIR / name
        if p.exists():
            h.update(p.read_bytes())
    return h.hexdigest()[:10]


ASSET_V = _asset_version()

if FRONTEND_DIR.exists():
    from fastapi.responses import HTMLResponse

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    @app.get("/index.html", response_class=HTMLResponse, include_in_schema=False)
    def _index():
        html = (FRONTEND_DIR / "index.html").read_text().replace("__V__", ASSET_V)
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
