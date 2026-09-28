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
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
try:
    from backend.image_extract import fetch_og_image
except ImportError:  # local dev runs from backend/
    from image_extract import fetch_og_image
try:
    from backend.domains import classify_domain, DOMAINS, domain_label
except ImportError:
    from domains import classify_domain, DOMAINS, domain_label

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
        # lightweight analytics beacons: view/save/register/share/search
        con.execute("""CREATE TABLE IF NOT EXISTS analytics(
            ts REAL NOT NULL, type TEXT NOT NULL, ref TEXT, meta TEXT)""")
        # user-submitted corrections ("report wrong info")
        con.execute("""CREATE TABLE IF NOT EXISTS reports(
            ts REAL NOT NULL, event_id TEXT NOT NULL, issue TEXT NOT NULL,
            detail TEXT, contact TEXT)""")
        # web-push subscriptions for day-before reminders
        con.execute("""CREATE TABLE IF NOT EXISTS push_subs(
            endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL,
            event_ids TEXT NOT NULL DEFAULT '[]', ts REAL NOT NULL)""")


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
    dcounts = {}
    for e in events:
        d = e.get("domain") or "business"
        dcounts[d] = dcounts.get(d, 0) + 1
    domains = [{"key": k, "en": DOMAINS.get(k, {}).get("en", k),
                "ar": DOMAINS.get(k, {}).get("ar", k),
                "count": dcounts[k]}
               for k in sorted(dcounts, key=lambda k: -dcounts[k])]
    return {"count": len(events), "cities": cities,
            "categories": cats, "domains": domains,
            "window": [starts[0] if starts else None,
                       ends[-1] if ends else None]}


@app.get("/api/events")
def list_events(city: str | None = None, category: str | None = None,
                domain: str | None = None,
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
    if domain:
        want = {c.strip().lower() for c in domain.split(",")}
        events = [e for e in events if (e.get("domain") or "business").lower() in want]
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
    live Nominatim (venue precision). Unresolved venues return nulls: we
    never invent coordinates, so the map only plots genuinely verified
    venue locations. (Cache namespace bumped to geo2: to drop stale
    city-center fallback entries.) Precise hits cache forever; nulls are
    retried after 24h."""
    key = "geo2:" + hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()
    # VENUE_COORDS (baked by geocode_seed.py) uses raw sha256 keys, no prefix.
    raw = key[5:]
    if raw in VENUE_COORDS:
        lat, lng = VENUE_COORDS[raw][:2]  # entries may carry a provenance note as 3rd element
        return {"lat": lat, "lng": lng}
    with _db_lock, db() as con:
        row = con.execute("SELECT v, ts FROM kv WHERE k=?", (key,)).fetchone()
    if row:
        d = json.loads(row["v"])
        if d.get("lat") is not None:
            return {"lat": d["lat"], "lng": d["lng"]}
        if time.time() - row["ts"] < 86400:
            return {"lat": None, "lng": None}
    res = geocode_nominatim(venue, city)
    payload = {"lat": res[0], "lng": res[1]} if res else {"lat": None, "lng": None}
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
                # keep derived fields fresh when core fields change
                if not ev.get("domain") and any(k in p.fields for k in ("title", "organizer", "category")):
                    ev["domain"] = classify_domain(ev.get("title"), ev.get("organizer"), ev.get("category"))
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
                    if not f.get("domain"):
                        f["domain"] = classify_domain(f.get("title"), f.get("organizer"), f.get("category"))
                    f.setdefault("description", "")
                    f.setdefault("added_at", date.today().isoformat())
                    con.execute("INSERT INTO events(id,data) VALUES(?,?)",
                                (p.id, json.dumps(f, ensure_ascii=False)))
                    patched += 1
                else:
                    not_found.append(p.id)
    return {"patched_count": patched, "not_found": not_found}


class Beacon(BaseModel):
    type: str   # view | save | unsave | register | share | search | undo
    ref: str = ""
    meta: str = ""


@app.post("/api/analytics")
def analytics(b: Beacon):
    """Privacy-friendly usage beacons (no user identity stored)."""
    if b.type not in {"view", "save", "unsave", "register", "share",
                      "search", "undo", "report", "remind", "jserror",
                      "pageview", "swipe", "detail", "ics", "map_open", "map_plot"}:
        raise HTTPException(400, "bad beacon type")
    with _db_lock, db() as con:
        con.execute("INSERT INTO analytics(ts,type,ref,meta) VALUES(?,?,?,?)",
                    (time.time(), b.type, b.ref[:64], b.meta[:256]))
    return {"ok": True}


class Report(BaseModel):
    event_id: str
    issue: str   # wrong_date | wrong_venue | wrong_price | cancelled | other
    detail: str = ""
    contact: str = ""


@app.post("/api/report")
def report(r: Report):
    """Crowdsourced corrections: users flag wrong event info."""
    if r.issue not in {"wrong_date", "wrong_venue", "wrong_price",
                       "cancelled", "other"} or not r.event_id:
        raise HTTPException(400, "bad report")
    with _db_lock, db() as con:
        con.execute(
            "INSERT INTO reports(ts,event_id,issue,detail,contact) VALUES(?,?,?,?,?)",
            (time.time(), r.event_id[:64], r.issue, r.detail[:500], r.contact[:120]))
    return {"ok": True}


# ---------------- web-push reminders (day-before) ----------------
def _vapid_private() -> str | None:
    k = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if k:
        return k
    try:
        p = Path(__file__).resolve().parent / ".vapid_private"
        if p.exists():
            return p.read_text().strip()
    except Exception:
        pass
    return None


def _vapid_public() -> str | None:
    # public key is baked next to the private one for local dev; on Render it
    # is derived from the private key (ecdsa ships with pywebpush)
    try:
        p = Path(__file__).resolve().parent / ".vapid_public"
        if p.exists():
            return p.read_text().strip()
    except Exception:
        pass
    priv = _vapid_private()
    if not priv:
        return None
    try:
        import base64
        # cryptography ships with pywebpush; ecdsa is NOT a pywebpush dep
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.backends import default_backend
        raw = base64.urlsafe_b64decode(priv + "=" * (-len(priv) % 4))
        privkey = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1(), default_backend())
        nums = privkey.public_key().public_numbers()
        pub = b"\x04" + nums.x.to_bytes(32, "big") + nums.y.to_bytes(32, "big")
        return base64.urlsafe_b64encode(pub).rstrip(b"=").decode()
    except Exception:
        return None


class PushSub(BaseModel):
    subscription: dict
    event_ids: list[str] = []


@app.get("/api/push/vapid-public")
def push_vapid_public():
    pub = _vapid_public()
    if not pub:
        raise HTTPException(503, "push not configured")
    return {"public_key": pub}


@app.post("/api/push/subscribe")
def push_subscribe(b: PushSub):
    ep = (b.subscription.get("endpoint") or "")[:500]
    if not ep.startswith("https://"):
        raise HTTPException(400, "bad subscription")
    ids = [str(i)[:64] for i in b.event_ids[:200]]
    with _db_lock, db() as con:
        con.execute(
            "INSERT INTO push_subs(endpoint,sub,event_ids,ts) VALUES(?,?,?,?) "
            "ON CONFLICT(endpoint) DO UPDATE SET sub=excluded.sub, event_ids=excluded.event_ids, ts=excluded.ts",
            (ep, json.dumps(b.subscription), json.dumps(ids), time.time()))
    return {"ok": True, "events": len(ids)}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(b: dict):
    ep = str(b.get("endpoint") or "")[:500]
    with _db_lock, db() as con:
        con.execute("DELETE FROM push_subs WHERE endpoint=?", (ep,))
    return {"ok": True}


class PushDue(BaseModel):
    key: str = ""


@app.post("/api/push/send-due")
def push_send_due(b: PushDue):
    """Send day-before reminders. Called by the daily cron with the ingest key."""
    if not INGEST_KEY or b.key != INGEST_KEY:
        raise HTTPException(403, "bad key")
    priv = _vapid_private()
    if not priv:
        raise HTTPException(503, "push not configured")
    from pywebpush import webpush, WebPushException
    from zoneinfo import ZoneInfo
    tomorrow = (datetime.now(ZoneInfo("Asia/Riyadh")) + timedelta(days=1)).date().isoformat()
    with _db_lock, db() as con:
        subs = con.execute("SELECT endpoint,sub,event_ids FROM push_subs").fetchall()
        ev_rows = {r[0]: json.loads(r[1]) for r in
                   con.execute("SELECT id,data FROM events").fetchall()}
    sent, pruned = 0, 0
    claims = {"sub": "https://thisweeksaudi.onrender.com"}
    for endpoint, sub_json, ids_json in subs:
        try:
            ids = json.loads(ids_json)
        except Exception:
            ids = []
        due = [ev_rows[i] for i in ids
               if i in ev_rows and str(ev_rows[i].get("start", ""))[:10] == tomorrow]
        if not due:
            continue
        try:
            sub = json.loads(sub_json)
        except Exception:
            continue
        dead = False
        for ev in due:
            payload = json.dumps({
                "title": "Tomorrow: " + str(ev.get("title", "Your event"))[:80],
                "body": f"{ev.get('venue') or ev.get('city', '')} · {ev.get('city', '')}".strip(" ·")[:120],
                "event_id": ev.get("id", ""),
                "url": "/#e=" + ev.get("id", ""),
            })
            try:
                webpush(sub, payload, vapid_private_key=priv, vapid_claims=claims)
                sent += 1
            except WebPushException as e:
                if e.response is not None and e.response.status_code in (404, 410):
                    dead = True
                    break
            except Exception:
                pass
        if dead:
            with _db_lock, db() as con:
                con.execute("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))
                pruned += 1
    return {"ok": True, "sent": sent, "pruned": pruned, "for_date": tomorrow}


@app.get("/e/{event_id}", response_class=None, include_in_schema=False)
def event_page(event_id: str):
    """Shareable, indexable event page: crawlers get OG tags + Event
    schema.org; browsers are handed to the SPA which opens the sheet."""
    from fastapi.responses import HTMLResponse
    with _db_lock, db() as con:
        row = con.execute("SELECT data FROM events WHERE id=?",
                          (event_id,)).fetchone()
    if not row:
        raise HTTPException(404, "event not found")
    ev = _with_image(json.loads(row["data"]))
    base = os.environ.get("PUBLIC_BASE", "https://thisweeksaudi.onrender.com")
    url = f"{base}/e/{event_id}"
    title = ev.get("title", "Event")
    desc = ev.get("description") or f"{title} — {ev.get('venue') or ev.get('city')}, {ev.get('start')}"
    img = ev.get("image") or f"{base}/icon-512.png"
    venue = ev.get("venue") or ""
    city = ev.get("city") or ""
    loc = ", ".join(x for x in (venue, city, "Saudi Arabia") if x)
    schema = {
        "@context": "https://schema.org", "@type": "Event",
        "name": title, "description": desc, "url": url,
        "eventStatus": "https://schema.org/EventScheduled",
        "startDate": ev.get("start"), "endDate": ev.get("end"),
        "location": {"@type": "Place", "name": loc,
                     "address": {"@type": "PostalAddress",
                                 "addressLocality": city,
                                 "addressCountry": "SA"}},
        "organizer": {"@type": "Organization",
                      "name": ev.get("organizer") or "ThisWeekSaudi"},
    }
    if img:
        schema["image"] = img
    esc_t = title.replace('"', '&quot;')
    esc_d = desc.replace('"', '&quot;')[:300]
    html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>{esc_t} — ThisWeekSaudi</title>
<meta name="description" content="{esc_d}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc_t} — ThisWeekSaudi">
<meta property="og:description" content="{esc_d}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script>
</head><body><script>location.replace('/#e={event_id}')</script>
<p><a href="/#e={event_id}">{esc_t}</a></p></body></html>"""
    return HTMLResponse(html)


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


def _preview_retry_loop():
    """Background: every 10 min, retry og:image fetch for event URLs whose
    preview cache is empty (blocked hosts, transient failures). Retries a
    small batch per cycle to stay polite to source sites."""
    time.sleep(90)  # let startup complete
    while True:
        try:
            with _db_lock, db() as con:
                rows = con.execute("SELECT data FROM events").fetchall()
            urls, seen = [], set()
            for (data,) in rows:
                try:
                    u = json.loads(data).get("url")
                except Exception:
                    u = None
                if u and u not in seen:
                    seen.add(u)
                    urls.append(u)
            retried = 0
            for u in urls:
                if retried >= 8:
                    break
                key = "preview:" + hashlib.sha256(u.encode()).hexdigest()
                if kv_get(key):
                    continue  # already has an image
                try:
                    img = fetch_og_image(u)
                except Exception:
                    img = None
                kv_set(key, img or "")
                retried += 1
                time.sleep(3)  # be polite
        except Exception:
            pass
        time.sleep(600)


threading.Thread(target=_preview_retry_loop, daemon=True, name="preview-retry").start()
