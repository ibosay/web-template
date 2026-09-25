# WertScan – Marktpreis-Pipeline

| Datei | Aufgabe |
|---|---|
| `marketPricePipeline.ts` | Einstieg `liveMarketLookup()` / `marketValuation()`. Nicht-Karten-Produkte: Scraping. Sammelkarten: `cardProvider`, sonst Scraping. |
| `cardData/types.ts` | Schnittstelle `CardDataProvider`, `PriceEvidence` (`sold` / `listing` / `guide`), `FxRateProvider`. |
| `cardData/cardIdentity.ts` | Exakte Zuordnung: Kartennummer, Set, Sprache, Variante. Mehrere Kandidaten → „nicht eindeutig“. |
| `cardData/cardValuation.ts` | Bewertung: Verkäufe vor Angeboten, nie gemischt; Preisführer getrennt; Raw/Graded getrennt; keine abgeleiteten Zustandspreise. |
| `cardData/cardMarketLookup.ts` | Ablauf Provider → Zuordnung → Belege → Bewertung, mit Status und Diagnose. |
| `cardData/scrydexProvider.ts` | Scrydex-Adapter. **Nur serverseitig.** Nicht über `cardData/index.ts` exportiert. |
| `cardData/testProvider.ts` | Test-Provider und fester Test-Wechselkurs. |

## Regeln

1. Karte zuerst exakt identifizieren (Set, Kartennummer, Variante, Sprache).
2. Keine Preisübernahme bei abweichender Kartennummer, Sprache, Variante oder Set.
3. Raw und Graded strikt getrennt; Graded nur bei exakt gleicher Firma **und** Note.
4. Verkäufe haben Vorrang vor Angeboten; beide werden nie zu einem Wert gemischt.
5. Preisführer (Scrydex market, Cardmarket, BrickLink, PriceCharting) nur separat in `priceGuides`.
6. Keine berechneten Zustandspreise, keine Prozentabschläge, kein Zusammenlegen von Zuständen.
7. Jeder Beleg: Quelle, `observedAt` (laut Quelle), `fetchedAt` und `expiresAt` (WertScan).
8. Zu wenige Belege (unter 2) → ausdrücklich „keine zuverlässige Bewertung“.
9. Originalwährung bleibt erhalten. EUR ist ein gekennzeichneter Anzeigewert mit Kursquelle und Stand.

## Scrydex einrichten (serverseitig)

```ts
import { createScrydexProviderFromEnv } from './cardData/scrydexProvider';

const cardProvider = createScrydexProviderFromEnv(); // liest SCRYDEX_API_KEY, SCRYDEX_TEAM_ID
const market = await liveMarketLookup(analysis, { cardProvider: cardProvider ?? undefined, fxRateProvider });
```

`SCRYDEX_API_KEY` und `SCRYDEX_TEAM_ID` nur als Server-Umgebungsvariablen setzen, niemals im Client oder im Repository.
`fxRateProvider` muss echte Kurse liefern (z. B. EZB-Referenzkurse); ohne Kurs wird kein EUR-Betrag angezeigt.

### Vor Livebetrieb gegen die Scrydex-Doku prüfen (im Code mit „PRÜFEN“ markiert)

- Namen der Auth-Header (`X-Api-Key`, `X-Team-ID` angenommen)
- `q`-Syntax (`name:"…" number:"…" expansion.id:"…"`)
- Pfade der sprachspezifischen Endpunkte (Standard: allgemeiner Endpunkt, Sprache prüft WertScan)
- Antwort-Wrapper (`{ data: [...] }`) und Paginierung der Listings

## Tests

```bash
bash wertscan/run-tests.sh
```

Kein Netzwerk und kein Scrydex-Key nötig.
