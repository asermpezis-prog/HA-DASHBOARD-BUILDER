"""Tests mit dem Demo-Backend (kein echtes Home Assistant nötig).

Start: DEMO=1 DATA_DIR=/tmp/hdb python3 -m unittest discover -s tests
"""
import asyncio
import os
import tempfile
import unittest

os.environ.setdefault("DEMO", "1")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="hdb-test-"))

import yaml  # noqa: E402

from app import main  # noqa: E402
from app.ha import DEFAULT_KEY, _ws_url  # noqa: E402
from app.store import Store, config_hash  # noqa: E402


def run(coro):
    return asyncio.run(coro)


class TestStore(unittest.TestCase):
    def setUp(self):
        self.store = Store(os.path.join(tempfile.mkdtemp(), "v.db"))

    def test_add_list_get(self):
        vid, new = self.store.add("d", "draft", "eins", {"views": []})
        self.assertTrue(new)
        self.assertEqual(self.store.get(vid)["config"], {"views": []})
        self.assertEqual([v["id"] for v in self.store.list("d")], [vid])
        self.assertEqual(self.store.list("anders"), [])

    def test_dedupe(self):
        a, _ = self.store.add("d", "backup", "", {"x": 1, "y": 2})
        b, new = self.store.add("d", "backup", "", {"y": 2, "x": 1}, dedupe=True)
        self.assertEqual(a, b)
        self.assertFalse(new)

    def test_hash_ignores_key_order(self):
        self.assertEqual(config_hash({"a": 1, "b": 2}), config_hash({"b": 2, "a": 1}))


class TestYamlDiff(unittest.TestCase):
    def test_roundtrip_keeps_order_and_multiline(self):
        cfg = {"type": "custom:mushroom-template-card", "secondary": "Zeile 1\nZeile 2", "entity": "sensor.x",
               "card_mod": {"style": "ha-card { color: red; }"}}
        text = main.to_yaml(cfg)
        self.assertTrue(text.startswith("type:"))
        self.assertIn("|", text)
        self.assertEqual(yaml.safe_load(text), cfg)

    def test_diff(self):
        d = main.make_diff({"a": 1}, {"a": 2})
        self.assertTrue(d["changed"])
        self.assertEqual((d["added"], d["removed"]), (1, 1))
        self.assertFalse(main.make_diff({"a": 1}, {"a": 1})["changed"])

    def test_ws_url(self):
        self.assertEqual(_ws_url("http://192.168.178.102:8123/"), "ws://192.168.178.102:8123/api/websocket")
        self.assertEqual(_ws_url("https://ha.example.de"), "wss://ha.example.de/api/websocket")


class TestApi(unittest.TestCase):
    def test_entities_have_areas(self):
        ents = run(main.entities())
        tech = [e for e in ents if e["entity_id"] == "sensor.technikraum_temperatur"][0]
        self.assertEqual((tech["area"], tech["floor"]), ("Technikraum", "Keller"))

    def test_push_creates_backup_and_version(self):
        r = run(main.get_config(DEFAULT_KEY))
        cfg = r["config"]
        cfg["views"][0]["title"] = "Geändert"
        res = run(main.push({"dashboard": DEFAULT_KEY, "config": cfg, "message": "Test", "base_hash": r["hash"]}))
        self.assertTrue(res["changed"])
        kinds = {v["id"]: v["kind"] for v in run(main.versions(DEFAULT_KEY))}
        self.assertEqual(kinds[res["backup"]], "backup")
        self.assertEqual(kinds[res["version"]], "push")
        self.assertEqual(run(main.get_config(DEFAULT_KEY))["config"]["views"][0]["title"], "Geändert")
        # gleicher Stand nochmal: keine Änderung
        self.assertFalse(run(main.push({"dashboard": DEFAULT_KEY, "config": cfg}))["changed"])

    def test_push_conflict(self):
        r = run(main.get_config("dashboard-test"))
        run(main.push({"dashboard": "dashboard-test", "config": {"views": [{"title": "A"}]}}))
        with self.assertRaises(main.HTTPException) as ctx:
            run(main.push({"dashboard": "dashboard-test", "config": {"views": [{"title": "B"}]},
                           "base_hash": r["hash"]}))
        self.assertEqual(ctx.exception.status_code, 409)
        ok = run(main.push({"dashboard": "dashboard-test", "config": {"views": [{"title": "B"}]},
                            "base_hash": r["hash"], "force": True}))
        self.assertTrue(ok["changed"])

    def test_copy_dashboard(self):
        src = run(main.get_config(DEFAULT_KEY))["config"]
        r = run(main.copy_dashboard({"source": DEFAULT_KEY, "title": "Enterprise Neu", "url_path": "enterprise-neu"}))
        self.assertEqual(r["key"], "enterprise-neu")
        keys = [d["key"] for d in run(main.dashboards())]
        self.assertIn("enterprise-neu", keys)
        copied = run(main.get_config("enterprise-neu"))["config"]
        self.assertEqual(copied["views"], src["views"])
        self.assertEqual(copied["title"], "Enterprise Neu")
        # Original unverändert
        self.assertEqual(run(main.get_config(DEFAULT_KEY))["config"], src)
        # doppelte URL und ungültige URL werden abgelehnt
        for bad in ("enterprise-neu", "ohnebindestrich", "Gross-Buchstaben!"):
            with self.assertRaises(main.HTTPException):
                run(main.copy_dashboard({"source": DEFAULT_KEY, "title": "X", "url_path": bad}))

    def test_copy_uses_editor_config(self):
        cfg = {"views": [{"title": "Nur im Editor"}]}
        r = run(main.copy_dashboard({"source": DEFAULT_KEY, "title": "Aus Editor", "url_path": "aus-editor", "config": cfg}))
        self.assertEqual(run(main.get_config(r["key"]))["config"], cfg)

    def test_templates(self):
        card = {"type": "custom:mushroom-template-card", "primary": "Technikraum",
                "secondary": "{{ states('sensor.technikraum_temperatur') }} °C"}
        tid = run(main.add_template({"name": "Raumkarte", "card": card}))["id"]
        tpls = run(main.templates())
        self.assertEqual([t["card"] for t in tpls if t["id"] == tid], [card])
        run(main.rename_template(tid, {"name": "Raum"}))
        self.assertIn("Raum", [t["name"] for t in run(main.templates())])
        run(main.delete_template(tid))
        self.assertNotIn(tid, [t["id"] for t in run(main.templates())])
        with self.assertRaises(main.HTTPException):
            run(main.add_template({"name": "", "card": card}))

    def test_health(self):
        self.assertTrue(run(main.health())["ok"])


if __name__ == "__main__":
    unittest.main()
