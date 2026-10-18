"""Versionierung: jede gespeicherte/übertragene Konfiguration landet als Snapshot in SQLite."""
import datetime
import hashlib
import json
import os
import sqlite3
import threading


def canon(cfg):
    return json.dumps(cfg, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def config_hash(cfg):
    return hashlib.sha256(canon(cfg).encode("utf-8")).hexdigest()


class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self.db.execute("""CREATE TABLE IF NOT EXISTS versions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dashboard TEXT NOT NULL,
            created TEXT NOT NULL,
            kind TEXT NOT NULL,
            message TEXT,
            hash TEXT NOT NULL,
            config TEXT NOT NULL)""")
        self.db.execute("CREATE INDEX IF NOT EXISTS idx_dash ON versions(dashboard, id)")
        self.db.execute("""CREATE TABLE IF NOT EXISTS templates(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created TEXT NOT NULL,
            card TEXT NOT NULL)""")
        self.db.commit()

    # ------------------------------------------------------------- Vorlagen
    def add_template(self, name, card):
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        with self.lock:
            cur = self.db.execute("INSERT INTO templates(name, created, card) VALUES (?,?,?)",
                                  (name, ts, json.dumps(card, ensure_ascii=False)))
            self.db.commit()
            return cur.lastrowid

    def list_templates(self):
        with self.lock:
            rows = self.db.execute("SELECT id, name, created, card FROM templates ORDER BY name COLLATE NOCASE, id").fetchall()
        return [{"id": r["id"], "name": r["name"], "created": r["created"], "card": json.loads(r["card"])} for r in rows]

    def rename_template(self, tid, name):
        with self.lock:
            self.db.execute("UPDATE templates SET name=? WHERE id=?", (name, tid))
            self.db.commit()

    def delete_template(self, tid):
        with self.lock:
            self.db.execute("DELETE FROM templates WHERE id=?", (tid,))
            self.db.commit()

    def add(self, dashboard, kind, message, config, dedupe=False):
        """kind: draft | push | backup. Gibt (id, neu_angelegt) zurück."""
        h = config_hash(config)
        with self.lock:
            if dedupe:
                row = self.db.execute(
                    "SELECT id FROM versions WHERE dashboard=? AND hash=? ORDER BY id DESC LIMIT 1",
                    (dashboard, h)).fetchone()
                if row:
                    return row["id"], False
            ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
            cur = self.db.execute(
                "INSERT INTO versions(dashboard, created, kind, message, hash, config) VALUES (?,?,?,?,?,?)",
                (dashboard, ts, kind, message, h, json.dumps(config, ensure_ascii=False)))
            self.db.commit()
            return cur.lastrowid, True

    def list(self, dashboard, limit=300):
        with self.lock:
            rows = self.db.execute(
                "SELECT id, created, kind, message, hash, length(config) AS size FROM versions "
                "WHERE dashboard=? ORDER BY id DESC LIMIT ?", (dashboard, limit)).fetchall()
        return [{**dict(r), "hash": r["hash"][:8]} for r in rows]

    def get(self, vid):
        with self.lock:
            r = self.db.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
        if not r:
            return None
        d = dict(r)
        d["config"] = json.loads(d["config"])
        return d

    def delete(self, vid):
        with self.lock:
            self.db.execute("DELETE FROM versions WHERE id=?", (vid,))
            self.db.commit()
