# Verkehrszeichen-Assistent — installierbare Testversion

Der Assistent als eigenständige App: dieselben Bildschirme wie auf der Marketplace-Seite
`/verkehrszeichen`, aber ohne Topbar und Footer, dafür installierbar und ohne Empfang startklar.

Nur zum Testen gedacht. Was der Assistent kann und was nicht, steht in
[`../src/containers/TrafficSignAssistPage/README.md`](../src/containers/TrafficSignAssistPage/README.md)
— besonders der Abschnitt über seine Grenzen.

## Bauen

```sh
node demo/build.js
```

Erzeugt Icons und Bundle nach `demo/dist/` (rund 0,7 MB, sieben Dateien). Beides ist gitignoriert
und wird bei jedem Build neu erzeugt.

## Lokal ausprobieren

```sh
node demo/serve.js        # http://127.0.0.1:8100/
```

Am eigenen Rechner reicht HTTP, weil der Browser `127.0.0.1` als sicheren Kontext behandelt und die
Kamera freigibt.

## Aufs Handy bringen

Am Handy reicht HTTP **nicht**: Kamera und GPS gibt der Browser nur über HTTPS heraus, und `file://`
hilft auch nicht weiter. Die App muss also über HTTPS erreichbar sein. Zwei Wege:

1. **Irgendwo statisch hosten.** Der Inhalt von `demo/dist/` ist eine fertige statische Seite — sie
   braucht keinen Server, keine Datenbank und keine Build-Schritte beim Hoster.
2. **Tunnel zum eigenen Rechner**, wenn es nur um eine schnelle Probefahrt geht:
   `node demo/serve.js` laufen lassen und einen Tunnel-Dienst auf Port 8100 zeigen lassen, der eine
   `https://`-Adresse ausgibt.

Danach am Handy im Browser öffnen und zum Startbildschirm hinzufügen:

- **Android, Chrome**: Menü (drei Punkte) → _App installieren_ bzw. _Zum Startbildschirm hinzufügen_
- **iPhone, Safari**: Teilen-Symbol → _Zum Home-Bildschirm_

Ab dann startet sie wie eine App, im Vollbild und ohne Adressleiste, und läuft auch ohne Empfang.

## Was am Handy anders ist als am Rechner

- **Das Display muss anbleiben.** Die App hält es über die Wake-Lock-Schnittstelle wach, solange sie
  fährt. Wo der Browser das nicht kann, das Display in den Einstellungen länger anlassen.
- **Die App muss im Vordergrund bleiben.** Wechselst du die App oder sperrst das Display, stoppt die
  Kamera. Das ist eine Grenze von Web-Apps, keine der Erkennung.
- **iPhone**: Nur Safari gibt die Kamera an eine Web-App. In Chrome oder Firefox auf iOS
  funktioniert sie nicht.
- **Beim ersten Start** fragt der Browser nach Kamera und Standort. Beides muss erlaubt werden,
  sonst bleibt das Bild schwarz beziehungsweise das Tempo leer.

## Wie sie gebaut ist

| Datei                       | Zweck                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| `index.js`, `App.js`        | Einstieg und Vollbild-Rahmen; der Assistent selbst kommt aus `src/` |
| `slimComponents.js`         | Ersetzt das Komponenten-Barrel der Vorlage — siehe unten            |
| `webpackRules.js`           | Loader-Regeln, geteilt mit dem Vorschau-Skill                       |
| `makeIcons.js`              | Zeichnet die Icons mit dem Schilder-Generator der App               |
| `serviceWorker.template.js` | Offline-Fähigkeit; die Dateiliste füllt `build.js` ein              |

Die App und die Marketplace-Seite teilen sich `useTrafficSignAssistant` und `AssistantScreens`. Es
gibt also keine zweite Fassung des Assistenten, die getrennt gepflegt werden müsste.

`slimComponents.js` ist der Grund, warum das Bundle 0,7 statt 4,1 MB groß ist: Die Bildschirme
importieren aus `src/components`, dem Sammel-Export der gesamten Komponentenbibliothek dieser
Vorlage. Für eine Marketplace-Seite ist das richtig, für eine App mit drei Bildschirmen zieht es 61
nachgeladene Pakete und 755 kB Marketingfotos mit, die nie angefordert werden. Der Demo-Build leitet
diesen Import auf die paar tatsächlich benutzten Komponenten um. In `src/` ändert sich dadurch
nichts.
