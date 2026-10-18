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

## Bedienung (wie PowerPoint)

| Aktion | So geht's |
|---|---|
| Auswählen | Karte anklicken → blauer Rahmen, rechts erscheint das **Format**-Fenster |
| Ändern | Im Format-Fenster Titel, Werte, Icon, Farben, Hintergrund, Entität einstellen – die Vorschau ändert sich sofort |
| Verschieben | Karte ziehen; die anderen Karten weichen aus, die Karte rastet ein. Auch in andere Abschnitte oder auf einen Ansicht-Reiter |
| Größe | An den Anfassern rechts/unten ziehen (Breite in 12tel, Höhe in Zeilen) oder im Format-Fenster wählen |
| Abschnitt | Über der Abschnitt-Leiste auswählen/ziehen; Breite am blauen Rand rechts |
| Einfügen | Baustein, Vorlage oder Entität aus der linken Leiste auf die Fläche ziehen (oder doppelklicken) |
| Liste ergänzen | Entität mitten auf eine Liste ziehen |
| Menü | Rechtsklick auf Karte, Abschnitt oder Fläche |
| Tastatur | Entf löschen · Strg+C/X/V kopieren/ausschneiden/einfügen · Strg+D duplizieren · Strg+Z/Y · ←/→ Reihenfolge |
| Vorschau | oben PC / Tablet / Handy, unten Zoom |
| Dashboard kopieren | „Kopieren …“: neues Dashboard in HA anlegen, das Original bleibt unverändert |
| Vorlagen | Rechtsklick → „Als Vorlage speichern“; beim Einfügen Raum wählen, Entitäten werden getauscht |
| Sonderfälle | Rechtsklick → „Code bearbeiten …“ |

**Wichtig:** Änderungen sind erst nach **Übertragen …** in Home Assistant aktiv. „Version speichern“ sichert nur einen Entwurf in der App. Unbekannte Optionen und Karten (custom cards, card-mod usw.) bleiben unverändert erhalten. Dashboards im **YAML-Modus** kann HA nicht über die API speichern; diese kannst du nur ansehen und herunterladen.

## Optional: als HAOS-Add-on

`config.yaml` erlaubt den Betrieb direkt auf HAOS, dann mit Ingress und ohne Token. Dafür kopierst du den Ordner nach `/addons/` und installierst ihn im Add-on Store unter *Lokale Add-ons*. Im Normalbetrieb auf hawk wird diese Datei nicht gebraucht.
