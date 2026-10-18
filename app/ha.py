"""Verbindung zu Home Assistant über die WebSocket-API (plus Demo-Backend zum Ausprobieren)."""
import asyncio
import copy
import json
import os

import websockets

DEFAULT_KEY = "__default__"  # Standard-Dashboard (url_path = null)


class HAError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def build_entities(states, areas, devices, registry, floors):
    area_name = {a["area_id"]: a.get("name") for a in areas}
    area_floor = {a["area_id"]: a.get("floor_id") for a in areas}
    floor_name = {f["floor_id"]: f.get("name") for f in floors}
    dev_area = {d["id"]: d.get("area_id") for d in devices}
    reg = {e["entity_id"]: e for e in registry}
    out = []
    for s in states:
        eid = s["entity_id"]
        attrs = s.get("attributes", {}) or {}
        r = reg.get(eid, {})
        area_id = r.get("area_id") or dev_area.get(r.get("device_id"))
        out.append({
            "entity_id": eid,
            "domain": eid.split(".", 1)[0],
            "name": attrs.get("friendly_name") or eid,
            "state": s.get("state"),
            "unit": attrs.get("unit_of_measurement"),
            "device_class": attrs.get("device_class"),
            "icon": attrs.get("icon") or r.get("icon"),
            "area": area_name.get(area_id),
            "floor": floor_name.get(area_floor.get(area_id)),
            "hidden": bool(r.get("hidden_by")),
            "category": r.get("entity_category"),
        })
    out.sort(key=lambda e: (e["area"] is None, (e["area"] or "").lower(), e["name"].lower()))
    return out


class HAClient:
    def __init__(self, ws_url, token, mode, target):
        self.ws_url = ws_url
        self.token = token
        self.mode = mode
        self.target = target

    async def _session(self, msgs):
        async with websockets.connect(self.ws_url, max_size=None, open_timeout=10) as ws:
            first = json.loads(await ws.recv())
            if first.get("type") == "auth_required":
                await ws.send(json.dumps({"type": "auth", "access_token": self.token}))
                res = json.loads(await ws.recv())
                if res.get("type") != "auth_ok":
                    raise HAError("Anmeldung an Home Assistant fehlgeschlagen: "
                                  + (res.get("message") or "ungültiger Token"), "auth")
            for i, m in enumerate(msgs, 1):
                await ws.send(json.dumps({"id": i, **m}))
            out = {}
            while len(out) < len(msgs):
                r = json.loads(await ws.recv())
                if r.get("type") == "result":
                    out[r["id"]] = r
            return [out[i] for i in range(1, len(msgs) + 1)]

    async def call_many(self, msgs, timeout=30):
        try:
            return await asyncio.wait_for(self._session(msgs), timeout)
        except HAError:
            raise
        except asyncio.TimeoutError:
            raise HAError("Zeitüberschreitung bei der Verbindung zu Home Assistant", "timeout")
        except (OSError, websockets.exceptions.WebSocketException) as e:
            raise HAError(f"Home Assistant nicht erreichbar ({self.target}): {e}", "connect")

    async def call(self, msg):
        r = (await self.call_many([msg]))[0]
        if not r.get("success"):
            err = r.get("error") or {}
            raise HAError(err.get("message") or "Unbekannter Fehler", err.get("code"))
        return r.get("result")

    async def dashboards(self):
        res = await self.call({"type": "lovelace/dashboards/list"})
        out = [{"key": DEFAULT_KEY, "title": "Übersicht (Standard)", "mode": "storage", "icon": "mdi:view-dashboard"}]
        for d in res:
            out.append({"key": d["url_path"], "title": d.get("title") or d["url_path"],
                        "mode": d.get("mode", "storage"), "icon": d.get("icon")})
        return out

    async def entities(self):
        st, ar, dr, er, fl = await self.call_many([
            {"type": "get_states"},
            {"type": "config/area_registry/list"},
            {"type": "config/device_registry/list"},
            {"type": "config/entity_registry/list"},
            {"type": "config/floor_registry/list"},  # ab HA 2024.4
        ])
        if not st.get("success"):
            raise HAError((st.get("error") or {}).get("message", "Zustände nicht lesbar"))
        ok = lambda r: r.get("result") if r.get("success") else []
        return build_entities(st["result"], ok(ar), ok(dr), ok(er), ok(fl))

    async def get_config(self, url_path):
        try:
            return await self.call({"type": "lovelace/config", "url_path": url_path, "force": True})
        except HAError as e:
            if e.code == "config_not_found":
                return {"views": []}
            raise

    async def save_config(self, url_path, config):
        await self.call({"type": "lovelace/config/save", "url_path": url_path, "config": config})

    async def create_dashboard(self, url_path, title, icon=None, show_in_sidebar=True):
        msg = {"type": "lovelace/dashboards/create", "url_path": url_path, "title": title,
               "mode": "storage", "show_in_sidebar": bool(show_in_sidebar), "require_admin": False}
        if icon:
            msg["icon"] = icon
        await self.call(msg)


# --------------------------------------------------------------------------- Demo

def _demo_data():
    areas = [("technikraum", "Technikraum", "keller"), ("buero", "Büro", "keller"),
             ("hobbyraum", "Hobbyraum", "keller"), ("wohnzimmer", "Wohnzimmer", "eg"),
             ("kueche", "Küche", "eg"), ("schlafzimmer", "Schlafzimmer", "og1"),
             ("bad", "Bad", "og1"), ("garten", "Garten", "aussen")]
    floors = [{"floor_id": "keller", "name": "Keller"}, {"floor_id": "eg", "name": "Erdgeschoss"},
              {"floor_id": "og1", "name": "1. Etage"}, {"floor_id": "aussen", "name": "Außen"}]
    states, registry = [], []

    def add(eid, name, state, area, unit=None, dc=None, icon=None):
        attrs = {"friendly_name": name}
        if unit: attrs["unit_of_measurement"] = unit
        if dc: attrs["device_class"] = dc
        if icon: attrs["icon"] = icon
        states.append({"entity_id": eid, "state": state, "attributes": attrs})
        registry.append({"entity_id": eid, "area_id": area})

    climate = {"technikraum": (23.0, 57.1), "buero": (22.1, 60.1), "hobbyraum": (21.3, 58.5),
               "wohnzimmer": (21.9, 55.0), "kueche": (22.4, 54.2), "schlafzimmer": (23.4, 63.5),
               "bad": (21.4, 60.4), "garten": (12.8, 81.0)}
    for aid, name, _ in areas:
        t, h = climate[aid]
        add(f"sensor.{aid}_temperatur", f"{name} Temperatur", str(t), aid, "°C", "temperature")
        add(f"sensor.{aid}_luftfeuchtigkeit", f"{name} Luftfeuchtigkeit", str(h), aid, "%", "humidity")
    for aid, name in [("hobbyraum", "Hobbyraum"), ("technikraum", "Technikraum"), ("bad", "Bad")]:
        add(f"switch.entfeuchter_{aid}", f"Entfeuchter {name}", "off" if aid == "hobbyraum" else "unavailable", aid)
    add("switch.haos_steckdose", "HAOS Steckdose (NUC6)", "on", "technikraum")
    add("switch.kuehlschrank", "Kühlschrank", "on", "kueche")
    add("switch.steckdose_hobbyraum", "Steckdose Hobbyraum", "off", "hobbyraum")
    add("alarm_control_panel.alarmanlage", "Alarmanlage", "disarmed", None)
    add("sensor.frigate_personen_heute", "Personen heute", "3", None, icon="mdi:account-group")
    add("sensor.frigate_bewegungen_heute", "Bewegungen heute", "68", None, icon="mdi:run")
    add("sensor.letzte_bewegung", "Letzte Bewegung", "2026-10-18T11:42:22+00:00", None, dc="timestamp")
    add("sensor.letzte_person", "Letzte Person", "2026-10-18T10:56:22+00:00", None, dc="timestamp")
    add("camera.einfahrt", "Kamera Einfahrt", "idle", "garten")
    add("light.wohnzimmer_decke", "Wohnzimmer Decke", "off", "wohnzimmer")
    add("light.kueche", "Küche Licht", "on", "kueche")
    add("weather.forecast_home", "Wetter", "cloudy", None)
    add("person.stavros", "Stavros", "home", None)
    add("person.nikolas", "Nikolas", "home", None)

    area_list = [{"area_id": a, "name": n, "floor_id": f} for a, n, f in areas]

    config = {"title": "Enterprise", "views": [
        {"title": "Übersicht", "path": "uebersicht", "icon": "mdi:view-dashboard",
         "type": "sections", "max_columns": 4, "sections": [
            {"type": "grid", "column_span": 4, "cards": [
                {"type": "heading", "heading": "Status"},
                {"type": "tile", "entity": "alarm_control_panel.alarmanlage", "grid_options": {"columns": 3}},
                {"type": "tile", "entity": "sensor.schlafzimmer_luftfeuchtigkeit", "name": "Höchste Feuchtigkeit",
                 "grid_options": {"columns": 3}},
                {"type": "tile", "entity": "sensor.frigate_personen_heute", "grid_options": {"columns": 3}},
                {"type": "tile", "entity": "sensor.frigate_bewegungen_heute", "grid_options": {"columns": 3}},
            ]},
            {"type": "grid", "column_span": 2, "cards": [
                {"type": "heading", "heading": "Keller", "icon": "mdi:arrow-down-bold"},
                {"type": "custom:mushroom-template-card", "primary": "Technikraum",
                 "secondary": "{{ states('sensor.technikraum_temperatur') }} °C · {{ states('sensor.technikraum_luftfeuchtigkeit') }} %",
                 "icon": "mdi:server", "entity": "sensor.technikraum_temperatur"},
                {"type": "custom:mushroom-template-card", "primary": "Büro",
                 "secondary": "{{ states('sensor.buero_temperatur') }} °C", "icon": "mdi:desk"},
            ]},
            {"type": "grid", "column_span": 2, "cards": [
                {"type": "heading", "heading": "Steuerung"},
                {"type": "entities", "title": "Entfeuchter",
                 "entities": ["switch.entfeuchter_hobbyraum", "switch.entfeuchter_technikraum", "switch.entfeuchter_bad"]},
            ]},
        ]},
        {"title": "Technikraum", "path": "technikraum", "icon": "mdi:server",
         "cards": [{"type": "entities", "entities": ["sensor.technikraum_temperatur", "switch.haos_steckdose"]}]},
    ]}
    return states, area_list, registry, floors, config


class DemoBackend:
    mode = "demo"
    target = "Demo-Daten"

    def __init__(self):
        self.states, self.areas, self.registry, self.floors, cfg = _demo_data()
        self.configs = {None: cfg, "dashboard-test": {"views": []}}
        self.dash_list = [{"key": "dashboard-test", "title": "Test-Dashboard (Demo)", "mode": "storage", "icon": "mdi:flask"}]

    async def dashboards(self):
        return [{"key": DEFAULT_KEY, "title": "Enterprise (Demo)", "mode": "storage", "icon": "mdi:view-dashboard"},
                *copy.deepcopy(self.dash_list)]

    async def create_dashboard(self, url_path, title, icon=None, show_in_sidebar=True):
        if url_path in self.configs:
            raise HAError(f"Die URL „{url_path}“ ist bereits vergeben", "home_assistant_error")
        self.dash_list.append({"key": url_path, "title": title, "mode": "storage", "icon": icon})
        self.configs[url_path] = {"views": []}

    async def entities(self):
        return build_entities(self.states, self.areas, [], self.registry, self.floors)

    async def get_config(self, url_path):
        return copy.deepcopy(self.configs.get(url_path, {"views": []}))

    async def save_config(self, url_path, config):
        self.configs[url_path] = copy.deepcopy(config)


# --------------------------------------------------------------------------- Auswahl

def _ws_url(http_url):
    u = http_url.rstrip("/")
    if u.startswith("https://"):
        u = "wss://" + u[8:]
    elif u.startswith("http://"):
        u = "ws://" + u[7:]
    elif not u.startswith(("ws://", "wss://")):
        u = "ws://" + u
    return u if u.endswith("/api/websocket") else u + "/api/websocket"


def make_backend():
    opts = {}
    if os.path.exists("/data/options.json"):  # Add-on-Optionen
        try:
            with open("/data/options.json", encoding="utf-8") as f:
                opts = json.load(f) or {}
        except (OSError, ValueError):
            opts = {}
    if os.getenv("DEMO", "").lower() in ("1", "true", "yes"):
        return DemoBackend()
    url = os.getenv("HA_URL") or opts.get("ha_url") or ""
    token = os.getenv("HA_TOKEN") or opts.get("token") or ""
    if token:
        url = url or "http://homeassistant:8123"
        return HAClient(_ws_url(url), token, "direkt", url)
    sup = os.getenv("SUPERVISOR_TOKEN")
    if sup:
        return HAClient("ws://supervisor/core/websocket", sup, "add-on", "Home Assistant (Add-on)")
    print("WARNUNG: Weder HA_TOKEN noch SUPERVISOR_TOKEN gesetzt – starte im Demo-Modus.", flush=True)
    return DemoBackend()
