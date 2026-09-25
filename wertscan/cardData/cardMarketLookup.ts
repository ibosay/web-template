/**
 * Ablauf für Sammelkarten über einen CardDataProvider:
 *   Identität prüfen → Kandidaten suchen → GENAU einen Kandidaten bestätigen → Belege laden → bewerten.
 * Bei jedem Zweifel: kein Preis, sondern ein eindeutiger Status mit Begründung.
 */
import { matchCandidates, MatchOptions, normalizeLanguage } from './cardIdentity';
import { CardSegment, CardValuation, valueCard } from './cardValuation';
import { CardCandidate, CardDataProvider, CardQuery, FxRateProvider } from './types';

export type CardMarketStatus =
  | 'priced'
  | 'insufficient_data'
  | 'not_unique'
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

const MESSAGES: Record<Exclude<CardMarketStatus, 'priced' | 'insufficient_data'>, string> = {
  not_unique: 'Karte nicht eindeutig zuordenbar. Es wird keine Karte automatisch ausgewählt und kein Preis angezeigt.',
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
      error: null,
    },
  };
  const done = (status: CardMarketStatus, message?: string) => {
    result.status = status;
    result.message = message || (status in MESSAGES ? MESSAGES[status as keyof typeof MESSAGES] : '');
    result.fallbackAllowed = status === 'insufficient_data';
    result.fallbackReason =
      status === 'insufficient_data'
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
  try {
    evidence = await provider.getPriceEvidence({ candidate: match.candidate, variant: match.variant, soldWithinDays: deps.soldWithinDays ?? 90 });
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
  });
  result.valuation = valuation;
  result.debug.excluded = valuation.excluded;
  return done(valuation.headline.kind === 'none' ? 'insufficient_data' : 'priced', valuation.message);
}
