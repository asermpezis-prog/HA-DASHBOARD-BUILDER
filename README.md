# HA-DASHBOARD-BUILDER

Visueller Editor für die Home-Assistant-Dashboards (Lovelace) des HAOS. Läuft auf hawk unter **http://hawk:8114**.

1. **Elemente sehen:** alle Entitäten live aus HA, gruppiert nach Etage › Bereich, mit Suche und Filtern. Ein ✓ markiert, was schon im Dashboard verwendet wird. Dazu kommen Bausteine wie Überschrift, Entities-Liste, Text, Mushroom Titel/Chips und Stack.
2. **Drag & Drop:**
   - Entitäten und Bausteine in Abschnitte ziehen.
   - Karten zwischen Abschnitten verschieben, oder auf einen Tab ziehen, um sie in eine andere Ansicht zu verschieben.
   - Abschnitte und Ansichten umsortieren.
   - Eine Entität **auf** eine Entities-Karte ziehen, um eine neue Zeile hinzuzufügen.
3. **Übertragen nach HA:** mit farbiger Diff-Vorschau. Wurde das Dashboard inzwischen direkt in HA geändert, warnt die App.
4. **Versionierung** in `data/versions.db`:
   - Vor jedem Übertragen wird der bisherige HA-Stand automatisch gesichert.
   - Entwürfe lassen sich ohne Übertragen speichern.
   - Jede Version lässt sich vergleichen und zurück in den Editor laden.

Außerdem: Rückgängig/Wiederholen (Strg+Z / Strg+Y), ein YAML-Editor für Karte, Abschnitt, Ansicht und das ganze Dashboard sowie ein YAML-Download.

Die Daten kommen ausschließlich über die WebSocket-API von Home Assistant: `get_states`, Bereichs-, Etagen-, Geräte- und Entitäten-Registry, `lovelace/config` und `lovelace/config/save`.

## Einrichten auf hawk

```bash
cd /POOL/DOCKER/EIGEN/HA-DASHBOARD-BUILDER
mkdir -p data                 # muss sakis gehören, nicht root
cp .env.example .env          # HA_TOKEN eintragen
hawk-deploy
```

Den Token erzeugst du so: in HA unten links auf dein **Profil → Sicherheit → Langlebige Zugangstoken → Token erstellen**. Der Benutzer muss Administrator sein, sonst darf er Dashboards nicht speichern.

Danach kannst du über `http://hawk:8114` auf die App zugreifen. Updates spielst du wie bei allen eigenen Projekten ein: `git pull --ff-only`, dann `hawk-deploy`.

> Wer die App erreicht, kann Dashboards ändern. Setze bei Bedarf `APP_PASSWORD` in `.env`; der Benutzername ist dann beliebig.

## Entwickeln & Testen

```bash
pip install -r requirements.txt
python3 scripts/fetch_icons.py                       # Icons einmalig laden (nicht im Git)
DEMO=1 DATA_DIR=./data PORT=8114 python3 -m app       # mit Beispieldaten, ohne HA
DEMO=1 DATA_DIR=/tmp/hdb python3 -m unittest discover -s tests
```

## Bedienung

| Aktion | So geht's |
|---|---|
| Karte anlegen | Entität aus der Palette in einen Abschnitt ziehen (Kartentyp unter „Neue Karte als“ wählen) |
| Schnell anhängen | Doppelklick auf eine Entität: Sie wird an den letzten Abschnitt angehängt |
| Zeile zu Entities-Karte | Entität mitten auf die Karte ziehen (gestrichelter Rahmen) |
| Neuer Abschnitt | „+ Abschnitt“ oder Element auf das Feld „Neuer Abschnitt“ ziehen |
| Abschnitt verschieben | am Griff ⠿ ziehen; Breite mit ↔-Buttons |
| Karte in andere Ansicht | Karte auf den Tab der Ziel-Ansicht ziehen |
| Karte bearbeiten | Doppelklick oder ✎: YAML-Editor |
| Dashboard kopieren | „Kopieren …“ oben: neues Dashboard in HA anlegen, das Original bleibt unverändert |
| Vorlage speichern | über eine Karte fahren → ★ |
| Vorlage einfügen | Vorlage aus der Palette ziehen → Bereich wählen: Entitäten und Raumname werden getauscht |
| Masonry-Ansicht | „In Abschnitte umwandeln“ macht daraus eine Sections-Ansicht |

**Wichtig:** Änderungen sind erst nach **Übertragen …** in Home Assistant aktiv. „Version speichern“ sichert nur einen Entwurf in der App. Unbekannte Optionen und Karten (custom cards, card-mod usw.) bleiben unverändert erhalten. Dashboards im **YAML-Modus** kann HA nicht über die API speichern; diese kannst du nur ansehen und herunterladen.

## Optional: als HAOS-Add-on

`config.yaml` erlaubt den Betrieb direkt auf HAOS, dann mit Ingress und ohne Token. Dafür kopierst du den Ordner nach `/addons/` und installierst ihn im Add-on Store unter *Lokale Add-ons*. Im Normalbetrieb auf hawk wird diese Datei nicht gebraucht.
