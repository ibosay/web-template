/**
 * Ablauf für Sammelkarten über einen CardDataProvider:
 *   Identität prüfen → Kandidaten suchen → GENAU einen Kandidaten bestätigen → Belege laden → bewerten.
 * Bei jedem Zweifel: kein Preis, sondern ein eindeutiger Status mit Begründung.
 */
import { matchCandidates, MatchOptions, normalizeLanguage } from './cardIdentity';
import { CardSegment, CardValuation, valueCard } from './cardValuation';
import { CardCandidate, CardDataProvider, CardQuery, FxRateProvider } from './types';

/**
 * Feste technische Status (für Frontend und Logs):
 *  priced                                – Marktwert aus echten Belegen
 *  card_identified_no_market_evidence    – Karte eindeutig, Anbieter liefert keine Verkäufe/Angebote
 *  card_identified_insufficient_evidence – Karte eindeutig, Belege reichen nicht (z. B. < 2, Zustand nicht geführt)
 *  not_unique                            – Karte wirklich mehrdeutig
 *  provider_search_incomplete            – Anbietersuche nicht vollständig geladen (nie positive Zuordnung)
 *  not_found                             – exakte Karte nicht gefunden / Widerspruch
 *  unsupported_language                  – Sprache vom Anbieter nicht geführt
 *  insufficient_identity                 – für die Suche fehlen Pflichtangaben (z. B. Nummer)
 *  provider_error                        – Anbieter technisch nicht erreichbar
 */
export type CardMarketStatus =
  | 'priced'
  | 'card_identified_no_market_evidence'
  | 'card_identified_insufficient_evidence'
  | 'not_unique'
  | 'provider_search_incomplete'
  | 'not_found'
  | 'unsupported_language'
  | 'insufficient_identity'
  | 'provider_error';

export type CardMarketResult = {
  status: CardMarketStatus;
  message: string;
  providerId: string;
  query: CardQuery;
  segment: CardSegment;
  card: CardCandidate | null;
  variant: string | null;
  valuation: CardValuation | null;
  /**
   * Ergänzende Marktplatzsuche erlaubt? NUR wenn der Anbieter die Karte eindeutig kennt und
   * lediglich Preisdaten fehlen. Nie bei nicht eindeutiger oder widersprüchlicher Identität.
   */
  fallbackAllowed: boolean;
  fallbackReason: string;
  debug: {
    candidatesFound: number;
    rejectedCandidates: { cardId: string; reason: string }[];
    remainingCandidates: string[];
    matchReason: string | null;
    evidenceLoaded: number;
    evidenceByKind: Record<string, number>;
    excluded: Record<string, number>;
    sales: { complete: boolean; loaded: number; total: number | null } | null;
    error: string | null;
  };
};

export type CardMarketDeps = {
  provider: CardDataProvider;
  fx?: FxRateProvider;
  now?: () => Date;
  soldWithinDays?: number;
  matchOptions?: MatchOptions;
  /** Siehe ValuationInput.trustConditionFilter. Standard false. */
  trustConditionFilter?: boolean;
};

const MESSAGES: Record<Exclude<CardMarketStatus, 'priced' | 'card_identified_insufficient_evidence'>, string> = {
  not_unique: 'Karte nicht eindeutig zuordenbar. Es wird keine Karte automatisch ausgewählt und kein Preis angezeigt.',
  provider_search_incomplete:
    'Die Suche beim Kartendatenanbieter lieferte zu viele Treffer und konnte nicht vollständig geladen werden. Es wird keine Karte zugeordnet und kein Preis angezeigt.',
  card_identified_no_market_evidence:
    'Karte eindeutig erkannt, aber der Kartendatenanbieter liefert derzeit keine Verkäufe oder Angebote für diese Karte.',
  not_found: 'Diese exakte Karte (Nummer, Set, Sprache, Variante) wurde beim Datenanbieter nicht gefunden. Es wird kein Preis einer anderen Karte übernommen.',
  unsupported_language: 'Der Datenanbieter führt keine Karten in dieser Sprache. Preise anderer Sprachfassungen werden nicht übernommen.',
  insufficient_identity: 'Keine Bewertung: Für eine exakte Zuordnung fehlt mindestens die Kartennummer.',
  provider_error: 'Der Kartendatenanbieter war technisch nicht erreichbar. Das bedeutet nicht, dass es keinen Marktpreis gibt.',
};

export async function lookupCardMarket(query: CardQuery, segment: CardSegment, deps: CardMarketDeps): Promise<CardMarketResult> {
  const { provider } = deps;
  const now = deps.now ? deps.now() : new Date();
  const result: CardMarketResult = {
    status: 'insufficient_identity',
    message: '',
    providerId: provider.id,
    query,
    segment,
    card: null,
    variant: null,
    valuation: null,
    fallbackAllowed: false,
    fallbackReason: '',
    debug: {
      candidatesFound: 0,
      rejectedCandidates: [],
      remainingCandidates: [],
      matchReason: null,
      evidenceLoaded: 0,
      evidenceByKind: {},
      excluded: {},
      sales: null,
      error: null,
    },
  };
  const done = (status: CardMarketStatus, message?: string) => {
    result.status = status;
    result.message = message || (status in MESSAGES ? MESSAGES[status as keyof typeof MESSAGES] : '');
    const identified = status === 'card_identified_no_market_evidence' || status === 'card_identified_insufficient_evidence';
    result.fallbackAllowed = identified;
    result.fallbackReason = identified
        ? 'Karte eindeutig bestätigt, aber zu wenige Preisbelege beim Anbieter.'
        : status === 'priced'
          ? 'Nicht nötig: Anbieterdaten reichen aus.'
          : 'Nicht erlaubt: Kartenidentität beim Anbieter nicht eindeutig bestätigt (' + status + (result.debug.matchReason ? ': ' + result.debug.matchReason : '') + ').';
    return result;
  };

  if (!query.number) return done('insufficient_identity');

  const language = normalizeLanguage(query.language);
  if (language && provider.supportedLanguages && !provider.supportedLanguages.includes(language)) {
    return done('unsupported_language');
  }

  let candidates: CardCandidate[];
  try {
    candidates = await provider.findCards({ ...query, language });
  } catch (error) {
    result.debug.error = String(error instanceof Error ? error.message : error);
    // Unvollständiges Suchergebnis: Die richtige Karte könnte fehlen → nie als eindeutig werten.
    if (error && typeof error === 'object' && (error as { incompleteSearch?: boolean }).incompleteSearch) {
      result.debug.matchReason = 'search_result_incomplete';
      return done('provider_search_incomplete');
    }
    return done('provider_error');
  }
  result.debug.candidatesFound = candidates.length;

  const match = matchCandidates({ ...query, language }, candidates, deps.matchOptions);
  result.debug.rejectedCandidates = match.rejected;
  if (match.status !== 'unique') {
    result.debug.matchReason = match.reason;
    result.debug.remainingCandidates = match.remaining.map(candidate => candidate.cardId);
    return done(match.status, MESSAGES[match.status] + ' (Grund: ' + match.reason + ')');
  }
  result.card = match.candidate;
  result.variant = match.variant;
  result.debug.matchReason = 'unique:' + match.numberMatch;

  let evidence;
  let sales: { complete: boolean; loaded: number; total: number | null };
  try {
    const loaded = await provider.getPriceEvidence({ candidate: match.candidate, variant: match.variant, soldWithinDays: deps.soldWithinDays ?? 90 });
    evidence = loaded.evidence;
    sales = { complete: loaded.salesComplete, loaded: loaded.salesLoaded, total: loaded.salesTotal };
  } catch (error) {
    result.debug.error = String(error instanceof Error ? error.message : error);
    return done('provider_error');
  }
  // Nur Belege genau dieser Karte.
  evidence = evidence.filter(row => row.cardId === match.candidate.cardId);
  result.debug.evidenceLoaded = evidence.length;
  evidence.forEach(row => (result.debug.evidenceByKind[row.kind] = (result.debug.evidenceByKind[row.kind] || 0) + 1));

  const valuation = await valueCard({
    evidence,
    variant: match.variant,
    cardHasMultipleVariants: match.candidate.variants.length > 1,
    segment,
    now,
    fx: deps.fx,
    supportedRawConditions: provider.supportedRawConditions,
    trustConditionFilter: deps.trustConditionFilter ?? false,
    sales,
  });
  result.valuation = valuation;
  result.debug.excluded = valuation.excluded;
  result.debug.sales = sales;
  if (valuation.headline.kind !== 'none') return done('priced', valuation.message);
  if (!valuation.marketEvidenceCount) {
    return done('card_identified_no_market_evidence', (valuation.message || MESSAGES.card_identified_no_market_evidence));
  }
  return done('card_identified_insufficient_evidence', valuation.message);
}
