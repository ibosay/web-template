/**
 * WertScan – Marktpreis-Pipeline (korrigierte Fassung)
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
 * Die Bilderkennung wird nicht angefasst. Alle Änderungen betreffen ausschließlich
 * Query-Aufbau, Quellenabruf, Extraktion, Validierung, Zustandszuordnung und Aggregation.
 *
 * Grundsatz: Jeder ausgegebene Preis stammt aus einem externen Marktbeleg, dessen Preistext
 * nachweislich im abgerufenen Quelltext steht. Es gibt keine Seed-, Schätz- oder Offline-Preise.
 */

// ---------------------------------------------------------------------------
// Quellen: EINE Quelle der Wahrheit für Typ, Schema, Prompt und Anzeige.
// Behebt die Inkonsistenz "cardmarket_public fehlt im Schema-Enum": Keys können nicht mehr
// auseinanderlaufen, weil Typ und Metadaten aus derselben Konstante abgeleitet werden und die
// Extraktion gar keinen sourceKey mehr zurückgibt (sondern eine sectionId, siehe unten).
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

// Record<SourceKey, …> erzwingt beim Kompilieren, dass jeder Key Metadaten hat.
const SOURCE_META: Record<SourceKey, SourceMeta> = {
  ebay_sold: { display: 'eBay verkauft', kind: 'sold', retailNew: false },
  ebay_offer: { display: 'eBay Angebot', kind: 'offer', retailNew: false },
  willhaben_offer: { display: 'Willhaben Angebot', kind: 'offer', retailNew: false },
  geizhals_offer: { display: 'Geizhals Angebot', kind: 'offer', retailNew: true },
  mediamarkt_offer: { display: 'MediaMarkt Angebot', kind: 'offer', retailNew: true },
  bricklink_guide: { display: 'BrickLink Marktindikator', kind: 'guide', retailNew: false },
  cardmarket_offer: { display: 'Cardmarket', kind: 'offer', retailNew: false },
  pricecharting_guide: { display: 'PriceCharting Marktindikator', kind: 'guide', retailNew: false },
  chrono24_offer: { display: 'Chrono24', kind: 'offer', retailNew: false },
  abebooks_offer: { display: 'AbeBooks', kind: 'offer', retailNew: false },
  discogs_offer: { display: 'Discogs', kind: 'offer', retailNew: false },
  web_search: { display: 'Websuche', kind: 'offer', retailNew: false },
};

// ---------------------------------------------------------------------------
// Typen (abwärtskompatibel erweitert: alle bisherigen Felder bleiben erhalten)
// ---------------------------------------------------------------------------

type MarketListing = {
  source: string;
  title: string;
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
  /** 'raw' oder z. B. 'psa 10'; nur bei Sammelkarten gesetzt. */
  grading?: string;
  /** Rohkarten-Beleg für eine gegradete Karte: nur Basiswert, kein Grading-Vergleich. */
  rawCardBase?: boolean;
  originalPrice?: number;
  originalCurrency?: string;
};

type ConditionMarketPrice = {
  price: number | null;
  from: number | null;
  to: number | null;
  soldCount: number;
  offerCount: number;
  sampleCount: number;
  basis: string;
  // neu:
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
  | 'insufficient_identity';

type UnreadableReason = 'http_error' | 'scrape_failed' | 'timeout' | 'empty' | 'blocked' | 'no_prices';

type SourceDiagnostic = {
  sourceKey: SourceKey;
  display: string;
  queryIndex: number;
  query: string;
  url: string;
  httpStatus: number | null;
  readable: boolean;
  unreadableReason: UnreadableReason | null;
  priceSignals: number;
  textChars: number;
  rawListings: number;
  validatedListings: number;
  extractionError: string | null;
};

export type MarketDiagnostics = {
  marketSearchStatus: MarketSearchStatus;
  sourcesAttempted: number;
  sourcesReadable: number;
  sourcesWithListings: number;
  rawListingsFound: number;
  validatedListings: number;
  rejectedListings: number;
  duplicatesRemoved: number;
  rejectionReasons: Record<string, number>;
  extractionErrors: string[];
  perSource: SourceDiagnostic[];
};

type MarketData = {
  connected: boolean;
  query: string;
  searchedQueries: string[];
  /** Nur Quellen, deren Inhalt tatsächlich lesbar war (vorher: alle versuchten). */
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
  diagnostics: MarketDiagnostics;
  /** Rohkarten-Basiswert derselben Karte bei gegradeten Karten (separat, kein Grading-Vergleich). */
  cardBaseValue: ConditionMarketPrice | null;
};

/** Optionaler strukturierter Datenlieferant (z. B. eBay Browse API) – läuft durch dieselbe Validierung. */
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
  log?: (event: string, data: unknown) => void;
};

// ---------------------------------------------------------------------------
// Extraktions-Schema
// Fix 1: sourceKey wird NICHT mehr vom Modell geliefert. Das Modell nennt nur die sectionId des
//        Abschnitts; Quelle, URL und Verkauft/Angebot werden deterministisch daraus abgeleitet.
//        Damit ist jede Enum-Inkonsistenz (cardmarket_public) strukturell ausgeschlossen.
// Fix 2: Flache Liste mit conditionGroup statt vier Arrays – kleinere Ausgaben, weniger
//        Abbrüche durch maxTokens, Zustand wird zusätzlich deterministisch geprüft.
// Fix 3: priceText (wörtlich) wird mitgeliefert und gegen den Quelltext geprüft (Anti-Halluzination).
// ---------------------------------------------------------------------------

const MAX_ITEMS_PER_EXTRACT = 20;

const marketRowSchema = {
  type: 'object',
  properties: {
    sectionId: { type: 'integer', minimum: 0 },
    title: { type: 'string' },
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

const looseTokens = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const compactId = (value: string) => looseTokens(value).join('');

const collapse = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasLettersAndDigits = (token: string) => /[a-z]/.test(token) && /\d/.test(token);

/** Unter 20 € auf Cent runden (Sammelkarten für 0,40 € dürfen nicht zu 1 € werden), sonst ganze Euro. */
const roundPrice = (value: number) =>
  value < 20 ? Math.round(value * 100) / 100 : Math.round(value);

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
// Seiteninhalt: Lesbarkeit prüfen und auf Listings verdichten
// Fix: HTTP < 400 allein galt als "lesbar". Jetzt zählt nur Text mit Preissignalen; Bot-/Consent-/
//      Captcha-Seiten werden als 'blocked' erkannt. Statt text.slice(0, 8500) (bei eBay fast nur
//      Navigation) werden gezielt die Zeilen um Preise herum behalten.
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

function condenseListingText(text: string, maxChars = 6000) {
  let lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // Manche Scraper liefern einen einzigen Fließtext – dann an typischen Trennern aufteilen.
  if (lines.length < 20) {
    lines = lines.flatMap(line => line.split(/\s{2,}| \| | · |(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/)).filter(Boolean);
  }
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (!PRICE_TEST.test(line)) return;
    for (let j = Math.max(0, index - 3); j <= Math.min(lines.length - 1, index + 2); j++) keep.add(j);
  });
  const condensed = [...keep]
    .sort((a, b) => a - b)
    .map(index => lines[index])
    .join('\n');
  return condensed.slice(0, maxChars);
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

const isPriceRange = (priceText: string) =>
  /\b(bis|to)\b/i.test(priceText) || /\d\s*[-–]\s*\d/.test(priceText);

function priceVariants(price: number) {
  const fixed = price.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withThousands = (sep: string) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const variants = [
    withThousands('.') + ',' + dec,
    intPart + ',' + dec,
    withThousands(',') + '.' + dec,
    fixed,
  ];
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
    return new RegExp(currency + '\\s?' + v + '(?![\\d])|(?<![\\d.,])' + v + '\\s?' + currency, 'i').test(
      haystack
    );
  });
}

function titleGrounded(title: string, haystackTokens: Set<string>) {
  const tokens = looseTokens(title).filter(token => token.length >= 3);
  if (!tokens.length) return false;
  return tokens.filter(token => haystackTokens.has(token)).length / tokens.length >= 0.5;
}

// ---------------------------------------------------------------------------
// Zustandsgruppen
// Fix: "neu ovp", "originalverpackt", "sealed", "brandneu", "new" landeten bisher in 'used',
//      weil nur n === 'neu' geprüft wurde. Gegradete Karten gelten als likeNew.
// ---------------------------------------------------------------------------

function conditionGroupFromText(text: string): ConditionKey | null {
  const n = ' ' + looseTokens(text).join(' ') + ' ';
  if (n.trim() === '') return null;
  const negatedDefect = / (nicht|kein|keine|ohne|no) (defekt|defekte|kaputt|defects?) /.test(n);
  if (
    !negatedDefect &&
    / (defekt|defekte|kaputt|bastler\w*|ersatzteil\w*|ersatzteilspender|for parts|not working|broken|defective|beschadigt|funktioniert nicht) /.test(
      n
    )
  ) {
    return 'defective';
  }
  if (/ (neuwertig\w*|wie neu|like new|sehr gut|near mint|mint|nm|hervorragend|top zustand) /.test(n)) {
    return 'likeNew';
  }
  if (/ (gebraucht|used|pre owned|preowned|getragen|bespielt|gut|akzeptabel|played|refurbished|generalüberholt|generaluberholt) /.test(n)) {
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

function isGradedCard(analysis: Analysis) {
  return isCardAnalysis(analysis) && Boolean(targetGrading(analysis));
}

/** Zustandsgruppe des gescannten Gegenstands (gegradete Karten => likeNew). */
function targetConditionKey(analysis: Analysis): ConditionKey {
  if (isGradedCard(analysis)) return 'likeNew';
  return detectedConditionKey(analysis.condition);
}

// ---------------------------------------------------------------------------
// Grading (Sammelkarten)
// ---------------------------------------------------------------------------

type Grading = { company: string; grade: string };

const GRADER_PATTERN =
  /\b(psa|bgs|beckett|cgc|pca|sgc|ace|tag|ags|gma|mnt|ccc)\s*(?:grade\s*|note\s*)?(10|[1-9](?:[.,]5)?)(?![\d])/i;

const normalizeGrader = (company: string) => {
  const c = company.toLowerCase().trim();
  return c === 'beckett' ? 'bgs' : c;
};

function gradingOf(text: string): Grading | null {
  const match = String(text || '').match(GRADER_PATTERN);
  return match ? { company: normalizeGrader(match[1]), grade: match[2].replace(',', '.') } : null;
}

function targetGrading(analysis: Analysis): Grading | null {
  const company = known(analysis.cardDetails?.gradingCompany);
  if (!company) return null;
  const grade = known(analysis.cardDetails?.grade).replace(',', '.');
  const parsed = gradingOf(company + ' ' + grade);
  return parsed || { company: normalizeGrader(compactId(company)), grade };
}

const MAJOR_GRADERS = ['psa', 'bgs', 'cgc'];

// ---------------------------------------------------------------------------
// Identitätsprofil – deterministische Prüfung, ob ein Treffer DASSELBE Produkt ist
// ---------------------------------------------------------------------------

const VARIANT_WORDS = ['pro', 'max', 'mini', 'plus', 'ultra', 'lite'];
const COVERAGE_STOPWORDS = new Set(['und', 'mit', 'for', 'fur', 'the', 'der', 'die', 'das', 'neu', 'gebraucht', 'preis']);
const ACCESSORY_WORDS = [
  'hulle',
  'schutzhulle',
  'silikonhulle',
  'cover',
  'skin',
  'sticker',
  'aufkleber',
  'schutzfolie',
  'panzerglas',
  'displayschutz',
  'etui',
];
const LOT_WORDS = ['konvolut', 'sammlung', 'lot', 'bundle', 'bulk', 'paket'];
const FAKE_CARD_WORDS = ['proxy', 'fake', 'custom', 'replica', 'orica', 'fanart'];

type IdentityProfile = {
  isCard: boolean;
  cardNumberCompact: string;
  cardNumberLead: string;
  cardNameTokens: string[];
  setTokens: string[];
  primaryHardTokens: string[];
  boostTokens: string[];
  identityTokens: Set<string>;
  generation: string | null;
  matchQueries: string[];
  grading: Grading | null;
};

function isCardAnalysis(analysis: Analysis) {
  return normalize(analysis.category) === 'sammelkarten' || normalize(analysis.objectType) === 'sammelkarte';
}

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
  const cardNumber = known(c?.cardNumber);
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
  return {
    isCard,
    cardNumberCompact: compactId(cardNumber),
    cardNumberLead: looseTokens(cardNumber)[0] || '',
    cardNameTokens: looseTokens(known(c?.cardName)),
    setTokens: looseTokens(known(c?.setName)).filter(token => token.length >= 3),
    // Ist das Modell selbst eine Kennung wie "G213", muss sie im Treffer stehen.
    primaryHardTokens: modelTokens.filter(token => token.length >= 3 && hasLettersAndDigits(token)),
    // Modellnummer/SKU (z. B. A2540) fehlt oft in Titeln: nur Bestätigung, keine Pflicht.
    boostTokens: [known(d?.modelNumber), known(d?.skuOrPartNumber)]
      .map(compactId)
      .filter(token => token.length >= 4),
    identityTokens: new Set(looseTokens(identityText)),
    generation: generationOf([model, known(d?.generation), analysis.title].join(' ')),
    matchQueries: queries,
    grading: isCard ? targetGrading(analysis) : null,
  };
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
  if (/ (leerkarton|nur ovp|nur box|nur karton|nur verpackung|empty box|box only) /.test(text)) {
    return 'packaging_only';
  }
  const foreign = (words: string[]) => words.some(word => tokenSet.has(word) && !profile.identityTokens.has(word));
  if (foreign(ACCESSORY_WORDS)) return 'accessory';
  if (foreign(LOT_WORDS)) return 'lot_or_bundle';

  if (profile.isCard) {
    if (foreign(FAKE_CARD_WORDS)) return 'fake_or_proxy';
    if (profile.cardNumberCompact) {
      if (compact.includes(profile.cardNumberCompact)) return null;
      const leadMatches = profile.cardNumberLead && tokenSet.has(profile.cardNumberLead);
      const nameMatches =
        profile.cardNameTokens.length > 0 && profile.cardNameTokens.every(token => tokenSet.has(token));
      const setMatches = profile.setTokens.some(token => tokenSet.has(token));
      return leadMatches && (nameMatches || setMatches) ? null : 'card_number_mismatch';
    }
    return profile.cardNameTokens.length && profile.cardNameTokens.every(token => tokenSet.has(token))
      ? null
      : 'card_name_mismatch';
  }

  if (VARIANT_WORDS.some(word => tokenSet.has(word) && !profile.identityTokens.has(word))) {
    return 'variant_mismatch';
  }
  const titleGeneration = generationOf(title);
  if (profile.generation && titleGeneration && titleGeneration !== profile.generation) {
    return 'generation_mismatch';
  }
  if (profile.boostTokens.some(token => compact.includes(token))) return null;
  if (profile.primaryHardTokens.length && !profile.primaryHardTokens.some(token => compact.includes(token))) {
    return 'model_mismatch';
  }
  const bestCoverage = Math.max(0, ...profile.matchQueries.map(query => queryCoverage(query, tokenSet)));
  return bestCoverage >= 0.6 ? null : 'model_mismatch';
}

// ---------------------------------------------------------------------------
// Query-Aufbau
// Fix: Die bisherige Primär-Query hängte Marke, Modell, Modellnummer, SKU, Generation,
//      Speicher bzw. Set, Seltenheit, Finish, Grading aneinander. eBay/Willhaben verknüpfen
//      alle Wörter mit UND → 0 Treffer. Außerdem stand ein Barcode an Position 0 und wurde so
//      auch an Cardmarket/PriceCharting geschickt. Jetzt: kurze, gestufte Queries (max. 8 Wörter),
//      spezifische Queries pro Quelle, Kartennummer als sprachunabhängige Suche ("Glurak" vs.
//      "Charizard" auf eBay.de).
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

function marketSearchVariants(analysis: Analysis): string[] {
  const candidates: string[] = [];
  const add = (...parts: string[]) => {
    const query = cleanQuery(parts.filter(Boolean).join(' '));
    if (query.length >= 3) candidates.push(query);
  };

  if (isCardAnalysis(analysis) && analysis.cardDetails) {
    const c = analysis.cardDetails;
    const name = known(c.cardName);
    const number = known(c.cardNumber);
    const set = known(c.setName);
    const franchise = known(c.franchise);
    const grading = targetGrading(analysis);
    if (grading && name) add(name, number, grading.company.toUpperCase(), grading.grade);
    if (name) add(name, number);
    if (franchise && number) add(franchise, number);
    if (name && set) add(name, number, set);
    if (franchise && name) add(franchise, name, number);
  } else {
    const d = analysis.universalDetails;
    const special =
      (analysis.casioDetails && isCasioWatch(analysis)) ||
      (analysis.hotWheelsDetails && isHotWheelsAnalysis(analysis)) ||
      (normalize(analysis.category) === 'modellautos' && analysis.modelCarDetails);
    if (special) add(marketQuery(analysis));

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

    if (model) add(brandPrefix, modelWithGeneration);
    productAliasQueries(analysis).forEach(alias => add(alias));
    if (brand && modelNumber) add(brand, modelNumber);
    if (brand && sku) add(brand, sku);
    if (!model) {
      add(brand, known(d?.productFamily));
      add(brand, known(analysis.objectType));
    }
    add(marketQuery(analysis));
    if (analysis.title) add(analysis.title);
  }

  const seen = new Set<string>();
  return candidates
    .filter(query => {
      const key = normalize(query);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, isCardAnalysis(analysis) ? 4 : 3);
}

// ---------------------------------------------------------------------------
// Suchseiten
// Fix: Google-Suche liefert serverseitig fast immer Consent/Captcha → durch DuckDuckGo-HTML und
//      Bing ersetzt, ohne erzwungene Exakt-Phrase und ohne Keyword-Ballast.
// Fix: cardmarket_public (Cardmarket-Startseite) entfernt: Sie enthält nie die gesuchte Karte,
//      nur Preise anderer Karten – reines Fehlerrisiko und ein verschwendeter Abruf.
// Fix: Chrono24/AbeBooks über .de-Domains (EUR). PriceCharting/Discogs liefern oft USD →
//      werden nur mit echtem Wechselkurs verwendet, sonst sauber als 'currency_not_eur' verworfen.
// ---------------------------------------------------------------------------

type SearchPage = {
  sourceKey: SourceKey;
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

function buildSearchPages(analysis: Analysis, queries: string[]): SearchPage[] {
  const category = normalize(analysis.category);
  const objectType = normalize(analysis.objectType);
  const brand = normalize(analysis.brand);
  const signals = categorySignals(analysis);
  const d = analysis.universalDetails;

  const isCard = isCardAnalysis(analysis);
  const isLego = category === 'lego' || brand === 'lego' || objectType === 'lego set' || objectType === 'minifigur';
  const isGame =
    category === 'videospiele' || category === 'konsolen' || objectType === 'videospiel' || objectType === 'spielkonsole';
  const isWatch =
    category === 'uhren' &&
    objectType !== 'smartwatch' &&
    !signals.includes('apple watch') &&
    !signals.includes('galaxy watch') &&
    !isCasioWatch(analysis);
  const isBook = category === 'bucher' || objectType === 'buch';
  const isVinyl = category === 'schallplatten' || category === 'vinyl' || objectType === 'schallplatte';
  // Fix: vorher Whitelist – Kategorien wie "zubehor"/"elektronik" (Siri Remote) fielen heraus.
  const checkRetailNew = !isCard && !NON_RETAIL_CATEGORIES.has(category);

  const pages: SearchPage[] = [];
  const push = (sourceKey: SourceKey, queryIndex: number, query: string, url: string) =>
    pages.push({ sourceKey, queryIndex, query, url });

  queries.forEach((query, index) => {
    const q = encodeURIComponent(query);
    push('ebay_sold', index, query, 'https://www.ebay.de/sch/i.html?_nkw=' + q + '&_sacat=0&LH_Sold=1&LH_Complete=1&rt=nc');
    push('ebay_offer', index, query, 'https://www.ebay.de/sch/i.html?_nkw=' + q + '&_sacat=0&rt=nc');
    if (index < 2) {
      push('willhaben_offer', index, query, 'https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=' + q);
      push('web_search', index, query, 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query + ' Preis €'));
    }
    if (index === 0) {
      push('web_search', index, query, 'https://www.bing.com/search?setlang=de&cc=AT&q=' + encodeURIComponent(query + ' Preis'));
    }
  });

  const primary = queries[0] || '';
  const encodedPrimary = encodeURIComponent(primary);

  if (checkRetailNew && primary) {
    const barcode = known(d?.barcodeOrEan);
    const geizhalsQuery = barcode && isValidGtin(barcode) ? digitsOnly(barcode) : primary;
    push('geizhals_offer', 0, geizhalsQuery, 'https://geizhals.at/?fs=' + encodeURIComponent(geizhalsQuery) + '&hloc=at&hloc=de');
    push('mediamarkt_offer', 0, primary, 'https://www.mediamarkt.at/de/search.html?query=' + encodedPrimary);
  }

  if (isLego) {
    const setNumber = (known(d?.modelNumber) || known(d?.skuOrPartNumber)).trim();
    const url = /^\d{3,7}(?:-\d+)?$/.test(setNumber)
      ? 'https://www.bricklink.com/catalogPG.asp?S=' + encodeURIComponent(setNumber.includes('-') ? setNumber : setNumber + '-1')
      : 'https://www.bricklink.com/v2/search.page?q=' + encodedPrimary;
    push('bricklink_guide', 0, setNumber || primary, url);
  }

  if (isCard) {
    const gamePath = cardmarketGamePath(analysis);
    // Cardmarket findet Karten über den Namen, nicht über Nummer/Set/Grading.
    const cardName = known(analysis.cardDetails?.cardName) || primary;
    if (gamePath && cardName) {
      push(
        'cardmarket_offer',
        0,
        cardName,
        'https://www.cardmarket.com/de/' + gamePath + '/Products/Search?searchString=' + encodeURIComponent(cardName)
      );
    }
  }

  if (isGame && primary) {
    push('pricecharting_guide', 0, primary, 'https://www.pricecharting.com/search-products?type=prices&q=' + encodedPrimary);
  }
  if (isWatch && primary) {
    push('chrono24_offer', 0, primary, 'https://www.chrono24.de/search/index.htm?query=' + encodedPrimary);
  }
  if (isBook) {
    const isbn = known(d?.barcodeOrEan);
    const url = isValidIsbn(isbn)
      ? 'https://www.abebooks.de/servlet/SearchResults?isbn=' + encodeURIComponent(digitsOnly(isbn))
      : 'https://www.abebooks.de/servlet/SearchResults?kn=' + encodedPrimary;
    push('abebooks_offer', 0, isbn || primary, url);
  }
  if (isVinyl && primary) {
    push('discogs_offer', 0, primary, 'https://www.discogs.com/search/?q=' + encodedPrimary + '&type=release');
  }

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
    basis: 'Keine passenden Marktbelege in dieser Zustandsgruppe gefunden.',
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
 * Fix: (1) Ein Verkauf + ein Angebot ergab bisher keinen Preis, obwohl 2 echte Belege vorlagen.
 *      (2) Genau ein Beleg wird jetzt als 'low_sample' mit referencePrice diagnostiziert statt
 *          wie "kein Markt" auszusehen – er wird aber bewusst NICHT als Marktpreis ausgegeben.
 *      (3) Kein doppelter IQR-Filter auf Kleinstmengen; kein Math.max(1, …), das 0,40-€-Karten
 *          zu 1 € machte.
 */
function conditionMarketPrice(rows: MarketListing[]): ConditionMarketPrice {
  const sold = rows.filter(row => row.type === 'sold');
  const offers = rows.filter(row => row.type === 'offer');
  const counts = { soldCount: sold.length, offerCount: offers.length, sampleCount: rows.length };

  if (!rows.length) return emptyConditionMarketPrice();

  if (rows.length === 1) {
    const only = rows[0];
    return {
      ...emptyConditionMarketPrice(),
      ...counts,
      status: 'low_sample',
      referencePrice: roundPrice(only.price),
      basis:
        'Nur ein passender Marktbeleg (' +
        only.source +
        ') – zu wenig Daten für einen verlässlichen Marktpreis. Der Einzelbeleg wird nur als Referenz gezeigt.',
    };
  }

  let evidence: number[];
  let basis: string;
  if (sold.length >= 2) {
    evidence = sold.map(row => row.price);
    basis = 'Median aus tatsächlich verkauften Vergleichsartikeln';
  } else if (sold.length === 1) {
    evidence = rows.map(row => row.price);
    basis = 'Ein verkaufter Vergleich plus aktuelle Marktangebote';
  } else {
    evidence = offers.map(row => row.price);
    basis =
      offers.length >= 3
        ? 'Median aus aktuellen Marktangeboten, keine ausreichenden Verkaufsdaten'
        : 'Median aus zwei passenden aktuellen Marktangeboten, geringe Datenbasis';
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

/** Fix: Schlüssel ohne Datum/Quelle, damit dasselbe Listing aus mehreren Query-Varianten nur einmal zählt. */
function dedupeMarketRows(rows: MarketListing[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = normalize(row.title) + '|' + row.price.toFixed(2) + '|' + row.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Entfernt Ausreißer je Gruppe (nur ab 4 Belegen). Liefert behaltene und verworfene Zeilen. */
function cleanMarketRows(rows: MarketListing[]) {
  if (rows.length < 4) return { kept: rows, outliers: [] as MarketListing[] };
  const keptPrices = new Set(iqrFilter(rows.map(row => row.price)));
  return {
    kept: rows.filter(row => keptPrices.has(row.price)),
    outliers: rows.filter(row => !keptPrices.has(row.price)),
  };
}

// ---------------------------------------------------------------------------
// Extraktion je Quelle
// Fix: Vorher EIN ai.extract-Aufruf für alle Quellen, ohne try/catch, maxTokens 3600 für bis zu
//      64 Zeilen → Abbruch/Schemafehler ließ die gesamte Pipeline leer bzw. warf eine Exception.
//      Jetzt: ein Aufruf pro Quelle, parallel, isoliert, mit Timeout und Fehlerdiagnose.
// ---------------------------------------------------------------------------

type ReadableSection = SearchPage & { sectionId: number; text: string; haystack: string; tokens: Set<string> };

const EXTRACT_SYSTEM = [
  'Du extrahierst ausschließlich reale Marktangebote, Verkäufe und Preisführer-Werte aus den bereitgestellten Abschnitten.',
  'Erfinde niemals Produkte, Preise, Zustände oder Daten. Wenn nichts Passendes sichtbar ist, gib eine leere Liste zurück.',
  'Nimm nur Treffer auf, bei denen Titel und Preis im selben sichtbaren Treffer stehen.',
  'priceText muss den Preis exakt so enthalten, wie er im Text steht (z. B. "1.234,56 €" oder "EUR 12,50").',
  'Keine Versandkosten, keine Preisspannen ("12 € bis 20 €"), keine durchgestrichenen Ursprungspreise, keine Ratenpreise.',
  'Bei verkauften eBay-Artikeln den tatsächlich erzielten Preis nehmen.',
  'Ignoriere Treffer unter Hinweisen wie "Ergebnisse für weniger Suchbegriffe", "Ähnliche Artikel", "Results matching fewer words" oder "Gesponsert", wenn sie nicht exakt passen.',
  'Ignoriere Suchgesuche ("Suche …"), Zubehör, Leerverpackungen, Konvolute und Sammlungen, außer genau das wird gesucht.',
  'sectionId ist die Nummer des Abschnitts, aus dem der Treffer stammt.',
  'conditionText: Zustandsangabe wörtlich aus dem Treffer, sonst leer.',
  'conditionGroup: new = fabrikneu/unbenutzt/versiegelt/Händler-Neuware; likeNew = neuwertig/wie neu/Near Mint/gegradet;',
  'used = gebraucht und funktionsfähig; defective = defekt/Bastlerware/Ersatzteile; unknown = nicht erkennbar.',
  'grading: bei Sammelkarten "raw" für ungegradete Karten, sonst Firma und Note wie "PSA 10" oder "PCA 9.5"; bei anderen Produkten leer.',
  'Bei Sammelkarten ist Kartenname plus Kartennummer die harte Identität; Set, Sprache, Finish und Seltenheit erhöhen nur die Relevanz. Nie den Preis einer anderen Kartennummer übernehmen.',
  'Prüfe Modell, Modellnummer, Generation, Speicher, Größe, Edition, Farbe, Maßstab streng. Ähnliche, aber andere Produkte erhalten relevance unter 0.4.',
  'relevance: 1 = exakt dasselbe Produkt, 0.7 = sehr wahrscheinlich dasselbe, unter 0.5 = zweifelhaft.',
  'currency: Währung des Preises (EUR, USD, GBP, CHF oder OTHER).',
  'date: Verkaufs- oder Angebotsdatum, falls sichtbar, sonst leer.',
].join(' ');

async function extractSourceGroup(
  sourceKey: SourceKey,
  sections: ReadableSection[],
  context: { identity: string; cardIdentity: string; grading: Grading | null },
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
    'Gesuchtes Produkt: ' + context.identity + '.',
    context.cardIdentity ? 'Verbindliche Kartenidentität (Name + Nummer): ' + context.cardIdentity + '.' : '',
    context.grading
      ? 'Gescannte Karte ist gegradet: ' + context.grading.company.toUpperCase() + ' ' + context.grading.grade +
        '. Extrahiere sowohl exakt passende gegradete Treffer als auch Raw-Treffer derselben Karte und kennzeichne sie im Feld grading.'
      : '',
    'Quelle: ' + meta.display + '. ' + sourceHint,
    'Extrahiere höchstens ' + MAX_ITEMS_PER_EXTRACT + ' passende Treffer.',
  ]
    .filter(Boolean)
    .join(' ');

  const content = sections
    .map(section => '=== SECTION ' + section.sectionId + ' | QUERY: ' + section.query + ' ===\n' + section.text)
    .join('\n\n');

  try {
    const extracted = await withTimeout(
      ai.extract({
        system: EXTRACT_SYSTEM,
        prompt,
        content,
        schema: marketExtractSchema,
        thinkingMode: 'FAST',
        maxRetries: 1,
        maxTokens: 4000,
        temperature: 0,
      }),
      timeoutMs,
      'extract:' + sourceKey
    );
    const items = (extracted?.data as { items?: ExtractedMarketRow[] } | undefined)?.items;
    return { rows: Array.isArray(items) ? items : [], error: null };
  } catch (error) {
    return { rows: [], error: sourceKey + ': ' + (error instanceof Error ? error.message : String(error)) };
  }
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
  /** Quelltext für die Belegprüfung; null bei strukturierten Providern (API). */
  section: ReadableSection | null;
};

type ValidatedRow = MarketListing & { conditionGroup: ConditionKey };

function validateRow(
  row: CandidateRow,
  profile: IdentityProfile,
  fxRatesToEur: Record<string, number>
): { row: ValidatedRow } | { reason: string } {
  const title = String(row.title || '').trim();
  if (!title) return { reason: 'missing_title' };

  const priceText = String(row.priceText || '').trim();
  if (priceText && isPriceRange(priceText)) return { reason: 'price_range' };

  const parsed = parseLocalePrice(priceText);
  let price = parsed != null ? parsed : Number(row.price);
  if (!Number.isFinite(price)) return { reason: 'invalid_price' };

  if (row.section) {
    // Anti-Halluzination: Preis und Titel müssen im gelesenen Quelltext stehen.
    if (!priceGrounded(priceText, price, row.section.haystack)) return { reason: 'price_not_in_source' };
    if (!titleGrounded(title, row.section.tokens)) return { reason: 'title_not_in_source' };
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

  const identityReason = identityRejection(title, profile);
  if (identityReason) return { reason: identityReason };

  const relevance = clamp01(row.relevance, 0);
  if (relevance < 0.5) return { reason: 'low_relevance' };

  const meta = SOURCE_META[row.sourceKey];

  let grading: string | undefined;
  let rawCardBase = false;
  if (profile.isCard) {
    const found = gradingOf(title) || gradingOf(row.grading);
    grading = found ? found.company + ' ' + found.grade : 'raw';
    if (profile.grading) {
      if (!found) rawCardBase = true;
      else if (found.company !== profile.grading.company || found.grade !== profile.grading.grade) {
        return { reason: 'grading_mismatch' };
      }
    } else if (found) {
      return { reason: 'graded_vs_raw' };
    }
  }

  const llmGroup = row.conditionGroup !== 'unknown' ? row.conditionGroup : null;
  let conditionGroup: ConditionKey =
    conditionGroupFromText(row.conditionText) ||
    llmGroup ||
    conditionGroupFromText(title) ||
    (meta.retailNew ? 'new' : 'used');
  if (profile.isCard && profile.grading && !rawCardBase) conditionGroup = 'likeNew';

  return {
    row: {
      source: meta.display,
      sourceKey: row.sourceKey,
      kind: meta.kind === 'guide' ? 'guide' : 'listing',
      title,
      price,
      currency: 'EUR',
      condition: row.conditionText || '',
      date: row.date || '',
      type: meta.kind === 'sold' ? 'sold' : 'offer',
      url: row.url,
      relevance,
      conditionGroup,
      grading,
      rawCardBase,
      originalPrice,
      originalCurrency,
    },
  };
}

// ---------------------------------------------------------------------------
// Statusmeldungen – ein technischer Quellenfehler ist NICHT "es gibt keinen Marktpreis"
// ---------------------------------------------------------------------------

const STATUS_MESSAGES: Record<MarketSearchStatus, string> = {
  loading: 'Marktpreise werden gesucht …',
  found: 'Marktpreise über mehrere Suchvarianten und Quellen geprüft. Jeder angezeigte Preis stammt ausschließlich aus passenden, im Quelltext belegten Marktdaten.',
  low_sample: 'Es wurden echte Marktbelege gefunden, aber zu wenige für einen verlässlichen Marktpreis im erkannten Zustand. Einzelbelege werden nur als Referenz gezeigt.',
  sources_unreachable: 'Die Marktquellen waren gerade technisch nicht lesbar (blockiert oder nicht erreichbar). Das bedeutet nicht, dass es keinen Markt gibt – bitte später erneut versuchen.',
  no_exact_matches: 'Die Quellen waren lesbar, enthielten aber keine Angebote oder Verkäufe exakt dieses Produkts.',
  extraction_failed: 'Die Marktseiten wurden gelesen, die Auswertung der Angebote ist jedoch technisch fehlgeschlagen. Bitte erneut versuchen.',
  filtered_all: 'Es wurden Angebote gefunden, aber keines hat die Prüfung auf Identität, Beleg und Plausibilität bestanden.',
  insufficient_identity: 'Keine Live-Marktsuche gestartet, weil der Gegenstand noch nicht sicher genug identifiziert ist.',
};

const IDENTITY_REASONS = new Set([
  'card_number_mismatch',
  'card_name_mismatch',
  'model_mismatch',
  'variant_mismatch',
  'generation_mismatch',
  'grading_mismatch',
  'graded_vs_raw',
  'low_relevance',
]);

function emptyDiagnostics(status: MarketSearchStatus): MarketDiagnostics {
  return {
    marketSearchStatus: status,
    sourcesAttempted: 0,
    sourcesReadable: 0,
    sourcesWithListings: 0,
    rawListingsFound: 0,
    validatedListings: 0,
    rejectedListings: 0,
    duplicatesRemoved: 0,
    rejectionReasons: {},
    extractionErrors: [],
    perSource: [],
  };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

async function liveMarketLookup(analysis: Analysis, options: MarketLookupOptions = {}): Promise<MarketData> {
  const {
    fxRatesToEur = {},
    providers = [],
    scrapeTimeoutMs = 20000,
    extractTimeoutMs = 45000,
    scrapeConcurrency = 6,
    extractConcurrency = 4,
    log = (event: string, data: unknown) => console.info('[wertscan:market] ' + event, JSON.stringify(data)),
  } = options;

  const searchedAt = new Date().toISOString();
  const queries = marketSearchVariants(analysis);
  const query = queries[0] || marketQuery(analysis);
  const profile = buildIdentityProfile(analysis, queries);
  const isCard = profile.isCard;
  const grading = profile.grading;
  const targetKey = targetConditionKey(analysis);

  const finish = (
    status: MarketSearchStatus,
    diagnostics: MarketDiagnostics,
    extra: Partial<MarketData> = {}
  ): MarketData => {
    diagnostics.marketSearchStatus = status;
    log('result', {
      status,
      query,
      sourcesAttempted: diagnostics.sourcesAttempted,
      sourcesReadable: diagnostics.sourcesReadable,
      raw: diagnostics.rawListingsFound,
      validated: diagnostics.validatedListings,
      rejected: diagnostics.rejectionReasons,
      extractionErrors: diagnostics.extractionErrors,
    });
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
      diagnostics,
      cardBaseValue: null,
      ...extra,
    };
  };

  // Fix: Suche nicht mehr wegen categoryConfidence < 0.65 komplett blockieren – die Kategorie
  //      steuert nur die Quellenauswahl; die Identitätsprüfung schützt vor falschen Treffern.
  const hasHardIdentity = isCard
    ? Boolean(profile.cardNumberCompact || profile.cardNameTokens.length)
    : profile.primaryHardTokens.length > 0 || profile.boostTokens.length > 0;
  if (!queries.length || (analysis.confidence < 0.55 && !hasHardIdentity)) {
    return finish('insufficient_identity', emptyDiagnostics('insufficient_identity'));
  }

  const diagnostics = emptyDiagnostics('loading');
  const pages = buildSearchPages(analysis, queries);
  diagnostics.sourcesAttempted = pages.length + providers.length;

  // 1) Abruf -------------------------------------------------------------------------------
  const perSource: SourceDiagnostic[] = pages.map(page => ({
    sourceKey: page.sourceKey,
    display: SOURCE_META[page.sourceKey].display,
    queryIndex: page.queryIndex,
    query: page.query,
    url: page.url,
    httpStatus: null,
    readable: false,
    unreadableReason: null,
    priceSignals: 0,
    textChars: 0,
    rawListings: 0,
    validatedListings: 0,
    extractionError: null,
  }));
  diagnostics.perSource = perSource;

  const sections: ReadableSection[] = [];
  await mapLimit(pages, scrapeConcurrency, async (page, index) => {
    const diag = perSource[index];
    try {
      const result = await withTimeout(ai.scrape({ url: page.url }), scrapeTimeoutMs, 'scrape');
      diag.httpStatus = typeof result?.status === 'number' ? result.status : null;
      const text = String(result?.text || '');
      diag.textChars = text.length;
      if (diag.httpStatus == null || diag.httpStatus >= 400) {
        diag.unreadableReason = 'http_error';
        return;
      }
      if (!text.trim()) {
        diag.unreadableReason = 'empty';
        return;
      }
      const condensed = condenseListingText(text);
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
      });
    } catch (error) {
      diag.unreadableReason = String(error).includes('timeout:') ? 'timeout' : 'scrape_failed';
    }
  });
  diagnostics.sourcesReadable = sections.length;

  // 2) Extraktion je Quelle -----------------------------------------------------------------
  const candidates: CandidateRow[] = [];
  const sectionById = new Map(sections.map(section => [section.sectionId, section]));
  const groups = new Map<SourceKey, ReadableSection[]>();
  sections
    .sort((a, b) => a.sectionId - b.sectionId)
    .forEach(section => groups.set(section.sourceKey, [...(groups.get(section.sourceKey) || []), section]));

  const cardIdentity =
    isCard && analysis.cardDetails
      ? [known(analysis.cardDetails.cardName), known(analysis.cardDetails.cardNumber)].filter(Boolean).join(' ')
      : '';
  const identity = [query, ...queries.slice(1)].join(' | ');

  const groupEntries = [...groups.entries()];
  const groupResults = await mapLimit(groupEntries, extractConcurrency, ([sourceKey, groupSections]) =>
    extractSourceGroup(sourceKey, groupSections, { identity, cardIdentity, grading }, extractTimeoutMs)
  );

  let failedGroups = 0;
  groupResults.forEach((result, groupIndex) => {
    const [sourceKey, groupSections] = groupEntries[groupIndex];
    if (result.error) {
      failedGroups++;
      diagnostics.extractionErrors.push(result.error);
      groupSections.forEach(section => (perSource[section.sectionId].extractionError = result.error));
    }
    const allowedIds = new Set(groupSections.map(section => section.sectionId));
    result.rows.forEach(row => {
      diagnostics.rawListingsFound++;
      // sectionId außerhalb dieser Gruppe → Treffer kann keiner Quelle zugeordnet werden.
      const section = allowedIds.has(Number(row.sectionId))
        ? sectionById.get(Number(row.sectionId))
        : groupSections.length === 1
          ? groupSections[0]
          : undefined;
      if (!section) {
        diagnostics.rejectedListings++;
        countBy(diagnostics.rejectionReasons, 'invalid_section');
        return;
      }
      perSource[section.sectionId].rawListings++;
      candidates.push({ ...row, sourceKey, url: section.url, section });
    });
  });

  // Optionale strukturierte Provider (z. B. offizielle APIs) – gleiche Validierung, ohne Scraping.
  const providerResults = await Promise.allSettled(providers.map(provider => provider.fetch({ analysis, queries })));
  providerResults.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === 'rejected') {
      diagnostics.extractionErrors.push('provider ' + provider.sourceKey + ': ' + String(result.reason));
      return;
    }
    result.value.forEach(listing => {
      diagnostics.rawListingsFound++;
      candidates.push({
        sourceKey: provider.sourceKey,
        url: listing.url,
        title: listing.title,
        priceText: '',
        price: listing.price,
        currency: listing.currency,
        conditionText: listing.conditionText,
        conditionGroup: 'unknown',
        grading: '',
        date: listing.date,
        relevance: 0.8,
        section: null,
      });
    });
  });

  // 3) Validierung ---------------------------------------------------------------------------
  const validated: ValidatedRow[] = [];
  candidates.forEach(candidate => {
    const outcome = validateRow(candidate, profile, fxRatesToEur);
    if ('reason' in outcome) {
      diagnostics.rejectedListings++;
      countBy(diagnostics.rejectionReasons, outcome.reason);
      return;
    }
    validated.push(outcome.row);
    if (candidate.section) perSource[candidate.section.sectionId].validatedListings++;
  });

  const deduped = dedupeMarketRows(validated) as ValidatedRow[];
  diagnostics.duplicatesRemoved = validated.length - deduped.length;

  // 4) Gruppierung + Ausreißer ---------------------------------------------------------------
  const rawBaseRows = deduped.filter(row => row.rawCardBase);
  const comparableRows = deduped.filter(row => !row.rawCardBase);
  const bucketRows: Record<ConditionKey, ValidatedRow[]> = { new: [], likeNew: [], used: [], defective: [] };
  (Object.keys(bucketRows) as ConditionKey[]).forEach(key => {
    const { kept, outliers } = cleanMarketRows(comparableRows.filter(row => row.conditionGroup === key));
    bucketRows[key] = kept as ValidatedRow[];
    outliers.forEach(() => countBy(diagnostics.rejectionReasons, 'price_outlier'));
    diagnostics.rejectedListings += outliers.length;
  });
  const baseClean = cleanMarketRows(rawBaseRows);
  baseClean.outliers.forEach(() => countBy(diagnostics.rejectionReasons, 'price_outlier'));
  diagnostics.rejectedListings += baseClean.outliers.length;

  const finalRows = [
    ...bucketRows.new,
    ...bucketRows.likeNew,
    ...bucketRows.used,
    ...bucketRows.defective,
    ...(baseClean.kept as ValidatedRow[]),
  ];
  diagnostics.validatedListings = finalRows.length;
  diagnostics.sourcesWithListings = perSource.filter(source => source.rawListings > 0).length;

  const conditionPrices: ConditionPriceSet = {
    new: conditionMarketPrice(bucketRows.new),
    likeNew: conditionMarketPrice(bucketRows.likeNew),
    used: conditionMarketPrice(bucketRows.used),
    defective: conditionMarketPrice(bucketRows.defective),
  };

  let cardBaseValue: ConditionMarketPrice | null = null;
  if (isCard && grading && baseClean.kept.length) {
    const base = conditionMarketPrice(baseClean.kept);
    cardBaseValue = {
      ...base,
      basis:
        base.basis +
        '. Rohkarten-Basiswert derselben Karte (ungegradet) – kein identischer ' +
        grading.company.toUpperCase() +
        ' ' +
        grading.grade +
        ' Grading-Vergleich.',
    };
  }

  // 5) Status ------------------------------------------------------------------------------
  const sold = finalRows.filter(row => row.type === 'sold');
  const offers = finalRows.filter(row => row.type === 'offer');
  const readableLabels = Array.from(new Set(sections.map(section => SOURCE_META[section.sourceKey].display)));
  if (providers.length) providers.forEach(provider => readableLabels.push(SOURCE_META[provider.sourceKey].display));

  let status: MarketSearchStatus;
  const providerRowCount = candidates.filter(candidate => !candidate.section).length;
  if (!sections.length && !providerRowCount) {
    status = 'sources_unreachable';
  } else if (!diagnostics.rawListingsFound) {
    status = failedGroups > 0 ? 'extraction_failed' : 'no_exact_matches';
  } else if (!finalRows.length) {
    const identityRejects = Object.entries(diagnostics.rejectionReasons)
      .filter(([reason]) => IDENTITY_REASONS.has(reason))
      .reduce((sum, [, count]) => sum + count, 0);
    status = identityRejects >= diagnostics.rejectedListings / 2 ? 'no_exact_matches' : 'filtered_all';
  } else if (
    conditionPrices[targetKey].price != null ||
    (grading && !MAJOR_GRADERS.includes(grading.company) && cardBaseValue?.price != null)
  ) {
    status = 'found';
  } else {
    status = 'low_sample';
  }

  const partial = pages.length - sections.length;
  const extra = partial > 0 && status !== 'sources_unreachable'
    ? ' (' + partial + ' von ' + pages.length + ' Quellenabrufen waren technisch nicht lesbar.)'
    : '';

  return finish(status, diagnostics, {
    connected: true,
    sourcesChecked: readableLabels,
    soldComparables: sold,
    currentOffers: offers,
    soldMedian: marketMedian(sold.filter(row => !row.rawCardBase)),
    offerMedian: marketMedian(offers.filter(row => !row.rawCardBase)),
    conditionPrices,
    cardBaseValue,
    message: STATUS_MESSAGES[status] + extra,
  });
}

// ---------------------------------------------------------------------------
// Bewertung
// Fix: gegradete Karten nutzen likeNew; Fallback auf gemischte Gruppe gebraucht+neuwertig bzw. auf
//      den Rohkarten-Basiswert ist klar gekennzeichnet und immer 'niedrig'. Nie ein erfundener Wert.
// ---------------------------------------------------------------------------

function marketValuation(analysis: Analysis, market: MarketData): Valuation | null {
  const key = targetConditionKey(analysis);
  const allRows = [...market.soldComparables, ...market.currentOffers];
  let summary = market.conditionPrices[key];
  let rows = allRows.filter(row => row.conditionGroup === key && !row.rawCardBase);
  let note = '';
  let forceLow = false;

  if (summary.price == null && isGradedCard(analysis)) {
    const grading = targetGrading(analysis);
    const thirdParty = grading && !MAJOR_GRADERS.includes(grading.company);
    // Nur bei weniger verbreiteten Grading-Firmen (z. B. PCA) dient der Rohkartenwert als Hauptwert.
    if (thirdParty && market.cardBaseValue?.price != null) {
      summary = market.cardBaseValue;
      rows = allRows.filter(row => row.rawCardBase);
      note = ' Bewertung der zugrunde liegenden Karte, da für die Drittanbieter-Graduierung keine ausreichenden exakt vergleichbaren Marktdaten vorliegen.';
      forceLow = true;
    }
  } else if (summary.price == null && (key === 'used' || key === 'likeNew')) {
    const pooledRows = allRows.filter(
      row => (row.conditionGroup === 'used' || row.conditionGroup === 'likeNew') && !row.rawCardBase
    );
    const pooled = conditionMarketPrice(pooledRows);
    if (pooled.price != null) {
      summary = pooled;
      rows = pooledRows;
      note = ' Zu wenige Belege im exakten Zustand – Wert aus gebrauchten und neuwertigen Vergleichen zusammen.';
      forceLow = true;
    }
  }

  if (summary.price == null || summary.from == null || summary.to == null) return null;

  const relevance = rows.length ? rows.reduce((sum, row) => sum + row.relevance, 0) / rows.length : 0;
  const quality: 'niedrig' | 'mittel' | 'hoch' = forceLow
    ? 'niedrig'
    : summary.soldCount >= 4 && summary.sampleCount >= 5 && relevance >= 0.75
      ? 'hoch'
      : summary.sampleCount >= 3
        ? 'mittel'
        : 'niedrig';

  const sensitive = ['uhren', 'schmuck', 'gemalde', 'drucke', 'munzen', 'antiquitaten', 'teppiche'].includes(
    normalize(analysis.category)
  );

  return {
    market: summary.price,
    from: summary.from,
    to: summary.to,
    quick: summary.from,
    privateSale: summary.price,
    dealer: summary.from,
    dataQuality: quality,
    professionalReview: sensitive && (summary.price >= 500 || analysis.confidence < 0.82),
    basis:
      summary.basis.replace(/\.+$/, '') +
      '.' +
      note +
      ' Der Hauptwert entspricht dem erkannten Zustand ' +
      analysis.condition +
      '. Keine Offline-Basispreise werden verwendet.',
    matchConfidence: relevance,
  };
}

export {
  marketRowSchema,
  marketExtractSchema,
  marketSearchVariants,
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
  // für Tests:
  parseLocalePrice,
  priceGrounded,
  condenseListingText,
  conditionGroupFromText,
  identityRejection,
  buildIdentityProfile,
  gradingOf,
};
