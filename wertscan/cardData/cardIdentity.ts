/**
 * Exakte Kartenzuordnung. Keine Heuristik: Es gibt nur feste Normalisierungen
 * (Groß/Klein, Trennzeichen, führende Nullen) und explizite Synonymtabellen.
 * Passt nicht genau EIN Kandidat, gibt es keinen Preis.
 */
import { EXPANSION_ALIASES, ExpansionAlias } from './expansionAliases';
import { CardCandidate, CardQuery, Grading } from './types';

export const fold = (value: string | null | undefined) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

export const normText = (value: string | null | undefined) =>
  fold(value)
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ')
    .trim();

const compact = (value: string | null | undefined) => normText(value).replace(/ /g, '');

const stripLeadingZeros = (value: string) => value.replace(/(^|[a-z])0+(\d)/g, '$1$2');

// ---------------------------------------------------------------------------
// Kartennummer
// ---------------------------------------------------------------------------

export type CardNumberKey = { full: string; lead: string; hasDenominator: boolean };

/** "143/S P", "143/S-P", "143/S-P Promo", "#143/SP" → full "143sp", lead "143". */
export function cardNumberKey(raw: string | null | undefined): CardNumberKey {
  const value = String(raw || '').replace(/^\s*#\s*/, '');
  const tokens = fold(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(token => (/^\d+$/.test(token) ? String(Number(token)) : token));
  while (tokens.length > 1 && /^(nr|no|nummer|number)$/.test(tokens[0])) tokens.shift();
  // Nachgestellte Wörter (Promo, Holo, Secret …) gehören nicht zur Nummer.
  while (tokens.length > 1 && /^[a-z]{3,}$/.test(tokens[tokens.length - 1])) tokens.pop();
  const slash = value.indexOf('/');
  const leftTokens = fold(slash >= 0 ? value.slice(0, slash) : value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(token => !/^(nr|no|nummer|number)$/.test(token))
    .map(token => (/^\d+$/.test(token) ? String(Number(token)) : token));
  return {
    full: stripLeadingZeros(tokens.join('')),
    lead: stripLeadingZeros(leftTokens.join('')),
    hasDenominator: slash >= 0,
  };
}

export type NumberMatch = 'exact' | 'lead' | null;

/** Numerischer Nenner einer erkannten Nummer ("223/197" → 197), sonst null ("143/S-P", "223"). */
export function numericDenominator(raw: string | null | undefined): number | null {
  const value = String(raw || '');
  const slash = value.indexOf('/');
  if (slash < 0) return null;
  const right = value.slice(slash + 1).trim();
  return /^\d+$/.test(right) ? Number(right) : null;
}

/**
 * 'exact': vollständige Nummer identisch (printed_number oder number).
 * 'lead' : nur die Kartennummer vor dem "/" passt, weil eine Seite keinen Nenner führt.
 *          Wird nur akzeptiert, wenn zusätzlich das Set exakt bestätigt ist.
 */
export function matchCardNumber(queryNumber: string | null, candidate: CardCandidate): NumberMatch {
  if (!queryNumber) return null;
  const q = cardNumberKey(queryNumber);
  if (!q.full) return null;
  const printed = candidate.printedNumber ? cardNumberKey(candidate.printedNumber) : null;
  const plain = candidate.number ? cardNumberKey(candidate.number) : null;
  if ((printed && printed.full === q.full) || (plain && plain.full === q.full)) return 'exact';
  if (q.hasDenominator && !printed && plain && !plain.hasDenominator && plain.full === q.lead) {
    // Erkannter numerischer Nenner (z. B. 223/197) und offizielle Set-Kartenzahl vom Anbieter:
    // Beides muss passen. Passt es, ist die vollständige Nummer belegt; sonst Ablehnung.
    // Ohne Kartenzahl oder bei Sondernummern (143/S-P) bleibt es bei 'lead' (Set muss bestätigen).
    const denominator = numericDenominator(queryNumber);
    const official = candidate.setOfficialCount;
    if (denominator != null && typeof official === 'number' && Number.isFinite(official)) {
      return official === denominator ? 'exact' : null;
    }
    return 'lead';
  }
  if (!q.hasDenominator && printed && printed.lead === q.full) return 'lead';
  return null;
}

// ---------------------------------------------------------------------------
// Sprache
// ---------------------------------------------------------------------------

const LANGUAGE_CODES: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en', englisch: 'en',
  ja: 'ja', jp: 'ja', jpn: 'ja', japanese: 'ja', japanisch: 'ja',
  de: 'de', ger: 'de', deu: 'de', german: 'de', deutsch: 'de',
  fr: 'fr', fra: 'fr', french: 'fr', franzosisch: 'fr', francais: 'fr',
  it: 'it', ita: 'it', italian: 'it', italienisch: 'it', italiano: 'it',
  es: 'es', spa: 'es', spanish: 'es', spanisch: 'es', espanol: 'es',
  pt: 'pt', por: 'pt', portuguese: 'pt', portugiesisch: 'pt',
  ko: 'ko', kor: 'ko', korean: 'ko', koreanisch: 'ko',
  zh: 'zh', chi: 'zh', chinese: 'zh', chinesisch: 'zh',
};

/** Nur explizit bekannte Bezeichnungen → ISO-Code; alles andere → null. */
export function normalizeLanguage(value: string | null | undefined): string | null {
  const key = compact(value);
  return key ? LANGUAGE_CODES[key] || null : null;
}

// ---------------------------------------------------------------------------
// Variante – explizite Synonyme, sonst exakter Vergleich
// ---------------------------------------------------------------------------

const VARIANT_SYNONYMS: Record<string, string> = {
  normal: 'normal', nonholo: 'normal', nonholofoil: 'normal', regular: 'normal',
  holo: 'holofoil', holofoil: 'holofoil',
  reverse: 'reverseholofoil', reverseholo: 'reverseholofoil', reverseholofoil: 'reverseholofoil', reversefoil: 'reverseholofoil',
  '1stedition': 'firstedition', firstedition: 'firstedition', '1steditionnormal': 'firstedition', firsteditionnormal: 'firstedition',
  '1steditionholo': 'firsteditionholofoil', '1steditionholofoil': 'firsteditionholofoil',
  firsteditionholo: 'firsteditionholofoil', firsteditionholofoil: 'firsteditionholofoil',
  unlimited: 'unlimited', unlimitedholo: 'unlimitedholofoil', unlimitedholofoil: 'unlimitedholofoil',
};

export function variantKey(value: string | null | undefined): string | null {
  const key = compact(value);
  return key ? VARIANT_SYNONYMS[key] || key : null;
}

// ---------------------------------------------------------------------------
// Grading und Raw-Zustand
// ---------------------------------------------------------------------------

export function normalizeGrading(company: string | null | undefined, grade: string | number | null | undefined): Grading | null {
  const c = compact(company);
  const match = String(grade ?? '').replace(',', '.').match(/\d+(?:\.\d)?/);
  if (!c || !match) return null;
  return { company: c === 'beckett' ? 'bgs' : c, grade: String(Number(match[0])) };
}

export const sameGrading = (a: Grading | null, b: Grading | null) =>
  Boolean(a && b && a.company === b.company && a.grade === b.grade);

export const formatGrading = (grading: Grading) => grading.company.toUpperCase() + ' ' + grading.grade.replace('.', ',');

// Zustände: siehe conditions.ts (zentrale Taxonomie).

// ---------------------------------------------------------------------------
// Kandidatenauswahl
// ---------------------------------------------------------------------------

export type CandidateRejection = { cardId: string; reason: string };

export type MatchResult =
  | { status: 'unique'; candidate: CardCandidate; variant: string | null; numberMatch: NumberMatch; rejected: CandidateRejection[] }
  | { status: 'not_found' | 'not_unique'; reason: string; remaining: CardCandidate[]; rejected: CandidateRejection[] };

export type MatchOptions = {
  /** Kontrolliert gepflegte Set-Zuordnungen. Standard: EXPANSION_ALIASES (expansionAliases.ts). */
  expansionAliases?: ExpansionAlias[];
};

/**
 * 'match'        : Set exakt bestätigt (Name, ID oder bestätigter Alias)
 * 'conflict'     : Set bekannt und widerspricht (Alias vorhanden und passt nicht, oder ID abweichend)
 * 'unverifiable' : Setname ohne Alias und ohne exakte Übereinstimmung – z. B. anderssprachiger Name
 * 'unknown'      : kein Set erkannt
 */
type SetCheck = 'match' | 'conflict' | 'unverifiable' | 'unknown';

function checkSet(query: CardQuery, candidate: CardCandidate, aliases: ExpansionAlias[]): SetCheck {
  if (query.setId) return compact(query.setId) === compact(candidate.expansionId) ? 'match' : 'conflict';
  if (!query.setName) return 'unknown';
  const name = normText(query.setName);
  if (name === normText(candidate.expansionName)) return 'match';
  const matching = aliases.filter(entry => entry.game === query.game && normText(entry.alias) === name);
  if (!matching.length) return 'unverifiable';
  const hit = matching.some(
    entry =>
      normText(entry.expansionName) === normText(candidate.expansionName) ||
      Boolean(entry.expansionId && compact(entry.expansionId) === compact(candidate.expansionId))
  );
  return hit ? 'match' : 'conflict';
}

/** Ablehnungsgründe, die einen echten Widerspruch zur erkannten Identität bedeuten. */
export const IDENTITY_CONFLICT_REASONS = ['number_mismatch', 'language_mismatch', 'set_mismatch', 'variant_mismatch'];

export function matchCandidates(query: CardQuery, candidates: CardCandidate[], options: MatchOptions = {}): MatchResult {
  const aliases = options.expansionAliases || EXPANSION_ALIASES;
  const rejected: CandidateRejection[] = [];

  if (!query.number) {
    return { status: 'not_unique', reason: 'number_missing', remaining: candidates, rejected };
  }
  const queryLanguage = normalizeLanguage(query.language);
  const queryVariant = variantKey(query.variant);

  type Accepted = { candidate: CardCandidate; variant: string | null; variantUnknown: boolean; numberMatch: NumberMatch };
  const accepted: Accepted[] = [];

  candidates.forEach(candidate => {
    const reject = (reason: string) => rejected.push({ cardId: candidate.cardId, reason });
    const numberMatch = matchCardNumber(query.number, candidate);
    if (!numberMatch) return reject('number_mismatch');

    if (queryLanguage) {
      const candidateLanguage = normalizeLanguage(candidate.languageCode) || normalizeLanguage(candidate.language);
      if (candidateLanguage !== queryLanguage) return reject('language_mismatch');
    }

    const set = checkSet(query, candidate, aliases);
    if (set === 'conflict') return reject('set_mismatch');
    if (set === 'unverifiable') return reject('set_unverifiable_no_alias');
    if (numberMatch === 'lead' && set !== 'match') return reject('number_not_exact_without_set');
    // Ohne bestätigtes Set muss wenigstens der Name exakt passen (sonst könnten Nachdrucke/Promos
    // verwechselt werden). Nur bei BEKANNTER Sprache: Namen unterscheiden sich zwischen Sprachen
    // (Charizard / リザードン). Bei unbekannter Sprache bleibt die Karte Kandidat → "nicht eindeutig".
    if (set === 'unknown' && queryLanguage && query.name && normText(query.name) !== normText(candidate.name)) {
      return reject('name_mismatch_without_set');
    }

    const variants = candidate.variants.map(entry => entry.name);
    if (queryVariant) {
      const hit = variants.filter(name => variantKey(name) === queryVariant);
      if (hit.length !== 1) return reject(hit.length ? 'variant_ambiguous' : 'variant_mismatch');
      accepted.push({ candidate, variant: hit[0], variantUnknown: false, numberMatch });
    } else if (variants.length <= 1) {
      accepted.push({ candidate, variant: variants[0] || null, variantUnknown: false, numberMatch });
    } else {
      accepted.push({ candidate, variant: null, variantUnknown: true, numberMatch });
    }
  });

  if (!accepted.length) {
    const reasons = Array.from(new Set(rejected.map(item => item.reason)));
    // Setname nicht prüfbar (kein Alias) → nicht eindeutig statt "nicht gefunden".
    if (reasons.includes('set_unverifiable_no_alias')) {
      return { status: 'not_unique', reason: 'set_unverifiable_no_alias', remaining: [], rejected };
    }
    return { status: 'not_found', reason: reasons.length ? reasons.join(',') : 'no_candidates', remaining: [], rejected };
  }
  if (accepted.length > 1) {
    const languages = new Set(accepted.map(item => normalizeLanguage(item.candidate.languageCode) || '?'));
    const reason = !queryLanguage && languages.size > 1 ? 'language_unknown_multiple_candidates' : 'multiple_candidates';
    return { status: 'not_unique', reason, remaining: accepted.map(item => item.candidate), rejected };
  }
  const only = accepted[0];
  if (only.variantUnknown) {
    return { status: 'not_unique', reason: 'variant_unknown_multiple_variants', remaining: [only.candidate], rejected };
  }
  return { status: 'unique', candidate: only.candidate, variant: only.variant, numberMatch: only.numberMatch, rejected };
}
