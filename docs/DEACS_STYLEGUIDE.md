# DEACS Styleguide 1.1

Stand: **DEACS V0.13.44**

- Die bestehende DEACS-Optik bleibt erhalten.
- ID steht in Tabellen vor Label.
- Tabellen verwenden nur einen äußeren Rahmen; markierte Zeilen erhalten Hintergrund und linke Akzentlinie.
- Eingabefelder in Tabellen wirken im Ruhezustand wie normale Zellen und werden erst bei Hover/Fokus deutlich.
- CAN-ID, Datenbytes und ASCII verwenden Monospace.
- In der globalen HEX-Anzeige beginnt jeder dargestellte Hexwert mit `0x` und einem kleinen `x`. Das gilt insbesondere für CAN-IDs, Datenbytes, Tabellenzellen, Vorschauen und Detailanzeigen in allen Tabs. In der globalen DEC-Anzeige werden CAN-IDs dezimal ohne `0x` dargestellt; Dateiformate und API-Nutzdaten bleiben davon unberührt.
- Grün kennzeichnet aktive/primäre Aktionen, Rot Fehler oder gefährliche Aktionen.
- Keine zusätzlichen Designrichtungen oder fremden UI-Stile übernehmen.


## UI-Freeze ab V0.12.53-TEST

Die DEACS-Oberfläche gilt ab diesem Stand als strukturell festgelegt.

- Bestehende DEACS-Farben, Tabs, Karten und Bedienmuster bleiben erhalten.
- Keine Umgestaltung in Richtung anderer CAN-Programme.
- Neue Funktionen fügen sich in die vorhandenen Komponenten ein.
- Größere Layoutänderungen erfolgen nur nach ausdrücklicher gemeinsamer Entscheidung.
- Fehlerkorrekturen, notwendige neue Felder und kleine Ausrichtungsverbesserungen bleiben möglich.


## Farbige Funktionsgruppen

- Generator und Analysewerkzeuge: blauer Seitenbalken mit dezenter blauer Tönung.
- Simulator und laufende Live-Daten: grüner Seitenbalken mit dezenter grüner Tönung.
- Steuerung und zugehöriges Ergebnis bzw. Tabelle bilden eine gemeinsame Gruppe.
- Selten benötigte Werkzeuge dürfen aufklappbar und standardmäßig geschlossen sein.
- Die farbigen Gruppen verändern beim Aktivieren weder Größe noch Position.


## Tooltips

Tooltips sind Bestandteil des verbindlichen DEACS-Stils.

### Gestaltung

- Dunkler Anthrazit-Hintergrund, etwas heller als die Hauptfläche.
- Maximalbreite etwa 340 px.
- Rundung 9 px.
- Dezenter Schatten.
- Linker Akzentbalken mit 3 px Breite.
- Normale Schriftgröße etwa 13 px.
- Kurze, verständliche Texte; keine langen Hilfeseiten im Tooltip.
- Abstand zum auslösenden Element etwa 10 px.
- Nur sanftes Ein- und Ausblenden mit etwa 130 ms.
- Keine Skalierung, kein Wabern und keine Größenänderung des Layouts.

### Farben

- Blau: Werkzeuge, Filter, Generator und Einstellungen.
- Grün: Simulator, Live-Daten und erfolgreiche Zustände.
- Orange: Log, Dateiimport/-export und Wiedergabe, sofern diese eine eigene Funktionsgruppe oder einen erklärenden Tooltip bilden.
- Rot: Fehler, Warnungen und kritische Aktionen.
- Neutralgrau: allgemeine Informationen ohne Funktionsfarbe.

### Verwendung

Neue DEACS-Tooltips sollen als eigene `data-tooltip`-Tooltips umgesetzt werden:

```html
<button
  data-tooltip="Startet die interne Simulation ohne CAN-TX."
  class="tooltip-green">
  Simulation starten
</button>
```

Verfügbare Klassen:

```text
tooltip-blue
tooltip-green
tooltip-orange
tooltip-red
tooltip-bottom
tooltip-left
tooltip-right
```

Native Browser-Tooltips über `title` sind nur für knappe technische Bezeichner
ohne Erklärcharakter zulässig. Für sichtbare Bedienhilfen und Erläuterungen
ist verbindlich der DEACS-`data-tooltip`-Stil zu verwenden.


## Einklappbare Funktionsbereiche

Alle größeren DEACS-Funktionsbereiche müssen nach demselben Muster aufgebaut
werden:

1. Einklappbare Kopfzeile mit Pfeil links.
2. Inhalt im gemeinsamen Gruppenrahmen.
3. Start-/Stop-Aktionszeile immer unten.
4. Start-/Stop-Button linksbündig, gleiche Breite und gleiche Höhe.
5. Keine frei schwebenden Startknöpfe an unterschiedlichen Positionen.
6. Generator standardmäßig geschlossen.
7. Selten verwendete Werkzeuge und Wiedergabebereiche standardmäßig geschlossen.
8. Primäre Live-/Arbeitsbereiche dürfen standardmäßig geöffnet sein.

Farben bleiben funktionsgebunden:

- Generator und Werkzeuge: Blau.
- Log und Wiedergabe: Orange.
- Simulator und Live-Daten: Grün.
- Kritische Aktionen und Fehler: Rot.

Beispielstruktur:

```html
<details class="deacsCollapsibleGroup">
  <summary>Bereichsname</summary>
  <div class="deacsGroupBody">
    <!-- Einstellungen und Daten -->
    <div class="sectionActionRow">
      <button>Starten</button>
    </div>
  </div>
</details>
```


### Keine nativen sichtbaren Tooltips

Erklärende Bedienhilfen dürfen nicht über das native HTML-Attribut `title`
angezeigt werden. Dieses erzeugt je nach Browser eine weiße, nicht gestaltbare
Sprechblase.

Verbindlich ist:

```html
data-tooltip="Erklärung"
```

zusammen mit einer DEACS-Farbklasse. Falls JavaScript den Text dynamisch setzt,
muss es `element.dataset.tooltip` verwenden und ein vorhandenes `title`-
Attribut entfernen.


## Import, Export und Dateiauswahl

- Import und Export werden als klar beschriftete Sekundäraktionen dargestellt.
- Das eigentliche HTML-Dateifeld bleibt verborgen; geöffnet wird es über einen normalen DEACS-Button.
- Ein Import darf bestehende Benutzerdaten nicht ohne ausdrückliche Bestätigung ersetzen.
- Erfolgreiche Aktionen, übersprungene ungültige Einträge und Fehler werden über die vorhandenen DEACS-Hinweise gemeldet.
- Dateiformate enthalten eine eindeutige Formatkennung und Versionsnummer, damit inkompatible Dateien sicher abgelehnt werden können.
- Innerhalb einer bestehenden grünen Simulatorgruppe bleiben Import und Export Teil dieser Gruppe; dafür wird keine zusätzliche orange Karte eingeführt.
- Seltene Dateiaktionen dürfen gemeinsam mit weiteren sekundären Aktionen umbrechen, ohne Eingabefelder oder Tabellen zu verschieben.


## Verbindliche Seitenstruktur

Jeder Tab besitzt mindestens einen echten HTML-`details`-Bereich.

- Monitor: Filter sowie CAN-Monitor.
- Übersicht: Werkzeuge sowie CAN-Übersicht.
- Decoded Messages: Werkzeuge sowie Datentabelle.
- Label Dictionary: mindestens ein Bereich.
- TX: mindestens ein Bereich.
- Simulator: Generator, Log-Wiedergabe und Simulator.
- Logs: mindestens ein Bereich.
- Einstellungen: mindestens ein Bereich.

Ein bloßer Kartenrahmen ohne anklickbare Bereichsüberschrift gilt nicht als
DEACS-Bereich. Jeder Bereich muss über seine Kopfzeile ein- und ausklappbar
sein.


## Verbindliche Tabellen- und Eingabemaße

Die folgenden Regeln gelten projektweit für alle bestehenden und neuen Tabs.

### Tabellenüberschriften

- Jede Tabellenüberschrift ist horizontal zentriert über der zugehörigen Datenspalte ausgerichtet.
- Das gilt auch für sortierbare Überschriften, Aktionsspalten und verschachtelte Elemente innerhalb einer Kopfzelle.
- Einzelne Seiten dürfen diese Ausrichtung nicht lokal überschreiben.
- Datenzellen dürfen abhängig vom Inhalt links, rechts oder mittig ausgerichtet sein; die Überschrift bleibt immer zentriert.

### Zentrale CSS-Werte

Gemeinsame Maße werden über zentrale DEACS-Variablen gepflegt:

```css
--deacs-input-height
--deacs-button-height
--deacs-table-header-height
--deacs-table-row-height
--deacs-gap-small
--deacs-gap-normal
--deacs-radius
```

Neue Eingabezeilen, Tabellen und Schaltflächen müssen diese Werte verwenden,
statt abweichende Höhen, Abstände oder Rundungen lokal festzulegen.

## Verbindliche Tabellenkopf-Regel

- Jede Tabellenüberschrift (`th`) ist auf allen Seiten horizontal und vertikal zentriert.
- Spaltenspezifische Links-/Rechtsausrichtung darf ausschließlich auf Datenzellen (`td`) angewendet werden.
- Auch sortierbare Überschriften und darin enthaltene Bedienelemente bleiben zentriert.

## Geometrische Spaltenmittelachse

- Tabellenüberschrift und Datenwert müssen dieselbe geometrische Spaltenmitte verwenden.
- Eingabebeschriftungen stehen mittig über dem zugehörigen Feld.
- Zentrierung darf nicht durch individuelle Padding- oder Pixel-Offsets korrigiert werden.
- Interaktive Zellinhalte füllen die komplette Zellenbreite und zentrieren ihren Inhalt intern.

### TX- und Simulator-Eingabezeilen

- Beschriftungen stehen horizontal exakt mittig über dem zugehörigen Feld.
- ID, DLC, D0-D7 und Intervall verwenden dieselbe geometrische Mittelachse.
- Die Regel gilt für die tatsächlichen Layout-Klassen der Seite; TX verwendet `.txFrameLine`.


## Responsive Verhalten

- Funktionsgruppen und Tabellen bleiben auf schmalen Ansichten horizontal beziehungsweise vertikal erreichbar; Inhalte dürfen nicht unzugänglich abgeschnitten werden.
- Eingabezeilen dürfen in definierte Rasterzeilen umbrechen. Die Zuordnung von Beschriftung und Eingabefeld bleibt dabei eindeutig.
- Aktionsgruppen dürfen umbrechen; Schaltflächen behalten die zentral definierte Höhe und ausreichende Bedienfläche.
- Responsive Regeln dürfen auf breiten Ansichten keine Sprünge oder Verschiebungen beim Aktivieren einer Funktion verursachen.
