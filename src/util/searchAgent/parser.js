/**
 * Query parser of the search agent.
 *
 * Turns a free-text query ("Suche Handy iPhone 13 in Berlin unter 300 Euro, neuste zuerst")
 * into a structured intent: what to look for, where, in which price range, in which order.
 *
 * The parser is rule based and runs locally. It recognizes German and English phrasings,
 * which are the two languages the template ships translations for by default. Everything it
 * does not recognize stays in the keywords, so a query is never silently dropped.
 */

import {
  COUNTRIES,
  findCities,
  findCountry,
  MAX_PLACE_NAME_WORDS,
  normalizeTerm,
} from './locations';

// A number as people write it: 1200, 1.200, 1,200, 1200.50, 1200,50
const NUM = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
const CURRENCY = '€|eur\\b|euros?\\b|\\$|usd\\b|dollars?\\b|chf\\b|fr\\.?\\b|£|gbp\\b|pfund\\b';

const CURRENCY_CODES = [
  { code: 'EUR', pattern: /€|\beur\b|\beuros?\b/i },
  { code: 'USD', pattern: /\$|\busd\b|\bdollars?\b/i },
  { code: 'CHF', pattern: /\bchf\b|\bfr\.?\b/i },
  { code: 'GBP', pattern: /£|\bgbp\b|\bpfund\b/i },
];

// Years are written like prices but almost never mean one ("iPhone ab 2020").
const looksLikeYear = value => Number.isInteger(value) && value >= 1900 && value <= 2100;

/**
 * Parse an amount written in German or English notation.
 * When both separators appear, the last one is the decimal separator. A single separator
 * followed by exactly three digits is a thousands separator ("1.200" -> 1200).
 *
 * @param {String} str
 * @returns {Number|null}
 */
export const parseAmount = str => {
  if (typeof str !== 'string') {
    return null;
  }
  const trimmed = str.trim();
  if (!/^\d[\d.,]*$/.test(trimmed)) {
    return null;
  }
  const lastDot = trimmed.lastIndexOf('.');
  const lastComma = trimmed.lastIndexOf(',');
  const hasBoth = lastDot > -1 && lastComma > -1;

  let normalized;
  if (hasBoth) {
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    normalized = trimmed.split(thousandsSeparator).join('');
    normalized = normalized.replace(decimalSeparator, '.');
  } else {
    const separator = lastDot > -1 ? '.' : lastComma > -1 ? ',' : null;
    const decimals = separator ? trimmed.length - trimmed.lastIndexOf(separator) - 1 : 0;
    const isThousands = separator && decimals === 3 && /^\d{1,3}([.,]\d{3})+$/.test(trimmed);
    normalized = isThousands ? trimmed.split(separator).join('') : trimmed.replace(/,/g, '.');
  }

  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
};

const detectCurrency = text => CURRENCY_CODES.find(c => c.pattern.test(text))?.code || null;

/**
 * Replace a matched span with spaces, so the words are gone from the keywords but all
 * remaining match indices stay valid.
 */
const blank = (text, start, length) =>
  text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);

/**
 * Run a list of patterns against the query and let the first match win.
 *
 * @param {String} text current working text
 * @param {Array} rules [{pattern, read}] where `read` maps a match to a value (or null to skip)
 * @returns {Object} {value, text} — value is null when nothing matched
 */
const applyFirstMatch = (text, rules) => {
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (match) {
      const value = rule.read(match);
      if (value != null) {
        return { value, text: blank(text, match.index, match[0].length) };
      }
    }
  }
  return { value: null, text };
};

const toKm = (amount, unit) => {
  const num = Number.parseInt(amount, 10);
  const isMiles = /mile|meile/i.test(unit);
  return isMiles ? Math.round(num * 1.609) : num;
};

const parseRadius = text => {
  const rules = [
    {
      pattern: new RegExp(
        `(?:im\\s+)?umkreis\\s+von\\s+(\\d{1,3})\\s*(km|kilometer\\w*|meilen?|miles?)`,
        'i'
      ),
      read: m => ({ km: toKm(m[1], m[2]) }),
    },
    {
      pattern: new RegExp(
        `(?:innerhalb|within)\\s+(?:von\\s+)?(\\d{1,3})\\s*(km|kilometer\\w*|meilen?|miles?)`,
        'i'
      ),
      read: m => ({ km: toKm(m[1], m[2]) }),
    },
    {
      pattern: new RegExp(
        `(\\d{1,3})\\s*(km|meilen?|miles?)\\s*(?:umkreis|radius|umgebung|around)`,
        'i'
      ),
      read: m => ({ km: toKm(m[1], m[2]) }),
    },
  ];
  const { value, text: rest } = applyFirstMatch(text, rules);
  return { radiusKm: value ? value.km : null, text: rest };
};

const parsePrice = (text, fallbackCurrency) => {
  const currencyInQuery = detectCurrency(text);
  const readAmount = (raw, matchText) => {
    const amount = parseAmount(raw);
    if (amount == null || amount < 0) {
      return null;
    }
    // Without a currency in the match, a year-shaped number is not a price.
    const hasCurrency = !!detectCurrency(matchText);
    return !hasCurrency && looksLikeYear(amount) ? null : amount;
  };

  const rules = [
    {
      // "zwischen 100 und 300 Euro", "between 100 and 300", "von 100 bis 300 €"
      pattern: new RegExp(
        `\\b(?:zwischen|between|von|from)\\s+(?:${CURRENCY})?\\s*(${NUM})\\s*(?:${CURRENCY})?\\s*(?:und|bis|and|to|[-–])\\s*(?:${CURRENCY})?\\s*(${NUM})\\s*(?:${CURRENCY})?`,
        'i'
      ),
      read: m => {
        const min = readAmount(m[1], m[0]);
        const max = readAmount(m[2], m[0]);
        return min != null && max != null ? { min, max } : null;
      },
    },
    {
      // "100 - 300 €" — a currency is required so that "iPhone 13 - 14" is not a price range.
      pattern: new RegExp(
        `\\b(${NUM})\\s*(?:${CURRENCY})?\\s*[-–]\\s*(${NUM})\\s*(?:${CURRENCY})`,
        'i'
      ),
      read: m => {
        const min = readAmount(m[1], m[0]);
        const max = readAmount(m[2], m[0]);
        return min != null && max != null ? { min, max } : null;
      },
    },
    {
      // upper bound
      pattern: new RegExp(
        `\\b(?:unter|bis(?:\\s+zu)?|max\\.?|maximal|h(?:oe|ö)chstens|nicht\\s+mehr\\s+als|(?:g(?:ue|ü)nstiger|billiger)\\s+als|under|below|less\\s+than|up\\s+to|cheaper\\s+than|no\\s+more\\s+than)\\s*(?:${CURRENCY})?\\s*(${NUM})\\s*(?:${CURRENCY})?`,
        'i'
      ),
      read: m => {
        const max = readAmount(m[1], m[0]);
        return max != null ? { min: null, max } : null;
      },
    },
    {
      // lower bound
      pattern: new RegExp(
        `\\b(?:ab|mindestens|min\\.?|minimum|mehr\\s+als|teurer\\s+als|over|at\\s+least|more\\s+than|starting\\s+at)\\s*(?:${CURRENCY})?\\s*(${NUM})\\s*(?:${CURRENCY})?`,
        'i'
      ),
      read: m => {
        const min = readAmount(m[1], m[0]);
        return min != null ? { min, max: null } : null;
      },
    },
  ];

  const { value, text: rest } = applyFirstMatch(text, rules);
  if (!value) {
    return { price: null, text: rest };
  }
  // A reversed range ("bis 300 ab 500") is a typo, not an empty result set.
  const { min, max } = value;
  const ordered = min != null && max != null && min > max ? { min: max, max: min } : { min, max };

  return {
    price: { ...ordered, currency: currencyInQuery || fallbackCurrency || null },
    text: rest,
  };
};

const parseSort = text => {
  const rules = [
    {
      pattern: /\b(?:g(?:ue|ü)nstigste\w*|billigste\w*|niedrigster\s+preis|preis\s+aufsteigend|cheapest|lowest\s+price)\b/i,
      read: () => '-price',
    },
    {
      pattern: /\b(?:teuerste\w*|h(?:oe|ö)chster\s+preis|preis\s+absteigend|most\s+expensive|highest\s+price)\b/i,
      read: () => 'price',
    },
    {
      pattern: /\b(?:neueste\w*|neuste\w*|zuletzt\s+eingestellt|newest|latest|most\s+recent)\b/i,
      read: () => 'createdAt',
    },
    { pattern: /\b(?:(?:ae|ä)lteste\w*|oldest)\b/i, read: () => '-createdAt' },
  ];
  const { value, text: rest } = applyFirstMatch(text, rules);
  return { sort: value, text: rest };
};

const parseCondition = text => {
  const rules = [
    {
      pattern: /\b(?:neuwertig|ungebraucht|originalverpackt|ovp|brand\s*new|unused)\b/i,
      read: () => 'new',
    },
    { pattern: /\b(?:fabrikneu|nagelneu)\b/i, read: () => 'new' },
    {
      pattern: /\b(?:gebraucht\w*|second\s*hand|gebrauchtware|used|pre\s*owned)\b/i,
      read: () => 'used',
    },
    { pattern: /\b(?:defekt\w*|kaputt|bastler\w*|broken|for\s+parts)\b/i, read: () => 'broken' },
  ];
  const { value, text: rest } = applyFirstMatch(text, rules);
  return { condition: value, text: rest };
};

// Words that introduce a place. Used to prefer "in Berlin" over a bare "Berlin".
const PLACE_PREPOSITIONS = [
  'in',
  'im',
  'aus',
  'bei',
  'nahe',
  'naehe',
  'um',
  'rund um',
  'raum',
  'region',
  'standort',
  'ort',
  'stadt',
  'land',
  'near',
  'around',
  'from',
  'at',
  'city',
  'country',
  'location',
];

/**
 * Find the place names in the query.
 *
 * Two passes: first only windows that follow a preposition ("in Berlin"), then bare windows
 * ("Berlin"). The first pass keeps product names from being read as places when the query
 * also names a real location.
 */
const parseLocation = (text, defaultCountryCode) => {
  const words = text.split(/\s+/).filter(Boolean);
  // Map each word back to its index in `text`, so matched words can be blanked out.
  const spans = [];
  let cursor = 0;
  words.forEach(word => {
    const index = text.indexOf(word, cursor);
    spans.push({ word, start: index, end: index + word.length });
    cursor = index + word.length;
  });

  const windows = [];
  for (let i = 0; i < words.length; i++) {
    for (let size = Math.min(MAX_PLACE_NAME_WORDS, words.length - i); size >= 1; size--) {
      const term = normalizeTerm(words.slice(i, i + size).join(' '));
      if (!term) {
        continue;
      }
      const previous = i > 0 ? normalizeTerm(words[i - 1]) : null;
      const twoBefore = i > 1 ? normalizeTerm(`${words[i - 2]} ${words[i - 1]}`) : null;
      const hasSingleWordPreposition = !!previous && PLACE_PREPOSITIONS.includes(previous);
      const hasTwoWordPreposition = !!twoBefore && PLACE_PREPOSITIONS.includes(twoBefore);
      const hasPreposition = hasSingleWordPreposition || hasTwoWordPreposition;
      const prepositionStart = hasTwoWordPreposition
        ? spans[i - 2].start
        : hasSingleWordPreposition
        ? spans[i - 1].start
        : null;
      windows.push({
        term,
        start: spans[i].start,
        end: spans[i + size - 1].end,
        prepositionStart,
        hasPreposition,
        size,
      });
    }
  }

  const countryWindows = windows.filter(w => !!findCountry(w.term));
  const cityWindows = windows.filter(w => findCities(w.term).length > 0);

  // Longer names win ("Frankfurt am Main" over "Frankfurt"), then prepositioned ones.
  const pickBest = candidates =>
    candidates
      .slice()
      .sort((a, b) => b.size - a.size || Number(b.hasPreposition) - Number(a.hasPreposition))[0] ||
    null;

  const withPreposition = list => list.filter(w => w.hasPreposition);
  const countryWindow = pickBest(withPreposition(countryWindows)) || pickBest(countryWindows);
  const country = countryWindow ? findCountry(countryWindow.term) : null;

  const cityCandidateWindows = withPreposition(cityWindows).length
    ? withPreposition(cityWindows)
    : cityWindows;
  // A city window must not overlap the country window ("Luxemburg" is both).
  const cityWindow = pickBest(
    cityCandidateWindows.filter(w => !countryWindow || w.start !== countryWindow.start)
  );

  const warnings = [];
  let city = null;
  let cityCandidates = [];

  if (cityWindow) {
    const contextCountry = country?.code || defaultCountryCode || null;
    const allMatches = findCities(cityWindow.term);
    const inContext = contextCountry
      ? allMatches.filter(c => c.countryCode === contextCountry)
      : [];

    if (inContext.length === 1) {
      city = inContext[0];
    } else if (country && inContext.length === 0) {
      // The query named both, but the city is not in that country.
      warnings.push({ code: 'cityNotInCountry', city: allMatches[0]?.name, country: country.name });
      city = allMatches.length === 1 ? allMatches[0] : null;
      cityCandidates = allMatches.length > 1 ? allMatches : [];
    } else if (allMatches.length === 1) {
      city = allMatches[0];
    } else if (allMatches.length > 1) {
      // Same name in several countries — let the user decide instead of guessing.
      warnings.push({ code: 'ambiguousCity', city: allMatches[0]?.name });
      cityCandidates = allMatches;
    }
  }

  let rest = text;
  const consume = window => {
    if (!window) {
      return;
    }
    const start = window.prepositionStart != null ? window.prepositionStart : window.start;
    rest = blank(rest, start, window.end - start);
  };
  // Keep an ambiguous city in the keywords: the search still runs, just without an area.
  if (city) {
    consume(cityWindow);
  }
  if (country) {
    consume(countryWindow);
  }

  // A city implies its country, so the country filter always shows where the search happens.
  const resolvedCountry =
    country || (city ? COUNTRIES.find(c => c.code === city.countryCode) || null : null);

  return { city, country: resolvedCountry, cityCandidates, warnings, text: rest };
};

// Filler that describes the act of searching rather than the thing searched for.
const STOPWORDS = new Set([
  'suche',
  'such',
  'suchen',
  'sucht',
  'finde',
  'find',
  'finden',
  'zeig',
  'zeige',
  'zeigt',
  'zeigen',
  'mir',
  'mich',
  'ich',
  'bitte',
  'mal',
  'gerne',
  'brauche',
  'moechte',
  'will',
  'nach',
  'einen',
  'einem',
  'eine',
  'einer',
  'ein',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'und',
  'oder',
  'fuer',
  'von',
  'mit',
  'search',
  'searching',
  'looking',
  'look',
  'show',
  'me',
  'please',
  'want',
  'need',
  'for',
  'a',
  'an',
  'the',
  'and',
  'or',
  'with',
  'to',
  'i',
]);

const MAX_KEYWORDS_LENGTH = 80;

const extractKeywords = text => {
  const words = text
    .split(/\s+/)
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+]+$/gu, ''))
    .filter(Boolean)
    .filter(word => !STOPWORDS.has(normalizeTerm(word)));

  return words
    .join(' ')
    .slice(0, MAX_KEYWORDS_LENGTH)
    .trim();
};

/**
 * Parse a sanitized query into a search intent.
 *
 * @param {String} sanitizedQuery output of `sanitizeQuery`
 * @param {Object} [options]
 * @param {String} [options.currency] marketplace currency, used when the query names no currency
 * @param {String} [options.defaultCountryCode] country to assume for ambiguous city names
 * @returns {Object} intent
 */
export const parseIntent = (sanitizedQuery, options = {}) => {
  const { currency = null, defaultCountryCode = null } = options;
  const query = typeof sanitizedQuery === 'string' ? sanitizedQuery : '';

  const radiusStep = parseRadius(query);
  const priceStep = parsePrice(radiusStep.text, currency);
  const sortStep = parseSort(priceStep.text);
  const conditionStep = parseCondition(sortStep.text);
  const locationStep = parseLocation(conditionStep.text, defaultCountryCode);
  const keywords = extractKeywords(locationStep.text);

  return {
    query,
    keywords,
    city: locationStep.city,
    country: locationStep.country,
    cityCandidates: locationStep.cityCandidates,
    radiusKm: radiusStep.radiusKm,
    price: priceStep.price,
    sort: sortStep.sort,
    condition: conditionStep.condition,
    warnings: locationStep.warnings,
  };
};
