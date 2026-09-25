# WertScan – Marktpreis-Pipeline

**Grundsatz: lieber kein Preis als ein falscher Preis.**

| Datei | Aufgabe |
|---|---|
| `marketPricePipeline.ts` | Einstieg `liveMarketLookup()` / `marketValuation()`. Nicht-Karten-Produkte: Scraping. Sammelkarten: `cardProvider`, ergänzend Scraping nur unter strengen Regeln. |
| `marketDisplay.ts` | Anzeigemodell mit drei getrennten Bereichen: Marktwert, Vergleichsverkäufe, Preisführer. |
| `cardData/types.ts` | Schnittstelle `CardDataProvider`, `PriceEvidence` (`sold` / `listing` / `guide`), `FxRateProvider`. |
| `cardData/conditions.ts` | **Zentrale Zustands-Taxonomie** (Mint, NM, EX, LP, MP, HP, DM). Keine Umwandlung zwischen Begriffen. |
| `cardData/expansionAliases.ts` | Kontrolliert gepflegte Set-Zuordnungen (z. B. deutsche Setnamen). |
| `cardData/cardIdentity.ts` | Exakte Zuordnung: Kartennummer, Set, Sprache, Variante. |
| `cardData/cardValuation.ts` | Bewertung aus Belegen. |
| `cardData/cardMarketLookup.ts` | Ablauf Provider → Zuordnung → Belege → Bewertung; entscheidet, ob ein Fallback erlaubt ist. |
| `cardData/fx.ts` | `EcbFxRateProvider` (EZB-Referenzkurse), austauschbar. |
| `cardData/scrydexProvider.ts` | Scrydex-Adapter. **Nur serverseitig.** Nicht über `cardData/index.ts` exportiert. |
| `cardData/testProvider.ts` | Test-Provider und fester Test-Wechselkurs. |
| `scripts/verify-scrydex.mjs` | Prüft die Scrydex-Annahmen gegen echte API-Antworten. |

## Regeln

1. Karte zuerst exakt identifizieren: Set, Kartennummer, Variante, Sprache.
2. Keine Preisübernahme bei abweichender Nummer, Sprache, Variante oder Set.
3. Mehrere mögliche Karten (z. B. Sprache oder Variante unbekannt) → „Karte nicht eindeutig zuordenbar“.
4. Raw und Graded strikt getrennt. Graded nur bei exakt gleicher Firma **und** Note.
5. Verkäufe haben Vorrang vor Angeboten. Beide werden nie zu einem Wert gemischt.
6. Preisführer (Scrydex market, Cardmarket, BrickLink, PriceCharting) nur separat, nie im Marktwert.
7. Zustände nur aus dem Zustandsfeld des Belegs (`conditionSource = 'provider_field'`), nie aus Titeln.
   Ein Anfragefilter zählt nur, wenn er nachweislich verifiziert ist (`trustConditionFilter`, Standard false).
8. Keine Umdeutung von Zuständen (Mint ≠ Near Mint). Führt der Anbieter den Zustand nicht → kein Zustandswert.
9. Keine berechneten Zustandspreise, keine Prozentabschläge, kein Zusammenlegen von Zuständen.
10. Jeder Beleg: Quelle, `observedAt` (laut Quelle), `fetchedAt` und `expiresAt` (WertScan).
11. Unter 2 Belegen → ausdrücklich „keine zuverlässige Bewertung“.
12. Originalpreis und Originalwährung bleiben immer erhalten. EUR ist ein gekennzeichneter Anzeigewert
    mit Kurs, Kursquelle und Stand. Ohne Kurs gibt es keinen EUR-Betrag.

### Ergänzende Marktplatzsuche (`cardScrapeFallback`, Standard aktiv)

| Situation beim Kartenanbieter | Marktplatzsuche |
|---|---|
| Karte eindeutig, zu wenige Preisbelege | erlaubt, nur für genau diese Karte (bestätigte Sprache/Variante gelten für Titel) |
| Karte nicht eindeutig | nein |
| Nummer, Set, Variante oder Sprache widerspricht | nein |
| Setname ohne bestätigten Alias | nein („nicht eindeutig“) |
| Sprache vom Anbieter nicht geführt | nein |
| Anbieter technisch nicht erreichbar | nein |

## Set-Aliase pflegen

Neue Einträge in `cardData/expansionAliases.ts` nur für bestätigte Zuordnungen, mit `confirmedBy` und
`confirmedAt`. Verglichen wird exakt (ohne Groß/Klein und Satzzeichen), nie unscharf. Wenn bekannt,
zusätzlich `expansionId` eintragen (per `verify-scrydex.mjs` ermittelbar).

## Scrydex einrichten (serverseitig)

```ts
import { EcbFxRateProvider } from './cardData';
import { createScrydexProviderFromEnv } from './cardData/scrydexProvider';

const cardProvider = createScrydexProviderFromEnv(); // liest SCRYDEX_API_KEY, SCRYDEX_TEAM_ID
const fxRateProvider = new EcbFxRateProvider();
const market = await liveMarketLookup(analysis, { cardProvider: cardProvider ?? undefined, fxRateProvider });
const display = buildMarketDisplay(market); // für das Frontend
```

`SCRYDEX_API_KEY` und `SCRYDEX_TEAM_ID` nur als Server-Umgebungsvariablen setzen, niemals im Client oder im Repository.

### Laut Scrydex-Dokumentation bestätigt (fest im Adapter)

- Header `X-Api-Key`, `X-Team-ID`; allgemeiner Endpunkt `/pokemon/v1/cards` (keine en/ja-Endpunkte),
  Einzelkarte `/pokemon/v1/cards/<id>`, Set `/pokemon/v1/expansions/<id>/cards`
- `q` Lucene-ähnlich: `!name:…` (exakt), `name:…`, `number:…`, `expansion.id:…`; mehrere Wörter in
  Anführungszeichen (`name:"venusaur v"`, `!name:"lost thunder"`)
- Paginierung: `page`, `page_size` (Standard und Maximum 100); Antwort `page`, `pageSize`, `totalCount`.
  Der Adapter lädt alle Seiten. Ist eine Kartensuche nicht vollständig ladbar, gilt die Karte als
  „nicht eindeutig“ (die richtige Karte könnte fehlen).
- `number` (z. B. 87) und `printed_number` (z. B. 87/160, SWSH101) werden beide gespeichert
- Preise nur mit `include=prices`; Raw NM/LP/MP/HP/DM; Graded mit company/grade (PCA nur, wenn im Datensatz)
- `market/low/mid/high` = Scrydex-Marktindikatoren → **Preisführer**, nie Verkauf
- `/cards/<id>/listings` mit `sold_at` = echte Verkäufe; Datensätze ohne `sold_at` werden nicht verwendet
- Währungen USD und JPY; EUR nur als gekennzeichneter Anzeigewert
- Listing-Objekt ohne garantiertes `condition`-Feld → kein Zustandsfilter, `trustConditionFilter` aus

### Abhängig von der Datenabdeckung – mit echtem Zugang messen

```bash
SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… node wertscan/scripts/verify-scrydex.mjs --name "Charizard" --number 143 --printed "143/S-P"
```

- ob `number` und `printed_number` für die relevanten Karten zuverlässig durchsuchbar sind
- welche Varianten konkrete Karten haben
- welche Grading-Firmen Daten haben, insbesondere PCA
- ob echte Listings zusätzlich ein `condition`-Feld enthalten
- ob `condition=NM` ausschließlich NM-Verkäufe liefert (bis dahin bleibt `trustConditionFilter` aus)

Zusätzlich prüft das Skript, ob die echten Antworten dem dokumentierten Format entsprechen.

## Frontend

Nur `buildMarketDisplay(market)` rendern. Drei Bereiche:

- **Marktwert:** Wert oder ausdrücklich `noValueReason`. Bei Umrechnung immer Originalbetrag und `fxNote` zeigen.
- **Vergleichsverkäufe:** `sold` (Badge „Verkauft“) und getrennt `offers` (Badge „Aktives Angebot“).
- **Preisführer:** eigener Bereich mit `disclaimer`, Badge „Preisführer“, eigene Optik. Nie in der Verkaufsliste.

## Freigabe-Checkliste (vor gemeinsamem Testlauf/Deployment)

- [x] Scrydex-Doku geprüft und im Adapter fest eingetragen
- [ ] `verify-scrydex.mjs` mit echtem Key ausgeführt (Antwortformat, Datenabdeckung, condition-Filter)
- [ ] EZB-Kurse im Serverbetrieb abrufbar (Netzwerkfreigabe für ecb.europa.eu)
- [ ] Frontend auf `buildMarketDisplay` umgestellt (drei Bereiche)
- [ ] `bash wertscan/run-tests.sh` grün

## Tests

```bash
bash wertscan/run-tests.sh
```

Kein Netzwerk und kein Scrydex-Key nötig.
