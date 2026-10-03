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


# City centers — used ONLY to detect when Nominatim backs off to a
# city-level result for an unknown venue. Such results are rejected (the
# map must never show city-centre/approximate pins), so coordinates only
# need to be roughly right here.
CITY_COORDS = {
    "riyadh": (24.7136, 46.6753), "jeddah": (21.4858, 39.1925),
    "dammam": (26.4207, 50.0888), "khobar": (26.2172, 50.1971),
    "medina": (24.5247, 39.5692), "taif": (21.4901, 40.5482),
    "abha": (18.2465, 42.5117), "khamis mushait": (18.3093, 42.7299),
    "tabuk": (28.3835, 36.5662), "buraydah": (26.3592, 43.9819),
    "unaizah": (26.0848, 43.9935), "al qassim": (26.3488, 43.7650),
    "al ahsa": (25.4288, 49.6211), "al majma'a": (25.9006, 45.3459),
    "alula": (26.6140, 37.9167), "al ula": (26.6140, 37.9167),
    "jubail": (27.0046, 49.6455), "mecca": (21.4225, 39.8262),
    "hail": (27.5114, 41.7208), "yanbu": (24.0232, 38.0618),
    "jazan": (16.8892, 42.5706), "najran": (17.4933, 44.1277),
}


def _haversine_km(a, b) -> float:
    from math import radians, sin, cos, asin, sqrt
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def _is_city_centre_fallback(lat: float, lng: float, city: str) -> bool:
    """True if a geocode hit is really just the city center, not the venue."""
    cc = CITY_COORDS.get((city or "").strip().lower())
    return bool(cc) and _haversine_km((lat, lng), cc) < 1.2


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
            lat, lng = float(items[0]["lat"]), float(items[0]["lon"])
            if _is_city_centre_fallback(lat, lng, city):
                return None  # venue unknown to OSM — never fake a pin
            return lat, lng
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
    city-center fallback entries.) Nominatim hits landing within 1.2km of
    the city center are rejected as unverified backoffs. Precise hits cache
    forever; nulls are retried after 24h. `src` is 'baked' for the
    hand-verified venue table, 'geo' for venue-level Nominatim hits."""
    key = "geo2:" + hashlib.sha256(f"{venue}|{city}".encode()).hexdigest()
    # VENUE_COORDS (baked by geocode_seed.py) uses raw sha256 keys, no prefix.
    raw = key[5:]
    if raw in VENUE_COORDS:
        lat, lng = VENUE_COORDS[raw][:2]  # entries may carry a provenance note as 3rd element
        return {"lat": lat, "lng": lng, "src": "baked"}
    with _db_lock, db() as con:
        row = con.execute("SELECT v, ts FROM kv WHERE k=?", (key,)).fetchone()
    if row:
        d = json.loads(row["v"])
        if d.get("lat") is not None:
            return {"lat": d["lat"], "lng": d["lng"], "src": "geo"}
        if time.time() - row["ts"] < 86400:
            return {"lat": None, "lng": None, "src": "none"}
    res = geocode_nominatim(venue, city)
    payload = {"lat": res[0], "lng": res[1]} if res else {"lat": None, "lng": None}
    kv_set(key, json.dumps(payload))
    payload["src"] = "geo" if res else "none"
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
                      "pageview", "swipe", "detail", "ics", "map_open", "map_plot",
                      "dview", "dfilter", "nearme", "dmap_plot", "plan_share"}:
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
    esc_t = html.escape(title, quote=True)
    esc_d = html.escape(desc[:300], quote=True)
    schema_json = json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")
    deeplink = json.dumps("/#e=" + event_id)
    page = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>{esc_t} — ThisWeekSaudi</title>
<meta name="description" content="{esc_d}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ThisWeekSaudi">
<meta property="og:title" content="{esc_t} — ThisWeekSaudi">
<meta property="og:description" content="{esc_d}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{schema_json}</script>
</head><body><script>location.replace({deeplink})</script>
<main style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#111">
<h1>{esc_t}</h1>
<p>{esc_d}</p>
<p><a href={deeplink}>View this event on ThisWeekSaudi →</a></p>
</main></body></html>"""
    return HTMLResponse(page)


@app.get("/p/{plan_ids}", include_in_schema=False)
def plan_page(plan_ids: str, t: str = ""):
    """Shareable weekend plan (WhatsApp growth loop): /p/id1,id2,id3?t=Title

    Server-rendered with OG tags so chat apps unfurl a rich preview card.
    noindex (never in sitemap) — plans are public-by-link only. IDs are
    validated against the DB; unknown IDs are skipped; no valid events → 404.
    All user input (title) is HTML-escaped."""
    from fastapi.responses import HTMLResponse
    import re as _re
    ids = [i for i in _re.split(r"[^a-f0-9]", plan_ids.lower()) if i][:6]
    if not ids:
        raise HTTPException(404, "empty plan")
    evs = []
    with _db_lock, db() as con:
        for eid in ids:
            row = con.execute("SELECT data FROM events WHERE id=?", (eid,)).fetchone()
            if row:
                try:
                    evs.append(_with_image(json.loads(row["data"])))
                except Exception:
                    pass
    if not evs:
        raise HTTPException(404, "plan not found")
    base = os.environ.get("PUBLIC_BASE", "https://thisweeksaudi.onrender.com")
    title = (t or "").strip()[:60] or "A weekend plan"
    esc_t = html.escape(title, quote=True)
    url = f"{base}/p/{','.join(e['id'] for e in evs)}"
    if t:
        url += "?t=" + urllib.parse.quote(t.strip()[:60])

    def _nice(iso):
        try:
            dt = datetime.fromisoformat((iso or "")[:16])
            return dt.strftime("%a, %b %d")
        except Exception:
            return (iso or "")[:10]

    today = date.today().isoformat()
    upcoming = [e for e in evs if (e.get("start") or "")[:10] >= today]
    stale = not upcoming
    cities = sorted({e.get("city") for e in evs if e.get("city")})
    city_str = ", ".join(cities[:3])
    og_title = f"{title} · {len(evs)} event{'s' if len(evs) != 1 else ''}" + (f" in {city_str}" if city_str else "")
    og_desc = " · ".join(
        f"{e.get('title', '')[:60]} ({_nice(e.get('start'))})" for e in evs[:3])
    if len(evs) > 3:
        og_desc += f" · +{len(evs) - 3} more"
    img = (evs[0].get("image") or "") or f"{base}/icon-512.png"

    cards = []
    for e in evs:
        eid = e["id"]
        et = html.escape(e.get("title", "Event"), quote=True)
        em = html.escape(", ".join(x for x in (e.get("venue"), e.get("city")) if x), quote=True)
        pr = html.escape(e.get("price") or "", quote=True)
        eimg = html.escape(e.get("image") or f"{base}/icon-512.png", quote=True)
        cards.append(
            f'<a class="plan-card" href="{base}/e/{html.escape(eid, quote=True)}">'
            f'<img src="{eimg}" alt="" loading="lazy">'
            f'<div><div class="plan-date">{html.escape(_nice(e.get("start")), quote=True)}</div>'
            f'<div class="plan-title">{et}</div>'
            f'<div class="plan-meta">{em}' + (f" · <b>{pr}</b>" if pr else "") + "</div></div></a>")
    stale_note = ('<p class="stale">These dates have passed — '
                  f'<a href="{base}/">browse this week\u2019s events</a> instead.</p>' if stale else "")
    page = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{esc_t} — ThisWeekSaudi</title>
<meta name="description" content="{html.escape(og_desc, quote=True)}">
<link rel="canonical" href="{html.escape(url, quote=True)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ThisWeekSaudi">
<meta property="og:title" content="{html.escape(og_title, quote=True)}">
<meta property="og:description" content="{html.escape(og_desc, quote=True)}">
<meta property="og:url" content="{html.escape(url, quote=True)}">
<meta property="og:image" content="{html.escape(img, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<style>
body{{margin:0;background:#0b0b0e;color:#f2ede3;font-family:-apple-system,system-ui,sans-serif}}
.wrap{{max-width:620px;margin:0 auto;padding:28px 18px 60px}}
.brand{{font-weight:800;letter-spacing:-.02em;font-size:15px;color:#d9a441;margin-bottom:26px}}
.brand b{{color:#f2ede3}}
h1{{font-size:30px;letter-spacing:-.02em;margin:0 0 6px}}
.sub{{color:#9a958a;font-size:14px;margin:0 0 8px}}
.stale{{background:rgba(217,164,65,.12);border:1px solid rgba(217,164,65,.4);border-radius:12px;
  padding:12px 14px;font-size:14px;color:#e8c97a}}
.stale a{{color:#e8c97a}}
.plan-card{{display:flex;gap:14px;background:#141417;border:1px solid #26262b;border-radius:16px;
  padding:12px;margin:14px 0;text-decoration:none;color:inherit}}
.plan-card img{{width:88px;height:88px;object-fit:cover;border-radius:10px;flex:0 0 auto;background:#1d1d21}}
.plan-date{{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#d9a441}}
.plan-title{{font-size:16px;font-weight:700;margin:3px 0}}
.plan-meta{{font-size:13px;color:#9a958a}}
.plan-meta b{{color:#d9a441}}
.cta{{display:block;text-align:center;background:linear-gradient(135deg,#f0c96a,#d9a441);color:#1a1206;
  font-weight:800;font-size:16px;border-radius:14px;padding:15px;margin:30px 0 10px;text-decoration:none}}
.foot{{text-align:center;color:#6b675e;font-size:12px;margin-top:26px}}
</style></head><body><div class="wrap">
<div class="brand">This<b>Week</b>Saudi</div>
<h1>{esc_t}</h1>
<p class="sub">{len(evs)} event{'s' if len(evs) != 1 else ''}{(' in ' + html.escape(city_str, quote=True)) if city_str else ''} · shared via ThisWeekSaudi</p>
{stale_note}
{''.join(cards)}
<a class="cta" href="{base}/">Make your own weekend plan →</a>
<div class="foot">Every conference, expo, concert and meetup across Saudi Arabia — this week and beyond.</div>
</div></body></html>"""
    return HTMLResponse(page)


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    """Crawler welcome mat: allow everything, point at the sitemap."""
    from fastapi.responses import PlainTextResponse
    base = os.environ.get("PUBLIC_BASE", "https://thisweeksaudi.onrender.com")
    return PlainTextResponse(
        f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    """Live sitemap generated from the DB — always current, no build step,
    so every ingest/deploy is reflected immediately (the 'keep updating' part)."""
    from fastapi.responses import Response
    base = os.environ.get("PUBLIC_BASE", "https://thisweeksaudi.onrender.com")
    with _db_lock, db() as con:
        rows = con.execute("SELECT id, data FROM events").fetchall()
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
             f'  <url><loc>{base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>']
    for eid, data in rows:
        try:
            ev = json.loads(data)
        except Exception:
            continue
        start = (ev.get("start") or "")[:10]
        lastmod = f"<lastmod>{start}</lastmod>" if start else ""
        parts.append(
            f'  <url><loc>{base}/e/{html.escape(eid, quote=True)}</loc>'
            f'{lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>')
    parts.append('</urlset>')
    return Response(content="\n".join(parts), media_type="application/xml")


@app.get("/llms.txt", include_in_schema=False)
def llms_txt():
    """Machine-readable site summary for AI crawlers/answer engines
    (ChatGPT, Perplexity, Copilot...). Served live from the DB."""
    from fastapi.responses import PlainTextResponse
    base = os.environ.get("PUBLIC_BASE", "https://thisweeksaudi.onrender.com")
    with _db_lock, db() as con:
        rows = con.execute("SELECT id, data FROM events").fetchall()
    evs = []
    for eid, data in rows:
        try:
            ev = json.loads(data)
        except Exception:
            continue
        ev["_eid"] = eid
        evs.append(ev)
    today = date.today().isoformat()
    upcoming = sorted(
        (e for e in evs if (e.get("start") or "")[:10] >= today),
        key=lambda e: (e.get("start") or "")[:10])
    lines = [
        "# ThisWeekSaudi",
        "",
        "> Your week in Saudi, one swipe away. ThisWeekSaudi lists conferences,",
        "> expos, concerts, meetups, workshops, festivals and sports events across",
        "> Saudi Arabia — Riyadh, Jeddah, Dammam, Khobar, Mecca and more. Browse by",
        "> week, map or stories; save events and export them to your calendar.",
        "",
        f"Site: {base}/",
        f"Sitemap: {base}/sitemap.xml",
        "",
        "## Upcoming events",
        "",
    ]
    for ev in upcoming:
        eid = ev["_eid"]
        title = (ev.get("title") or "Untitled event").replace("\n", " ").strip()
        start = (ev.get("start") or "")[:10]
        venue = (ev.get("venue") or "").replace("\n", " ").strip()
        city = (ev.get("city") or "").strip()
        price = (ev.get("price") or "").strip()
        bits = [b for b in (start, ", ".join(x for x in (venue, city) if x), price) if b]
        lines.append(f"- [{title}]({base}/e/{eid}) — {' · '.join(bits)}")
    lines += ["",
              "## Notes",
              "- Prices are in SAR (Saudi Riyal) unless marked Free.",
              "- Event details, images and availability change; verify on the event page.",
              ""]
    return PlainTextResponse("\n".join(lines))


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
# Cache-busting: index.html references assets as app.js?v=__V__ / styles.css?v=__V__
# (+ discover.js / discover.css). __V__ is a hash of the asset contents, so every
# deploy with changed JS/CSS gets fresh URLs and phones stop showing stale cached code.
def _asset_version():
    h = hashlib.sha256()
    for name in ("app.js", "styles.css", "discover.js", "discover.css"):
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
