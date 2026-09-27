#!/usr/bin/env python3
"""Seed events.db from ~/workspace/saudi-events/data/events.json.

Keeps only in-window events (start >= window start), matching the live
artifact's exclusion of the 4 pre-window ongoing events.
"""
import json
import os
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


SRC_CANDIDATES = [
    Path(os.environ.get("SEED_SNAPSHOT", "") or "/nonexistent"),
    HERE.parent / "data" / "events.json",  # docker build context
    Path.home() / "workspace" / "saudi-events" / "data" / "events.json",
]


def seed_db(db_path: Path, src: Path) -> int:
    d = json.loads(src.read_text())
    window_start = (d.get("window") or [None, None])[0]
    events = d["events"]
    if window_start:
        events = [e for e in events if (e.get("start") or "") >= window_start]
    ids = [e["id"] for e in events]
    assert len(ids) == len(set(ids)), "duplicate ids in source"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, data TEXT NOT NULL)")
    con.execute("CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL, ts REAL NOT NULL)")
    con.executemany(
        "INSERT OR IGNORE INTO events(id,data) VALUES(?,?)",
        [(e["id"], json.dumps(e, ensure_ascii=False)) for e in events],
    )
    con.commit()
    n = con.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    con.close()
    return n


def main():
    db_path = Path(os.environ.get("DATA_DIR", HERE)) / "events.db"
    src = next((p for p in SRC_CANDIDATES if p.exists()), None)
    if not src:
        raise SystemExit("events.json not found")
    n = seed_db(db_path, src)
    print(f"seeded {n} events into {db_path}")


if __name__ == "__main__":
    sys.exit(main())
