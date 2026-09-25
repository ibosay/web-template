/**
 * Scrydex-Adapter (NUR serverseitig verwenden).
 *
 * Übersetzt Scrydex-Antworten in CardCandidate / PriceEvidence. Er entscheidet NICHT, ob eine
 * Karte passt – das macht WertScan in cardIdentity.ts.
 *
 * Laut Scrydex-Dokumentation bestätigt (vom WertScan-Team geprüft, 2026-09):
 *   - Auth-Header: X-Api-Key, X-Team-ID
 *   - GET /pokemon/v1/cards?q=…                     allgemeiner Kartenendpunkt (keine eigenen en/ja-Endpunkte)
 *   - GET /pokemon/v1/cards/<id>                    Einzelkarte
 *   - GET /pokemon/v1/expansions/<expansionId>/cards Karten eines Sets
 *   - q: Lucene-ähnlich, z. B. name:charizard, !name:charizard (exakt), expansion.id:sm1, kombinierbar
 *   - Kartenobjekt: id, name, number, printed_number, expansion.id/.name, language, language_code,
 *     variants[] (je name, eigene Bilder/Preise)
 *   - Preise nur mit include=prices. Raw: condition (NM, LP, MP, HP, DM), type 'raw', low, market,
 *     currency, trends. Graded: company, grade, type, low, mid, high, market, currency, trends.
 *     market = von Scrydex berechneter Durchschnitt über Quellen → Preisführer, KEIN Verkauf.
 *   - Währungen derzeit USD und JPY (japanische Raw-Preise in JPY).
 *   - GET /pokemon/v1/cards/<id>/listings: id, source, card_id, title, variant, company, grade, url,
 *     price, currency, sold_at (= Verkaufsdatum) → echte Verkäufe.
 *   - Listings kennen einen condition-FILTER, das Listing-Objekt aber kein garantiertes
 *     condition-Feld → Zustand wird nur übernommen, wenn er im einzelnen Listing steht.
 *
 * Noch mit echtem Zugang zu bestätigen (scripts/verify-scrydex.mjs):
 *   - Antwort-Wrapper { data: [...] } und Paginierung (Parameter- und Feldnamen)
 *   - Anführungszeichen für Werte mit Leer-/Sonderzeichen in q (Lucene-Standard angenommen)
 *   - ob number/printed_number in q suchbar sind (Adapter fällt sonst auf Namens-/Setsuche zurück)
 *   - Verhalten des condition-Filters
 *
 * API-Key und Team-ID nur aus Server-Umgebungsvariablen. Niemals im Client oder im Repository.
 */
import { CardCandidate, CardDataProvider, CardQuery, EvidenceRequest, PriceEvidence } from './types';
import { cardNumberKey, normalizeGrading } from './cardIdentity';
import { SCRYDEX_RAW_CONDITIONS, normalizeCardCondition } from './conditions';

export const SCRYDEX_API_KEY_HEADER = 'X-Api-Key';
export const SCRYDEX_TEAM_ID_HEADER = 'X-Team-ID';
export const SCRYDEX_BASE_URL = 'https://api.scrydex.com';
const CARDS_PATH = '/pokemon/v1/cards';
const expansionCardsPath = (expansionId: string) => '/pokemon/v1/expansions/' + encodeURIComponent(expansionId) + '/cards';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type ScrydexConfig = {
  apiKey: string;
  teamId: string;
  baseUrl?: string;
  fetch?: FetchLike;
  now?: () => Date;
  /** Gültigkeit der Scrydex-Marktindikatoren (WertScan-Metadatum expiresAt). Standard 24 h. */
  guideTtlMs?: number;
  /** Gültigkeit der Verkäufe (expiresAt). Standard 24 h. */
  listingTtlMs?: number;
  /** Seitengröße für Kartensuche/Listings. Paginierung mit echtem Zugang bestätigen. */
  pageSize?: number;
};

type Json = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value.filter(item => item && typeof item === 'object') as Json[]) : []);

/** Antwort-Wrapper tolerant lesen: { data: [...] } oder direktes Array. */
const dataList = (payload: unknown): Json[] => (Array.isArray(payload) ? list(payload) : list(obj(payload).data));
/** Einzelobjekt tolerant lesen: { data: {...} } oder direktes Objekt. */
const dataObject = (payload: unknown): Json => {
  const data = obj(payload).data;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Json) : obj(payload);
};

/** Lucene-Wert: einfache Token unverändert, sonst in Anführungszeichen (Sonderzeichen entfernt). */
export const luceneValue = (value: string) => {
  const clean = value.replace(/["\\]/g, '').trim();
  return /^[A-Za-z0-9._-]+$/.test(clean) ? clean : '"' + clean + '"';
};

export class ScrydexProvider implements CardDataProvider {
  readonly id = 'scrydex';
  readonly displayName = 'Scrydex';
  /** Laut Doku derzeit Englisch und Japanisch. */
  readonly supportedLanguages = ['en', 'ja'];
  readonly supportedRawConditions = SCRYDEX_RAW_CONDITIONS;

  private readonly config: Required<Omit<ScrydexConfig, 'fetch'>> & { fetch: FetchLike };
  /** Rohdaten gefundener Karten (für include=prices ohne erneuten Abruf). */
  private readonly rawCards = new Map<string, Json>();

  constructor(config: ScrydexConfig) {
    if (typeof window !== 'undefined') {
      throw new Error('ScrydexProvider darf nur serverseitig verwendet werden (API-Key-Schutz).');
    }
    if (!config.apiKey || !config.teamId) throw new Error('Scrydex: API-Key und Team-ID fehlen (Server-Umgebungsvariablen).');
    const globalFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    const fetchImpl = config.fetch || globalFetch;
    if (!fetchImpl) throw new Error('Scrydex: keine fetch-Implementierung verfügbar.');
    this.config = {
      apiKey: config.apiKey,
      teamId: config.teamId,
      baseUrl: (config.baseUrl || SCRYDEX_BASE_URL).replace(/\/$/, ''),
      fetch: fetchImpl,
      now: config.now || (() => new Date()),
      guideTtlMs: config.guideTtlMs ?? 24 * 3600 * 1000,
      listingTtlMs: config.listingTtlMs ?? 24 * 3600 * 1000,
      pageSize: config.pageSize ?? 100,
    };
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const query = Object.entries(params)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value))
      .join('&');
    const response = await this.config.fetch(this.config.baseUrl + path + (query ? '?' + query : ''), {
      method: 'GET',
      headers: {
        [SCRYDEX_API_KEY_HEADER]: this.config.apiKey,
        [SCRYDEX_TEAM_ID_HEADER]: this.config.teamId,
        Accept: 'application/json',
      },
    });
    // Fehlermeldung ohne Header/Key, damit keine Zugangsdaten in Logs landen.
    if (!response.ok) throw new Error('Scrydex HTTP ' + response.status + ' für ' + path);
    return response.json();
  }

  private toCandidate(raw: Json): CardCandidate | null {
    const cardId = str(raw.id);
    if (!cardId) return null;
    const expansion = obj(raw.expansion);
    return {
      providerId: this.id,
      cardId,
      game: 'pokemon',
      name: str(raw.name) || '',
      number: str(raw.number),
      printedNumber: str(raw.printed_number),
      expansionId: str(expansion.id),
      expansionName: str(expansion.name),
      language: str(raw.language),
      languageCode: str(raw.language_code),
      variants: list(raw.variants)
        .map(variant => str(variant.name))
        .filter((name): name is string => Boolean(name))
        .map(name => ({ name })),
    };
  }

  /**
   * Suchanfragen von präzise nach breit. Die Suche darf breiter sein als das Ergebnis:
   * WertScan prüft jeden Kandidaten anschließend selbst exakt (Nummer/printed_number, Set,
   * Sprache, Variante). Sprache wird nicht in q gesetzt – sie steht im Kartenobjekt.
   */
  buildSearches(query: CardQuery): { path: string; q: string }[] {
    const key = query.number ? cardNumberKey(query.number) : null;
    // number (z. B. "143") ist der Teil vor dem "/"; printed_number ist der vollständige Aufdruck.
    const numberValue = key ? (key.hasDenominator ? query.number!.split('/')[0].trim().replace(/^#/, '') : query.number!.trim()) : '';
    const name = query.name ? luceneValue(query.name) : '';
    const numberTerm = numberValue ? 'number:' + luceneValue(numberValue) : '';
    const path = query.setId ? expansionCardsPath(query.setId) : CARDS_PATH;
    const searches = [
      name && numberTerm ? '!name:' + name + ' ' + numberTerm : '',
      name && numberTerm ? 'name:' + name + ' ' + numberTerm : '',
      // Nummer allein: findet auch anderssprachige Namen (z. B. japanische Karten).
      numberTerm && (query.setId || !name) ? numberTerm : '',
      !numberTerm && name ? '!name:' + name : '',
    ].filter(Boolean);
    return Array.from(new Set(searches)).map(q => ({ path, q }));
  }

  async findCards(query: CardQuery): Promise<CardCandidate[]> {
    const found = new Map<string, CardCandidate>();
    for (const search of this.buildSearches(query)) {
      const payload = await this.get(search.path, { q: search.q, include: 'prices', page_size: String(this.config.pageSize) });
      dataList(payload).forEach(raw => {
        const candidate = this.toCandidate(raw);
        if (!candidate) return;
        this.rawCards.set(candidate.cardId, raw);
        found.set(candidate.cardId, candidate);
      });
      if (found.size) break; // präzise Suche erfolgreich → keine breitere nötig
    }
    return [...found.values()];
  }

  private async rawCard(cardId: string): Promise<Json | null> {
    const cached = this.rawCards.get(cardId);
    if (cached) return cached;
    const payload = await this.get(CARDS_PATH + '/' + encodeURIComponent(cardId), { include: 'prices' });
    const raw = dataObject(payload);
    if (str(raw.id) !== cardId) return null;
    this.rawCards.set(cardId, raw);
    return raw;
  }

  /** Preisobjekte (include=prices) → ausschließlich Preisführer/Marktindikatoren (guide), nie Verkäufe. */
  private guideEvidence(raw: Json, cardId: string, fetchedAt: Date): PriceEvidence[] {
    const expiresAt = new Date(fetchedAt.getTime() + this.config.guideTtlMs).toISOString();
    const variants = list(raw.variants);
    const priceSets: { variant: string | null; prices: Json[] }[] = variants.length
      ? variants.map(variant => ({ variant: str(variant.name), prices: list(variant.prices) }))
      : [{ variant: null, prices: list(raw.prices) }];

    const evidence: PriceEvidence[] = [];
    priceSets.forEach(({ variant, prices }) =>
      prices.forEach(entry => {
        const currency = str(entry.currency);
        const type = str(entry.type);
        if (!currency || (type !== 'raw' && type !== 'graded')) return;
        // Firma nur, wenn der Datensatz sie enthält (z. B. PCA nur, wenn Scrydex PCA liefert).
        const grading = type === 'graded' ? normalizeGrading(str(entry.company), str(entry.grade) ?? num(entry.grade)) : null;
        if (type === 'graded' && !grading) return;
        const condition = type === 'raw' ? normalizeCardCondition(str(entry.condition)) : null;
        const priceTypes = type === 'graded' ? ['market', 'low', 'mid', 'high'] : ['market', 'low'];
        priceTypes.forEach(priceType => {
          const price = num(entry[priceType]);
          if (price == null || price <= 0) return;
          evidence.push({
            kind: 'guide',
            providerId: this.id,
            source: 'scrydex',
            cardId,
            variant,
            title: 'Scrydex Marktindikator (' + priceType + ', Durchschnitt mehrerer Quellen – kein Einzelverkauf)',
            grading,
            condition,
            conditionSource: condition ? 'provider_field' : null,
            priceType,
            price,
            currency: currency.toUpperCase(),
            url: null,
            observedAt: null, // Scrydex nennt für Preisobjekte keinen Stichtag in der Doku
            fetchedAt: fetchedAt.toISOString(),
            expiresAt,
          });
        });
      })
    );
    return evidence;
  }

  async getPriceEvidence(request: EvidenceRequest): Promise<PriceEvidence[]> {
    const fetchedAt = this.config.now();
    const cardId = request.candidate.cardId;
    const raw = await this.rawCard(cardId);
    const evidence = raw ? this.guideEvidence(raw, cardId, fetchedAt) : [];

    // Bewusst KEIN condition-Filter: Zustand nur, wenn er im einzelnen Listing steht.
    const params: Record<string, string> = { days: String(request.soldWithinDays), page_size: String(this.config.pageSize) };
    if (request.variant) params.variant = request.variant;
    const payload = await this.get(CARDS_PATH + '/' + encodeURIComponent(cardId) + '/listings', params);
    const expiresAt = new Date(fetchedAt.getTime() + this.config.listingTtlMs).toISOString();
    const seen = new Set<string>();

    dataList(payload).forEach(item => {
      const soldAt = str(item.sold_at);
      // Nur Datensätze mit Verkaufsdatum sind belegte Verkäufe. Ohne sold_at: nicht verwenden.
      if (!soldAt) return;
      const listingId = str(item.id);
      if (listingId && seen.has(listingId)) return;
      if (listingId) seen.add(listingId);
      const price = num(item.price);
      const currency = str(item.currency);
      if (price == null || price <= 0 || !currency) return;
      const company = str(item.company);
      const gradeValue = str(item.grade) ?? num(item.grade);
      const grading = company || gradeValue != null ? normalizeGrading(company, gradeValue) : null;
      // Graded-Angabe unvollständig (nur Firma oder nur Note) → weder raw noch graded zuordenbar.
      if ((company || gradeValue != null) && !grading) return;
      const condition = normalizeCardCondition(str(item.condition));
      evidence.push({
        kind: 'sold',
        providerId: this.id,
        source: str(item.source) || 'scrydex',
        cardId: str(item.card_id) || cardId,
        externalId: listingId,
        variant: str(item.variant),
        title: str(item.title),
        grading,
        condition,
        conditionSource: condition ? 'provider_field' : null,
        priceType: null,
        price,
        currency: currency.toUpperCase(),
        url: str(item.url),
        observedAt: soldAt,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt,
      });
    });
    return evidence;
  }
}

/** Server-Fabrik: liest Zugangsdaten ausschließlich aus Server-Umgebungsvariablen. */
export function createScrydexProviderFromEnv(
  env: Record<string, string | undefined> = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env || {},
  overrides: Partial<ScrydexConfig> = {}
): ScrydexProvider | null {
  const apiKey = env.SCRYDEX_API_KEY;
  const teamId = env.SCRYDEX_TEAM_ID;
  if (!apiKey || !teamId) return null;
  return new ScrydexProvider({ ...overrides, apiKey, teamId });
}
