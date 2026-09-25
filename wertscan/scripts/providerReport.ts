/**
 * Prüfbericht für den echten Anbieterbetrieb (Scrydex + EZB). Nur serverseitig ausführen:
 *
 *   SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… bash wertscan/scripts/provider-report.sh
 *   bash wertscan/scripts/provider-report.sh --mock      (Format-Probe ohne Netzwerk, KEINE echten Daten)
 *
 * Verwendet den produktiven Code (ScrydexProvider, lookupCardMarket, EcbFxRateProvider).
 * Zugangsdaten werden nur als Request-Header verwendet und nie ausgegeben; jede Ausgabe wird
 * zusätzlich auf die Key-/Team-ID-Werte geprüft und notfalls geschwärzt.
 */
import { CardQuery, EcbFxRateProvider, EvidenceResult, FxRateProvider, PriceEvidence, lookupCardMarket } from '../cardData';
import { CardSegment } from '../cardData/cardValuation';
import { CARD_CONDITIONS } from '../cardData/conditions';
import { ScrydexProvider } from '../cardData/scrydexProvider';
import { CARD_STATUS_TO_MARKET_STATUS } from '../marketPricePipeline';

type Env = Record<string, string | undefined>;
type Proc = { env: Env; argv: string[]; exitCode?: number; stdout: { write(text: string): void } };
const proc = (globalThis as unknown as { process: Proc }).process;
const nodeRequire = (globalThis as unknown as { require?: (m: string) => any }).require || require;
const fs = nodeRequire('fs');
const path = nodeRequire('path');

type CaseConfig = {
  id: string;
  beschreibung: string;
  query: CardQuery;
  segment: CardSegment;
  alsoWithVariant?: string;
  allConditions?: boolean;
};

type Json = Record<string, unknown>;
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const MOCK = proc.argv.includes('--mock');
const apiKey = proc.env.SCRYDEX_API_KEY || '';
const teamId = proc.env.SCRYDEX_TEAM_ID || '';

/** Entfernt Zugangsdaten aus jedem Text, bevor er ausgegeben wird. */
function redact(text: string) {
  let out = text;
  [apiKey, teamId].filter(secret => secret && secret.length >= 4).forEach(secret => (out = out.split(secret).join('[GESCHWÄRZT]')));
  return out;
}

// ---------------------------------------------------------------------------
// fetch: echt oder Mock (Mock nur zur Formatprobe, klar gekennzeichnet)
// ---------------------------------------------------------------------------

function mockFetch(): FetchLike {
  const card = (id: string, extra: Json) => ({ id, name: 'Charizard', number: '143', printed_number: '143/S-P', expansion: { id: 'svp', name: 'Promo' }, language: 'Japanese', language_code: 'ja', variants: [{ name: 'holofoil', prices: [{ type: 'raw', condition: 'NM', low: 1500, market: 76, currency: 'USD' }] }], ...extra });
  return async (url: string) => {
    const u = new URL(url);
    let body: unknown = { data: [], page: 1, pageSize: 100, totalCount: 0 };
    if (u.pathname.endsWith('/listings')) {
      body = {
        data: [
          { id: 'm1', source: 'ebay', card_id: 'mock-1', title: 'MOCK Charizard 143/S-P', variant: 'holofoil', price: 19, currency: 'USD', sold_at: '2026-09-01', url: null },
          { id: 'm2', source: 'ebay', card_id: 'mock-1', title: 'MOCK Charizard 143/S-P', variant: 'holofoil', price: 21, currency: 'USD', sold_at: '2026-09-02', url: null },
          { id: 'm3', source: 'ebay', card_id: 'mock-1', title: 'MOCK Charizard 143/S-P PSA 9', variant: 'holofoil', company: 'PSA', grade: '9', price: 300, currency: 'USD', sold_at: '2026-09-03', url: null },
        ],
        page: 1,
        pageSize: 100,
        totalCount: 3,
      };
    } else if (u.pathname.startsWith('/pokemon/v1/cards/')) {
      body = { data: card('mock-1', {}) };
    } else {
      body = { data: [card('mock-1', {})], page: 1, pageSize: 100, totalCount: 1 };
    }
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

const realFetch = (globalThis as unknown as { fetch: FetchLike }).fetch;
const fetchImpl: FetchLike = MOCK ? mockFetch() : realFetch;

// ---------------------------------------------------------------------------
// Rohdaten-Prüfung der Listings (condition-Feld, Paginierung) – direkt, ohne Adapter-Filter
// ---------------------------------------------------------------------------

async function rawListingInspection(cardId: string) {
  const url = 'https://api.scrydex.com/pokemon/v1/cards/' + encodeURIComponent(cardId) + '/listings?days=90&page=1&page_size=100';
  try {
    const response = await fetchImpl(url, { headers: { 'X-Api-Key': apiKey, 'X-Team-ID': teamId, Accept: 'application/json' } });
    const body = (await response.json()) as Json;
    const items = Array.isArray(body?.data) ? (body.data as Json[]) : [];
    return {
      httpStatus: response.status,
      antwortFormat: { page: body?.page ?? null, pageSize: body?.pageSize ?? null, totalCount: body?.totalCount ?? null },
      listingsSeite1: items.length,
      conditionFeldVorhanden: items.filter(item => item.condition !== undefined && item.condition !== null).length,
      conditionWerte: Array.from(new Set(items.map(item => item.condition).filter(value => value != null))),
      ohneSoldAt: items.filter(item => !item.sold_at).length,
      felder: Array.from(new Set(items.flatMap(item => Object.keys(item)))).sort(),
    };
  } catch (error) {
    return { fehler: redact(String(error)) };
  }
}

// ---------------------------------------------------------------------------
// Einzelfall
// ---------------------------------------------------------------------------

const segmentLabel = (segment: CardSegment) =>
  segment.type === 'graded' ? segment.grading.company.toUpperCase() + ' ' + segment.grading.grade : 'Raw ' + (segment.condition || '?');

/** Zeichnet die Belege auf, die der Adapter an die Bewertung übergibt. */
class RecordingProvider extends ScrydexProvider {
  lastEvidence: EvidenceResult | null = null;
  async getPriceEvidence(request: Parameters<ScrydexProvider['getPriceEvidence']>[0]): Promise<EvidenceResult> {
    this.lastEvidence = await super.getPriceEvidence(request);
    return this.lastEvidence;
  }
}

async function runCase(config: CaseConfig, segment: CardSegment, query: CardQuery, fx: FxRateProvider) {
  const provider = new RecordingProvider({ apiKey: apiKey || 'mock', teamId: teamId || 'mock', fetch: fetchImpl });
  const result = await lookupCardMarket(query, segment, { provider, fx });
  const evidence: PriceEvidence[] = provider.lastEvidence?.evidence || [];
  const sold = evidence.filter(row => row.kind === 'sold');
  const guides = evidence.filter(row => row.kind === 'guide');
  const valuation = result.valuation;
  const headlineValue = valuation?.headline.value || null;

  // Invariante: Marktwert nur aus Verkäufen/Angeboten, nie aus Preisführern (z. B. market 76 vs. Verkäufe ~20).
  const valueFromGuides = headlineValue ? headlineValue.evidence.some(row => row.kind === 'guide') : false;
  const guideMarket = guides.filter(row => row.priceType === 'market');

  return {
    fall: config.id,
    beschreibung: config.beschreibung,
    anfrage: { ...query, segment: segmentLabel(segment) },
    scrydexKarte: result.card
      ? {
          id: result.card.cardId,
          name: result.card.name,
          set: { id: result.card.expansionId, name: result.card.expansionName },
          number: result.card.number,
          printed_number: result.card.printedNumber,
          sprache: { language: result.card.language, language_code: result.card.languageCode },
          varianten: result.card.variants.map(variant => variant.name),
          verwendeteVariante: result.variant,
        }
      : null,
    kandidaten: {
      gefunden: result.debug.candidatesFound,
      verbleibend: result.debug.remainingCandidates,
      abgelehnt: result.debug.rejectedCandidates,
      grund: result.debug.matchReason,
    },
    verkaeufe: {
      anzahlGesamt: sold.length,
      jeGrading: sold.reduce<Record<string, number>>((acc, row) => {
        const key = row.grading ? row.grading.company.toUpperCase() + ' ' + row.grading.grade : 'raw';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      jeZustandAusBelegfeld: sold.reduce<Record<string, number>>((acc, row) => {
        const key = row.grading ? 'graded' : row.condition || 'ohne Zustandsangabe';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      originalWaehrungen: Array.from(new Set(sold.map(row => row.currency))),
      alleSeitenGeladen: provider.lastEvidence ? provider.lastEvidence.salesComplete : null,
      geladenVonGesamt: provider.lastEvidence ? provider.lastEvidence.salesLoaded + ' / ' + (provider.lastEvidence.salesTotal ?? 'unbekannt') : null,
    },
    verwendetFuerWert: {
      segment: segmentLabel(segment),
      belegeImSegment: valuation ? valuation.segmentEvidence.exact.length : 0,
      ausgeschlossen: valuation ? valuation.excluded : {},
    },
    marketValue: headlineValue
      ? {
          basis: headlineValue.basis,
          anzahl: headlineValue.count,
          original: headlineValue.median + ' ' + headlineValue.currency + ' (' + headlineValue.low + '–' + headlineValue.high + ')',
          eur: headlineValue.eur ? headlineValue.eur.median + ' EUR (Anzeigewert: ' + headlineValue.eur.note + ')' : 'kein EUR (kein Kurs)',
          eingeschraenkteDatenbasis: headlineValue.limitedData,
        }
      : null,
    preisfuehrerGetrennt: valuation
      ? valuation.priceGuides.map(entry => ({ label: entry.label, preis: entry.price + ' ' + entry.currency, eur: entry.eur ? entry.eur.amount + ' EUR' : null, passtZumExemplar: entry.matchesTarget }))
      : [],
    kontrolle76vs20: {
      marktwertEnthaeltPreisfuehrer: valueFromGuides,
      scrydexMarketWerte: guideMarket.map(row => row.price + ' ' + row.currency + (row.grading ? ' (' + row.grading.company.toUpperCase() + ' ' + row.grading.grade + ')' : ' (raw ' + (row.condition || '?') + ')')),
      marktwertMedian: headlineValue ? headlineValue.median + ' ' + headlineValue.currency : null,
      ergebnis: valueFromGuides ? 'FEHLER: Preisführer im Marktwert' : 'OK: Marktwert nur aus Verkäufen/Angeboten',
    },
    listingRohdaten: result.card ? await rawListingInspection(result.card.cardId) : null,
    wertscanStatus: { kartenanbieter: result.status, pipeline: CARD_STATUS_TO_MARKET_STATUS[result.status], fallbackErlaubt: result.fallbackAllowed },
    meldung: result.message,
    fehler: result.debug.error ? redact(result.debug.error) : null,
  };
}

// ---------------------------------------------------------------------------
// EZB
// ---------------------------------------------------------------------------

async function ecbReport() {
  const now = new Date();
  const ecb = new EcbFxRateProvider({ now: () => now, fetch: MOCK ? async () => ({ ok: true, status: 200, text: async () => "<Cube time='" + now.toISOString().slice(0, 10) + "'><Cube currency='USD' rate='1.1'/><Cube currency='JPY' rate='160'/></Cube>" }) : undefined });
  const usd = await ecb.getRate('USD');
  const jpy = await ecb.getRate('JPY');
  const asOf = usd?.asOf || jpy?.asOf || null;

  let stale: unknown = 'nicht prüfbar (kein Kurssatz geladen)';
  if (asOf) {
    const later = new Date(new Date(asOf + 'T16:00:00Z').getTime() + 10 * 86400000);
    const staleProvider = new EcbFxRateProvider({
      now: () => later,
      fetch: async () => ({ ok: true, status: 200, text: async () => "<Cube time='" + asOf + "'><Cube currency='USD' rate='1.1'/></Cube>" }),
    });
    const staleRate = await staleProvider.getRate('USD');
    stale = { simuliertesDatum: later.toISOString().slice(0, 10), ergebnis: staleRate, ok: staleRate === null };
  }

  const unreachable = new EcbFxRateProvider({ url: 'https://ecb-unreachable.invalid/eurofxref-daily.xml' });
  const unreachableRate = await unreachable.getRate('USD');

  return {
    quelle: MOCK ? 'MOCK' : 'EZB (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)',
    usdZuEur: usd,
    jpyZuEur: jpy,
    kursdatum: asOf,
    beispiel: {
      '100 USD': usd ? Math.round(100 * usd.rate * 100) / 100 + ' EUR (Anzeigewert)' : 'kein Kurs → keine EUR-Anzeige',
      '2.500 JPY': jpy ? Math.round(2500 * jpy.rate * 100) / 100 + ' EUR (Anzeigewert)' : 'kein Kurs → keine EUR-Anzeige',
    },
    veralteterKurs: stale,
    nichtErreichbar: { ergebnis: unreachableRate, ok: unreachableRate === null, hinweis: 'keine Schätzung, keine Ersatzquelle' },
  };
}

// ---------------------------------------------------------------------------
// Hauptprogramm
// ---------------------------------------------------------------------------

async function main() {
  if (!MOCK && (!apiKey || !teamId)) {
    proc.stdout.write('SCRYDEX_API_KEY und SCRYDEX_TEAM_ID als Server-Umgebungsvariablen setzen (oder --mock für eine Formatprobe).\n');
    proc.exitCode = 1;
    return;
  }
  const casesFile = path.join(proc.env.WERTSCAN_DIR || '.', 'scripts', 'provider-report.cases.json');
  const cases: CaseConfig[] = JSON.parse(fs.readFileSync(casesFile, 'utf8')).cases;

  const ecb = await ecbReport();
  const fx: FxRateProvider = {
    getRate: async currency => (currency === 'USD' ? ecb.usdZuEur : currency === 'JPY' ? ecb.jpyZuEur : null),
  };

  const results: unknown[] = [];
  for (const config of cases) {
    const runs: [CardSegment, CardQuery][] = [];
    if (config.allConditions) {
      CARD_CONDITIONS.forEach(condition => runs.push([{ type: 'raw', condition }, config.query]));
    } else {
      runs.push([config.segment, config.query]);
      if (config.alsoWithVariant) runs.push([config.segment, { ...config.query, variant: config.alsoWithVariant }]);
    }
    for (const [segment, query] of runs) {
      try {
        results.push(await runCase(config, segment, query, fx));
      } catch (error) {
        results.push({ fall: config.id, segment: segmentLabel(segment), fehler: redact(String(error)) });
      }
    }
  }

  const report = {
    art: MOCK ? 'MOCK-FORMATPROBE – keine echten Daten' : 'Echter Anbieterbetrieb',
    erstelltAm: new Date().toISOString(),
    zugangsdaten: MOCK ? 'nicht verwendet' : 'serverseitig gesetzt (nicht ausgegeben)',
    scrydex: results,
    ezb: ecb,
  };
  const text = redact(JSON.stringify(report, null, 2));
  const outFile = proc.env.REPORT_FILE;
  if (outFile) fs.writeFileSync(outFile, text + '\n');
  proc.stdout.write(text + '\n');
}

main().catch(error => {
  proc.stdout.write(redact('Prüfbericht abgebrochen: ' + String(error)) + '\n');
  proc.exitCode = 1;
});
