/**
 * Exakte Kartenzuordnung. Keine Heuristik: Es gibt nur feste Normalisierungen
 * (Groß/Klein, Trennzeichen, führende Nullen) und explizite Synonymtabellen.
 * Passt nicht genau EIN Kandidat, gibt es keinen Preis.
 */
import { CardCandidate, CardQuery, Grading, RawCondition } from './types';

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
  if (q.hasDenominator && !printed && plain && !plain.hasDenominator && plain.full === q.lead) return 'lead';
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

const RAW_CONDITION_PHRASES: [RegExp, RawCondition][] = [
  [/(^| )(nm|near mint)( |$)/, 'NM'],
  [/(^| )(lp|lightly played|light played)( |$)/, 'LP'],
  [/(^| )(mp|moderately played)( |$)/, 'MP'],
  [/(^| )(hp|heavily played|heavy played)( |$)/, 'HP'],
  [/(^| )(dm|dmg|damaged)( |$)/, 'DM'],
];

/**
 * Ordnet einen Zustandstext nur dann einer Raw-Kategorie zu, wenn er GENAU eine der festen
 * Bezeichnungen enthält. "Mint", "sehr gut" o. Ä. werden nicht umgedeutet → null.
 */
export function normalizeRawCondition(value: string | null | undefined): RawCondition | null {
  const text = normText(value);
  if (!text) return null;
  const found = new Set<RawCondition>();
  RAW_CONDITION_PHRASES.forEach(([pattern, code]) => {
    if (pattern.test(text)) found.add(code);
  });
  return found.size === 1 ? [...found][0] : null;
}

// ---------------------------------------------------------------------------
// Kandidatenauswahl
// ---------------------------------------------------------------------------

export type CandidateRejection = { cardId: string; reason: string };

export type MatchResult =
  | { status: 'unique'; candidate: CardCandidate; variant: string | null; numberMatch: NumberMatch; rejected: CandidateRejection[] }
  | { status: 'not_found' | 'not_unique'; reason: string; remaining: CardCandidate[]; rejected: CandidateRejection[] };

export type MatchOptions = {
  /** Explizite, von Menschen gepflegte Zuordnung Setname → expansion.id (z. B. deutsche Setnamen). */
  expansionAliases?: Record<string, string>;
};

function setMatches(query: CardQuery, candidate: CardCandidate, aliases: Record<string, string>): boolean | null {
  if (query.setId) return compact(query.setId) === compact(candidate.expansionId);
  if (!query.setName) return null; // kein Set bekannt → nicht prüfbar
  const name = normText(query.setName);
  if (name === normText(candidate.expansionName)) return true;
  const alias = aliases[name];
  return Boolean(alias && compact(alias) === compact(candidate.expansionId));
}

export function matchCandidates(query: CardQuery, candidates: CardCandidate[], options: MatchOptions = {}): MatchResult {
  const aliases: Record<string, string> = {};
  Object.entries(options.expansionAliases || {}).forEach(([key, value]) => (aliases[normText(key)] = value));
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

    const setOk = setMatches(query, candidate, aliases);
    if (setOk === false) return reject('set_mismatch');
    if (numberMatch === 'lead' && setOk !== true) return reject('number_not_exact_without_set');
    // Ohne bestätigtes Set muss wenigstens der Name exakt passen (sonst könnten Nachdrucke/Promos verwechselt werden).
    if (setOk === null && query.name && normText(query.name) !== normText(candidate.name)) return reject('name_mismatch_without_set');

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
