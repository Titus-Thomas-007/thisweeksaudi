# Wain — Saudi Events Directory (public site)

Public, hosted version of the Saudi Events Directory: a swipeable Tinder-style
deck of every event happening across Saudi Arabia.

## Layout

- `frontend/` — static SPA (index.html, styles.css, app.js). Served by the backend at `/`.
- `backend/app.py` — FastAPI: `/api/events`, `/api/meta`, `/api/preview` (cached og:image),
  `/api/geocode` (cached Nominatim), `POST /api/ingest` (keyed upsert for the radar crons).
- `backend/seed.py` — builds `events.db` (SQLite) from `data/events.json`.
- `data/events.json` — snapshot of the dataset baked into the image at build time.

## Run locally

```bash
python3 backend/seed.py
uvicorn backend.app:app --app-dir . --reload   # from this directory
# open http://127.0.0.1:8000
```

The ingest key lives in `backend/.ingest_key` (generated at first run, chmod 600).
The 3x-daily radar crons read that key and POST new/changed events to `/api/ingest`.

## Deploy

Single container, stateless except `backend/events.db` (SQLite). Any host that runs
Docker works: Render, Railway, Fly.io, or a plain VPS.

- Build: `docker build -t wain .`
- Run: `docker run -e PORT=8000 -v wain-data:/srv/backend -p 8000:8000 wain`
  (mount a volume at `/srv/backend` so `events.db` — events + image/geocode caches —
  survives redeploys; the `.ingest_key` lives there too)
- Health: `GET /api/health`

### Render (example)

1. New Web Service → from this repo → Docker runtime.
2. Add a persistent disk mounted at `/srv/backend`.
3. Deploy. Note the public URL, e.g. `https://wain.onrender.com`.
4. Copy the ingest key: `docker exec` / shell → `cat backend/.ingest_key`,
   store it for the radar crons (see "Radar sync" below).

### Radar sync (keeps the public site fresh 3x daily)

Each radar cron run, after updating `events.json` and the private artifact, also:

```bash
KEY=$(cat ~/workspace/saudi-events-site/backend/.ingest_key)
# POST only the new/changed records:
curl -s -X POST https://<public-host>/api/ingest \
  -H 'Content-Type: application/json' \
  -d "{\"key\":\"$KEY\",\"patches\":[{\"id\":\"...\",\"fields\":{...}}]}"
```

## Notes

- Saved events on the public site live in the visitor's browser (localStorage) —
  no accounts, no tracking.
- Map tiles: OpenStreetMap via Leaflet. Venue pins: geocoded via Nominatim, cached
  server-side in SQLite.
- Card images: pulled from each event's destination link (og:image), cached
  server-side; graceful fallback when a page has no image.
