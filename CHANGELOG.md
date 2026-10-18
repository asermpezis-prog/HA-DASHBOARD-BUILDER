# Changelog

## 0.2.0 – 2026-10-18
- Dashboard kopieren: legt in HA ein neues Dashboard mit dem Inhalt des aktuellen an (Stand aus HA oder aus dem Editor) und wechselt zur Kopie.
- Vorlagen: jede Karte mit ★ als Vorlage speichern (in `data/versions.db`), aus der Palette in Abschnitte ziehen.
- Beim Einfügen einer Vorlage Bereich wählen: passende Entitäten (gleiche Domain und Geräteklasse) werden automatisch eingesetzt, der Raumname im Text ersetzt; jede Zuordnung bleibt anpassbar.

## 0.1.0 – 2026-10-18
- Erste Version: Entitäten, Bereiche und Etagen live aus Home Assistant (WebSocket-API).
- Drag & Drop: Karten anlegen, zwischen Abschnitten und Ansichten verschieben, Abschnitte und Ansichten umsortieren, Zeilen in Entities-Karten ergänzen.
- YAML-Editor für Karte, Abschnitt, Ansicht und das ganze Dashboard; Rückgängig/Wiederholen.
- Übertragen nach HA mit Diff-Vorschau und Warnung bei zwischenzeitlichen Änderungen in HA.
- Versionierung in SQLite: Entwürfe, Übertragungen, automatische Sicherung des HA-Stands vor jedem Übertragen; vergleichen und wiederherstellen.
- Betrieb auf hawk (Port 8114, `hawk-deploy`), alternativ als lokales HAOS-Add-on.
