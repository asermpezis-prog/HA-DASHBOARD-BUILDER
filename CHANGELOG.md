# Changelog

## 0.3.0 – 2026-10-18
- Neuer Editor im Stil von PowerPoint/Visio: Das Dashboard wird so gezeichnet, wie es in HA aussieht (Kacheln, Mushroom-Karten, Listen, Überschriften, Hintergründe aus card-mod, Live-Werte).
- Karte anklicken → Auswahlrahmen mit Anfassern; Ziehen verschiebt mit Einrasten (die anderen Karten weichen live aus), Anfasser ändern Breite (12er-Raster) und Höhe (Zeilen); Abschnittsbreite am Rand ziehen.
- Format-Fenster rechts statt YAML: Titel, Werte, Icon, Icon-Farbe, Hintergrund, Entität, Größe, Listen-Zeilen; Ansicht- und Abschnitt-Eigenschaften.
- Rechtsklick-Menü, Tastatur (Entf, Strg+C/X/V/D/Z/Y, Pfeile), Zoom, Vorschau für PC/Tablet/Handy.
- Code-Ansicht nur noch für Sonderfälle („Code bearbeiten …“); Versionen als Reiter im rechten Fenster.

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
