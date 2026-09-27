FROM python:3.12-slim

WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Seed snapshot lives OUTSIDE the persistent-disk mount so a fresh disk
# can be seeded on first boot (see app.py).
COPY data/events.json /srv/seed/events.json

ENV DATA_DIR=/srv/data \
    SEED_SNAPSHOT=/srv/seed/events.json \
    PORT=8000

EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.app:app --app-dir /srv --host 0.0.0.0 --port ${PORT} --workers 1"]
