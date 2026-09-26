# Live-Patch für wertscan-wpmt2x (ein Deploy)

Fertig geprüftes Paket für **genau einen** AppDeploy-Deploy. Es wird nichts automatisch deployt.

## Was der Patch behebt

| Problem in der Live-App (v63) | Änderung |
|---|---|
| eBay-"Verkauft"-Seiten leiten seit 22.07.2026 ohne Login auf die Anmeldung um. Sie kosten Zeit im 30-s-Limit und liefern nichts. | Werden nicht mehr abgerufen. |
| Marktplatz-Seiten sind beim Scraping oft blockiert, deshalb häufig **gar keine Preise**. | Kostenlose eBay Browse API (eBay.de/.at, Sofortkauf-Angebote, strukturiert, ca. 1 s). |
| Mode/Einzelstücke ohne Modellnummer werden über den Text kaum gefunden. | Kostenlose Bildsuche (Google Lens über SerpApi): Foto rein, gleiche Angebote mit Preis raus. |
| Strukturierte Quellen liefen erst nach der KI-Auswertung und damit am Ende des Zeitlimits. | Starten sofort, parallel zu den Seitenabrufen, mit eigenem Zeitlimit innerhalb des 25-s-Budgets. |
| Diagnose-Reste aus v59 (`GET /api/_timeout-probe`, `console.warn`-Zusammenfassung). | Entfernt. |

Unverändert bleiben: Bilderkennung, Identitätsprüfung (Marke/Nummer im Titel), Grading-Regeln,
Sammelkarten-Wert nur aus Verkäufen. Werte aus eBay-API und Lens sind **Angebotspreise** und werden
so gekennzeichnet.

Ohne Secrets passiert nichts Zusätzliches: Die jeweilige Quelle wird einfach nicht verwendet.

## Dateien

| Datei | Inhalt |
|---|---|
| `diffs.json` | Exakte Änderungen (`from` → `to`) für `backend/index.ts` (8) und `src/App.tsx` (3) |
| `../sources/*.ts` | Neue Dateien, unverändert nach `backend/sources/` (eigene Typen, kein Import aus der Pipeline) |
| `build-payload.mjs` | Gibt das `files[]`-Feld für den Deploy aus |
| `verify.mjs`, `glue.test.cjs` | Prüfung ohne AppDeploy: TypeScript strict gegen nachgebaute Live-Typen, 5 Laufzeittests |

Prüfen: `node wertscan/live-patch/verify.mjs`

Alle `from`-Stellen wurden gegen den gelesenen Live-Code (v56) plus die Deploys v57–v63 abgeglichen.
AppDeploy bricht einen Deploy ab, wenn eine Stelle nicht oder mehrfach passt; es wird dann nichts
halb eingespielt.

## Ablauf

1. Nutzer trägt die kostenlosen Schlüssel selbst als App-Secrets ein (nie im Chat, Code oder Log):
   `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, optional `SERPAPI_API_KEY`
   (Anleitung: `../docs/free-sources-integration.md`).
2. Nach ausdrücklicher Freigabe: ein `deploy_app` mit `files = build-payload.mjs`-Ausgabe.
3. Test in der App: Kleid, Uhr, PS5, eine Karte. In der Diagnose erscheinen die Quellen
   "eBay Angebot" (API) bzw. "Websuche" (Lens); Fehler einer Quelle stehen unter den
   Auswertungsfehlern, ohne die übrigen Quellen zu stoppen.
4. Rückweg, falls nötig: `apply_app_version` auf v63 (1790403204169).

## Grenzen

- eBay-API: nur aktive Angebote, keine Verkäufe (kostenlos gibt es keine eBay-Verkaufsdaten mehr).
- SerpApi-Free-Plan: begrenzte Suchen pro Monat; jede Marktsuche mit Foto verbraucht eine. Ist das
  Kontingent leer, läuft die Suche ohne Lens weiter.
- PS5 u. a. Elektronik: Die Suche startet weiterhin nur mit lesbarer Modellnummer (z. B. CFI-2016).
  Das ist bewusst streng, damit nicht jedes "Sony"-Produkt als Vergleich zählt.
