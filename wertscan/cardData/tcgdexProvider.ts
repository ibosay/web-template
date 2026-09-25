/**
 * Kostenloser Pokémon-Kartenkatalog über TCGdex.
 *
 * Zweck in WertScan:
 *   1. Karte, Sprache, Set und Variante ohne kostenpflichtigen API-Key verifizieren.
 *   2. Cardmarket/TCGplayer-Werte aus TCGdex ausschließlich als Preisführer ausgeben.
 *   3. Niemals einen TCGdex-Preisführer als echten Verkauf behandeln.
 *
 * TCGdex liefert keine für WertScan hinreichend strukturierten Grading-Verkäufe. Deshalb
 * enthält getPriceEvidence() bewusst nur kind='guide'. Für einen Marktwert darf die bestehende
 * Marktplatzsuche anschließend echte Verkäufe derselben, zuvor bestätigten Karte suchen.
 *
 * Dokumentierte API:
 *   https://api.tcgdex.net/v2/{lang}/cards
 *   https://api.tcgdex.net/v2/{lang}/cards/{id}
 *
 * Kein API-Key erforderlich.
 */
import { variantKey } from './cardIdentity';
import { CardCandidate, CardDataProvider, CardQuery, EvidenceRequest, EvidenceResult, PriceEvidence } from './types';

type FetchLike = typeof fetch;

type TcgDexCardBrief = {
  id?: unknown;
  localId?: unknown;
  name?: unknown;
};

type TcgDexVariantDetailed = {
  type?: unknown;
  subtype?: unknown;
  stamp?: unknown;
  languages?: unknown;
};

type TcgDexCard = {
  id?: unknown;
  localId?: unknown;
  name?: unknown;
  set?: {
    id?: unknown;
    name?: unknown;
    cardCount?: { official?: unknown; total?: unknown };
  } | null;
  variants?: Record<string, unknown> | TcgDexVariantDetailed[] | null;
  variants_detailed?: TcgDexVariantDetailed[] | null;
  pricing?: {
    cardmarket?: Record<string, unknown> | null;
    tcgplayer?: Record<string, unknown> | null;
  } | null;
};

export type TcgDexProviderOptions = {
  fetchFn?: FetchLike;
  baseUrl?: string;
  /**
   * TCGdex hat keinen sprachübergreifenden Karten-Endpunkt. Ist die Sprache unbekannt,
   * werden diese Sprachen einzeln geprüft. Für WertScan bewusst DE/EN/JA als Standard.
   */
  languagesWhenUnknown?: string[];
  requestTimeoutMs?: number;
  priceGuideTtlMs?: number;
  now?: () => Date;
  maxCandidates?: number;
};

const DEFAULT_LANGUAGES = ['de', 'en', 'ja'];

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asPositiveNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};

function normalizeObservedAt(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * Nummer für TCGdex localId:
 *   "223/197" -> "223"      (TCGdex localId enthält bei regulären Sets keinen Nenner)
 *   "143/S P" -> "143/S-P"  (Promo-Suffix bleibt Teil der Nummer)
 */
export function tcgdexLocalId(raw: string | null | undefined): string | null {
  let value = String(raw || '').trim().replace(/^#\s*/, '');
  if (!value) return null;
  value = value.replace(/\s*\/\s*/g, '/');
  const slash = value.indexOf('/');
  if (slash >= 0) {
    const left = value.slice(0, slash).trim();
    const right = value.slice(slash + 1).trim();
    if (/^\d+$/.test(right)) return left || null;
    value = left + '/' + right.replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  }
  return value || null;
}

function detailVariantName(row: TcgDexVariantDetailed): string | null {
  const type = asString(row.type)?.toLowerCase() || '';
  const subtype = asString(row.subtype)?.toLowerCase() || '';
  const stamps = Array.isArray(row.stamp)
    ? row.stamp.map(asString).filter((value): value is string => Boolean(value)).map(value => value.toLowerCase())
    : [];
  const firstEdition = stamps.includes('1st-edition');

  let base = '';
  if (firstEdition) {
    base = type === 'holo' ? 'firstEditionHolofoil' : 'firstEdition';
  } else if (subtype === 'unlimited') {
    base = type === 'holo' ? 'unlimitedHolofoil' : 'unlimited';
  } else if (type === 'reverse') {
    base = 'reverseHolofoil';
  } else if (type === 'holo') {
    base = 'holofoil';
  } else if (type === 'normal') {
    base = 'normal';
  } else if (type) {
    base = type;
  }

  const extraStamps = stamps.filter(stamp => stamp !== '1st-edition');
  const extras = [subtype && subtype !== 'unlimited' ? subtype : '', ...extraStamps].filter(Boolean);
  if (!base && !extras.length) return null;
  return [base || 'variant', ...extras].join(':');
}

function variantNames(card: TcgDexCard): string[] {
  const detailed = Array.isArray(card.variants_detailed)
    ? card.variants_detailed
    : Array.isArray(card.variants)
      ? card.variants
      : null;

  if (detailed?.length) {
    return Array.from(new Set(detailed.map(detailVariantName).filter((value): value is string => Boolean(value))));
  }

  const legacy = card.variants && !Array.isArray(card.variants) ? card.variants : null;
  if (!legacy) return [];

  const names: string[] = [];
  if (legacy.normal === true) names.push('normal');
  if (legacy.holo === true) names.push('holofoil');
  if (legacy.reverse === true) names.push('reverseHolofoil');
  if (legacy.firstEdition === true) names.push('firstEdition');
  if (legacy.preRelease === true) names.push('preRelease');
  if (legacy.wPromo === true) names.push('wPromo');
  if (legacy.jumbo === true) names.push('jumbo');
  return Array.from(new Set(names));
}

function candidateFromCard(card: TcgDexCard, language: string): CardCandidate | null {
  const id = asString(card.id);
  const localId = asString(card.localId);
  const name = asString(card.name);
  if (!id || !localId || !name) return null;
  const setId = asString(card.set?.id);
  const setName = asString(card.set?.name);

  // Bei Promos/Sondernummern wie 143/S-P ist localId bereits die gedruckte Nummer.
  // Bei normalen Sets erfinden wir keinen Nenner, sondern lassen printedNumber null.
  const printedNumber = /[a-z]/i.test(localId) || localId.includes('/') ? localId : null;

  return {
    providerId: 'tcgdex',
    cardId: id,
    game: 'pokemon',
    name,
    number: localId,
    printedNumber,
    expansionId: setId,
    expansionName: setName,
    language,
    languageCode: language,
    variants: variantNames(card).map(name => ({ name })),
    // Nur als Beleg für einen erkannten numerischen Nenner, keine erfundene gedruckte Nummer.
    setOfficialCount: asPositiveNumber(card.set?.cardCount?.official),
  };
}

function guideVariantForCardmarket(candidate: CardCandidate, holo: boolean): string | null {
  const wanted = holo ? 'holofoil' : 'normal';
  const hit = candidate.variants.find(row => variantKey(row.name) === variantKey(wanted));
  if (hit) return hit.name;
  return candidate.variants.length === 1 ? candidate.variants[0].name : null;
}

function tcgplayerVariant(key: string): string | null {
  const normalized = key.toLowerCase().replace(/_/g, '-');
  const map: Record<string, string> = {
    normal: 'normal',
    holofoil: 'holofoil',
    holo: 'holofoil',
    reverse: 'reverseHolofoil',
    'reverse-holofoil': 'reverseHolofoil',
    '1st-edition': 'firstEdition',
    '1st-edition-holofoil': 'firstEditionHolofoil',
    unlimited: 'unlimited',
    'unlimited-holofoil': 'unlimitedHolofoil',
  };
  return map[normalized] || null;
}

export class TcgDexProvider implements CardDataProvider {
  readonly id = 'tcgdex';
  readonly displayName = 'TCGdex (kostenlos)';
  readonly supportedLanguages = ['de', 'en', 'ja', 'fr', 'it', 'es'];
  readonly supportedRawConditions = null;

  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;
  private readonly languagesWhenUnknown: string[];
  private readonly requestTimeoutMs: number;
  private readonly priceGuideTtlMs: number;
  private readonly now: () => Date;
  private readonly maxCandidates: number;

  constructor(options: TcgDexProviderOptions = {}) {
    this.fetchFn = options.fetchFn || fetch;
    this.baseUrl = (options.baseUrl || 'https://api.tcgdex.net').replace(/\/$/, '');
    this.languagesWhenUnknown = Array.from(new Set(options.languagesWhenUnknown || DEFAULT_LANGUAGES));
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
    this.priceGuideTtlMs = options.priceGuideTtlMs ?? 48 * 60 * 60 * 1000;
    this.now = options.now || (() => new Date());
    this.maxCandidates = options.maxCandidates ?? 80;
  }

  private async json(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('TCGdex HTTP ' + response.status);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async detail(language: string, id: string): Promise<TcgDexCard | null> {
    const value = await this.json(this.baseUrl + '/v2/' + encodeURIComponent(language) + '/cards/' + encodeURIComponent(id));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as TcgDexCard) : null;
  }

  private async findInLanguage(language: string, query: CardQuery): Promise<CardCandidate[]> {
    const localId = tcgdexLocalId(query.number);
    if (!localId) return [];

    // Bei bekannter Set-ID ist der direkte Set/Karten-Endpunkt die engste Suche und darf
    // nicht auf ein anderes Set ausweichen.
    if (query.setId) {
      const url =
        this.baseUrl + '/v2/' + encodeURIComponent(language) + '/sets/' +
        encodeURIComponent(query.setId) + '/' + encodeURIComponent(localId);
      const raw = await this.json(url);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const candidate = candidateFromCard(raw as TcgDexCard, language);
      return candidate ? [candidate] : [];
    }

    // Normaler TCGdex-Filter (localId=<nummer>): Der eq:-Filter lieferte im Browser-Test für
    // localId 136 eine leere Liste, obwohl swsh3-136 existiert. Der normale Filter ist breiter und
    // liefert nur Kandidaten – ob eine Nummer exakt passt, entscheidet danach ausschließlich
    // matchCardNumber() in der WertScan-Identitätsprüfung.
    const listUrl =
      this.baseUrl + '/v2/' + encodeURIComponent(language) + '/cards?localId=' +
      encodeURIComponent(localId);
    const raw = await this.json(listUrl);
    if (!Array.isArray(raw)) return [];

    if (raw.length > this.maxCandidates) {
      const error = new Error('TCGdex-Suche unvollständig: ' + raw.length + ' Kandidaten überschreiten das Limit ' + this.maxCandidates) as Error & {
        incompleteSearch?: boolean;
      };
      error.incompleteSearch = true;
      throw error;
    }

    const ids = Array.from(
      new Set(
        (raw as TcgDexCardBrief[])
          .map(row => asString(row.id))
          .filter((value): value is string => Boolean(value))
      )
    );
    const cards = await Promise.all(ids.map(id => this.detail(language, id)));
    return cards
      .map(card => (card ? candidateFromCard(card, language) : null))
      .filter((value): value is CardCandidate => Boolean(value));
  }

  async findCards(query: CardQuery): Promise<CardCandidate[]> {
    if (query.game.toLowerCase() !== 'pokemon') return [];
    const requested = query.language?.toLowerCase() || null;
    if (requested && !this.supportedLanguages.includes(requested)) return [];

    const languages = requested ? [requested] : this.languagesWhenUnknown.filter(lang => this.supportedLanguages.includes(lang));
    const groups = await Promise.all(languages.map(language => this.findInLanguage(language, query)));
    const seen = new Set<string>();
    const result: CardCandidate[] = [];
    for (const candidate of groups.flat()) {
      const key = candidate.languageCode + ':' + candidate.cardId;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(candidate);
      if (result.length > this.maxCandidates) {
        const error = new Error('TCGdex-Suche unvollständig: zu viele sprachübergreifende Kandidaten') as Error & {
          incompleteSearch?: boolean;
        };
        error.incompleteSearch = true;
        throw error;
      }
    }
    return result;
  }

  async getPriceEvidence(request: EvidenceRequest): Promise<EvidenceResult> {
    const language = request.candidate.languageCode;
    if (!language || !this.supportedLanguages.includes(language)) {
      throw new Error('TCGdex: Sprache des bestätigten Kandidaten fehlt oder wird nicht unterstützt.');
    }
    const card = await this.detail(language, request.candidate.cardId);
    const pricing = card?.pricing;
    const fetchedAt = this.now().toISOString();
    const expiresAt = new Date(new Date(fetchedAt).getTime() + this.priceGuideTtlMs).toISOString();
    const evidence: PriceEvidence[] = [];

    const pushGuide = (
      source: string,
      priceType: string,
      price: unknown,
      currency: string,
      variant: string | null,
      observedAt: string | null
    ) => {
      const numeric = asPositiveNumber(price);
      if (numeric == null) return;
      evidence.push({
        kind: 'guide',
        providerId: this.id,
        source,
        cardId: request.candidate.cardId,
        externalId: null,
        variant,
        title: request.candidate.name,
        grading: null,
        condition: null,
        conditionSource: null,
        priceType,
        price: numeric,
        currency,
        url: this.baseUrl + '/v2/' + encodeURIComponent(language) + '/cards/' + encodeURIComponent(request.candidate.cardId),
        observedAt,
        fetchedAt,
        expiresAt,
      });
    };

    const cardmarket = pricing?.cardmarket;
    if (cardmarket && typeof cardmarket === 'object') {
      const currency = asString(cardmarket.unit) || 'EUR';
      const updated = normalizeObservedAt(cardmarket.updated);
      const regularVariant = guideVariantForCardmarket(request.candidate, false);
      const holoVariant = guideVariantForCardmarket(request.candidate, true);
      const regularFields = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30'];
      const holoFields = ['avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo'];
      regularFields.forEach(field => pushGuide('Cardmarket über TCGdex', 'cardmarket_' + field, cardmarket[field], currency, regularVariant, updated));
      holoFields.forEach(field => pushGuide('Cardmarket über TCGdex', 'cardmarket_' + field, cardmarket[field], currency, holoVariant, updated));
    }

    const tcgplayer = pricing?.tcgplayer;
    if (tcgplayer && typeof tcgplayer === 'object') {
      const currency = asString(tcgplayer.unit) || 'USD';
      const updated = normalizeObservedAt(tcgplayer.updated);
      for (const [variantName, values] of Object.entries(tcgplayer)) {
        if (variantName === 'updated' || variantName === 'unit' || !values || typeof values !== 'object' || Array.isArray(values)) continue;
        const variant = tcgplayerVariant(variantName);
        if (!variant) continue;
        for (const field of ['lowPrice', 'midPrice', 'highPrice', 'marketPrice', 'directLowPrice']) {
          pushGuide('TCGplayer über TCGdex', 'tcgplayer_' + field, (values as Record<string, unknown>)[field], currency, variant, updated);
        }
      }
    }

    // TCGdex-Preise sind Marktindikatoren. Keine dieser Zeilen wird als Verkauf ausgegeben.
    return {
      evidence,
      salesComplete: true,
      salesLoaded: 0,
      salesTotal: 0,
    };
  }
}
