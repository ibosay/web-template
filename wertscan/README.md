# WertScan – Marktpreis-Pipeline

**Grundsatz: lieber kein Preis als ein falscher Preis.**

| Datei | Aufgabe |
|---|---|
| `marketPricePipeline.ts` | Einstieg `liveMarketLookup()` / `marketValuation()`. Nicht-Karten-Produkte: Scraping. Sammelkarten: `cardProvider` (Pokémon standardmäßig TCGdex), ergänzend Scraping nur unter strengen Regeln. |
| `cardData/defaultCardProvider.ts` | Erzeugt den Standard-Kartenanbieter für Pokémon (`TcgDexProvider`). |
| `marketDisplay.ts` | Anzeigevertrag v1: `marketValue`, `soldComparables`, `priceGuides`. |
| `cardData/types.ts` | Schnittstelle `CardDataProvider`, `PriceEvidence` (`sold` / `listing` / `guide`), `FxRateProvider`. |
| `cardData/conditions.ts` | **Zentrale Zustands-Taxonomie** (Mint, NM, EX, LP, MP, HP, DM). Keine Umwandlung zwischen Begriffen. |
| `cardData/expansionAliases.ts` | Kontrolliert gepflegte Set-Zuordnungen (z. B. deutsche Setnamen). |
| `cardData/cardIdentity.ts` | Exakte Zuordnung: Kartennummer, Set, Sprache, Variante. |
| `cardData/cardValuation.ts` | Bewertung aus Belegen. |
| `cardData/cardMarketLookup.ts` | Ablauf Provider → Zuordnung → Belege → Bewertung; entscheidet, ob ein Fallback erlaubt ist. |
| `cardData/fx.ts` | `EcbFxRateProvider` (EZB-Referenzkurse), austauschbar. |
| `cardData/tcgdexProvider.ts` | Kostenloser TCGdex-Adapter ohne API-Key. Identität + Preisführer, keine Verkäufe. |
| `cardData/scrydexProvider.ts` | Scrydex-Adapter. **Nur serverseitig.** Nicht über `cardData/index.ts` exportiert. |
| `cardData/testProvider.ts` | Test-Provider und fester Test-Wechselkurs. |
| `scripts/verify-scrydex.mjs` | Prüft Antwortformat und Datenabdeckung gegen die echte Scrydex-API. |
| `scripts/verify-ecb.sh` | Prüft den EZB-Kursanbieter gegen die echte EZB-Quelle. |
| `scripts/provider-report.sh` | Prüfbericht für den echten Anbieterbetrieb (sechs Scrydex-Testfälle + EZB). |
| `docs/display-examples.json` | Beispielausgaben des Anzeigevertrags (aus Tests erzeugt). |

## Regeln

1. Karte zuerst exakt identifizieren: Set, Kartennummer, Variante, Sprache.
2. Keine Preisübernahme bei abweichender Nummer, Sprache, Variante oder Set.
3. Mehrere mögliche Karten (z. B. Sprache oder Variante unbekannt) → „Karte nicht eindeutig zuordenbar“.
4. Raw und Graded strikt getrennt. Graded nur bei exakt gleicher Firma **und** Note.
   Fehlen ausreichende Verkäufe mit exakt gleicher Firma und Note, gibt es **keinen Marktwert**.
   Ungegradete Preise, andere Firmen/Noten und Preisführer ersetzen ihn nie (kein Kartenbasiswert).
5. Verkäufe haben Vorrang vor Angeboten. Beide werden nie zu einem Wert gemischt. **Sammelkarten:** Der Marktwert entsteht ausschließlich aus mindestens 2 passenden Verkäufen; aktive Angebote ergeben nie einen Marktwert und werden nur separat angezeigt (`soldComparables.offers`). Nicht-Karten-Produkte behalten die bisherige Logik.
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

## Technische Status

`market.status` (Pipeline) bzw. `display.status` / `display.statusCategory` (Anzeige):

| Status | Kategorie | Bedeutung | Marktplatz-Fallback |
|---|---|---|---|
| `found` | value | Marktwert aus echten Belegen | – |
| `card_identified_no_market_evidence` | insufficient | Karte eindeutig, Anbieter liefert keine Verkäufe/Angebote | erlaubt |
| `card_identified_insufficient_evidence` | insufficient | Karte eindeutig, zu wenige passende Belege (z. B. < 2, Zustand nicht geführt) | erlaubt |
| `low_sample`, `filtered_all` | insufficient | Marktplatzsuche: zu wenige bzw. keine gültigen Belege | – |
| `card_not_unique` | ambiguous | Karte wirklich mehrdeutig (Sprache/Variante/Set nicht eindeutig) | nein |
| `provider_search_incomplete` | incomplete | Anbietersuche nicht vollständig geladen (totalCount > geladen) – nie positive Zuordnung | nein |
| `card_not_found`, `no_exact_matches`, `unsupported_language` | not_found | exakte Karte nicht gefunden / Widerspruch / Sprache nicht geführt | nein |
| `provider_error`, `sources_unreachable`, `extraction_failed` | technical_error | Anbieter oder Quellen technisch nicht erreichbar | nein |
| `insufficient_identity` | not_identified | Gegenstand zu unsicher identifiziert (z. B. Kartennummer fehlt) | nein |

Details zum Kartenanbieter stehen in `market.cardMarket` (`status`, `fallbackAllowed`, `fallbackReason`, `debug`).

## Scrydex-Suche

Grundsatz: Die Kandidatenmenge, auf der über Eindeutigkeit entschieden wird, stammt nur aus Suchen,
die **nie strenger sind als die eigene exakte Prüfung**. Sonst könnte eine zweite passende Karte
unsichtbar bleiben und fälschlich Eindeutigkeit entstehen.

| Bekannt | Suche(n) |
|---|---|
| vollständige gedruckte Nummer (z. B. `143/S-P`, `223/197`, `SWSH101`) | `printed_number:"…"` – namens- und sprachunabhängig; bei Set-ID zusätzlich `number:…` im Set |
| nur Nummer + Set-ID | `number:…` über `/pokemon/v1/expansions/<id>/cards` |
| nur Nummer, Sprache bekannt, kein Set | `name:"…" number:…` (die Prüfung verlangt dann ohnehin den Namen; nicht exakt, also Obermenge) |
| nur Nummer, sonst | `number:…` global |

Endpunkt ohne Set-ID: bei **sicher bekannter** Sprache `/pokemon/v1/en/cards` bzw. `/pokemon/v1/ja/cards`
(die Sprache ist Teil der exakten Identität), bei unbekannter Sprache immer `/pokemon/v1/cards`.
Das verhindert, dass Nummernsuchen bei bekannter Sprache unnötig bei `provider_search_incomplete` enden.

- Keine exakte Namenssuche (`!name`) für die Kandidatenmenge: Bei bekanntem Set verlangt die Prüfung
  keinen gleichen Namen, `!name` könnte also z. B. eine Promo-Variante als eigenes Kartenobjekt verbergen.
- Kein vorzeitiger Abbruch: alle vorgesehenen Suchen laufen vollständig (paginiert). Liefert
  `printed_number` nichts, wird auf `number` ausgewichen.
- Varianten (Reverse Holo/normal, 1st Edition/Unlimited) liegen bei Scrydex im selben Kartenobjekt
  (`variants[]`) und kommen immer vollständig mit. Ist die Variante unbekannt und gibt es mehrere →
  `card_not_unique`.
- Jede Suche wird vollständig paginiert. Mehr als 5 Seiten (500 Karten) → `provider_search_incomplete`,
  nie eine Zuordnung.

Listings (Verkäufe) werden vollständig paginiert, Sicherheitsgrenze 20 Seiten (2.000 Verkäufe).
Greift sie, wird mit den geladenen Verkäufen gerechnet und der Wert als `limitedData`
(„eingeschränkte Datenbasis: nur X von Y Verkäufen geladen“) gekennzeichnet.

## Set-Aliase pflegen

Neue Einträge in `cardData/expansionAliases.ts` nur für bestätigte Zuordnungen, mit `confirmedBy` und
`confirmedAt`. Verglichen wird exakt (ohne Groß/Klein und Satzzeichen), nie unscharf. Wenn bekannt,
zusätzlich `expansionId` eintragen (per `verify-scrydex.mjs` ermittelbar).

## Kostenlose Übergangslösung: TCGdex + bestehende Marktplatzsuche

Für die Entwicklung ist **kein Scrydex-Abo nötig**. `TcgDexProvider` nutzt die kostenlose,
offene TCGdex-API ohne API-Key.

TCGdex übernimmt in diesem Modus:

1. Kartenidentität in DE/EN/JA (weitere Sprachen können ergänzt werden)
2. Set und Kartennummer
3. Varianten wie normal, Holo, Reverse und 1st Edition, soweit TCGdex sie für die Karte führt
4. Cardmarket- und TCGplayer-Werte ausschließlich als `priceGuides`

TCGdex-Preiswerte werden **nie als Verkauf und nie als Marktwert** behandelt. Für einen Marktwert
greift nach eindeutiger Kartenidentität der bestehende `cardScrapeFallback` und sucht echte
Vergleichsverkäufe. Bei Grading gilt weiterhin: nur exakt gleiche Firma und Note zählen.

**TCGdex ist der Standard-Kartenanbieter für Pokémon.** `liveMarketLookup` erzeugt ihn automatisch
über `createDefaultPokemonCardProvider()` (`cardData/defaultCardProvider.ts`), wenn kein
`cardProvider` übergeben wird. Andere Spiele und Nicht-Karten-Produkte nutzen ihn nicht.
`cardProvider: null` schaltet ihn bewusst ab (nur Marktplatzsuche).

```ts
import { EcbFxRateProvider } from './cardData';

const market = await liveMarketLookup(analysis, { fxRateProvider }); // Pokémon → TCGdex automatisch
const display = buildMarketDisplay(market);
```

Ablauf Pokémon: Bilderkennung → TCGdex-Kandidaten → exakte WertScan-Prüfung (Nummer inkl. Nenner
über `set.cardCount.official`, Set, Sprache, Variante) → TCGdex-Preise nur als `priceGuides` →
bei fehlenden Verkäufen `cardScrapeFallback` → Marktwert nur aus echten, zulässigen Verkäufen.
Ist TCGdex nicht erreichbar: `provider_error`, kein TCGdex-Preis, kein Marktwert, keine Marktplatzsuche.

Wichtig: TCGdex braucht keinen Key. Wenn TCGdex eine Karte nicht eindeutig identifizieren kann,
wird nicht geraten. Scrydex kann später über dieselbe `CardDataProvider`-Schnittstelle wieder
eingeschaltet werden, ohne die Bewertungsregeln zu ändern.

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

- Header `X-Api-Key`, `X-Team-ID`; allgemeiner Endpunkt `/pokemon/v1/cards` (mehrere Sprachen),
  sprachspezifisch `/pokemon/v1/en/cards` und `/pokemon/v1/ja/cards` (nur bei sicher bekannter Sprache genutzt),
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

## Prüfbericht echter Anbieterbetrieb (Scrydex-Testfälle + EZB)

```bash
SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… bash wertscan/scripts/provider-report.sh
# optional zusätzlich als Datei (außerhalb des Repositorys): REPORT_FILE=/tmp/wertscan-bericht.json
# Formatprobe ohne Netzwerk (keine echten Daten): bash wertscan/scripts/provider-report.sh --mock
```

Testkarten in `scripts/provider-report.cases.json` (anpassbar): englische Raw-Karte, japanische Promo
143/S-P, Karte mit Normal/Reverse Holo, Raw-Karte je Zustand NM/LP/MP/HP/DM, PSA-Karte, PCA-Karte.

Je Fall: Scrydex-Karten-ID, Name, Set, `number`, `printed_number`, Sprache, Varianten, Kandidaten
(gefunden/abgelehnt/Grund), Anzahl Verkäufe je Grading und je Zustand (nur aus dem Belegfeld),
Originalwährungen, ob alle Seiten geladen wurden, verwendetes Segment (Firma/Note bzw. Zustand),
Marktwert oder keiner, Preisführer getrennt, Kontrolle „Preisführer nie im Marktwert“ (76 vs. 20),
Rohdaten-Prüfung der Listings (condition-Feld vorhanden?, Antwortformat, Felder) und der
entstehende WertScan-Status. EZB: USD→EUR, JPY→EUR, Kursdatum, veralteter Kurs, Nichterreichbarkeit.

Zugangsdaten werden nur als Header verwendet und nie ausgegeben; die Ausgabe wird zusätzlich
auf Key und Team-ID geprüft und geschwärzt. Berichte nicht ins Repository einchecken.

## Anzeigevertrag für das Frontend (`buildMarketDisplay`, Version 1)

Das Frontend rendert **ausschließlich** `buildMarketDisplay(market)` in drei Bereichen:

| Bereich | Inhalt | Regeln |
|---|---|---|
| `marketValue` | `state` (`value` / `no_value`), `value`, `range`, `basis`, `notes`, `limitedData`, `noValueReason` | Bei `no_value` immer `noValueReason` zeigen, nie einen Preis aus anderen Bereichen. `fxNote` und `original` bei Umrechnung immer zeigen. Alle `notes` zeigen. `limitedData` → Hinweis „eingeschränkte Datenbasis“. |
| `soldComparables` | `sold[]` (Badge „Verkauft“), `offers[]` (Badge „Aktives Angebot“), `emptyText` | Nur echte, zur Karte passende Belege. Auch bei `no_value` sichtbar. |
| `priceGuides` | `items[]` (Badge „Preisführer“), `disclaimer` | Eigener Bereich, eigene Optik, `disclaimer` immer zeigen. Nie in der Verkaufsliste, nie als Marktwert. |

Das Frontend darf **nicht**: Mediane oder Spannen berechnen, Preise zusammenführen, Preisführer in
den Marktwert übernehmen, Währungen umrechnen, Zustände ableiten. Die Optik wird nur über `variant`
(`sold` / `offer` / `guide`) gesteuert. `sortValueEur` dient nur zum Sortieren.

Weitere Felder: `contractVersion`, `status`, `statusCategory`, `message`.

### Beispielausgaben

Gekürzt; vollständige Ausgaben in `docs/display-examples.json` (erzeugt aus den Tests in
`tests/displayExamples.test.ts`, neu erzeugen mit `WRITE_DISPLAY_EXAMPLES=1 bash wertscan/run-tests.sh`).

#### 1. Normale Karte mit echten Verkäufen

```json
{
  "status": "found",
  "statusCategory": "value",
  "marketValue": {
    "state": "value",
    "value": {
      "eur": "297,00 €",
      "original": "330,00 USD",
      "fxNote": "Umgerechneter Anzeigewert, kein Marktpreis der Quelle. Kurs USD→EUR 0.9 (EZB-Referenzkurs, Stand 2026-09-24)."
    },
    "range": {
      "from": "288,00 €",
      "to": "306,00 €"
    },
    "basis": "Median aus Raw-NM-Belegen (tatsächlich verkauft)",
    "notes": [
      "Nur Belege im Zustand NM (Zustand von der Quelle angegeben)."
    ],
    "limitedData": false
  },
  "soldComparables": {
    "sold": [
      {
        "badge": "Verkauft",
        "title": "Charizard 4/102 Base Set",
        "price": "279,00 € (310,00 USD)"
      },
      {
        "badge": "Verkauft",
        "title": "Charizard 4/102 Base Set",
        "price": "297,00 € (330,00 USD)"
      },
      {
        "badge": "Verkauft",
        "title": "Charizard 4/102 Base Set",
        "price": "315,00 € (350,00 USD)"
      }
    ],
    "offers": 0
  },
  "priceGuides": [
    {
      "badge": "Preisführer",
      "label": "Raw NM market",
      "source": "scrydex",
      "price": "810,00 € (900,00 USD)",
      "matchesTarget": true
    }
  ]
}
```

#### 2. Eindeutige Karte ohne genügend Verkäufe

```json
{
  "status": "card_identified_insufficient_evidence",
  "statusCategory": "insufficient",
  "marketValue": {
    "state": "no_value",
    "value": null,
    "noValueReason": "Keine zuverlässige Bewertung möglich: Für den Zustand NM liegen nicht mindestens 2 Marktbelege mit Zustandsangabe vor."
  },
  "soldComparables": {
    "sold": [
      {
        "badge": "Verkauft",
        "title": "Charizard 4/102 Base Set",
        "price": "288,00 € (320,00 USD)"
      }
    ],
    "offers": 0
  },
  "priceGuides": []
}
```

#### 3. Nicht eindeutige Karte (Sprache unbekannt, en + ja vorhanden)

```json
{
  "status": "card_not_unique",
  "statusCategory": "ambiguous",
  "marketValue": {
    "state": "no_value",
    "value": null,
    "noValueReason": "Karte nicht eindeutig zuordenbar. Es wird keine Karte automatisch ausgewählt und kein Preis angezeigt. (Grund: language_unknown_multiple_candidates)"
  },
  "soldComparables": {
    "sold": [],
    "offers": 0
  },
  "priceGuides": []
}
```

#### 4. Gegradete PCA-9,5-Karte ohne PCA-9,5-Verkäufe (PSA 10 und Raw vorhanden)

```json
{
  "status": "card_identified_insufficient_evidence",
  "statusCategory": "insufficient",
  "marketValue": {
    "state": "no_value",
    "value": null,
    "noValueReason": "Keine zuverlässige Bewertung möglich: Für PCA 9,5 liegen nicht mindestens 2 passende Marktbelege vor. Ungegradete Preise, andere Grading-Firmen oder -Noten und Preisführer werden dafür nicht verwendet. Preisführer werden separat angezeigt und sind nicht Teil des Marktwerts."
  },
  "soldComparables": {
    "sold": [],
    "offers": 0
  },
  "priceGuides": [
    {
      "badge": "Preisführer",
      "label": "Raw NM market",
      "source": "scrydex",
      "price": "78,00 € (13.000 JPY)",
      "matchesTarget": false
    }
  ]
}
```

#### 5. Echte Verkäufe um 20 € plus Preisführer 76 €

```json
{
  "status": "found",
  "statusCategory": "value",
  "marketValue": {
    "state": "value",
    "value": {
      "eur": "20,00 €",
      "original": null,
      "fxNote": null
    },
    "range": {
      "from": "19,50 €",
      "to": "20,50 €"
    },
    "basis": "Median aus Raw-NM-Belegen (tatsächlich verkauft)",
    "notes": [
      "Nur Belege im Zustand NM (Zustand von der Quelle angegeben)."
    ],
    "limitedData": false
  },
  "soldComparables": {
    "sold": [
      {
        "badge": "Verkauft",
        "title": "Glurak ex 223/197",
        "price": "19,00 €"
      },
      {
        "badge": "Verkauft",
        "title": "Charizard ex 223/197",
        "price": "20,00 €"
      },
      {
        "badge": "Verkauft",
        "title": "Charizard ex 223/197 SIR",
        "price": "21,00 €"
      }
    ],
    "offers": 0
  },
  "priceGuides": [
    {
      "badge": "Preisführer",
      "label": "Raw NM trend",
      "source": "cardmarket",
      "price": "76,00 €",
      "matchesTarget": true
    }
  ]
}
```

## Freigabe-Checkliste (vor gemeinsamem Testlauf/Deployment)

- [x] Scrydex-Doku geprüft und im Adapter fest eingetragen
- [ ] `provider-report.sh` mit echtem Key ausgeführt (sechs Testfälle + EZB) und Bericht ausgewertet
- [ ] `verify-scrydex.mjs` mit echtem Key ausgeführt (Antwortformat, Datenabdeckung, condition-Filter)
- [ ] `verify-ecb.sh` im Serverbetrieb grün (Netzwerkfreigabe für ecb.europa.eu)
- [ ] Echte Scrydex-Testkarten sauber: normale englische Karte, japanische Promo, Karte mit mehreren
      Varianten, Raw-Karte mit mehreren Zuständen, PSA-Karte, PCA-Karte
- [ ] Frontend auf `buildMarketDisplay` umgestellt (drei Bereiche, Vertrag v1)
- [ ] `bash wertscan/run-tests.sh` grün

## Tests

```bash
bash wertscan/run-tests.sh
```

Kein Netzwerk und kein Scrydex-Key nötig.
