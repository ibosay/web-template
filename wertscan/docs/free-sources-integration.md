# Kostenlose Quellen: eBay Browse API und Google Lens (SerpApi)

Stand: 26.09.2026. Nur kostenlose Dienste, keine Abos.

## Warum

- **eBay-"Verkauft"-Seiten** leiten seit dem 22.07.2026 ohne Login auf die Anmeldung um. Die
  Abrufe liefern nichts, kosten aber Zeit (30-s-Limit der Plattform) und Abrufe. Sie sind jetzt
  standardmäßig aus (`ebaySoldPages: false`).
- **eBay Browse API**: offizielle, kostenlose Schnittstelle (Developers Program, 5.000 Aufrufe/Tag).
  Aktive Sofortkauf-Angebote auf eBay.de und eBay.at, strukturiert, ca. 1 s, wird nicht blockiert.
- **Google Lens über SerpApi (Free-Plan)**: Foto rein, visuell gleiche Angebote mit Preis raus,
  z. B. dasselbe Kleid auf Vinted. Jeder Aufruf verbraucht eine Suche des Monatskontingents.

Beide Quellen laufen **parallel ab Beginn** der Marktsuche (nicht mehr erst nach der KI-Auswertung)
und durch dieselbe strenge Identitätsprüfung wie alle anderen Treffer.

## Dateien

| Datei | Inhalt |
|---|---|
| `sources/ebayBrowseProvider.ts` | `createEbayBrowseProvider({ clientId, clientSecret })` → `MarketProvider` (`ebay_offer`) |
| `sources/googleLensProvider.ts` | `createGoogleLensProvider({ apiKey, image })` → `MarketProvider` (`web_search`), `searchGoogleLens()` |
| `marketPricePipeline.ts` | Option `ebaySoldPages` (Standard aus); `providers` starten parallel zu den Seitenabrufen |
| `tests/freeSources.test.ts` | Tests mit nachgestellten Antworten (Token, Marktplätze, Auktionen, Duplikate, Upload, Grenzen) |

## Schlüssel (kostenlos, nur als App-Secret, nie in Code, Chat oder Logs)

1. **eBay**: developer.ebay.com → Konto anlegen → *Application Keys* → **Production**-Keyset erzeugen.
   Bei der Abfrage zu *Marketplace Account Deletion* die Ausnahme wählen (die App speichert keine
   eBay-Nutzerdaten). Benötigt werden *App ID (Client ID)* und *Cert ID (Client Secret)*.
   Secrets: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.
2. **SerpApi**: serpapi.com → kostenloses Konto → API-Key. Secret: `SERPAPI_API_KEY`.

Fehlt ein Secret, wird die jeweilige Quelle einfach nicht verwendet.

## Einbau in die Live-App (ein Deploy)

1. `backend/sources/ebayBrowseProvider.ts` und `backend/sources/googleLensProvider.ts` anlegen
   (Inhalt wie hier; Import der Typen `MarketProvider`/`MarketProviderListing` aus `../index`).
2. `backend/index.ts`, `buildSearchPages`: die Zeile mit `push('ebay_sold', …LH_Sold=1…)` entfernen.
3. `backend/index.ts`, `liveMarketLookup`: `Promise.allSettled(providers.map(…fetch…))` direkt nach
   `buildSearchPages` starten und das Ergebnis erst an der bisherigen Stelle `await`en.
4. `backend/index.ts`, `buildMarketResult(analysis, lensImage)`: Provider aus den Secrets bauen
   (`secrets.readSecret(...)`, fehlende Secrets überspringen) und an `liveMarketLookup(analysis, { providers })` geben.
5. `POST /api/market`: optionales Feld `lensImage: { data, mimeType }` aus dem Body lesen und an
   `buildMarketResult` weitergeben.
6. `src/App.tsx`, `runMarketSearch`: vom Hauptfoto eine kleine Kopie mitsenden
   (`aiImage.resizeIfNeeded(file, { maxDimension: 640, quality: 0.7, mimeType: 'image/jpeg' })`),
   damit sie unter der SerpApi-Grenze von 500 KB bleibt.

## Grenzen

- Die Browse API liefert **aktive Angebote**, keine Verkäufe. Werte daraus sind als
  Angebotspreise gekennzeichnet. Echte eBay-Verkaufsdaten gibt es kostenlos nicht mehr.
- Lens findet visuell ähnliche Artikel. Die Identitätsprüfung (Marke/Nummer im Titel) bleibt
  unverändert; ein Treffer mit falsch geschriebener Marke im Titel wird weiterhin verworfen.
- SerpApi-Free-Plan: begrenzte Suchen pro Monat. Ist das Kontingent aufgebraucht, antwortet SerpApi
  mit einem Fehler; die übrigen Quellen laufen normal weiter.
