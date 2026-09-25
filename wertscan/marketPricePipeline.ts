/**
 * WertScan – Marktpreis-Pipeline (korrigierte Fassung, Stand 2)
 *
 * Ersetzt 1:1 die folgenden bestehenden Funktionen/Konstanten:
 *   marketRowSchema, marketExtractSchema, marketSearchVariants, cleanMarketRows,
 *   emptyConditionMarketPrice, emptyConditionPriceSet, conditionMarketPrice,
 *   detectedConditionKey, dedupeMarketRows, marketMedian, liveMarketLookup, marketValuation
 *
 * Unverändert weiterverwendet (bestehende Helfer aus WertScan, hier nicht neu definiert):
 *   normalize, isUnknown, clamp01, median, quantile, iqrFilter, isValidGtin, isValidIsbn,
 *   digitsOnly, categorySignals, isCasioWatch, isHotWheelsAnalysis, marketQuery, cardmarketGamePath,
 *   productAliasQueries, ai (ai.scrape / ai.extract), Typen Analysis und Valuation.
 *
 * Die Bilderkennung wird nicht angefasst.
 *
 * Grundsatz: Jeder ausgegebene Preis stammt aus einem externen Marktbeleg, dessen Preistext
 * nachweislich im abgerufenen Quelltext steht. Es gibt keine Seed-, Schätz- oder Offline-Preise.
 *
 * Gegradete Sammelkarten: Marktwert NUR aus Belegen mit exakt gleicher Grading-Firma UND Note.
 *   Fehlen diese, gibt es keinen Marktwert. Ungegradete Preise, andere Firmen/Noten und
 *   Preisführer ersetzen ihn nie (es gibt keinen Kartenbasiswert als Ersatz).
 *
 * Diagnose: MarketData.debug zeigt für jeden Schritt, wo Belege verloren gehen
 * (formatMarketDebug(debug) liefert eine lesbare Textfassung).
 *
 * Sammelkarten mit konfiguriertem CardDataProvider (z. B. Scrydex) laufen NICHT über Scraping,
 * sondern über ./cardData (exakte Zuordnung, strukturierte Belege). Nicht-Karten-Produkte
 * sind davon unberührt.
 *
 * Feste Regeln (für alle Produkte):
 *   - Verkäufe haben Vorrang; Verkäufe und Angebote werden nie zu einem Wert gemischt.
 *   - Preisführer (BrickLink, PriceCharting, Cardmarket) sind nie Teil des Marktwerts,
 *     sondern werden separat in MarketData.priceGuides ausgewiesen.
 *   - Keine Zusammenlegung verschiedener Zustände, keine abgeleiteten Zustandspreise.
 *   - Jeder Beleg trägt Quelle, observedAt, fetchedAt und expiresAt.
 */

import {
  CardDataProvider,
  CardMarketResult,
  CardQuery,
  CardSegment,
  EurConversion,
  FxCache,
  FxRateProvider,
  MatchOptions,
  PriceEvidence,
  PriceGuideEntry,
  ValueSummary,
  lookupCardMarket,
  normalizeGrading,
  normalizeLanguage,
  normalizeCardCondition,
  CardCondition,
  toEur,
  variantKey,
} from './cardData';
import { createDefaultPokemonCardProvider } from './cardData/defaultCardProvider';
import {
  IdentityDecision,
  ObjectIdentityInput,
  buildSearchQueries as buildObjectSearchQueries,
  decideIdentity as decideObjectIdentity,
  evaluateCandidate as evaluateObjectCandidate,
  objectIdentityFromAnalysis,
} from './objectMatching';

// ---------------------------------------------------------------------------
// Quellen: EINE Quelle der Wahrheit für Typ, Schema, Prompt und Anzeige.
// ---------------------------------------------------------------------------

export const SOURCE_KEYS = [
  'ebay_sold',
  'ebay_offer',
  'willhaben_offer',
  'geizhals_offer',
  'mediamarkt_offer',
  'bricklink_guide',
  'cardmarket_offer',
  'pricecharting_guide',
  'chrono24_offer',
  'abebooks_offer',
  'discogs_offer',
  'web_search',
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

type ConditionKey = 'new' | 'likeNew' | 'used' | 'defective';

type SourceMeta = {
  display: string;
  kind: 'sold' | 'offer' | 'guide';
  /** Händlerquelle: Treffer ohne Zustandsangabe gelten als Neuware. */
  retailNew: boolean;
};

const SOURCE_META: Record<SourceKey, SourceMeta> = {
  ebay_sold: { display: 'eBay verkauft', kind: 'sold', retailNew: false },
  ebay_offer: { display: 'eBay Angebot', kind: 'offer', retailNew: false },
  willhaben_offer: { display: 'Willhaben Angebot', kind: 'offer', retailNew: false },
  geizhals_offer: { display: 'Geizhals Angebot', kind: 'offer', retailNew: true },
  mediamarkt_offer: { display: 'MediaMarkt Angebot', kind: 'offer', retailNew: true },
  bricklink_guide: { display: 'BrickLink Marktindikator', kind: 'guide', retailNew: false },
  cardmarket_offer: { display: 'Cardmarket Preisführer', kind: 'guide', retailNew: false },
  pricecharting_guide: { display: 'PriceCharting Marktindikator', kind: 'guide', retailNew: false },
  chrono24_offer: { display: 'Chrono24', kind: 'offer', retailNew: false },
  abebooks_offer: { display: 'AbeBooks', kind: 'offer', retailNew: false },
  discogs_offer: { display: 'Discogs', kind: 'offer', retailNew: false },
  web_search: { display: 'Websuche', kind: 'offer', retailNew: false },
};

// ---------------------------------------------------------------------------
// Typen (abwärtskompatibel erweitert: alle ursprünglichen Felder bleiben erhalten)
// ---------------------------------------------------------------------------

export type MarketListing = {
  source: string;
  title: string;
  /** Wörtlicher Zusatzbeleg aus demselben Markt Treffer, nie aus der Suchanfrage ergänzt. */
  identityEvidence?: string;
  price: number;
  currency: 'EUR';
  condition: string;
  date: string;
  type: 'sold' | 'offer';
  url: string;
  relevance: number;
  // neu, optional:
  sourceKey?: SourceKey;
  kind?: 'listing' | 'guide';
  conditionGroup?: ConditionKey;
  /** 'raw' oder z. B. 'pca 9.5'; nur bei Sammelkarten gesetzt. */
  grading?: string;
  /** Sammelkarten: 'exact' = exakt gleiche Firma+Note, 'raw' = ungegradet (Basiswert). */
  gradingClass?: 'exact' | 'raw';
  /** true = Beleg zählt nur für den Kartenbasiswert, nie als Grading-Vergleich. */
  rawCardBase?: boolean;
  originalPrice?: number;
  originalCurrency?: string;
  /** Zeitpunkt laut Quelle (Verkaufs-/Angebotsdatum); null, wenn die Quelle keinen liefert. */
  observedAt?: string | null;
  /** WertScan: Abrufzeitpunkt. */
  fetchedAt?: string;
  /** WertScan: Ablauf des Belegs (Cache). */
  expiresAt?: string;
  /** Nur bei umgerechneten Beträgen: Kurs, Kursquelle, Stand. */
  eurConversion?: EurConversion | null;
};

type ConditionMarketPrice = {
  price: number | null;
  from: number | null;
  to: number | null;
  soldCount: number;
  offerCount: number;
  sampleCount: number;
  basis: string;
  status: 'ok' | 'low_sample' | 'none';
  /** Genau ein echter Beleg: wird gezeigt, aber NICHT als Marktpreis ausgegeben. */
  referencePrice: number | null;
};

type ConditionPriceSet = {
  new: ConditionMarketPrice;
  likeNew: ConditionMarketPrice;
  used: ConditionMarketPrice;
  defective: ConditionMarketPrice;
};

export type MarketSearchStatus =
  | 'loading'
  | 'found'
  | 'low_sample'
  | 'sources_unreachable'
  | 'no_exact_matches'
  | 'extraction_failed'
  | 'filtered_all'
  | 'insufficient_identity'
  | 'card_not_unique'
  | 'provider_search_incomplete'
  | 'card_identified_no_market_evidence'
  | 'card_identified_insufficient_evidence'
  | 'card_not_found'
  | 'unsupported_language'
  | 'provider_error';

/** Was die Oberfläche als Hauptwert anzeigen soll – statt pauschal "Preisreferenzen fehlen". */
export type MarketHeadline = {
  kind: 'condition' | 'exact_grading' | 'reference' | 'none';
  price: number | null;
  from: number | null;
  to: number | null;
  /** Nur bei kind 'reference': ein einzelner echter Beleg, kein Marktpreis. */
  referencePrice: number | null;
  soldCount: number;
  offerCount: number;
  sampleCount: number;
  basis: string;
  note: string;
  /** Originalwerte der Quelle, wenn nicht in EUR (z. B. USD/JPY bei Scrydex). */
  original: { price: number; from: number; to: number; currency: string } | null;
  /** Hinweis zur Umrechnung: EUR ist ein Anzeigewert, kein Marktpreis der Quelle. */
  fxNote: string;
  /** true = nicht alle Verkäufe beim Anbieter geladen → eingeschränkte Datenbasis. */
  limitedData: boolean;
};

type QueryRole = 'base' | 'grading' | 'product';

type QueryPlanEntry = { index: number; role: QueryRole; query: string };

type UnreadableReason = 'http_error' | 'scrape_failed' | 'timeout' | 'empty' | 'blocked' | 'no_prices';

export type PageDebug = {
  sourceKey: SourceKey;
  display: string;
  role: QueryRole;
  queryIndex: number;
  query: string;
  url: string;
  httpStatus: number | null;
  readable: boolean;
  unreadableReason: UnreadableReason | null;
  textChars: number;
  condensedChars: number;
  priceSignals: number;
  /** Zeilen im Rohtext, die exakt die gesuchte Identität nennen (Karte: Kartennummer). */
  identityMentionsRaw: number;
  /** Dieselbe Zählung nach condenseListingText – Differenz = Verlust durch Verdichtung. */
  identityMentionsCondensed: number;
  rawListings: number;
  validatedListings: number;
  extractionError: string | null;
  textPreview: string;
};

export type LossStage =
  | 'none'
  | 'identity_gate'
  | 'fetch'
  | 'source_content'
  | 'condense'
  | 'extraction'
  | 'validation'
  | 'aggregation'
  | 'card_provider';

export type MarketDebug = {
  marketSearchStatus: MarketSearchStatus;
  lossStage: LossStage;
  lossExplanation: string;
  isCard: boolean;
  cardNumberCanonical: string;
  targetGrading: string;
  queriesGenerated: QueryPlanEntry[];
  pagesRequested: PageDebug[];
  pagesReadable: number;
  priceSignalsFound: number;
  identityMentionsInPages: number;
  identityMentionsAfterCondense: number;
  rawListingsExtracted: number;
  validatedListings: number;
  rawCardListings: number;
  exactGradingListings: number;
  duplicatesRemoved: number;
  rejectedListings: number;
  rejectionReasons: Record<string, number>;
  rejectedSamples: { source: string; title: string; priceText: string; reason: string }[];
  acceptedSamples: { source: string; title: string; price: number; class: string }[];
  extractionErrors: string[];
  cardBaseValue: ConditionMarketPrice | null;
  exactGradingValue: ConditionMarketPrice | null;
  headline: MarketHeadline;
  priceGuidesFound: number;
  cardProvider:
    | (CardMarketResult['debug'] & { providerId: string; status: string; message: string; cardId: string | null; variant: string | null })
    | null;
};

export type MarketData = {
  connected: boolean;
  query: string;
  searchedQueries: string[];
  /** Nur Quellen, deren Inhalt tatsächlich lesbar war. */
  sourcesChecked: string[];
  soldComparables: MarketListing[];
  currentOffers: MarketListing[];
  soldMedian: number | null;
  offerMedian: number | null;
  conditionPrices: ConditionPriceSet;
  searchedAt: string;
  message: string;
  // neu:
  status: MarketSearchStatus;
  headline: MarketHeadline;
  /** A. Kartenbasiswert: ungegradete Belege derselben Karte (nur bei gegradeten Karten). */
  cardBaseValue: ConditionMarketPrice | null;
  /** B. Direkter Grading-Vergleich: nur exakt gleiche Firma + Note. */
  exactGradingValue: ConditionMarketPrice | null;
  debug: MarketDebug;
  /** @deprecated gleiche Referenz wie debug (Kompatibilität zur vorherigen Fassung). */
  diagnostics: MarketDebug;
  /** Preisführer – separat, nie Teil des Marktwerts. */
  priceGuides: PriceGuideEntry[];
  /** Ergebnis des Kartendatenanbieters (nur Sammelkarten mit CardDataProvider). */
  cardMarket: CardMarketResult | null;
  /** Flohmarkt Identität für Nicht Karten Produkte. Keine Preisberechnung, nur Matching Qualität. */
  objectMatch?: {
    mode: IdentityDecision['mode'];
    quality: IdentityDecision['quality'];
    score: number;
    label: IdentityDecision['valuationPolicy']['label'];
    marketValueAllowed: boolean;
    comparisonRangeAllowed: boolean;
    minimumComparableCount: number;
    requiredSearchTerms: string[];
    missingExactFields: string[];
    explanation: string[];
  } | null;
};

export type MarketProviderListing = {
  title: string;
  price: number;
  currency: string;
  conditionText: string;
  date: string;
  url: string;
};

export type MarketProvider = {
  sourceKey: SourceKey;
  fetch: (ctx: { analysis: Analysis; queries: string[] }) => Promise<MarketProviderListing[]>;
};

export type MarketLookupOptions = {
  /** Echte, tagesaktuelle Kurse (z. B. EZB). Ohne Kurs werden Nicht-EUR-Preise verworfen, nie geraten. */
  fxRatesToEur?: Record<string, number>;
  providers?: MarketProvider[];
  scrapeTimeoutMs?: number;
  extractTimeoutMs?: number;
  scrapeConcurrency?: number;
  extractConcurrency?: number;
  /** Wird immer mit ('debug', MarketDebug) aufgerufen. Standard: formatierte Ausgabe per console.info. */
  log?: (event: string, data: unknown) => void;
  /**
   * Kartendatenanbieter. Nicht angegeben (undefined): Standard für Pokémon ist der kostenlose
   * TcgDexProvider (createDefaultPokemonCardProvider). Ein anderer Anbieter (z. B. ScrydexProvider)
   * kann explizit übergeben werden. null: bewusst kein Kartenanbieter, nur Marktplatzsuche.
   */
  cardProvider?: CardDataProvider | null;
  /** Spiele, für die der Provider genutzt wird. Standard: ['pokemon']. */
  cardProviderGames?: string[];
  /** Echte Wechselkurse für die EUR-Anzeige von Provider-Preisen. */
  fxRateProvider?: FxRateProvider;
  /** Kontrolliert gepflegte Set-Zuordnungen. Standard: EXPANSION_ALIASES (cardData/expansionAliases.ts). */
  expansionAliases?: MatchOptions['expansionAliases'];
  /** Zeitraum für Verkäufe beim Provider. Standard 90 Tage. */
  soldWithinDays?: number;
  /**
   * Ergänzende Marktplatzsuche NUR, wenn der Anbieter die Karte eindeutig kennt und lediglich
   * Preisdaten fehlen. Nie bei nicht eindeutiger Identität oder Widerspruch bei Nummer, Set,
   * Variante oder Sprache; nie bei nicht geführter Sprache oder Anbieterfehler. Standard: true.
   */
  cardScrapeFallback?: boolean;
  /** Gültigkeit gescrapter Belege (expiresAt). Standard 24 h. */
  scrapeEvidenceTtlMs?: number;
};

// ---------------------------------------------------------------------------
// Extraktions-Schema: das Modell nennt nur die sectionId, nie die Quelle.
// ---------------------------------------------------------------------------

const MAX_ITEMS_PER_EXTRACT = 25;

const marketRowSchema = {
  type: 'object',
  properties: {
    sectionId: { type: 'integer', minimum: 0 },
    title: { type: 'string' },
    identityEvidence: { type: 'string' },
    priceText: { type: 'string' },
    price: { type: 'number' },
    currency: { type: 'string', enum: ['EUR', 'USD', 'GBP', 'CHF', 'OTHER'] },
    conditionText: { type: 'string' },
    conditionGroup: { type: 'string', enum: ['new', 'likeNew', 'used', 'defective', 'unknown'] },
    grading: { type: 'string' },
    date: { type: 'string' },
    relevance: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'sectionId',
    'title',
    'identityEvidence',
    'priceText',
    'price',
    'currency',
    'conditionText',
    'conditionGroup',
    'grading',
    'date',
    'relevance',
  ],
};

const marketExtractSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', maxItems: MAX_ITEMS_PER_EXTRACT, items: marketRowSchema },
  },
  required: ['items'],
};

type ExtractedMarketRow = {
  sectionId: number;
  title: string;
  identityEvidence: string;
  priceText: string;
  price: number;
  currency: string;
  conditionText: string;
  conditionGroup: ConditionKey | 'unknown';
  grading: string;
  date: string;
  relevance: number;
};

// ---------------------------------------------------------------------------
// Kleine lokale Helfer
// ---------------------------------------------------------------------------

const known = (value?: string | null) => (value && !isUnknown(value) ? String(value).trim() : '');

const foldText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

const looseTokens = (value: string) => foldText(value).split(/[^a-z0-9]+/).filter(Boolean);

const compactId = (value: string) => looseTokens(value).join('');

const collapse = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasLettersAndDigits = (token: string) => /[a-z]/.test(token) && /\d/.test(token);

/** Unter 20 € auf Cent runden (Karten für 0,40 € dürfen nicht zu 1 € werden), sonst ganze Euro. */
const roundPrice = (value: number) => (value < 20 ? Math.round(value * 100) / 100 : Math.round(value));

const formatEuro = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: value < 20 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';

function countBy(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout:' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Scrape-Ergebnis robust lesen
// FIX: Bisher wurde nur result.status (Zahl) und result.text gelesen. Liefert ai.scrape z. B.
//      { statusCode, markdown } oder rohes HTML, galten ALLE Quellen als unlesbar
//      (→ "sources_unreachable", 0 Belege), obwohl Listings vorhanden waren.
// ---------------------------------------------------------------------------

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/span|\/a|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&euro;|&#8364;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

function readScrapeResult(result: unknown): { status: number | null; text: string } {
  if (typeof result === 'string') {
    return { status: null, text: /<(div|span|li|a|body)\b/i.test(result) ? htmlToText(result) : result };
  }
  const r = (result || {}) as Record<string, unknown>;
  const rawStatus = r.status ?? r.statusCode ?? r.httpStatus ?? r.code;
  const numeric = rawStatus == null || rawStatus === '' ? NaN : Number(rawStatus);
  const candidates = [r.text, r.markdown, r.content, r.body, r.html].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  let text = candidates[0] || '';
  if (text && /<(div|span|li|a|body)\b/i.test(text.slice(0, 20000))) text = htmlToText(text);
  return { status: Number.isFinite(numeric) ? numeric : null, text };
}

// ---------------------------------------------------------------------------
// Preiserkennung und Verdichtung
// FIX: condenseListingText behielt nur 3 Zeilen VOR einem Preis. Bei eBay stehen zwischen Titel
//      und Preis oft Zustand, Verkäufer, "Top-Rated", Verkaufsdatum → Titel fiel weg, das Modell
//      konnte Titel und Preis nicht mehr zuordnen. Außerdem wurden kurze Seiten an "12. Sep"
//      zerschnitten. Jetzt: großzügiges Fenster, Zeilen mit der gesuchten Identität werden
//      immer behalten, Verlust wird in debug gemessen.
// ---------------------------------------------------------------------------

const PRICE_SOURCE =
  '(?:€|EUR|US\\$|\\$|£|CHF)\\s?\\d{1,3}(?:[.\\s\']\\d{3})*(?:[.,]\\d{1,2})?' +
  '|\\d{1,3}(?:[.\\s\']\\d{3})*(?:[.,]\\d{1,2}|,-)?\\s?(?:€|EUR|US\\$|\\$|£|CHF)';
const PRICE_TEST = new RegExp(PRICE_SOURCE, 'i');

const BLOCK_PATTERN =
  /captcha|are you a robot|bist du ein mensch|pardon our interruption|access denied|zugriff verweigert|just a moment|checking your browser|enable javascript|javascript (?:aktivieren|einschalten)|unusual traffic|ungewöhnlichen datenverkehr|bevor sie zu google|before you continue|request blocked|attention required|verify you are human/i;

function countPriceSignals(text: string) {
  return (text.match(new RegExp(PRICE_SOURCE, 'gi')) || []).length;
}

function splitLines(text: string) {
  let lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // Nur echte Fließtext-Blobs (sehr lange Zeilen) aufteilen – nicht an Datumsangaben wie "12. Sep".
  if (lines.some(line => line.length > 600)) {
    lines = lines.flatMap(line => (line.length > 600 ? line.split(/\s{2,}| \| | · /) : [line])).filter(Boolean);
  }
  return lines;
}

function condenseListingText(text: string, maxChars = 9000, keepLine?: (line: string) => boolean) {
  const lines = splitLines(text);
  const keep = new Set<number>();
  const keepRange = (from: number, to: number) => {
    for (let j = Math.max(0, from); j <= Math.min(lines.length - 1, to); j++) keep.add(j);
  };
  lines.forEach((line, index) => {
    if (PRICE_TEST.test(line)) keepRange(index - 7, index + 2);
    if (keepLine && keepLine(line)) keepRange(index - 1, index + 8);
  });
  return [...keep]
    .sort((a, b) => a - b)
    .map(index => lines[index])
    .join('\n')
    .slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// Preis-Parsing und Beleg-Prüfung
// ---------------------------------------------------------------------------

/** Parst "1.234,56 €", "1,234.56", "€ 12", "12,-" robust. */
function parseLocalePrice(raw: string): number | null {
  const match = String(raw || '')
    .replace(/\s/g, '')
    .match(/\d[\d.,']*/);
  if (!match) return null;
  let s = match[0].replace(/'/g, '').replace(/[.,]-?$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    s = parts.length > 2 || tail.length === 3 ? parts.join('') : parts.slice(0, -1).join('') + '.' + tail;
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

function currencyOf(priceText: string, fallback: string) {
  const t = String(priceText || '').toLowerCase();
  if (t.includes('€') || /\beur\b/.test(t)) return 'EUR';
  if (t.includes('us$') || t.includes('$') || /\busd\b/.test(t)) return 'USD';
  if (t.includes('£') || /\bgbp\b/.test(t)) return 'GBP';
  if (/\bchf\b/.test(t)) return 'CHF';
  return (fallback || 'EUR').toUpperCase();
}

const isPriceRange = (priceText: string) => /\b(bis|to)\b/i.test(priceText) || /\d\s*[-–]\s*\d/.test(priceText);

function priceVariants(price: number) {
  const fixed = price.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withThousands = (sep: string) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const variants = [withThousands('.') + ',' + dec, intPart + ',' + dec, withThousands(',') + '.' + dec, fixed];
  if (dec === '00') variants.push(withThousands('.'), intPart, intPart + ',-');
  return Array.from(new Set(variants));
}

/** Der Preis muss nachweislich im Quelltext stehen – sonst ist er erfunden. */
function priceGrounded(priceText: string, price: number, haystack: string) {
  const needle = collapse(priceText);
  if (needle.length >= 2 && haystack.includes(needle)) return true;
  const currency = '(?:€|eur|us\\$|\\$|£|chf)';
  return priceVariants(price).some(variant => {
    const v = escapeRegExp(variant);
    return new RegExp(currency + '\\s?' + v + '(?![\\d])|(?<![\\d.,])' + v + '\\s?' + currency, 'i').test(haystack);
  });
}

/** Mindestens die Hälfte der Titelwörter muss im Quelltext stehen (Modell darf kürzen, nicht erfinden). */
function titleGrounded(title: string, haystackTokens: Set<string>) {
  const tokens = looseTokens(title).filter(token => token.length >= 3);
  if (!tokens.length) return true; // z. B. rein japanischer Titel: Preisprüfung trägt allein
  return tokens.filter(token => haystackTokens.has(token)).length / tokens.length >= 0.5;
}

/**
 * Identitätsbeleg muss als Tokenfolge im selben Quellabschnitt vorkommen.
 * Kleine Lücken sind erlaubt, damit Labels wie "Material:" oder Satzzeichen nicht stören.
 * So darf das Extraktionsmodell keine Merkmale aus Suchanfrage oder Vorwissen einschleusen.
 */
function identityEvidenceGrounded(evidence: string, section: ReadableSection) {
  const expected = looseTokens(evidence).filter(token => token.length >= 2);
  if (!expected.length) return true;
  if (expected.length > 32) return false;
  const source = looseTokens(section.text);
  for (let start = 0; start < source.length; start++) {
    if (source[start] !== expected[0]) continue;
    let cursor = start + 1;
    let ok = true;
    for (let i = 1; i < expected.length; i++) {
      let found = -1;
      for (let j = cursor; j < Math.min(source.length, cursor + 4); j++) {
        if (source[j] === expected[i]) {
          found = j;
          break;
        }
      }
      if (found < 0) {
        ok = false;
        break;
      }
      cursor = found + 1;
    }
    if (ok) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Zustandsgruppen
// ---------------------------------------------------------------------------

function conditionGroupFromText(text: string): ConditionKey | null {
  const n = ' ' + looseTokens(text).join(' ') + ' ';
  if (n.trim() === '') return null;
  const negatedDefect = / (nicht|kein|keine|ohne|no) (defekt|defekte|kaputt|defects?) /.test(n);
  if (
    !negatedDefect &&
    / (defekt|defekte|kaputt|bastler\w*|ersatzteil\w*|ersatzteilspender|for parts|not working|broken|defective|beschadigt|damaged|poor|funktioniert nicht) /.test(
      n
    )
  ) {
    return 'defective';
  }
  if (/ (neuwertig\w*|wie neu|like new|sehr gut|near mint|mint|nm|hervorragend|top zustand) /.test(n)) {
    return 'likeNew';
  }
  if (
    / (gebraucht|used|pre owned|preowned|getragen|bespielt|gut|akzeptabel|played|lightly played|excellent|refurbished|generaluberholt) /.test(
      n
    )
  ) {
    return 'used';
  }
  if (/ (neu|new|brandneu|neuware|ovp|originalverpackt|versiegelt|sealed|ungeoffnet|unbenutzt|unopened|bnib|nib) /.test(n)) {
    return 'new';
  }
  return null;
}

/** Bestehende Signatur bleibt erhalten. */
function detectedConditionKey(condition: string): ConditionKey {
  return conditionGroupFromText(condition) || 'used';
}

// ---------------------------------------------------------------------------
// Sammelkarten: Erkennung, Kartennummer, Grading
// ---------------------------------------------------------------------------

/**
 * FIX: Bisher galt eine Analyse nur als Sammelkarte, wenn category exakt "Sammelkarten" oder
 * objectType exakt "Sammelkarte" war. Bei "Pokémon Karten", "Trading Card" o. Ä. lief die Karte
 * durch die Produktlogik (Queries "Pokémon", "Pokémon Karte", keine Nummernprüfung, kein Grading).
 */
function isCardAnalysis(analysis: Analysis) {
  const category = normalize(analysis.category);
  const objectType = normalize(analysis.objectType);
  if (category === 'sammelkarten' || objectType === 'sammelkarte') return true;
  const c = analysis.cardDetails;
  return Boolean(c && (known(c.cardNumber) || known(c.cardName)));
}

/** Folge normalisierter Token einer Kartennummer: "143/S P", "143/S-P Promo", "#143/SP" → 143,s,p */
function cardNumberTokens(raw: string): string[] {
  const tokens = looseTokens(raw).map(token => (/^\d+$/.test(token) ? String(Number(token)) : token));
  while (tokens.length > 1 && /^(nr|no|nummer|number|card|karte)$/.test(tokens[0])) tokens.shift();
  // Nachgestellte Wörter (Promo, Holo, Secret, Rare …) gehören nicht zur Nummer.
  while (tokens.length > 1 && /^[a-z]{3,}$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

const normalizeIdChunk = (value: string) => value.replace(/(^|[a-z])0+(\d)/g, '$1$2');

/**
 * Suchtaugliche Schreibweise: "143/S P" → "143/S-P", "143/S-P Promo" → "143/S-P", "158/147" bleibt.
 * FIX: Die erkannte Schreibweise "143/S P" ging bisher unverändert in eBay-URLs; die Listings
 *      schreiben "143/S-P".
 */
function canonicalCardNumber(raw: string) {
  const value = String(raw || '').trim().replace(/^#\s*/, '');
  const match = value.match(/^([A-Za-z]{0,4}\d{1,4}[A-Za-z]?)\s*\/\s*(.+)$/);
  if (!match) {
    const parts = value.split(/\s+/).filter(Boolean);
    while (parts.length > 1 && /^[A-Za-z]{3,}$/.test(parts[parts.length - 1])) parts.pop();
    return parts.join(' ');
  }
  const right = match[2]
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((part, index) => index === 0 || !/^[A-Za-z]{3,}$/.test(part));
  return match[1] + '/' + right.join('-').toUpperCase();
}

type Grading = { company: string; grade: string };

const GRADER_NAMES = ['psa', 'bgs', 'beckett', 'cgc', 'pca', 'sgc', 'ace', 'tag', 'ags', 'gma', 'mnt', 'ccc', 'hga', 'ksa', 'pgs', 'ggs'];
const MAJOR_GRADERS = ['psa', 'bgs', 'cgc'];
const GRADED_MARKERS = ['graded', 'gegradet', 'gradiert', 'slab', 'slabbed'];

const normalizeGrader = (company: string) => (company === 'beckett' ? 'bgs' : company);

/**
 * Liefert Firma+Note, { company, grade: '' } bei erkennbarem, aber unklarem Grading, sonst null.
 * FIX: Bisher musste die Note direkt hinter der Firma stehen. "PSA GEM MINT 10", "PCA Gem Mint 9.5"
 *      oder "CGC Pristine 10" wurden als UNGEGRADET gewertet → teure Slabs verfälschten den
 *      Rohkartenwert, echte PCA-9,5-Vergleiche gingen verloren. "TAG TEAM"/"ACE SPEC" sind keine Grader.
 */
function gradingOf(text: string): Grading | null {
  const tokens = foldText(text).match(/[a-z]+|\d+(?:[.,]\d)?/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!GRADER_NAMES.includes(token)) continue;
    const nextToken = tokens[i + 1] || '';
    if ((token === 'tag' && nextToken === 'team') || (token === 'ace' && nextToken === 'spec')) continue;
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 5); j++) {
      const candidate = tokens[j].replace(',', '.');
      if (!/^\d+(\.\d)?$/.test(candidate)) continue;
      const value = Number(candidate);
      if (value >= 1 && value <= 10 && (Number.isInteger(value) || candidate.endsWith('.5'))) {
        return { company: normalizeGrader(token), grade: String(value) };
      }
    }
    return { company: normalizeGrader(token), grade: '' };
  }
  if (tokens.some(token => GRADED_MARKERS.includes(token))) return { company: '', grade: '' };
  return null;
}

/**
 * FIX: Bisher nur gradingCompany + grade im festen Format. "9,5 Mint" o. Ä. ergab die Note
 *      "mint 9.5" → kein Treffer konnte je exakt passen. Jetzt robust über mehrere Felder.
 */
function targetGrading(analysis: Analysis): Grading | null {
  const c = analysis.cardDetails;
  const fromFields = gradingOf([known(c?.gradingCompany), known(c?.grade)].join(' '));
  if (fromFields && fromFields.company) return fromFields;
  const fromCondition = gradingOf(analysis.condition);
  if (fromCondition && fromCondition.company) return fromCondition;
  const fromTitle = gradingOf(analysis.title);
  if (fromTitle && fromTitle.company) return fromTitle;
  const company = compactId(known(c?.gradingCompany));
  return company ? { company: normalizeGrader(company), grade: '' } : null;
}

const formatGrading = (grading: Grading | null) =>
  grading ? (grading.company.toUpperCase() + ' ' + grading.grade.replace('.', ',')).trim() : '';

function isGradedCard(analysis: Analysis) {
  return isCardAnalysis(analysis) && Boolean(targetGrading(analysis));
}

/** Zustandsgruppe des gescannten Gegenstands (gegradete Karten ⇒ likeNew). */
function targetConditionKey(analysis: Analysis): ConditionKey {
  if (isGradedCard(analysis)) return 'likeNew';
  return detectedConditionKey(analysis.condition);
}

// ---------------------------------------------------------------------------
// Identitätsprofil
// ---------------------------------------------------------------------------

const VARIANT_WORDS = ['pro', 'max', 'mini', 'plus', 'ultra', 'lite'];
const COVERAGE_STOPWORDS = new Set(['und', 'mit', 'for', 'fur', 'the', 'der', 'die', 'das', 'neu', 'gebraucht', 'preis']);
const ACCESSORY_WORDS = ['hulle', 'schutzhulle', 'silikonhulle', 'cover', 'skin', 'sticker', 'aufkleber', 'schutzfolie', 'panzerglas', 'displayschutz', 'etui'];
const LOT_WORDS = ['konvolut', 'sammlung', 'lot', 'bundle', 'bulk', 'paket'];
const FAKE_CARD_WORDS = ['proxy', 'fake', 'custom', 'replica', 'orica', 'fanart'];
const GENERIC_SET_WORDS = new Set(['promo', 'promos', 'card', 'cards', 'karte', 'karten', 'pokemon', 'holo', 'rare', 'japanese', 'japanisch', 'english', 'deutsch', 'edition', 'set', 'the', 'and']);

type IdentityProfile = {
  isCard: boolean;
  cardNumberTokens: string[];
  cardNumberConcat: string;
  cardNumberLead: string;
  cardNameTokens: string[];
  setTokens: string[];
  primaryHardTokens: string[];
  boostTokens: string[];
  identityTokens: Set<string>;
  generation: string | null;
  matchQueries: string[];
  grading: Grading | null;
  /** Sprache/Variante der gescannten Karte, nur wenn die Erkennung sie liefert. */
  cardLanguage: string | null;
  cardVariant: string | null;
  /** Zustand des Exemplars in der zentralen Karten-Taxonomie (nur Raw-Karten relevant). */
  cardCondition: CardCondition | null;
  /** Zustandsgruppe, in der gültige Kartenbelege landen. */
  targetKey: ConditionKey;
  /** Kategorieabhängige Flohmarkt Identität. Für Karten bleibt die bestehende Kartenlogik maßgeblich. */
  objectIdentity: ObjectIdentityInput | null;
  objectDecision: IdentityDecision | null;
};

function generationOf(text: string): string | null {
  const t = String(text || '').toLowerCase();
  const match =
    t.match(/(\d{1,2})\s*(?:\.|st|nd|rd|th)?\s*(?:gen\b|gen\.|generation|generación)/) ||
    t.match(/\bgen(?:eration)?\s*(\d{1,2})\b/);
  return match ? match[1] : null;
}

function buildIdentityProfile(analysis: Analysis, queries: string[]): IdentityProfile {
  const d = analysis.universalDetails;
  const c = analysis.cardDetails;
  const isCard = isCardAnalysis(analysis) && Boolean(c);
  const numberTokens = cardNumberTokens(known(c?.cardNumber));
  const model = known(analysis.model) || known(d?.modelName);
  const brand = known(analysis.brand) || known(d?.manufacturer);
  const identityText = [
    brand,
    model,
    analysis.title,
    known(d?.generation),
    known(d?.editionOrVariant),
    known(d?.modelNumber),
    known(d?.skuOrPartNumber),
    known(c?.cardName),
    known(c?.setName),
    ...productAliasQueries(analysis),
  ].join(' ');
  const modelTokens = looseTokens(model).filter(token => !looseTokens(brand).includes(token));
  const objectIdentity = !isCard ? objectIdentityFromAnalysis(analysis) : null;
  const objectDecision = objectIdentity ? decideObjectIdentity(objectIdentity) : null;
  return {
    isCard,
    cardNumberTokens: numberTokens,
    cardNumberConcat: normalizeIdChunk(numberTokens.join('')),
    cardNumberLead: numberTokens.find(token => /^\d+$/.test(token)) || '',
    cardNameTokens: looseTokens(known(c?.cardName)),
    setTokens: looseTokens(known(c?.setName)).filter(token => token.length >= 3 && !GENERIC_SET_WORDS.has(token)),
    primaryHardTokens: modelTokens.filter(token => token.length >= 3 && hasLettersAndDigits(token)),
    boostTokens: [known(d?.modelNumber), known(d?.skuOrPartNumber)].map(compactId).filter(token => token.length >= 4),
    identityTokens: new Set(looseTokens(identityText)),
    generation: generationOf([model, known(d?.generation), analysis.title].join(' ')),
    matchQueries: queries,
    grading: isCard ? targetGrading(analysis) : null,
    cardLanguage: isCard ? normalizeLanguage(cardDetailText(analysis, 'language')) : null,
    cardVariant: isCard ? variantKey(cardDetailText(analysis, 'variant')) : null,
    cardCondition: isCard ? normalizeCardCondition(analysis.condition) : null,
    targetKey: targetConditionKey(analysis),
    objectIdentity,
    objectDecision,
  };
}

/**
 * Exakter Kartennummer-Treffer als zusammenhängende Token-Folge.
 * FIX: Bisher Teilstring-Suche im zusammengeklebten Titel ("143sp" passte in "143 spanish").
 */
function hasExactCardNumber(tokens: string[], profile: IdentityProfile) {
  if (!profile.cardNumberConcat) return false;
  const normalized = tokens.map(token => (/^\d+$/.test(token) ? String(Number(token)) : token));
  for (let i = 0; i < normalized.length; i++) {
    let joined = '';
    for (let j = i; j < Math.min(normalized.length, i + 6); j++) {
      joined = normalizeIdChunk(joined + normalized[j]);
      if (joined === profile.cardNumberConcat) {
        // Folgetoken darf die Nummer nicht verlängern (143/S-P vs. 143/S-PX).
        return true;
      }
      if (joined.length >= profile.cardNumberConcat.length) break;
    }
  }
  return false;
}

/**
 * 'exact' = Kartennummer exakt; 'lead' = nur Hauptnummer + Name/Set; 'name' = keine Nummer bekannt.
 * FIX: "Charizard Promo 143/SV-P" (andere Karte!) wurde über "143" + "promo" akzeptiert.
 *      Steht im Titel eine andere vollständige Nummer mit derselben Hauptnummer, wird abgelehnt.
 */
function cardIdentityMatch(title: string, profile: IdentityProfile): 'exact' | 'lead' | 'name' | null {
  const tokens = looseTokens(title);
  const tokenSet = new Set(tokens.map(token => (/^\d+$/.test(token) ? String(Number(token)) : token)));
  if (profile.cardNumberConcat) {
    if (hasExactCardNumber(tokens, profile)) return 'exact';
    if (!profile.cardNumberLead || !tokenSet.has(profile.cardNumberLead)) return null;
    const otherFullNumber = new RegExp('(^|[^\\d])0*' + profile.cardNumberLead + '\\s*/\\s*[a-z0-9]', 'i').test(foldText(title));
    if (otherFullNumber) return null;
    const nameMatches = profile.cardNameTokens.length > 0 && profile.cardNameTokens.every(token => tokenSet.has(token));
    const setMatches = profile.setTokens.some(token => tokenSet.has(token));
    return nameMatches || setMatches ? 'lead' : null;
  }
  return profile.cardNameTokens.length && profile.cardNameTokens.every(token => tokenSet.has(token)) ? 'name' : null;
}

function queryCoverage(query: string, titleTokens: Set<string>) {
  const tokens = looseTokens(query).filter(token => token.length >= 2 && !COVERAGE_STOPWORDS.has(token));
  if (!tokens.length) return 0;
  return tokens.filter(token => titleTokens.has(token)).length / tokens.length;
}

/** Gibt einen Ablehnungsgrund zurück oder null, wenn der Titel zur Identität passt. */
function identityRejection(title: string, profile: IdentityProfile): string | null {
  const tokens = looseTokens(title);
  const tokenSet = new Set(tokens);
  const compact = tokens.join('');
  const text = ' ' + tokens.join(' ') + ' ';

  if (/^(suche|tausche|ankauf|kaufe|wtb|wanted)\b/.test(tokens.join(' '))) return 'wanted_ad';
  if (text.includes(' shop on ebay ') || text.includes(' neues angebot ')) return 'placeholder';
  if (/ (leerkarton|nur ovp|nur box|nur karton|nur verpackung|empty box|box only) /.test(text)) return 'packaging_only';
  const foreign = (words: string[]) => words.some(word => tokenSet.has(word) && !profile.identityTokens.has(word));
  if (foreign(ACCESSORY_WORDS)) return 'accessory';
  if (foreign(LOT_WORDS)) return 'lot_or_bundle';

  if (profile.isCard) {
    if (foreign(FAKE_CARD_WORDS)) return 'fake_or_proxy';
    const languageOrVariant = cardLanguageVariantRejection(tokens, profile);
    if (languageOrVariant) return languageOrVariant;
    if (cardIdentityMatch(title, profile)) return null;
    return profile.cardNumberConcat ? 'card_number_mismatch' : 'card_name_mismatch';
  }

  // Neue Flohmarkt Engine: nur aktiv, wenn aus dem Foto mindestens zwei belastbare Suchanker
  // vorhanden sind. Alte Tests und schwach erkannte Objekte fallen sonst auf die bisherige Logik zurück.
  if (profile.objectIdentity && profile.objectDecision && profile.objectDecision.requiredSearchTerms.length >= 2) {
    const candidate = evaluateObjectCandidate(profile.objectIdentity, { title, fields: {} });
    if (candidate.accepted) return null;
    if (candidate.conflicts.length) return 'object_identity_conflict';
    if (candidate.missingRequired.length) return 'object_required_features_missing';
    return profile.objectDecision.mode === 'comparable_object' ? 'object_not_comparable' : 'object_identity_mismatch';
  }

  if (VARIANT_WORDS.some(word => tokenSet.has(word) && !profile.identityTokens.has(word))) return 'variant_mismatch';
  const titleGeneration = generationOf(title);
  if (profile.generation && titleGeneration && titleGeneration !== profile.generation) return 'generation_mismatch';
  if (profile.boostTokens.some(token => compact.includes(token))) return null;
  if (profile.primaryHardTokens.length && !profile.primaryHardTokens.some(token => compact.includes(token))) {
    return 'model_mismatch';
  }
  const bestCoverage = Math.max(0, ...profile.matchQueries.map(query => queryCoverage(query, tokenSet)));
  return bestCoverage >= 0.6 ? null : 'model_mismatch';
}

/** Optionales Feld aus cardDetails lesen (z. B. language, variant), ohne den Analysis-Typ zu ändern. */
function cardDetailText(analysis: Analysis, key: string): string {
  const value = ((analysis.cardDetails || {}) as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? known(value) : '';
}

// Explizite Schlüsselwörter in Angebotstiteln. Nur für gescrapte Titel (Provider-Daten sind strukturiert).
const TITLE_LANGUAGE_WORDS: Record<string, string[]> = {
  de: ['deutsch', 'german'],
  en: ['englisch', 'english'],
  ja: ['japanisch', 'japanese', 'japan', 'jpn'],
  fr: ['franzosisch', 'french', 'francais'],
  it: ['italienisch', 'italian', 'italiano'],
  es: ['spanisch', 'spanish', 'espanol'],
  ko: ['koreanisch', 'korean'],
  zh: ['chinesisch', 'chinese'],
};

/**
 * Gescrapte Titel: Sprache und Variante dürfen der erkannten Karte nicht widersprechen.
 * - Titel nennt eine andere Sprache → language_mismatch
 * - Reverse Holo / 1st Edition muss bei entsprechender Variante im Titel stehen und darf
 *   bei anderer oder unbekannter Variante nicht im Titel stehen.
 */
function cardLanguageVariantRejection(tokens: string[], profile: IdentityProfile): string | null {
  const text = ' ' + tokens.join(' ') + ' ';
  if (profile.cardLanguage) {
    const mentioned = Object.entries(TITLE_LANGUAGE_WORDS)
      .filter(([, words]) => words.some(word => text.includes(' ' + word + ' ')))
      .map(([code]) => code);
    if (mentioned.length && !mentioned.includes(profile.cardLanguage)) return 'language_mismatch';
  }
  const titleReverse = / reverse /.test(text);
  const titleFirstEdition = / (1st|first|erste|1) (edition|ed) /.test(text);
  const variant = profile.cardVariant || '';
  const wantsReverse = variant === 'reverseholofoil';
  const wantsFirstEdition = variant.startsWith('firstedition');
  if (wantsReverse && !titleReverse) return 'variant_not_confirmed';
  if (wantsFirstEdition && !titleFirstEdition) return 'variant_not_confirmed';
  if ((titleReverse && !wantsReverse) || (titleFirstEdition && !wantsFirstEdition)) {
    return profile.cardVariant ? 'variant_mismatch' : 'variant_unverified';
  }
  return null;
}

/** Für die Diagnose: nennt diese Zeile eindeutig die gesuchte Identität? */
function mentionsIdentity(line: string, profile: IdentityProfile) {
  if (profile.isCard) {
    return profile.cardNumberConcat
      ? hasExactCardNumber(looseTokens(line), profile)
      : cardIdentityMatch(line, profile) !== null;
  }
  if (profile.objectIdentity && profile.objectDecision && profile.objectDecision.requiredSearchTerms.length >= 2) {
    return evaluateObjectCandidate(profile.objectIdentity, { title: line, fields: {} }).accepted;
  }
  const tokens = looseTokens(line);
  const compact = tokens.join('');
  if (profile.boostTokens.some(token => compact.includes(token))) return true;
  if (profile.primaryHardTokens.length) return profile.primaryHardTokens.some(token => compact.includes(token));
  const tokenSet = new Set(tokens);
  return profile.matchQueries.some(query => queryCoverage(query, tokenSet) >= 0.8);
}

// ---------------------------------------------------------------------------
// Query-Plan
// FIX: Bei gegradeten Karten stand die Grading-Query ("Charizard 143/S P PCA 9.5") auf Position 0.
//      Dadurch liefen Bing, Willhaben und DuckDuckGo NUR mit der Grading-Query, die es für
//      seltene Grader praktisch nie gibt – die ungegradete Karte (Basiswert) wurde dort nie gesucht.
//      Jetzt: Basis-Queries zuerst, Grading-Query separat mit Rolle 'grading' und nur auf eBay.
//      Die Grading-Query enthält die Firma, aber keine Note ("9,5" vs. "9.5" würde bei eBay das
//      UND-Matching brechen); die exakte Note prüft der Code.
// ---------------------------------------------------------------------------

function cleanQuery(value: string, maxWords = 8) {
  const seen = new Set<string>();
  return String(value || '')
    .replace(/[()"[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => {
      const key = normalize(word) || word;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxWords)
    .join(' ');
}

function buildQueryPlan(analysis: Analysis): QueryPlanEntry[] {
  const entries: { role: QueryRole; query: string }[] = [];
  const add = (role: QueryRole, ...parts: string[]) => {
    const query = cleanQuery(parts.filter(Boolean).join(' '));
    if (query.length >= 3) entries.push({ role, query });
  };

  if (isCardAnalysis(analysis) && analysis.cardDetails) {
    const c = analysis.cardDetails;
    const name = known(c.cardName);
    const number = canonicalCardNumber(known(c.cardNumber));
    const set = known(c.setName);
    const franchise = known(c.franchise);
    const grading = targetGrading(analysis);
    if (number) {
      add('base', name, number);
      add('base', franchise, number); // sprachunabhängig (Glurak/Dracaufeu/リザードン)
      if (set) add('base', name, number, set);
    } else {
      if (name && set) add('base', name, set);
      if (franchise && name) add('base', franchise, name);
    }
    if (grading && grading.company && (name || number)) add('grading', name, number, grading.company.toUpperCase());
  } else {
    const objectIdentity = objectIdentityFromAnalysis(analysis);
    const objectDecision = decideObjectIdentity(objectIdentity);
    if (objectDecision.requiredSearchTerms.length >= 2) {
      buildObjectSearchQueries(objectIdentity).forEach(query => add('product', query));
    }

    const d = analysis.universalDetails;
    const special =
      (analysis.casioDetails && isCasioWatch(analysis)) ||
      (analysis.hotWheelsDetails && isHotWheelsAnalysis(analysis)) ||
      (normalize(analysis.category) === 'modellautos' && analysis.modelCarDetails);
    if (special) add('product', marketQuery(analysis));

    const brand = known(analysis.brand) || known(d?.manufacturer);
    const model = known(analysis.model) || known(d?.modelName);
    const generation = known(d?.generation);
    const modelNumber = known(d?.modelNumber);
    const sku = known(d?.skuOrPartNumber);
    const generationNumber = generationOf(generation) || looseTokens(generation).find(token => /^\d+$/.test(token));
    const modelHasGeneration =
      normalize(model).includes(normalize(generation)) ||
      Boolean(generationNumber && looseTokens(model).includes(generationNumber));
    const modelWithGeneration = generation && !modelHasGeneration ? model + ' ' + generation : model;
    const brandPrefix = brand && !normalize(model).startsWith(normalize(brand)) ? brand : '';

    if (model) add('product', brandPrefix, modelWithGeneration);
    productAliasQueries(analysis).forEach(alias => add('product', alias));
    if (brand && modelNumber) add('product', brand, modelNumber);
    if (brand && sku) add('product', brand, sku);
    if (!model) {
      add('product', brand, known(d?.productFamily));
      add('product', brand, known(analysis.objectType));
    }
    add('product', marketQuery(analysis));
    if (analysis.title) add('product', analysis.title);
  }

  const seen = new Set<string>();
  const unique = entries.filter(entry => {
    const key = normalize(entry.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const primary = unique.filter(entry => entry.role !== 'grading').slice(0, 3);
  const grading = unique.filter(entry => entry.role === 'grading').slice(0, 1);
  return [...primary, ...grading].map((entry, index) => ({ ...entry, index }));
}

/** Bestehende Signatur (string[]) bleibt erhalten. */
function marketSearchVariants(analysis: Analysis): string[] {
  return buildQueryPlan(analysis).map(entry => entry.query);
}

// ---------------------------------------------------------------------------
// Suchseiten
// ---------------------------------------------------------------------------

type SearchPage = {
  sourceKey: SourceKey;
  role: QueryRole;
  queryIndex: number;
  query: string;
  url: string;
};

const NON_RETAIL_CATEGORIES = new Set([
  'sammelkarten',
  'munzen',
  'briefmarken',
  'antiquitaten',
  'gemalde',
  'drucke',
  'kunst',
  'schmuck',
  'uhren',
  'bucher',
  'schallplatten',
  'vinyl',
  'teppiche',
]);

function buildSearchPages(analysis: Analysis, plan: QueryPlanEntry[]): SearchPage[] {
  const category = normalize(analysis.category);
  const objectType = normalize(analysis.objectType);
  const brand = normalize(analysis.brand);
  const signals = categorySignals(analysis);
  const d = analysis.universalDetails;

  const isCard = isCardAnalysis(analysis);
  const isLego = category === 'lego' || brand === 'lego' || objectType === 'lego set' || objectType === 'minifigur';
  const isGame = category === 'videospiele' || category === 'konsolen' || objectType === 'videospiel' || objectType === 'spielkonsole';
  const isWatch =
    category === 'uhren' &&
    objectType !== 'smartwatch' &&
    !signals.includes('apple watch') &&
    !signals.includes('galaxy watch') &&
    !isCasioWatch(analysis);
  const isBook = category === 'bucher' || objectType === 'buch';
  const isVinyl = category === 'schallplatten' || category === 'vinyl' || objectType === 'schallplatte';
  const checkRetailNew = !isCard && !NON_RETAIL_CATEGORIES.has(category);

  const pages: SearchPage[] = [];
  const push = (sourceKey: SourceKey, entry: QueryPlanEntry, query: string, url: string) =>
    pages.push({ sourceKey, role: entry.role, queryIndex: entry.index, query, url });

  const primaryEntries = plan.filter(entry => entry.role !== 'grading');
  const primaryEntry = primaryEntries[0];

  plan.forEach(entry => {
    const q = encodeURIComponent(entry.query);
    push('ebay_sold', entry, entry.query, 'https://www.ebay.de/sch/i.html?_nkw=' + q + '&_sacat=0&LH_Sold=1&LH_Complete=1&rt=nc');
    push('ebay_offer', entry, entry.query, 'https://www.ebay.de/sch/i.html?_nkw=' + q + '&_sacat=0&rt=nc');
  });
  primaryEntries.slice(0, 2).forEach(entry => {
    push('willhaben_offer', entry, entry.query, 'https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=' + encodeURIComponent(entry.query));
    push('web_search', entry, entry.query, 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(entry.query + ' Preis €'));
  });
  if (!primaryEntry) return pages;
  push('web_search', primaryEntry, primaryEntry.query, 'https://www.bing.com/search?setlang=de&cc=AT&q=' + encodeURIComponent(primaryEntry.query + ' Preis'));

  const primary = primaryEntry.query;
  const encodedPrimary = encodeURIComponent(primary);

  if (checkRetailNew) {
    const barcode = known(d?.barcodeOrEan);
    const geizhalsQuery = barcode && isValidGtin(barcode) ? digitsOnly(barcode) : primary;
    push('geizhals_offer', primaryEntry, geizhalsQuery, 'https://geizhals.at/?fs=' + encodeURIComponent(geizhalsQuery) + '&hloc=at&hloc=de');
    push('mediamarkt_offer', primaryEntry, primary, 'https://www.mediamarkt.at/de/search.html?query=' + encodedPrimary);
  }

  if (isLego) {
    const setNumber = (known(d?.modelNumber) || known(d?.skuOrPartNumber)).trim();
    const url = /^\d{3,7}(?:-\d+)?$/.test(setNumber)
      ? 'https://www.bricklink.com/catalogPG.asp?S=' + encodeURIComponent(setNumber.includes('-') ? setNumber : setNumber + '-1')
      : 'https://www.bricklink.com/v2/search.page?q=' + encodedPrimary;
    push('bricklink_guide', primaryEntry, setNumber || primary, url);
  }

  if (isCard) {
    // Hinweis: Cardmarket durchsucht nur Produktnamen (keine Kartennummern). Die Namenssuche
    // liefert viele Drucke; ob die gesuchte Nummer überhaupt auf der Seite steht, zeigt
    // debug.pagesRequested[].identityMentionsRaw.
    const gamePath = cardmarketGamePath(analysis);
    const cardName = known(analysis.cardDetails?.cardName);
    if (gamePath && cardName) {
      push(
        'cardmarket_offer',
        primaryEntry,
        cardName,
        'https://www.cardmarket.com/de/' + gamePath + '/Products/Search?searchString=' + encodeURIComponent(cardName)
      );
    }
  }

  if (isGame) push('pricecharting_guide', primaryEntry, primary, 'https://www.pricecharting.com/search-products?type=prices&q=' + encodedPrimary);
  if (isWatch) push('chrono24_offer', primaryEntry, primary, 'https://www.chrono24.de/search/index.htm?query=' + encodedPrimary);
  if (isBook) {
    const isbn = known(d?.barcodeOrEan);
    const url = isValidIsbn(isbn)
      ? 'https://www.abebooks.de/servlet/SearchResults?isbn=' + encodeURIComponent(digitsOnly(isbn))
      : 'https://www.abebooks.de/servlet/SearchResults?kn=' + encodedPrimary;
    push('abebooks_offer', primaryEntry, isbn || primary, url);
  }
  if (isVinyl) push('discogs_offer', primaryEntry, primary, 'https://www.discogs.com/search/?q=' + encodedPrimary + '&type=release');

  return pages;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function marketMedian(rows: MarketListing[]) {
  return rows.length ? roundPrice(median(rows.map(row => row.price))) : null;
}

function emptyConditionMarketPrice(): ConditionMarketPrice {
  return {
    price: null,
    from: null,
    to: null,
    soldCount: 0,
    offerCount: 0,
    sampleCount: 0,
    basis: 'Keine passenden Marktbelege in dieser Gruppe gefunden.',
    status: 'none',
    referencePrice: null,
  };
}

function emptyConditionPriceSet(): ConditionPriceSet {
  return {
    new: emptyConditionMarketPrice(),
    likeNew: emptyConditionMarketPrice(),
    used: emptyConditionMarketPrice(),
    defective: emptyConditionMarketPrice(),
  };
}

/**
 * Mindestens 2 echte Belege für einen Marktpreis; genau 1 Beleg ⇒ nur referencePrice.
 * soldOnly (Sammelkarten): Ein Wert entsteht ausschließlich aus mindestens 2 Verkäufen. Aktive
 * Angebote erzeugen nie einen Wert oder Referenzpreis; sie bleiben nur separat sichtbar.
 */
function conditionMarketPrice(rows: MarketListing[], soldOnly = false): ConditionMarketPrice {
  const sold = rows.filter(row => row.type === 'sold');
  const offers = rows.filter(row => row.type === 'offer');
  const counts = { soldCount: sold.length, offerCount: offers.length, sampleCount: rows.length };

  if (!rows.length) return emptyConditionMarketPrice();

  if (soldOnly && sold.length < 2) {
    const offerNote = offers.length
      ? ' ' + offers.length + (offers.length === 1 ? ' aktives Angebot wird' : ' aktive Angebote werden') +
        ' bei Sammelkarten nur separat angezeigt und ergeben keinen Marktwert.'
      : '';
    return {
      ...emptyConditionMarketPrice(),
      ...counts,
      status: 'low_sample',
      referencePrice: sold.length === 1 ? roundPrice(sold[0].price) : null,
      basis:
        (sold.length === 1
          ? 'Nur ein passender Verkauf (' + sold[0].source + ') – mindestens 2 Verkäufe für einen Marktwert erforderlich.'
          : 'Keine passenden Verkäufe – kein Marktwert.') + offerNote,
    };
  }

  if (rows.length === 1) {
    const only = rows[0];
    return {
      ...emptyConditionMarketPrice(),
      ...counts,
      status: 'low_sample',
      referencePrice: roundPrice(only.price),
      basis: 'Nur ein passender Marktbeleg (' + only.source + ') – zu wenig Daten für einen verlässlichen Marktpreis',
    };
  }

  // Verkäufe haben Vorrang. Verkäufe und Angebote werden nie zu einem Wert gemischt.
  let evidence: number[];
  let basis: string;
  if (sold.length >= 2) {
    evidence = sold.map(row => row.price);
    basis = 'Median aus tatsächlich verkauften Vergleichsartikeln';
  } else if (offers.length >= 2) {
    evidence = offers.map(row => row.price);
    basis =
      (offers.length >= 3
        ? 'Median aus aktuellen Marktangeboten, keine ausreichenden Verkaufsdaten'
        : 'Median aus zwei passenden aktuellen Marktangeboten, geringe Datenbasis') +
      (sold.length === 1 ? ' (ein einzelner Verkauf liegt bei ' + formatEuro(sold[0].price) + ', wird nicht eingemischt)' : '');
  } else {
    const reference = sold[0] || offers[0];
    return {
      ...emptyConditionMarketPrice(),
      ...counts,
      status: 'low_sample',
      referencePrice: roundPrice(reference.price),
      basis: 'Nur ein Verkauf und ein Angebot – zu wenig gleichartige Belege für einen verlässlichen Marktpreis',
    };
  }

  const clean = evidence.length >= 4 ? iqrFilter(evidence) : evidence;
  const sorted = [...(clean.length >= 2 ? clean : evidence)].sort((a, b) => a - b);

  return {
    ...counts,
    price: roundPrice(median(sorted)),
    from: roundPrice(quantile(sorted, 0.25)),
    to: roundPrice(quantile(sorted, 0.75)),
    basis,
    status: 'ok',
    referencePrice: null,
  };
}

/** Dasselbe Listing aus mehreren Query-Varianten zählt nur einmal. */
function dedupeMarketRows<T extends MarketListing>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = normalize(row.title) + '|' + row.price.toFixed(2) + '|' + row.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Entfernt Ausreißer je Gruppe (nur ab 4 Belegen). */
function cleanMarketRows<T extends MarketListing>(rows: T[]) {
  if (rows.length < 4) return { kept: rows, outliers: [] as T[] };
  const keptPrices = new Set(iqrFilter(rows.map(row => row.price)));
  return {
    kept: rows.filter(row => keptPrices.has(row.price)),
    outliers: rows.filter(row => !keptPrices.has(row.price)),
  };
}

// ---------------------------------------------------------------------------
// Extraktion je Quelle
// FIX 1: Der Prompt nannte bei gegradeten Karten "Gesuchtes Produkt: … PCA 9.5" und
//        "ähnliche, aber andere Produkte → relevance < 0.4". Ungegradete Treffer wurden dadurch
//        als "anderes Produkt" niedrig bewertet oder gar nicht extrahiert (→ low_relevance,
//        0 Basisbelege). Außerdem kopierte das Modell "PCA 9.5" ins grading-Feld von Raw-Treffern,
//        wodurch Raw-Preise als direkter PCA-Vergleich zählten. Jetzt: Identität ohne Grading,
//        ALLE Treffer der Karte extrahieren, Grading wird ausschließlich aus dem Titel bestimmt.
// FIX 2: Deutsche/französische/japanische Kartennamen (Glurak, Dracaufeu) ausdrücklich erlaubt.
// FIX 3: Antwortformat robust gelesen (data.items, items, Array, JSON-String, Alt-Schema).
// ---------------------------------------------------------------------------

type ReadableSection = SearchPage & { sectionId: number; text: string; haystack: string; tokens: Set<string>; fetchedAt: string };

const EXTRACT_SYSTEM = [
  'Du extrahierst ausschließlich reale Marktangebote, Verkäufe und Preisführer-Werte aus den bereitgestellten Abschnitten.',
  'Erfinde niemals Produkte, Preise, Zustände oder Daten. Wenn nichts Passendes sichtbar ist, gib eine leere Liste zurück.',
  'Nimm nur Treffer auf, bei denen Titel und Preis zum selben sichtbaren Treffer gehören.',
  'title: der Treffertitel möglichst wörtlich aus dem Text (nicht übersetzen, nichts ergänzen).',
  'identityEvidence: höchstens 220 Zeichen wörtlich aus DEMSELBEN Trefferabschnitt, nur wenn dort zusätzliche Identitätsmerkmale sichtbar sind, die nicht im Titel stehen. Nie aus Suchanfrage, Vorwissen oder anderen Treffern ergänzen. Sonst leer.',
  'priceText: der Preis exakt so, wie er im Text steht (z. B. "1.234,56 €" oder "EUR 12,50").',
  'Keine Versandkosten, keine Preisspannen, keine durchgestrichenen Ursprungspreise, keine Ratenpreise.',
  'Bei verkauften eBay-Artikeln den tatsächlich erzielten Preis nehmen.',
  'Ignoriere Suchgesuche ("Suche …"), Zubehör, Leerverpackungen, Konvolute und Sammlungen.',
  'sectionId: die Zahl aus der Kopfzeile "=== SECTION <Zahl>" des Abschnitts, aus dem der Treffer stammt.',
  'conditionText: Zustandsangabe wörtlich aus dem Treffer, sonst leer.',
  'conditionGroup: new = fabrikneu/versiegelt/Händler-Neuware; likeNew = neuwertig/wie neu/Near Mint/Mint;',
  'used = gebraucht/played; defective = defekt/beschädigt/Bastlerware; unknown = nicht erkennbar.',
  'grading: nur was im Treffertext steht (z. B. "PSA 10", "PCA 9.5"); steht dort kein Grading, "raw". Nie aus der Suchanfrage übernehmen.',
  'relevance: nur ob es DASSELBE Produkt bzw. dieselbe Karte ist (1 = sicher, 0.7 = wahrscheinlich, < 0.5 = zweifelhaft) – unabhängig von Zustand, Grading und Preis.',
  'currency: Währung des Preises (EUR, USD, GBP, CHF oder OTHER). date: Datum, falls sichtbar, sonst leer.',
].join(' ');

function readExtractItems(extracted: unknown): { items: ExtractedMarketRow[] | null; shape: string } {
  const root = (extracted || {}) as Record<string, unknown>;
  let data: unknown = root.data ?? root.output ?? root.result ?? extracted;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { items: null, shape: 'string (kein JSON)' };
    }
  }
  if (Array.isArray(data)) return { items: data as ExtractedMarketRow[], shape: 'array' };
  const record = (data || {}) as Record<string, unknown>;
  if (Array.isArray(record.items)) return { items: record.items as ExtractedMarketRow[], shape: 'items' };
  const legacyKeys = ['newItems', 'likeNewItems', 'usedItems', 'defectiveItems'];
  if (legacyKeys.some(key => Array.isArray(record[key]))) {
    return { items: legacyKeys.flatMap(key => (Array.isArray(record[key]) ? (record[key] as ExtractedMarketRow[]) : [])), shape: 'legacy' };
  }
  return { items: null, shape: 'keys: ' + Object.keys(record).join(',') };
}

async function extractSourceGroup(
  sourceKey: SourceKey,
  sections: ReadableSection[],
  context: { identityLines: string[] },
  timeoutMs: number
): Promise<{ rows: ExtractedMarketRow[]; error: string | null }> {
  const meta = SOURCE_META[sourceKey];
  const sourceHint =
    meta.kind === 'sold'
      ? 'Diese Abschnitte zeigen verkaufte Artikel.'
      : meta.kind === 'guide'
        ? 'Diese Abschnitte sind Preisführer bzw. Marktindikatoren.'
        : meta.retailNew
          ? 'Diese Abschnitte sind Händlerangebote; ohne andere Angabe ist das Neuware.'
          : 'Diese Abschnitte sind aktuelle Angebote bzw. Suchtreffer.';

  const prompt = [
    ...context.identityLines,
    'Quelle: ' + meta.display + '. ' + sourceHint,
    'Extrahiere höchstens ' + MAX_ITEMS_PER_EXTRACT + ' passende Treffer.',
  ].join(' ');

  const content = sections
    .map(section => '=== SECTION ' + section.sectionId + ' | QUERY: ' + section.query + ' ===\n' + section.text)
    .join('\n\n')
    .slice(0, 36000);

  try {
    const extracted = await withTimeout(
      ai.extract({
        system: EXTRACT_SYSTEM,
        prompt,
        content,
        schema: marketExtractSchema,
        thinkingMode: 'FAST',
        maxRetries: 1,
        maxTokens: 5000,
        temperature: 0,
      }),
      timeoutMs,
      'extract:' + sourceKey
    );
    const { items, shape } = readExtractItems(extracted);
    if (!items) return { rows: [], error: sourceKey + ': unerwartetes Antwortformat (' + shape + ')' };
    return { rows: items, error: null };
  } catch (error) {
    return { rows: [], error: sourceKey + ': ' + (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * FIX: Treffer mit einer sectionId außerhalb der Gruppe wurden als 'invalid_section' verworfen –
 *      z. B. wenn das Modell die Abschnitte je Quelle neu durchnummeriert. Jetzt wird der Abschnitt
 *      über den nachweisbaren Preis (und Titel) im Text bestimmt; die sectionId ist nur ein Hinweis.
 */
function resolveSection(row: ExtractedMarketRow, groupSections: ReadableSection[]) {
  const claimed = groupSections.find(section => section.sectionId === Number(row.sectionId));
  const ordered = claimed ? [claimed, ...groupSections.filter(section => section !== claimed)] : groupSections;
  const parsed = parseLocalePrice(row.priceText);
  const price = parsed != null ? parsed : Number(row.price);
  const grounded = ordered.find(
    section => Number.isFinite(price) && priceGrounded(row.priceText, price, section.haystack) && titleGrounded(row.title, section.tokens)
  );
  return grounded || claimed || groupSections[0];
}

// ---------------------------------------------------------------------------
// Validierung eines einzelnen Treffers
// ---------------------------------------------------------------------------

type CandidateRow = {
  sourceKey: SourceKey;
  url: string;
  title: string;
  priceText: string;
  price: number;
  currency: string;
  conditionText: string;
  conditionGroup: ConditionKey | 'unknown';
  grading: string;
  date: string;
  relevance: number;
  identityEvidence: string;
  section: ReadableSection | null;
  fetchedAt: string;
};

type ValidatedRow = MarketListing & { conditionGroup: ConditionKey };

function validateRow(
  row: CandidateRow,
  profile: IdentityProfile,
  fxRatesToEur: Record<string, number>,
  ttlMs = 24 * 3600 * 1000
): { row: ValidatedRow } | { reason: string } {
  const title = String(row.title || '').trim();
  if (!title) return { reason: 'missing_title' };

  const priceText = String(row.priceText || '').trim();
  if (priceText && isPriceRange(priceText)) return { reason: 'price_range' };

  const parsed = parseLocalePrice(priceText);
  let price = parsed != null ? parsed : Number(row.price);
  if (!Number.isFinite(price)) return { reason: 'invalid_price' };

  const identityEvidence = String(row.identityEvidence || '').trim().slice(0, 220);
  if (row.section) {
    if (!priceGrounded(priceText, price, row.section.haystack)) return { reason: 'price_not_in_source' };
    if (!titleGrounded(title, row.section.tokens)) return { reason: 'title_not_in_source' };
    if (identityEvidence && !identityEvidenceGrounded(identityEvidence, row.section)) {
      return { reason: 'identity_evidence_not_in_source' };
    }
  }

  const currency = currencyOf(priceText, row.currency);
  let originalPrice: number | undefined;
  let originalCurrency: string | undefined;
  if (currency !== 'EUR') {
    const rate = fxRatesToEur[currency];
    if (!rate || !Number.isFinite(rate)) return { reason: 'currency_not_eur' };
    originalPrice = price;
    originalCurrency = currency;
    price = Math.round(price * rate * 100) / 100;
  }
  if (!(price >= 0.1 && price < 1000000)) return { reason: 'price_out_of_range' };

  // Karten bleiben absichtlich titelbasiert: Nummer, Sprache und Grading dürfen nicht aus einem
  // freien Snippet ergänzt werden. Bei anderen Flohmarktobjekten darf ein nachweislich wörtlicher
  // Beleg aus demselben Treffer zusätzliche Merkmale bestätigen.
  const identityText = profile.isCard ? title : [title, identityEvidence].filter(Boolean).join(' ');
  const identityReason = identityRejection(identityText, profile);
  if (identityReason) return { reason: identityReason };

  const relevance = clamp01(row.relevance, 0);
  const meta = SOURCE_META[row.sourceKey];

  let grading: string | undefined;
  let gradingClass: 'exact' | 'raw' | undefined;
  // Preisführer werden nie als Wert verwendet: Sie müssen zur Karte passen (Identität, Sprache,
  // Variante – oben geprüft), aber nicht zu Zustand oder Grading. Sie erscheinen nur separat.
  const isGuide = meta.kind === 'guide';
  if (profile.isCard && isGuide) {
    const found = gradingOf(title + ' ' + (row.conditionText || ''));
    grading = found && found.grade ? found.company + ' ' + found.grade : 'raw';
  } else if (profile.isCard) {
    // FIX: Die exakte Kartennummer ist ein deterministischer Identitätsbeweis. Eine niedrige
    //      Modell-Relevanz (z. B. weil der Treffer ungegradet ist) darf ihn nicht mehr aufheben.
    const match = cardIdentityMatch(title, profile);
    if (match !== 'exact' && relevance < 0.5) return { reason: 'low_relevance' };

    // FIX: Grading nur aus Titel/Zustandstext, nie aus dem grading-Feld des Modells.
    const found = gradingOf(title + ' ' + (row.conditionText || ''));
    if (found && !found.grade) return { reason: 'grading_unclear' };
    if (profile.grading) {
      // Gegradete Karte: ungegradete Treffer sind nie ein Vergleich (auch nicht als Ersatzwert).
      if (!found) return { reason: 'raw_not_used_for_graded' };
      if (found.company === profile.grading.company && profile.grading.grade && found.grade === profile.grading.grade) {
        gradingClass = 'exact';
        grading = found.company + ' ' + found.grade;
      } else {
        return { reason: found.company === profile.grading.company ? 'grading_other_grade' : 'grading_other_company' };
      }
    } else if (found) {
      return { reason: 'graded_vs_raw' };
    } else {
      grading = 'raw';
    }
  } else if (relevance < 0.5) {
    return { reason: 'low_relevance' };
  }

  const llmGroup = row.conditionGroup !== 'unknown' ? row.conditionGroup : null;
  let conditionGroup: ConditionKey =
    conditionGroupFromText(row.conditionText) || llmGroup || conditionGroupFromText(title) || (meta.retailNew ? 'new' : 'used');
  if (gradingClass === 'exact') conditionGroup = 'likeNew';
  if (gradingClass === 'raw' && conditionGroup === 'defective') return { reason: 'raw_card_damaged' };
  if (profile.isCard && !isGuide && gradingClass !== 'exact') {
    // Zentrale Karten-Taxonomie, nur aus der Zustandsangabe des Treffers (nie aus dem Titel:
    // "Charizard ex" ist kein Zustand). Mint ≠ Near Mint; keine Umdeutung.
    const cardCondition = normalizeCardCondition(row.conditionText);
    if (gradingClass === 'raw') {
      // Kartenbasiswert: NM oder ohne Zustandsangabe; andere bekannte Zustände zählen nicht.
      if (cardCondition && cardCondition !== 'NM') return { reason: 'raw_not_nm_for_base' };
    } else {
      if (!profile.cardCondition) return { reason: 'card_condition_unknown_target' };
      if (!cardCondition) return { reason: 'card_condition_not_stated' };
      if (cardCondition !== profile.cardCondition) return { reason: 'card_condition_mismatch' };
      conditionGroup = profile.targetKey;
    }
  }

  return {
    row: {
      source: meta.display,
      sourceKey: row.sourceKey,
      kind: meta.kind === 'guide' ? 'guide' : 'listing',
      title,
      identityEvidence: identityEvidence || undefined,
      price,
      currency: 'EUR',
      condition: row.conditionText || '',
      date: row.date || '',
      type: meta.kind === 'sold' ? 'sold' : 'offer',
      url: row.url,
      relevance,
      conditionGroup,
      grading,
      gradingClass,
      rawCardBase: gradingClass === 'raw' && Boolean(profile.grading),
      originalPrice,
      originalCurrency,
      observedAt: row.date || null,
      fetchedAt: row.fetchedAt,
      expiresAt: new Date(new Date(row.fetchedAt).getTime() + ttlMs).toISOString(),
      eurConversion: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Hauptwert (Headline) – eine Stelle, die Status, Anzeige und Bewertung speist
// FIX: cardBaseValue wurde berechnet, aber nur für "Drittanbieter-Grader" und nur in
//      marketValuation genutzt; Status und Frontend kannten den Wert nicht → "Preisreferenzen
//      fehlen", obwohl ein belegter Kartenbasiswert vorlag.
// ---------------------------------------------------------------------------

function toHeadline(kind: MarketHeadline['kind'], value: ConditionMarketPrice, note: string): MarketHeadline {
  return {
    kind,
    price: value.price,
    from: value.from,
    to: value.to,
    referencePrice: value.referencePrice,
    soldCount: value.soldCount,
    offerCount: value.offerCount,
    sampleCount: value.sampleCount,
    basis: value.basis,
    note,
    original: null,
    fxNote: '',
    limitedData: false,
  };
}

const NO_HEADLINE: MarketHeadline = {
  kind: 'none',
  price: null,
  from: null,
  to: null,
  referencePrice: null,
  soldCount: 0,
  offerCount: 0,
  sampleCount: 0,
  basis: '',
  note: '',
  original: null,
  fxNote: '',
  limitedData: false,
};

function buildHeadline(
  targetKey: ConditionKey,
  grading: Grading | null,
  isCard: boolean,
  conditionPrices: ConditionPriceSet
): MarketHeadline {
  if (isCard && grading) {
    const label = formatGrading(grading);
    const exact = conditionPrices.likeNew;
    if (exact.price != null) return toHeadline('exact_grading', exact, 'Direkter Vergleich: nur ' + label + '-Belege derselben Karte.');
    if (exact.referencePrice != null) {
      return toHeadline('reference', exact, 'Nur ein direkter ' + label + '-Beleg – kein verlässlicher Marktpreis.');
    }
    return NO_HEADLINE;
  }

  const exact = conditionPrices[targetKey];
  if (exact.price != null) return toHeadline('condition', exact, '');
  // Kein Zusammenlegen verschiedener Zustände: fehlen Belege im erkannten Zustand, gibt es keinen Wert.
  if (exact.referencePrice != null) return toHeadline('reference', exact, 'Nur ein passender Beleg – kein verlässlicher Marktpreis.');
  return NO_HEADLINE;
}

// ---------------------------------------------------------------------------
// Status, Meldungen, Diagnose
// ---------------------------------------------------------------------------

const STATUS_MESSAGES: Record<MarketSearchStatus, string> = {
  loading: 'Marktpreise werden gesucht …',
  found: 'Marktpreise über mehrere Quellen geprüft. Jeder angezeigte Preis stammt ausschließlich aus passenden, im Quelltext belegten Marktdaten.',
  low_sample: 'Es wurden echte Marktbelege gefunden, aber zu wenige für einen verlässlichen Marktpreis. Einzelbelege werden nur als Referenz gezeigt.',
  sources_unreachable: 'Die Marktquellen waren gerade technisch nicht lesbar (blockiert oder nicht erreichbar). Das bedeutet nicht, dass es keinen Markt gibt.',
  no_exact_matches: 'Die Quellen waren lesbar, enthielten aber keine Angebote oder Verkäufe exakt dieses Gegenstands.',
  extraction_failed: 'Die Marktseiten wurden gelesen, die Auswertung der Angebote ist jedoch technisch fehlgeschlagen.',
  filtered_all: 'Es wurden Angebote gefunden, aber keines hat die Prüfung auf Identität, Beleg und Plausibilität bestanden.',
  insufficient_identity: 'Keine Live-Marktsuche gestartet, weil der Gegenstand noch nicht sicher genug identifiziert ist.',
  card_not_unique: 'Karte nicht eindeutig zuordenbar. Es wird keine Karte automatisch ausgewählt und kein Preis angezeigt.',
  provider_search_incomplete: 'Die Suche beim Kartendatenanbieter konnte nicht vollständig geladen werden. Es wird keine Karte zugeordnet und kein Preis angezeigt.',
  card_identified_no_market_evidence: 'Karte eindeutig erkannt, aber es liegen keine Verkäufe oder Angebote beim Kartendatenanbieter vor.',
  card_identified_insufficient_evidence: 'Karte eindeutig erkannt, aber es liegen zu wenige passende Marktbelege für eine zuverlässige Bewertung vor.',
  card_not_found: 'Diese exakte Karte wurde beim Kartendatenanbieter nicht gefunden. Es wird kein Preis einer anderen Karte übernommen.',
  unsupported_language: 'Der Kartendatenanbieter führt diese Sprachfassung nicht. Preise anderer Sprachfassungen werden nicht übernommen.',
  provider_error: 'Der Kartendatenanbieter war technisch nicht erreichbar. Das bedeutet nicht, dass es keinen Marktpreis gibt.',
};

const IDENTITY_REASONS = new Set([
  'card_number_mismatch',
  'card_name_mismatch',
  'model_mismatch',
  'variant_mismatch',
  'generation_mismatch',
  'low_relevance',
  'language_mismatch',
  'variant_not_confirmed',
  'variant_unverified',
  'card_condition_mismatch',
  'card_condition_not_stated',
  'card_condition_unknown_target',
]);

function newDebug(isCard: boolean, grading: Grading | null, cardNumber: string, plan: QueryPlanEntry[]): MarketDebug {
  return {
    marketSearchStatus: 'loading',
    lossStage: 'none',
    lossExplanation: '',
    isCard,
    cardNumberCanonical: cardNumber,
    targetGrading: formatGrading(grading),
    queriesGenerated: plan,
    pagesRequested: [],
    pagesReadable: 0,
    priceSignalsFound: 0,
    identityMentionsInPages: 0,
    identityMentionsAfterCondense: 0,
    rawListingsExtracted: 0,
    validatedListings: 0,
    rawCardListings: 0,
    exactGradingListings: 0,
    duplicatesRemoved: 0,
    rejectedListings: 0,
    rejectionReasons: {},
    rejectedSamples: [],
    acceptedSamples: [],
    extractionErrors: [],
    cardBaseValue: null,
    exactGradingValue: null,
    headline: NO_HEADLINE,
    priceGuidesFound: 0,
    cardProvider: null,
  };
}

function diagnoseLoss(debug: MarketDebug, status: MarketSearchStatus): { stage: LossStage; explanation: string } {
  const topReasons = Object.entries(debug.rejectionReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => reason + ' ×' + count)
    .join(', ');
  if (debug.cardProvider && !debug.pagesRequested.length) {
    return status === 'found'
      ? { stage: 'none', explanation: 'Kein Verlust: Hauptwert aus Belegen des Kartendatenanbieters ermittelt.' }
      : { stage: 'card_provider', explanation: 'KARTENANBIETER (' + debug.cardProvider.providerId + '): ' + debug.cardProvider.status + ' – ' + debug.cardProvider.message };
  }
  if (status === 'found') return { stage: 'none', explanation: 'Kein Verlust: Hauptwert aus belegten Marktdaten ermittelt.' };
  if (status === 'insufficient_identity') return { stage: 'identity_gate', explanation: 'Suche nicht gestartet: Identität zu unsicher.' };
  if (!debug.pagesReadable) {
    const reasons: Record<string, number> = {};
    debug.pagesRequested.forEach(page => countBy(reasons, page.unreadableReason || 'ok'));
    return { stage: 'fetch', explanation: 'ABRUF: keine Seite mit Preisen lesbar (' + JSON.stringify(reasons) + ').' };
  }
  if (!debug.identityMentionsInPages) {
    return {
      stage: 'source_content',
      explanation: 'ABRUF/QUELLE: ' + debug.pagesReadable + ' Seiten lesbar, aber keine nennt die gesuchte Identität (' +
        (debug.cardNumberCanonical || debug.queriesGenerated[0]?.query || '') + '). Die Suchseiten liefern andere Artikel.',
    };
  }
  if (!debug.identityMentionsAfterCondense) {
    return { stage: 'condense', explanation: 'VERDICHTUNG: Identität steht im Rohtext, ging aber in condenseListingText verloren.' };
  }
  if (!debug.rawListingsExtracted) {
    return {
      stage: 'extraction',
      explanation: 'EXTRAKTION: ' + debug.identityMentionsAfterCondense + ' Zeilen nennen die Identität, ai.extract lieferte 0 Treffer' +
        (debug.extractionErrors.length ? ' (Fehler: ' + debug.extractionErrors.join(' | ') + ')' : '') + '.',
    };
  }
  if (!debug.validatedListings) {
    return { stage: 'validation', explanation: 'PRÜFUNG: ' + debug.rawListingsExtracted + ' extrahierte Treffer, alle verworfen (' + topReasons + ').' };
  }
  return {
    stage: 'aggregation',
    explanation: 'AGGREGATION: ' + debug.validatedListings + ' gültige Belege (Rohkarte ' + debug.rawCardListings + ', exaktes Grading ' +
      debug.exactGradingListings + '), aber je Gruppe weniger als 2 – kein verlässlicher Marktpreis.',
  };
}

/** Lesbare Debug-Ausgabe für Konsole oder Entwickler-Panel. */
export function formatMarketDebug(debug: MarketDebug): string {
  const lines: string[] = [];
  const price = (value: ConditionMarketPrice | null) =>
    !value
      ? '–'
      : value.price != null
        ? formatEuro(value.price) + ' (' + formatEuro(value.from || 0) + '–' + formatEuro(value.to || 0) + ', n=' + value.sampleCount + ')'
        : value.referencePrice != null
          ? 'nur Einzelbeleg ' + formatEuro(value.referencePrice)
          : 'kein Wert (n=' + value.sampleCount + ')';
  lines.push('=== WertScan Marktpreis-Debug ===');
  lines.push('status: ' + debug.marketSearchStatus + ' | lossStage: ' + debug.lossStage);
  lines.push('→ ' + debug.lossExplanation);
  lines.push('isCard: ' + debug.isCard + ' | cardNumber: ' + (debug.cardNumberCanonical || '–') + ' | targetGrading: ' + (debug.targetGrading || '–'));
  lines.push('queriesGenerated:');
  debug.queriesGenerated.forEach(entry => lines.push('  [' + entry.index + '] ' + entry.role + ': ' + entry.query));
  lines.push('pagesRequested: ' + debug.pagesRequested.length + ' | pagesReadable: ' + debug.pagesReadable + ' | priceSignalsFound: ' + debug.priceSignalsFound);
  lines.push('identityMentions: roh ' + debug.identityMentionsInPages + ' → nach Verdichtung ' + debug.identityMentionsAfterCondense);
  debug.pagesRequested.forEach(page =>
    lines.push(
      '  ' + (page.readable ? 'OK ' : 'XX ') + page.sourceKey + ' [' + page.role + ' q' + page.queryIndex + '] http=' + (page.httpStatus ?? '?') +
        (page.unreadableReason ? ' reason=' + page.unreadableReason : '') + ' chars=' + page.textChars + '/' + page.condensedChars +
        ' prices=' + page.priceSignals + ' identity=' + page.identityMentionsRaw + '/' + page.identityMentionsCondensed +
        ' extracted=' + page.rawListings + ' valid=' + page.validatedListings + (page.extractionError ? ' ERR=' + page.extractionError : '') +
        '\n     ' + page.url + (page.readable ? '' : '\n     preview: ' + page.textPreview.replace(/\s+/g, ' ').slice(0, 160))
    )
  );
  lines.push('rawListingsExtracted: ' + debug.rawListingsExtracted + ' | validatedListings: ' + debug.validatedListings +
    ' | duplicatesRemoved: ' + debug.duplicatesRemoved);
  lines.push('rawCardListings: ' + debug.rawCardListings + ' | exactGradingListings: ' + debug.exactGradingListings);
  lines.push('rejectionReasons: ' + JSON.stringify(debug.rejectionReasons));
  debug.rejectedSamples.slice(0, 12).forEach(sample =>
    lines.push('  ✗ ' + sample.reason.padEnd(22) + ' ' + sample.priceText.padEnd(12) + ' ' + sample.source + ': ' + sample.title)
  );
  debug.acceptedSamples.slice(0, 12).forEach(sample =>
    lines.push('  ✓ ' + sample.class.padEnd(22) + ' ' + formatEuro(sample.price).padEnd(12) + ' ' + sample.source + ': ' + sample.title)
  );
  if (debug.extractionErrors.length) lines.push('extractionErrors: ' + debug.extractionErrors.join(' | '));
  lines.push('cardBaseValue: ' + price(debug.cardBaseValue));
  lines.push('exactGradingValue: ' + price(debug.exactGradingValue));
  lines.push('headline: ' + debug.headline.kind + ' ' + (debug.headline.price != null ? formatEuro(debug.headline.price) : '') +
    (debug.headline.original ? ' [Original ' + debug.headline.original.price + ' ' + debug.headline.original.currency + ']' : '') +
    (debug.headline.note ? ' – ' + debug.headline.note : '') + (debug.headline.fxNote ? ' | ' + debug.headline.fxNote : ''));
  lines.push('priceGuidesFound: ' + debug.priceGuidesFound + ' (separat, nicht im Marktwert)');
  if (debug.cardProvider) {
    const cp = debug.cardProvider;
    lines.push('cardProvider: ' + cp.providerId + ' | status: ' + cp.status + ' | card: ' + (cp.cardId || '–') + ' | variant: ' + (cp.variant || '–'));
    lines.push('  candidatesFound: ' + cp.candidatesFound + ' | remaining: ' + JSON.stringify(cp.remainingCandidates) + ' | match: ' + (cp.matchReason || '–'));
    lines.push('  rejectedCandidates: ' + JSON.stringify(cp.rejectedCandidates));
    lines.push('  evidence: ' + cp.evidenceLoaded + ' ' + JSON.stringify(cp.evidenceByKind) + ' | excluded: ' + JSON.stringify(cp.excluded));
    if (cp.error) lines.push('  error: ' + cp.error);
    lines.push('  → ' + cp.message);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Brücke zum Kartendatenanbieter (./cardData)
// Die Bilderkennung bleibt unverändert: Es werden nur vorhandene cardDetails-Felder gelesen.
// language, variant, setId werden genutzt, sobald die Erkennung sie liefert – sonst null (nie geraten).
// ---------------------------------------------------------------------------

function cardGameOf(analysis: Analysis): string | null {
  const franchise = normalize(known(analysis.cardDetails?.franchise) || analysis.title);
  if (franchise.includes('pokemon')) return 'pokemon';
  return franchise || null;
}

function cardQueryFromAnalysis(analysis: Analysis, game: string): CardQuery {
  const c = analysis.cardDetails;
  return {
    game,
    name: known(c?.cardName) || null,
    number: canonicalCardNumber(known(c?.cardNumber)) || null,
    setName: known(c?.setName) || null,
    setId: cardDetailText(analysis, 'setId') || cardDetailText(analysis, 'expansionId') || null,
    language: normalizeLanguage(cardDetailText(analysis, 'language')),
    variant: cardDetailText(analysis, 'variant') || null,
  };
}

function valueToHeadline(kind: MarketHeadline['kind'], value: ValueSummary, note: string): MarketHeadline {
  const inEur = value.currency === 'EUR' ? { median: value.median, low: value.low, high: value.high } : value.eur;
  const fxNote =
    value.currency !== 'EUR'
      ? value.eur
        ? value.eur.note
        : 'Kein Wechselkurs verfügbar – Wert nur in Originalwährung (' + value.currency + ').'
      : value.convertedFromMixedCurrencies && value.eur
        ? value.eur.note
        : '';
  return {
    kind,
    price: inEur ? inEur.median : null,
    from: inEur ? inEur.low : null,
    to: inEur ? inEur.high : null,
    referencePrice: null,
    soldCount: value.basis === 'sold' ? value.count : 0,
    offerCount: value.basis === 'listing' ? value.count : 0,
    sampleCount: value.count,
    basis: value.description,
    note,
    original: value.currency === 'EUR' ? null : { price: value.median, from: value.low, to: value.high, currency: value.currency },
    fxNote,
    limitedData: value.limitedData,
  };
}

async function evidenceToListing(
  evidence: PriceEvidence,
  role: 'exact' | 'raw' | 'condition',
  targetKey: ConditionKey,
  fx: FxRateProvider | undefined,
  cache: FxCache
): Promise<MarketListing | null> {
  const conversion = evidence.currency === 'EUR' ? null : await toEur(evidence.price, evidence.currency, fx, cache);
  // Ohne echten Kurs kein EUR-Betrag: Der Beleg bleibt in cardMarket, erscheint aber nicht in EUR-Listen.
  if (evidence.currency !== 'EUR' && !conversion) return null;
  return {
    source: evidence.source + ' (' + evidence.providerId + ')',
    title: evidence.title || '',
    price: conversion ? conversion.amount : evidence.price,
    currency: 'EUR',
    condition: evidence.condition || '',
    date: evidence.observedAt || '',
    type: evidence.kind === 'sold' ? 'sold' : 'offer',
    url: evidence.url || '',
    relevance: 1,
    kind: 'listing',
    conditionGroup: role === 'exact' ? 'likeNew' : role === 'condition' ? targetKey : undefined,
    grading: evidence.grading ? evidence.grading.company + ' ' + evidence.grading.grade : 'raw',
    gradingClass: role === 'exact' ? 'exact' : role === 'raw' ? 'raw' : undefined,
    rawCardBase: role === 'raw',
    originalPrice: conversion ? evidence.price : undefined,
    originalCurrency: conversion ? evidence.currency : undefined,
    observedAt: evidence.observedAt,
    fetchedAt: evidence.fetchedAt,
    expiresAt: evidence.expiresAt,
    eurConversion: conversion,
  };
}

/** Zuordnung Kartenanbieter-Status → Pipeline-Status (eine Stelle, auch für Prüfberichte). */
export const CARD_STATUS_TO_MARKET_STATUS: Record<CardMarketResult['status'], MarketSearchStatus> = {
    priced: 'found',
    card_identified_no_market_evidence: 'card_identified_no_market_evidence',
    card_identified_insufficient_evidence: 'card_identified_insufficient_evidence',
    not_unique: 'card_not_unique',
    provider_search_incomplete: 'provider_search_incomplete',
    not_found: 'card_not_found',
    unsupported_language: 'unsupported_language',
    insufficient_identity: 'insufficient_identity',
    provider_error: 'provider_error',
};

type CardProviderOutcome = {
  result: CardMarketResult;
  status: MarketSearchStatus;
  headline: MarketHeadline;
  rows: MarketListing[];
  priceGuides: PriceGuideEntry[];
};

async function runCardProvider(
  analysis: Analysis,
  game: string,
  provider: CardDataProvider,
  opts: { fx?: FxRateProvider; expansionAliases?: MatchOptions['expansionAliases']; soldWithinDays: number; targetKey: ConditionKey }
): Promise<CardProviderOutcome> {
  const query = cardQueryFromAnalysis(analysis, game);
  const grading = targetGrading(analysis);
  const normalized = grading ? normalizeGrading(grading.company, grading.grade) : null;
  const segment: CardSegment = normalized
    ? { type: 'graded', grading: normalized }
    : { type: 'raw', condition: normalizeCardCondition(analysis.condition) };

  let result: CardMarketResult;
  if (grading && !normalized) {
    result = {
      status: 'insufficient_identity',
      message: 'Grading-Firma erkannt, aber keine Note. Ohne exakte Note ist kein Grading-Vergleich möglich.',
      providerId: provider.id,
      query,
      segment,
      card: null,
      variant: null,
      valuation: null,
      fallbackAllowed: false,
      fallbackReason: 'Nicht erlaubt: Grading-Note fehlt.',
      debug: { candidatesFound: 0, rejectedCandidates: [], remainingCandidates: [], matchReason: null, evidenceLoaded: 0, evidenceByKind: {}, excluded: {}, sales: null, error: null },
    };
  } else {
    result = await lookupCardMarket(query, segment, {
      provider,
      fx: opts.fx,
      soldWithinDays: opts.soldWithinDays,
      matchOptions: { expansionAliases: opts.expansionAliases },
    });
  }

  const status = CARD_STATUS_TO_MARKET_STATUS[result.status];

  let headline: MarketHeadline = NO_HEADLINE;
  const rows: MarketListing[] = [];
  const valuation = result.valuation;
  if (valuation) {
    const h = valuation.headline;
    if (h.value && h.kind !== 'none') headline = valueToHeadline(h.kind === 'raw_condition' ? 'condition' : h.kind, h.value, h.note);
    const cache: FxCache = new Map();
    // Alle passenden echten Belege anzeigen – auch wenn sie für einen Marktwert nicht reichen.
    const add = async (evidenceRows: PriceEvidence[], role: 'exact' | 'raw' | 'condition') => {
      for (const evidence of evidenceRows) {
        const row = await evidenceToListing(evidence, role, opts.targetKey, opts.fx, cache);
        if (row) rows.push(row);
      }
    };
    await add(valuation.segmentEvidence.exact, segment.type === 'graded' ? 'exact' : 'condition');
  }
  return { result, status, headline, rows, priceGuides: valuation ? valuation.priceGuides : [] };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

async function liveMarketLookup(analysis: Analysis, options: MarketLookupOptions = {}): Promise<MarketData> {
  const {
    fxRatesToEur = {},
    providers = [],
    scrapeTimeoutMs = 30000,
    extractTimeoutMs = 60000,
    scrapeConcurrency = 6,
    extractConcurrency = 4,
    log = (event: string, data: unknown) =>
      console.info(event === 'debug' ? formatMarketDebug(data as MarketDebug) : '[wertscan:market] ' + event + ' ' + JSON.stringify(data)),
    cardProvider: cardProviderOption,
    cardProviderGames = ['pokemon'],
    fxRateProvider,
    expansionAliases,
    soldWithinDays = 90,
    cardScrapeFallback = true,
    scrapeEvidenceTtlMs = 24 * 3600 * 1000,
  } = options;
  let cardMarket: CardMarketResult | null = null;

  const searchedAt = new Date().toISOString();
  const plan = buildQueryPlan(analysis);
  const queries = plan.map(entry => entry.query);
  const baseQueries = plan.filter(entry => entry.role !== 'grading').map(entry => entry.query);
  const query = queries[0] || marketQuery(analysis);
  const profile = buildIdentityProfile(analysis, baseQueries);
  const isCard = profile.isCard;
  const grading = profile.grading;
  const targetKey = targetConditionKey(analysis);
  const debug = newDebug(isCard, grading, canonicalCardNumber(known(analysis.cardDetails?.cardNumber)), plan);

  const finish = (status: MarketSearchStatus, extra: Partial<MarketData> = {}): MarketData => {
    debug.marketSearchStatus = status;
    const loss = diagnoseLoss(debug, status);
    debug.lossStage = loss.stage;
    debug.lossExplanation = loss.explanation;
    try {
      log('debug', debug);
    } catch {
      // Logging darf die Pipeline nie abbrechen.
    }
    return {
      connected: status !== 'sources_unreachable' && status !== 'extraction_failed',
      query,
      searchedQueries: queries,
      sourcesChecked: [],
      soldComparables: [],
      currentOffers: [],
      soldMedian: null,
      offerMedian: null,
      conditionPrices: emptyConditionPriceSet(),
      searchedAt,
      message: STATUS_MESSAGES[status],
      status,
      headline: debug.headline,
      cardBaseValue: null,
      exactGradingValue: null,
      debug,
      diagnostics: debug,
      priceGuides: [],
      cardMarket,
      objectMatch:
        profile.objectDecision && profile.objectDecision.requiredSearchTerms.length >= 2
          ? {
            mode: profile.objectDecision.mode,
            quality: profile.objectDecision.quality,
            score: profile.objectDecision.score,
            label: profile.objectDecision.valuationPolicy.label,
            marketValueAllowed: profile.objectDecision.valuationPolicy.marketValueAllowed,
            comparisonRangeAllowed: profile.objectDecision.valuationPolicy.comparisonRangeAllowed,
            minimumComparableCount: profile.objectDecision.valuationPolicy.minimumComparableCount,
            requiredSearchTerms: profile.objectDecision.requiredSearchTerms,
            missingExactFields: profile.objectDecision.missingExactFields,
            explanation: profile.objectDecision.explanation,
            }
          : null,
      ...extra,
    };
  };

  const hasHardIdentity = isCard
    ? Boolean(profile.cardNumberConcat || profile.cardNameTokens.length)
    : profile.primaryHardTokens.length > 0 || profile.boostTokens.length > 0;
  if (!queries.length || (analysis.confidence < 0.55 && !hasHardIdentity)) return finish('insufficient_identity');

  // Sammelkarten mit Kartendatenanbieter: strukturierte, exakte Zuordnung statt Scraping.
  const game = isCard ? cardGameOf(analysis) : null;
  let providerMessage = '';
  let providerGuides: PriceGuideEntry[] = [];
  let providerFallbackStatus: MarketSearchStatus | null = null;
  // Standard: TCGdex für Pokémon, sofern kein Anbieter übergeben wurde (null = bewusst keiner).
  const cardProvider =
    cardProviderOption === undefined
      ? isCard && game === 'pokemon'
        ? createDefaultPokemonCardProvider()
        : null
      : cardProviderOption;
  if (isCard && cardProvider && game && cardProviderGames.includes(game)) {
    const outcome = await runCardProvider(analysis, game, cardProvider, {
      fx: fxRateProvider,
      expansionAliases,
      soldWithinDays,
      targetKey,
    });
    cardMarket = outcome.result;
    debug.cardProvider = {
      ...outcome.result.debug,
      providerId: outcome.result.providerId,
      status: outcome.result.status,
      message: outcome.result.message,
      cardId: outcome.result.card?.cardId || null,
      variant: outcome.result.variant,
    };
    debug.headline = outcome.headline;
    debug.priceGuidesFound = outcome.priceGuides.length;
    // Ergänzende Marktplatzsuche nur, wenn der Anbieter die Karte EINDEUTIG kennt und nur Preise fehlen.
    const fallback = cardScrapeFallback && outcome.result.fallbackAllowed;
    if (!fallback) {
      return finish(outcome.status, {
        connected: outcome.status !== 'provider_error',
        sourcesChecked: [cardProvider.displayName],
        soldComparables: outcome.rows.filter(row => row.type === 'sold'),
        currentOffers: outcome.rows.filter(row => row.type === 'offer'),
        soldMedian: null,
        offerMedian: null,
        headline: outcome.headline,
        priceGuides: outcome.priceGuides,
        message: outcome.result.message,
      });
    }
    providerMessage = outcome.result.message + ' Ergänzende Marktplatzsuche für genau diese Karte: ';
    providerGuides = outcome.priceGuides;
    providerFallbackStatus = outcome.status;
    // Vom Anbieter bestätigte Identität gilt nun auch für gescrapte Titel.
    const confirmedLanguage = normalizeLanguage(outcome.result.card?.languageCode || outcome.result.card?.language || '');
    if (confirmedLanguage) profile.cardLanguage = confirmedLanguage;
    if (outcome.result.variant) profile.cardVariant = variantKey(outcome.result.variant);
  }

  const pages = buildSearchPages(analysis, plan);
  const perPage: PageDebug[] = pages.map(page => ({
    sourceKey: page.sourceKey,
    display: SOURCE_META[page.sourceKey].display,
    role: page.role,
    queryIndex: page.queryIndex,
    query: page.query,
    url: page.url,
    httpStatus: null,
    readable: false,
    unreadableReason: null,
    textChars: 0,
    condensedChars: 0,
    priceSignals: 0,
    identityMentionsRaw: 0,
    identityMentionsCondensed: 0,
    rawListings: 0,
    validatedListings: 0,
    extractionError: null,
    textPreview: '',
  }));
  debug.pagesRequested = perPage;

  // 1) Abruf + Verdichtung --------------------------------------------------------------------
  const keepIdentityLine = (line: string) => mentionsIdentity(line, profile);
  const sections: ReadableSection[] = [];
  await mapLimit(pages, scrapeConcurrency, async (page, index) => {
    const diag = perPage[index];
    try {
      const { status, text } = readScrapeResult(await withTimeout(ai.scrape({ url: page.url }), scrapeTimeoutMs, 'scrape'));
      diag.httpStatus = status;
      diag.textChars = text.length;
      diag.textPreview = text.slice(0, 400);
      if (status != null && status >= 400) {
        diag.unreadableReason = 'http_error';
        return;
      }
      if (!text.trim()) {
        diag.unreadableReason = 'empty';
        return;
      }
      diag.identityMentionsRaw = splitLines(text).filter(keepIdentityLine).length;
      const condensed = condenseListingText(text, 9000, keepIdentityLine);
      diag.condensedChars = condensed.length;
      diag.identityMentionsCondensed = condensed.split('\n').filter(keepIdentityLine).length;
      diag.priceSignals = countPriceSignals(condensed);
      if (!diag.priceSignals) {
        diag.unreadableReason = BLOCK_PATTERN.test(text) ? 'blocked' : 'no_prices';
        return;
      }
      diag.readable = true;
      sections.push({
        ...page,
        sectionId: index,
        text: condensed,
        haystack: collapse(condensed),
        tokens: new Set(looseTokens(condensed)),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      diag.unreadableReason = String(error).includes('timeout:') ? 'timeout' : 'scrape_failed';
      diag.textPreview = String(error).slice(0, 400);
    }
  });
  debug.pagesReadable = sections.length;
  debug.priceSignalsFound = perPage.reduce((sum, page) => sum + page.priceSignals, 0);
  debug.identityMentionsInPages = perPage.filter(page => page.readable).reduce((sum, page) => sum + page.identityMentionsRaw, 0);
  debug.identityMentionsAfterCondense = perPage.filter(page => page.readable).reduce((sum, page) => sum + page.identityMentionsCondensed, 0);

  // 2) Extraktion je Quelle -------------------------------------------------------------------
  const c = analysis.cardDetails;
  const identityLines =
    isCard && c
      ? [
          'Gesuchte Karte (Identität unabhängig von Zustand und Grading): ' +
            [known(c.franchise), known(c.cardName), debug.cardNumberCanonical ? 'Kartennummer ' + debug.cardNumberCanonical : '', known(c.setName)]
              .filter(Boolean)
              .join(', ') + '.',
          'Der Kartenname kann in anderer Sprache stehen (z. B. deutsch, französisch, japanisch); entscheidend ist die Kartennummer.',
          'Extrahiere ALLE sichtbaren Treffer dieser Karte – ungegradet (raw) UND gegradet mit beliebiger Firma und Note. Filtere NICHT nach Grading oder Zustand.',
          'Treffer mit anderer Kartennummer nicht aufnehmen.',
        ]
      : profile.objectDecision && profile.objectDecision.requiredSearchTerms.length >= 2
        ? profile.objectDecision.mode === 'comparable_object'
          ? [
              'Gesuchtes Flohmarktobjekt ist NICHT exakt bis zur Modellreferenz identifiziert.',
              'Für Vergleichstreffer müssen mehrere dieser direkt beobachteten Merkmale gemeinsam bestätigt sein: ' +
                profile.objectDecision.requiredSearchTerms.join(', ') + '.',
              'Extrahiere keine bloß markengleichen oder formähnlichen Produkte, wenn die sichtbaren Kernmerkmale fehlen.',
              'Wenn ein wichtiges Merkmal nur in Beschreibung oder Snippet steht, kopiere es wörtlich nach identityEvidence.',
            ]
          : [
              'Gesuchtes exakt identifiziertes Produkt: ' + profile.objectDecision.requiredSearchTerms.join(', ') + '.',
              'Andere Modellnummern, Varianten oder Produktidentitäten erhalten relevance unter 0.4.',
              'Wenn ein Identitätsmerkmal nur in Beschreibung oder Snippet steht, kopiere es wörtlich nach identityEvidence.',
            ]
        : ['Gesuchtes Produkt: ' + baseQueries.join(' | ') + '.', 'Ähnliche, aber andere Produkte (andere Generation, Variante, Modellnummer) erhalten relevance unter 0.4.'];

  const candidates: CandidateRow[] = [];
  const groups = new Map<SourceKey, ReadableSection[]>();
  [...sections]
    .sort((a, b) => a.sectionId - b.sectionId)
    .forEach(section => groups.set(section.sourceKey, [...(groups.get(section.sourceKey) || []), section]));
  const groupEntries = [...groups.entries()];
  const groupResults = await mapLimit(groupEntries, extractConcurrency, ([sourceKey, groupSections]) =>
    extractSourceGroup(sourceKey, groupSections, { identityLines }, extractTimeoutMs)
  );

  let failedGroups = 0;
  groupResults.forEach((result, groupIndex) => {
    const [sourceKey, groupSections] = groupEntries[groupIndex];
    if (result.error) {
      failedGroups++;
      debug.extractionErrors.push(result.error);
      groupSections.forEach(section => (perPage[section.sectionId].extractionError = result.error));
    }
    result.rows.forEach(row => {
      debug.rawListingsExtracted++;
      const section = resolveSection(row, groupSections);
      perPage[section.sectionId].rawListings++;
      candidates.push({ ...row, sourceKey, url: section.url, section, fetchedAt: section.fetchedAt });
    });
  });

  const providerResults = await Promise.allSettled(providers.map(provider => provider.fetch({ analysis, queries: baseQueries })));
  providerResults.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === 'rejected') {
      debug.extractionErrors.push('provider ' + provider.sourceKey + ': ' + String(result.reason));
      return;
    }
    result.value.forEach(listing => {
      debug.rawListingsExtracted++;
      candidates.push({
        sourceKey: provider.sourceKey,
        url: listing.url,
        title: listing.title,
        identityEvidence: '',
        priceText: '',
        price: listing.price,
        currency: listing.currency,
        conditionText: listing.conditionText,
        conditionGroup: 'unknown',
        grading: '',
        date: listing.date,
        relevance: 0.8,
        section: null,
        fetchedAt: new Date().toISOString(),
      });
    });
  });

  // 3) Validierung -----------------------------------------------------------------------------
  const validated: ValidatedRow[] = [];
  candidates.forEach(candidate => {
    const outcome = validateRow(candidate, profile, fxRatesToEur, scrapeEvidenceTtlMs);
    if ('reason' in outcome) {
      debug.rejectedListings++;
      countBy(debug.rejectionReasons, outcome.reason);
      const sample = {
        source: SOURCE_META[candidate.sourceKey].display,
        title: String(candidate.title || '').slice(0, 120),
        priceText: String(candidate.priceText || candidate.price || ''),
        reason: outcome.reason,
      };
      const seen = debug.rejectedSamples.some(
        item => item.title === sample.title && item.reason === sample.reason && item.source === sample.source
      );
      if (!seen && debug.rejectedSamples.length < 40) debug.rejectedSamples.push(sample);
      return;
    }
    validated.push(outcome.row);
    if (candidate.section) perPage[candidate.section.sectionId].validatedListings++;
  });

  const deduped = dedupeMarketRows(validated);
  debug.duplicatesRemoved = validated.length - deduped.length;

  // 4) Preisführer abtrennen – sie sind nie Teil eines Marktwerts ---------------------------------
  const guideRows = deduped.filter(row => row.kind === 'guide');
  const marketRows = deduped.filter(row => row.kind !== 'guide');
  const priceGuides: PriceGuideEntry[] = guideRows.map(row => ({
    providerId: 'scrape',
    source: row.source,
    label: row.title,
    segment: row.grading && row.grading !== 'raw' ? 'graded' : 'raw',
    condition: normalizeCardCondition(row.condition),
    grading: null,
    priceType: null,
    price: row.price,
    currency: 'EUR',
    eur: null,
    matchesTarget: false,
    url: row.url || null,
    observedAt: row.observedAt ?? null,
    fetchedAt: row.fetchedAt || searchedAt,
    expiresAt: row.expiresAt || searchedAt,
  }));
  priceGuides.push(...providerGuides);
  debug.priceGuidesFound = priceGuides.length;

  // 5) Gruppierung – bei gegradeten Karten zwei strikt getrennte Märkte -------------------------
  const rawBaseRows = marketRows.filter(row => row.rawCardBase);
  const comparableRows = marketRows.filter(row => !row.rawCardBase);
  const bucketRows: Record<ConditionKey, ValidatedRow[]> = { new: [], likeNew: [], used: [], defective: [] };
  const dropOutliers = <T extends MarketListing>(rows: T[]) => {
    const { kept, outliers } = cleanMarketRows(rows);
    outliers.forEach(row => {
      countBy(debug.rejectionReasons, 'price_outlier');
      if (debug.rejectedSamples.length < 40) {
        debug.rejectedSamples.push({ source: row.source, title: row.title.slice(0, 120), priceText: formatEuro(row.price), reason: 'price_outlier' });
      }
    });
    debug.rejectedListings += outliers.length;
    return kept;
  };
  // Sammelkarten: Verkäufe nur gegen Verkäufe desselben exakten Segments prüfen. Exakt passende
  // Angebote bleiben vollständig sichtbar (kein Preisfilter) und fließen nie in einen Wert ein.
  // Nicht-Karten: unverändert.
  const dropSegmentOutliers = (rows: ValidatedRow[]) =>
    isCard
      ? [...dropOutliers(rows.filter(row => row.type === 'sold')), ...rows.filter(row => row.type !== 'sold')]
      : dropOutliers(rows);
  (Object.keys(bucketRows) as ConditionKey[]).forEach(key => {
    bucketRows[key] = dropSegmentOutliers(comparableRows.filter(row => row.conditionGroup === key));
  });
  const baseRows = dropSegmentOutliers(rawBaseRows);

  const finalRows: ValidatedRow[] = [...bucketRows.new, ...bucketRows.likeNew, ...bucketRows.used, ...bucketRows.defective, ...baseRows];
  debug.validatedListings = finalRows.length;
  debug.rawCardListings = isCard ? finalRows.filter(row => row.gradingClass === 'raw').length : 0;
  debug.exactGradingListings = finalRows.filter(row => row.gradingClass === 'exact').length;
  debug.acceptedSamples = finalRows.slice(0, 40).map(row => ({
    source: row.source,
    title: row.title.slice(0, 120),
    price: row.price,
    class: row.gradingClass === 'exact' ? 'grading_exact' : row.gradingClass === 'raw' ? 'raw_card' : row.conditionGroup,
  }));

  const conditionPrices: ConditionPriceSet = {
    new: conditionMarketPrice(bucketRows.new, isCard),
    likeNew: conditionMarketPrice(bucketRows.likeNew, isCard),
    used: conditionMarketPrice(bucketRows.used, isCard),
    defective: conditionMarketPrice(bucketRows.defective, isCard),
  };

  // Kein Kartenbasiswert: ungegradete Treffer werden bei gegradeten Karten bereits verworfen.
  const cardBaseValue: ConditionMarketPrice | null = null;
  const exactGradingValue: ConditionMarketPrice | null = isCard && grading ? conditionPrices.likeNew : null;
  debug.cardBaseValue = cardBaseValue;
  debug.exactGradingValue = exactGradingValue;

  const headline = buildHeadline(targetKey, grading, isCard, conditionPrices);
  debug.headline = headline;

  // 5) Status ----------------------------------------------------------------------------------
  const providerRowCount = candidates.filter(candidate => !candidate.section).length;
  let status: MarketSearchStatus;
  if (!sections.length && !providerRowCount) {
    status = 'sources_unreachable';
  } else if (!debug.rawListingsExtracted) {
    status = failedGroups > 0 ? 'extraction_failed' : 'no_exact_matches';
  } else if (!finalRows.length) {
    const identityRejects = Object.entries(debug.rejectionReasons)
      .filter(([reason]) => IDENTITY_REASONS.has(reason))
      .reduce((sum, [, count]) => sum + count, 0);
    status = identityRejects >= debug.rejectedListings / 2 ? 'no_exact_matches' : 'filtered_all';
  } else if (headline.kind === 'condition' || headline.kind === 'exact_grading') {
    status = 'found';
  } else {
    status = 'low_sample';
  }
  // Ergänzende Suche ohne Wert: der Anbieterstatus (Karte eindeutig, zu wenige Belege) bleibt maßgeblich.
  // Karte eindeutig, Marktplatzbelege vorhanden, aber keine 2 Verkäufe → zu wenige Belege.
  if (providerFallbackStatus && status === 'low_sample') status = 'card_identified_insufficient_evidence';
  else if (providerFallbackStatus && status !== 'found') status = providerFallbackStatus;

  const sold = finalRows.filter(row => row.type === 'sold');
  const offers = finalRows.filter(row => row.type === 'offer');
  const readableLabels = Array.from(new Set(sections.map(section => SOURCE_META[section.sourceKey].display)));
  providers.forEach(provider => readableLabels.push(SOURCE_META[provider.sourceKey].display));
  const unreadable = pages.length - sections.length;
  const partial =
    unreadable > 0 && status !== 'sources_unreachable'
      ? ' (' + unreadable + ' von ' + pages.length + ' Quellenabrufen lieferten keine lesbaren Preise.)'
      : '';

  return finish(status, {
    connected: true,
    sourcesChecked: readableLabels,
    soldComparables: sold,
    currentOffers: offers,
    soldMedian: marketMedian(sold.filter(row => !row.rawCardBase)),
    offerMedian: marketMedian(offers.filter(row => !row.rawCardBase)),
    conditionPrices,
    cardBaseValue,
    exactGradingValue,
    headline,
    priceGuides,
    message:
      providerMessage +
      (headline.note ? headline.note + ' ' : '') +
      STATUS_MESSAGES[status] +
      partial +
      (priceGuides.length ? ' Preisführer werden separat angezeigt und sind nicht Teil des Marktwerts.' : ''),
  });
}

// ---------------------------------------------------------------------------
// Bewertung – nutzt dieselbe Headline wie Status und Anzeige.
// FIX: Bei gegradeten Karten wurde der Basiswert nur für "Drittanbieter-Grader" genutzt; jetzt
//      gilt für jede Grading-Firma: exakter Vergleich, sonst Kartenbasiswert mit Hinweis.
// ---------------------------------------------------------------------------

function marketValuation(analysis: Analysis, market: MarketData): Valuation | null {
  const headline = market.headline;
  // Vergleichsobjekte dürfen niemals als exakt identifizierter Marktwert ausgegeben werden.
  // Die Spanne bleibt in market.headline erhalten und wird vom Anzeigevertrag separat dargestellt.
  if (market.objectMatch && !market.objectMatch.marketValueAllowed) return null;
  if (!headline || headline.price == null || headline.from == null || headline.to == null) return null;

  const allRows = [...market.soldComparables, ...market.currentOffers];
  const key = targetConditionKey(analysis);
  const rows =
    headline.kind === 'exact_grading'
        ? allRows.filter(row => row.gradingClass === 'exact')
        : allRows.filter(row => row.conditionGroup === key && !row.rawCardBase);

  const relevance = rows.length ? rows.reduce((sum, row) => sum + row.relevance, 0) / rows.length : 0;
  const quality: 'niedrig' | 'mittel' | 'hoch' =
    headline.soldCount >= 4 && headline.sampleCount >= 5 && relevance >= 0.75 ? 'hoch' : headline.sampleCount >= 3 ? 'mittel' : 'niedrig';

  const sensitive = ['uhren', 'schmuck', 'gemalde', 'drucke', 'munzen', 'antiquitaten', 'teppiche'].includes(normalize(analysis.category));

  return {
    market: headline.price,
    from: headline.from,
    to: headline.to,
    quick: headline.from,
    privateSale: headline.price,
    dealer: headline.from,
    dataQuality: quality,
    professionalReview: sensitive && (headline.price >= 500 || analysis.confidence < 0.82),
    basis:
      headline.basis.replace(/\.+$/, '') +
      '.' +
      (headline.note ? ' ' + headline.note : '') +
      (headline.fxNote ? ' ' + headline.fxNote : '') +
      ' Erkannter Zustand: ' +
      analysis.condition +
      '. Keine Offline-Basispreise werden verwendet.',
    matchConfidence: relevance,
  };
}

export {
  marketRowSchema,
  marketExtractSchema,
  marketSearchVariants,
  buildQueryPlan,
  buildSearchPages,
  cleanMarketRows,
  emptyConditionMarketPrice,
  emptyConditionPriceSet,
  conditionMarketPrice,
  detectedConditionKey,
  targetConditionKey,
  dedupeMarketRows,
  marketMedian,
  liveMarketLookup,
  marketValuation,
  // für Tests/Diagnose:
  parseLocalePrice,
  priceGrounded,
  condenseListingText,
  conditionGroupFromText,
  identityRejection,
  cardIdentityMatch,
  canonicalCardNumber,
  buildIdentityProfile,
  gradingOf,
  targetGrading,
  readScrapeResult,
  readExtractItems,
};
