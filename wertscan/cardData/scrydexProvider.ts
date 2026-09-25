/**
 * Scrydex-Adapter (NUR serverseitig verwenden).
 *
 * Übersetzt Scrydex-Antworten in CardCandidate / PriceEvidence. Er entscheidet NICHT, ob eine
 * Karte passt – das macht WertScan in cardIdentity.ts. Er deutet keine Zustände hinein:
 * condition wird nur übernommen, wenn Scrydex es in der konkreten Antwort liefert.
 *
 * Grundlage: vom WertScan-Team geprüfte Scrydex-Dokumentation:
 *   GET /pokemon/v1/cards?q=…&include=prices     Karten inkl. variants[].prices
 *   GET /pokemon/v1/cards/<id>/listings           Verkäufe (source, title, variant, company, grade, price, currency, sold_at, url)
 * Vor dem Livebetrieb gegen die Doku prüfen (mit "PRÜFEN" markiert):
 *   - Namen der Auth-Header, q-Syntax, Pfade der sprachspezifischen Endpunkte, Paginierung,
 *     Form des Antwort-Wrappers ({ data: [...] }).
 *
 * API-Key und Team-ID nur aus Server-Umgebungsvariablen. Niemals im Client oder im Repository.
 */
import { CardCandidate, CardDataProvider, CardQuery, EvidenceRequest, PriceEvidence } from './types';
import { cardNumberKey, normalizeGrading } from './cardIdentity';
import { SCRYDEX_RAW_CONDITIONS, normalizeCardCondition } from './conditions';

// PRÜFEN: Header-Namen laut Scrydex-Doku.
export const SCRYDEX_API_KEY_HEADER = 'X-Api-Key';
export const SCRYDEX_TEAM_ID_HEADER = 'X-Team-ID';

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
  /** Cache-Dauer für Preisführer (WertScan-Metadatum expiresAt). Standard 24 h. */
  guideTtlMs?: number;
  /** Cache-Dauer für Verkäufe. Standard 24 h. */
  listingTtlMs?: number;
  /** PRÜFEN: Pfad für Kartensuche je Sprache. Standard: allgemeiner Endpunkt, Sprache prüft WertScan selbst. */
  cardsPath?: (languageCode: string | null) => string;
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

const quote = (value: string) => '"' + value.replace(/"/g, '') + '"';

export class ScrydexProvider implements CardDataProvider {
  readonly id = 'scrydex';
  readonly displayName = 'Scrydex';
  readonly supportedLanguages = ['en', 'ja'];
  readonly supportedRawConditions = SCRYDEX_RAW_CONDITIONS;

  private readonly config: Required<Omit<ScrydexConfig, 'fetch'>> & { fetch: FetchLike };
  /** Rohdaten der zuletzt gefundenen Karten (für Preise aus include=prices ohne erneuten Abruf). */
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
      baseUrl: (config.baseUrl || 'https://api.scrydex.com').replace(/\/$/, ''),
      fetch: fetchImpl,
      now: config.now || (() => new Date()),
      guideTtlMs: config.guideTtlMs ?? 24 * 3600 * 1000,
      listingTtlMs: config.listingTtlMs ?? 24 * 3600 * 1000,
      cardsPath: config.cardsPath || (() => '/pokemon/v1/cards'),
      pageSize: config.pageSize ?? 50,
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

  /** PRÜFEN: q-Syntax. WertScan prüft das Ergebnis ohnehin selbst exakt; die Suche darf breiter sein. */
  buildQueries(query: CardQuery): string[] {
    const number = query.number ? cardNumberKey(query.number) : null;
    const numberValue = number ? (number.hasDenominator ? query.number!.split('/')[0].trim() : query.number!.trim()) : '';
    const parts = (withName: boolean) =>
      [
        withName && query.name ? 'name:' + quote(query.name) : '',
        numberValue ? 'number:' + quote(numberValue) : '',
        query.setId ? 'expansion.id:' + quote(query.setId) : '',
      ]
        .filter(Boolean)
        .join(' ');
    return Array.from(new Set([parts(true), parts(false)].filter(Boolean)));
  }

  async findCards(query: CardQuery): Promise<CardCandidate[]> {
    const languages = query.language ? [query.language] : [null];
    const found = new Map<string, CardCandidate>();
    for (const language of languages) {
      for (const q of this.buildQueries(query)) {
        const payload = await this.get(this.config.cardsPath(language), { q, include: 'prices', page_size: String(this.config.pageSize) });
        dataList(payload).forEach(raw => {
          const candidate = this.toCandidate(raw);
          if (!candidate) return;
          this.rawCards.set(candidate.cardId, raw);
          found.set(candidate.cardId, candidate);
        });
        if (found.size) break; // präzise Suche erfolgreich → keine breitere nötig
      }
    }
    return [...found.values()];
  }

  /** Preise aus include=prices → ausschließlich Preisführer (guide). */
  private guideEvidence(cardId: string, fetchedAt: Date): PriceEvidence[] {
    const raw = this.rawCards.get(cardId);
    if (!raw) return [];
    const expiresAt = new Date(fetchedAt.getTime() + this.config.guideTtlMs).toISOString();
    const variants = list(raw.variants);
    const priceSets: { variant: string | null; prices: Json[] }[] = variants.length
      ? variants.map(variant => ({ variant: str(variant.name), prices: list(variant.prices) }))
      : [{ variant: null, prices: list(raw.prices) }];

    const evidence: PriceEvidence[] = [];
    priceSets.forEach(({ variant, prices }) =>
      prices.forEach(entry => {
        const currency = str(entry.currency);
        if (!currency) return;
        const type = str(entry.type);
        const grading = type === 'graded' ? normalizeGrading(str(entry.company), str(entry.grade) ?? num(entry.grade)) : null;
        if (type === 'graded' && !grading) return; // Graded ohne Firma/Note ist nicht zuordenbar
        const priceTypes = type === 'graded' ? ['market', 'low', 'mid', 'high'] : ['market', 'low'];
        const condition = type === 'graded' ? null : normalizeCardCondition(str(entry.condition));
        priceTypes.forEach(priceType => {
          const price = num(entry[priceType]);
          if (price == null || price <= 0) return;
          evidence.push({
            kind: 'guide',
            providerId: this.id,
            source: 'scrydex',
            cardId,
            variant,
            title: null,
            grading,
            condition,
            conditionSource: condition ? 'provider_field' : null,
            priceType,
            price,
            currency: currency.toUpperCase(),
            url: null,
            observedAt: str(entry.updated_at) || str(entry.date), // nur falls geliefert
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
    const evidence = this.guideEvidence(cardId, fetchedAt);

    const params: Record<string, string> = { days: String(request.soldWithinDays), page_size: '100' };
    if (request.variant) params.variant = request.variant;
    const payload = await this.get('/pokemon/v1/cards/' + encodeURIComponent(cardId) + '/listings', params);
    const expiresAt = new Date(fetchedAt.getTime() + this.config.listingTtlMs).toISOString();

    dataList(payload).forEach(item => {
      const price = num(item.price);
      const currency = str(item.currency);
      if (price == null || price <= 0 || !currency) return;
      const company = str(item.company);
      const gradeValue = str(item.grade) ?? num(item.grade);
      const grading = company || gradeValue != null ? normalizeGrading(company, gradeValue) : null;
      // Graded-Angabe unvollständig (nur Firma oder nur Note) → nicht zuordenbar, weder raw noch graded.
      if ((company || gradeValue != null) && !grading) return;
      // Zustand nur aus dem Feld DIESES Listings. Kein Rückschluss aus Titel oder Anfragefilter.
      const condition = normalizeCardCondition(str(item.condition));
      evidence.push({
        kind: str(item.sold_at) ? 'sold' : 'listing',
        providerId: this.id,
        source: str(item.source) || 'scrydex',
        cardId: str(item.card_id) || cardId,
        variant: str(item.variant),
        title: str(item.title),
        grading,
        condition,
        conditionSource: condition ? 'provider_field' : null,
        priceType: null,
        price,
        currency: currency.toUpperCase(),
        url: str(item.url),
        observedAt: str(item.sold_at),
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
