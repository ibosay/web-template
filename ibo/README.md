# Servano – Prototyp

Verzeichnis für geprüfte Dienstleistungsbetriebe in Wien. Statische Website ohne Build-Schritt,
ohne Framework und ohne externe Abhängigkeiten – einfach die `index.html` über einen Webserver
öffnen.

## Starten

```sh
# irgendein statischer Server, z. B.
npx serve ibo
# oder
python3 -m http.server 5501 --directory ibo
```

In VS Code funktioniert auch die Erweiterung „Live Server" (Port 5501 ist in
`.vscode/settings.json` vorkonfiguriert).

> `file://` funktioniert grundsätzlich ebenfalls, weil alle Skripte klassische `<script>`-Dateien
> sind. Der lokale Speicher ist dort je nach Browser aber gesperrt, dann fallen Merkliste und
> Formularentwürfe auf einen flüchtigen Speicher zurück.

## Tests

```sh
node ibo/tests/run-tests.js
```

Geprüft werden Suche, Filter, Sortierung, UID-Prüfziffer, Öffnungszeiten, Maskierung sowie die
Verdrahtung zwischen HTML und JavaScript (Element-IDs, interne Links, Icon-Referenzen). Kein
Framework, keine Installation nötig.

## Aufbau

```
ibo/
├── index.html          Suche, Ergebnisliste, Anbieterprofil, Merkliste (eine Seite, Hash-Routing)
├── signup.html         Antrag auf Firmeneintrag
├── verwaltung.html     Admin-Bereich (Anträge, Betriebe, Anfragen)
├── info.html           So funktioniert's + FAQ
├── impressum.html      Offenlegung nach ECG/UGB/MedienG
├── datenschutz.html    Datenschutzerklärung
├── agb.html            Nutzungsbedingungen
├── 404.html            Fehlerseite
├── assets/
│   ├── css/style.css   Design-Tokens, Komponenten, Dark Mode, Druckstile
│   └── js/
│       ├── icons.js    SVG-Sprite (ersetzt die frühere FontAwesome-CDN-Einbindung)
│       ├── util.js     Maskierung, Normalisierung, Validierung, Öffnungszeiten, Speicher
│       ├── data.js     Bezirke, Kategorien, Demo-Betriebe
│       ├── layout.js   gemeinsame Kopf- und Fußzeile, Farbschema
│       ├── app.js      Router, Suche, Ergebnisliste, Profil, Anfrage-Formular
│       ├── signup.js   Registrierung inkl. UID-Prüfung
│       └── admin.js    Verwaltung
└── tests/run-tests.js
```

## Routen

Der Zustand steht in der URL, dadurch funktionieren Zurück-Button, Neuladen und das Teilen von
Links:

| Route                     | Ansicht                                       |
| ------------------------- | --------------------------------------------- |
| `#/`                      | Startseite mit Kategorien und Notdiensten      |
| `#/suche?q=…&bezirk=…`    | Ergebnisliste mit Filtern und Sortierung       |
| `#/anbieter/<slug>`       | Anbieterprofil mit Anfrage-Formular            |
| `#/merkliste`             | lokal gespeicherte Auswahl                     |

Filter-Parameter: `kat`, `offen=1`, `notdienst=1`, `geprueft=1`, `sort=relevanz|name|bezirk|geprueft`.

## Datenmodell

`assets/js/data.js` liefert dieselbe Struktur, die später aus einer API kommen soll. Ein Betrieb
enthält unter anderem:

| Feld                    | Bedeutung                                                      |
| ----------------------- | -------------------------------------------------------------- |
| `slug`                  | sprechende URL                                                  |
| `categories`            | IDs aus `IBO.categories`                                        |
| `hours` / `emergency24` | Öffnungszeiten je Wochentag bzw. durchgehender Notdienst         |
| `verified`              | Gewerbeberechtigung und UID wurden manuell geprüft               |
| `isSponsored`           | bezahlte Platzierung – wird gekennzeichnet, aber nicht bevorzugt |

## Bekannte Grenzen des Prototyps

- **Kein Backend.** Anträge, Anfragen und Statusänderungen liegen im `localStorage` des Geräts.
- **Die Admin-Anmeldung ist keine Sicherheitsfunktion.** Sie blendet lediglich Inhalte ein oder aus
  (Kennwort `servano-demo`). Produktiv gehört der Bereich hinter eine serverseitige
  Authentifizierung mit Rollen und Protokollierung.
- **Firmendaten sind erfunden**, ebenso die Angaben in Impressum, Datenschutz und AGB.
- **Keine echte Registerabfrage.** Die UID wird formal und über die Prüfziffer validiert; der
  Abgleich mit dem Bestätigungsverfahren des BMF und mit GISA muss serverseitig erfolgen.

## Nächste sinnvolle Schritte

1. Backend mit API für Betriebe, Anträge und Anfragen; `data.js` durch einen Abruf ersetzen.
2. Serverseitige Authentifizierung für `verwaltung.html`, dazu Rollen und ein Änderungsprotokoll.
3. Automatischer UID-Abgleich und GISA-Abfrage im Freigabe-Ablauf.
4. Kartenansicht mit selbst gehostetem Kartenmaterial statt eines Links zu OpenStreetMap.
5. Serverseitiges Rendern oder Vorab-Rendern der Profile für Suchmaschinen.
6. Bilder für Betriebe (Logo, Referenzen) inklusive Zuschnitt und Größenvarianten.
