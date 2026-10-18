"""HA Dashboard Builder – Web-API und Auslieferung der Oberfläche."""
import base64
import difflib
import os
import secrets
from pathlib import Path

import yaml
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .ha import DEFAULT_KEY, HAError, make_backend
from .store import Store, canon, config_hash

DATA_DIR = os.getenv("DATA_DIR", "/data")
APP_PASSWORD = os.getenv("APP_PASSWORD", "")

backend = make_backend()
store = Store(os.path.join(DATA_DIR, "versions.db"))
app = FastAPI(title="HA Dashboard Builder", docs_url=None, redoc_url=None)


# --------------------------------------------------------------------------- Hilfen

class _Dumper(yaml.SafeDumper):
    def increase_indent(self, flow=False, indentless=False):  # Listen eingerückt wie in HA
        return super().increase_indent(flow, False)


def _str(dumper, s):
    if "\n" in s:
        return dumper.represent_scalar("tag:yaml.org,2002:str", s, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", s)


_Dumper.add_representer(str, _str)


def to_yaml(data):
    return yaml.dump(data, Dumper=_Dumper, allow_unicode=True, sort_keys=False,
                     default_flow_style=False, width=4096)


def url_path(key):
    return None if key in (None, "", DEFAULT_KEY) else key


def make_diff(old, new, old_label="alt", new_label="neu"):
    a = to_yaml(old).splitlines()
    b = to_yaml(new).splitlines()
    lines = list(difflib.unified_diff(a, b, old_label, new_label, n=3, lineterm=""))
    added = sum(1 for l in lines if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in lines if l.startswith("-") and not l.startswith("---"))
    return {"diff": "\n".join(lines), "changed": canon(old) != canon(new), "added": added, "removed": removed}


@app.middleware("http")
async def basic_auth(request: Request, call_next):
    if APP_PASSWORD and request.url.path != "/health":
        ok = False
        h = request.headers.get("authorization", "")
        if h.startswith("Basic "):
            try:
                _, _, pw = base64.b64decode(h[6:]).decode("utf-8").partition(":")
                ok = secrets.compare_digest(pw, APP_PASSWORD)
            except Exception:
                ok = False
        if not ok:
            return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="Dashboard Builder"'})
    return await call_next(request)


@app.exception_handler(HAError)
async def ha_error(_req, exc: HAError):
    return JSONResponse(status_code=502, content={"detail": str(exc), "code": exc.code})


# --------------------------------------------------------------------------- Home Assistant

def _version():
    for p in (Path(__file__).parent.parent / "VERSION", Path(__file__).parent / "VERSION"):
        if p.exists():
            return p.read_text(encoding="utf-8").strip()
    return "dev"


VERSION = _version()


@app.get("/health")
async def health():
    return {"ok": True, "version": VERSION}


@app.get("/api/status")
async def status():
    return {"mode": backend.mode, "target": backend.target, "version": VERSION}


@app.get("/api/dashboards")
async def dashboards():
    return await backend.dashboards()


@app.get("/api/entities")
async def entities():
    return await backend.entities()


@app.get("/api/config")
async def get_config(dashboard: str = Query(DEFAULT_KEY)):
    cfg = await backend.get_config(url_path(dashboard))
    return {"config": cfg, "hash": config_hash(cfg)}


@app.post("/api/push")
async def push(body: dict = Body(...)):
    key = body.get("dashboard") or DEFAULT_KEY
    cfg = body.get("config")
    if not isinstance(cfg, dict):
        raise HTTPException(400, "Ungültige Konfiguration")
    message = (body.get("message") or "").strip() or "Übertragen"
    current = await backend.get_config(url_path(key))
    cur_hash = config_hash(current)
    if canon(current) == canon(cfg):
        return {"changed": False, "hash": cur_hash}
    if body.get("base_hash") and body["base_hash"] != cur_hash and not body.get("force"):
        raise HTTPException(409, "Das Dashboard wurde inzwischen in Home Assistant geändert. "
                                 "Bitte Änderungen prüfen und erneut übertragen.")
    backup_id, _ = store.add(key, "backup", "Stand in Home Assistant vor dem Übertragen", current, dedupe=True)
    await backend.save_config(url_path(key), cfg)
    vid, _ = store.add(key, "push", message, cfg)
    return {"changed": True, "version": vid, "backup": backup_id, "hash": config_hash(cfg)}


# --------------------------------------------------------------------------- Versionen

@app.get("/api/versions")
async def versions(dashboard: str = Query(DEFAULT_KEY)):
    return store.list(dashboard)


@app.post("/api/versions")
async def save_version(body: dict = Body(...)):
    cfg = body.get("config")
    if not isinstance(cfg, dict):
        raise HTTPException(400, "Ungültige Konfiguration")
    vid, _ = store.add(body.get("dashboard") or DEFAULT_KEY, "draft",
                       (body.get("message") or "").strip() or "Entwurf", cfg)
    return {"version": vid}


@app.get("/api/versions/{vid}")
async def get_version(vid: int):
    v = store.get(vid)
    if not v:
        raise HTTPException(404, "Version nicht gefunden")
    return v


@app.delete("/api/versions/{vid}")
async def delete_version(vid: int):
    store.delete(vid)
    return {"ok": True}


# --------------------------------------------------------------------------- YAML & Diff

@app.post("/api/diff")
async def diff(body: dict = Body(...)):
    return make_diff(body.get("old") or {}, body.get("new") or {},
                     body.get("old_label") or "alt", body.get("new_label") or "neu")


@app.post("/api/yaml/dump")
async def yaml_dump(body: dict = Body(...)):
    return {"text": to_yaml(body.get("data"))}


@app.post("/api/yaml/parse")
async def yaml_parse(body: dict = Body(...)):
    try:
        data = yaml.safe_load(body.get("text") or "")
    except yaml.YAMLError as e:
        raise HTTPException(400, f"YAML-Fehler: {e}")
    if not isinstance(data, dict):
        raise HTTPException(400, "Erwartet wird ein YAML-Objekt (Schlüssel: Wert).")
    return {"data": data}


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
