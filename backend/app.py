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

HERE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", HERE))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "events.db"
FRONTEND_DIR = HERE.parent / "frontend"
KEY_PATH = DATA_DIR / ".ingest_key"
SEED_SNAPSHOT = os.environ.get("SEED_SNAPSHOT", "")

REQUIRED_FIELDS = ["id", "title", "city", "venue", "price", "url",
                   "organizer", "sources", "start", "end", "category"]

app = FastAPI(title="Saudi Events Directory")
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


class _OGImageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None

    def handle_starttag(self, tag, attrs):
        if tag != "meta" or self.image:
            return
        d = dict(attrs)
        prop = (d.get("property") or d.get("name") or "").lower()
        if prop in ("og:image", "twitter:image") and d.get("content"):
            self.image = d["content"].strip()


def fetch_og_image(url: str) -> str | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; SaudiEventsBot/1.0)"})
        with urllib.request.urlopen(req, timeout=12) as r:
            ctype = r.headers.get("Content-Type", "")
            if "html" not in ctype:
                return None
            raw = r.read(200_000).decode("utf-8", "ignore")
        p = _OGImageParser()
        p.feed(raw)
        if p.image:
            return urllib.parse.urljoin(url, p.image)
    except Exception:
        pass
    return None


def geocode_nominatim(venue: str, city: str) -> tuple[float, float] | None:
    q = f"{venue}, {city}, Saudi Arabia" if venue else f"{city}, Saudi Arabia"
    try:
        params = urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1})
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{params}",
            headers={"User-Agent": "WainEvents/1.0"})
        with urllib.request.urlopen(req, timeout=12) as r:
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
    return {"count": len(events), "events": events[:limit]}


@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    with _db_lock, db() as con:
        row = con.execute("SELECT data FROM events WHERE id=?",
                          (event_id,)).fetchone()
    if not row:
        raise HTTPException(404, "event not found")
    return json.loads(row["data"])


@app.get("/api/preview")
def preview(url: str = Query(...)):
    """Return a cached og:image for a destination URL ({} when none)."""
    key = "preview:" + hashlib.sha256(url.encode()).hexdigest()
    cached = kv_get(key)
    if cached is not None:
        return {"image": cached or None}
    img = fetch_og_image(url)
    kv_set(key, img or "")
    return {"image": img}


@app.get("/api/geocode")
def geocode(venue: str = Query(""), city: str = Query("")):
    """Return cached {lat, lng} for a venue (null fields when unknown).

    Negative results are cached for 24h, then retried — venues get added
    to OpenStreetMap over time."""
    key = "geo:" + hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()
    with _db_lock, db() as con:
        row = con.execute("SELECT v, ts FROM kv WHERE k=?", (key,)).fetchone()
    if row:
        d = json.loads(row["v"])
        if d.get("lat") is not None or time.time() - row["ts"] < 86400:
            return {"lat": d.get("lat"), "lng": d.get("lng")}
    res = geocode_nominatim(venue, city)
    payload = {"lat": res[0] if res else None,
               "lng": res[1] if res else None}
    kv_set(key, json.dumps(payload))
    return payload


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
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
