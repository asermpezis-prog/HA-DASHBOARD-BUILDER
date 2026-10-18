# HA-DASHBOARD-BUILDER

Allgemeine Regeln (Git, Ausliefern mit `hawk-deploy`): siehe `/POOL/DOCKER/CLAUDE.md`.

- Visueller Editor für Lovelace-Dashboards des HAOS (192.168.178.102:8123); Port 8114 auf hawk.
- Zugriff auf HA nur über die WebSocket-API (`app/ha.py`); Token nur in `.env`, nie im Git.
- Konfigurationen werden als Ganzes gelesen und gespeichert; unbekannte Schlüssel (custom cards, card-mod …) immer unverändert durchreichen.
- Vor jedem Speichern nach HA sichert `/api/push` den bisherigen HA-Stand in `data/versions.db` – diese Sicherung nie entfernen.
- Icons (`app/static/mdi/`) kommen beim Build über `scripts/fetch_icons.py`, nicht ins Git.
- Bei jeder Änderung: `VERSION`, `CHANGELOG.md` und den `?v=` in `app/static/index.html` nachziehen.
- Tests: `DEMO=1 DATA_DIR=/tmp/hdb python3 -m unittest discover -s tests` (Demo-Backend statt echtem HA).
- `config.yaml` ist nur für den optionalen Betrieb als HAOS-Add-on (Ingress, Port 8099).
