/**
 * Safety layer of the search agent.
 *
 * Two jobs:
 * 1. Sanitize the free-text query before anything else touches it.
 * 2. Classify the query, so that requests that would put the user at risk are stopped
 *    ("blocked") and risky-but-legitimate ones get a warning ("caution").
 *
 * The agent never sends the query anywhere except the marketplace's own search API, so the
 * risk this layer addresses is what the user could walk into: illegal goods, scam patterns,
 * and searches that are really attempts to look up a private person.
 */

/** Queries longer than this are cut off. Real search queries are far shorter. */
export const MAX_QUERY_LENGTH = 250;

export const RISK_OK = 'ok';
export const RISK_CAUTION = 'caution';
export const RISK_BLOCKED = 'blocked';

/**
 * Remove everything that has no business in a search query: control characters, markup,
 * and anything that looks like an injected URL or template expression. The result is plain
 * text that is safe to render, to log, and to put into a URL query parameter.
 *
 * @param {String} raw the user's input
 * @returns {String} sanitized query, at most MAX_QUERY_LENGTH characters
 */
export const sanitizeQuery = raw => {
  if (typeof raw !== 'string') {
    return '';
  }
  return (
    raw
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      // Zero-width and bidi characters can hide text from the user while keeping it in the query.
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/[<>]/g, ' ')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/\b(?:https?|ftp|javascript|data|file|vbscript):\/*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_QUERY_LENGTH)
  );
};

// Searches the agent refuses to run. Each rule carries a code that maps to a translated
// explanation, so the user learns why the search was stopped.
const BLOCK_RULES = [
  {
    code: 'weapons',
    pattern: /\b(schusswaffe\w*|pistole\w*|revolver|maschinenpistole|sturmgewehr|munition|patronen|sprengstoff|granate\w*|handgranate\w*|firearm\w*|handgun\w*|ammunition|explosives?|silencer|schalld(ae|ä)mpfer)\b/i,
  },
  {
    code: 'drugs',
    pattern: /\b(kokain|heroin|crystal\s*meth|methamphetamin\w*|mdma|ecstasy|lsd|amphetamin\w*|cocaine|fentanyl)\b/i,
  },
  {
    code: 'forgery',
    pattern: /\b(gef(ae|ä)lscht\w*|f(ae|ä)lschung\w*|fake)\s+(ausweis\w*|p(ae|ä)ss\w*|pass|papiere|dokument\w*|f(ue|ü)hrerschein\w*|id|passport\w*|document\w*)\b|\b(fake\s*id|falscher\s+ausweis|blueten\s+geld)\b/i,
  },
  {
    code: 'stolenGoods',
    pattern: /\b(gestohlen\w*|hehlerware|diebesgut|stolen|geklaut\w*)\b|\bimei\s*(entsperren|(ae|ä)ndern|unlock|change)\b|\bicloud\s*(sperre\s*entfernen|bypass|unlock)\b/i,
  },
  {
    code: 'credentials',
    pattern: /\b(kreditkartennummer\w*|kreditkartendaten|kontodaten|bankdaten|cvv|carding|dumps)\b|\bpasswort\w*\s*(kaufen|liste|leak)\b|\bgehackt\w*\s*(konto|account)\b|\bhacked\s+accounts?\b|\bstolen\s+credit\s+cards?\b/i,
  },
  {
    code: 'personSearch',
    pattern: /\b(adresse|wohnort|wohnadresse|anschrift|telefonnummer|handynummer|standort|aufenthaltsort|address|phone\s*number|home\s*address)\s+(von|vom|of)\s+\S+/i,
  },
  {
    code: 'personSearch',
    pattern: /\b(person\w*\s+(finden|aufsp(ue|ü)ren|ausfindig|tracken|orten)|jemanden\s+(orten|tracken|(ue|ü)berwachen)|stalk\w*|track\s+(a\s+)?person|find\s+someone'?s?\s+(address|phone))\b/i,
  },
  {
    code: 'personalData',
    pattern: /\b(ausweiskopie\w*|passkopie\w*|sozialversicherungsnummer\w*|ssn|social\s+security\s+number)\b|\bpersonalausweis\s*(scan|kopie)\b|\bsteuer\s*id\s+von\b/i,
  },
];

// Searches that are allowed but come with a known risk. The agent runs them and shows a hint.
const CAUTION_RULES = [
  {
    code: 'advancePayment',
    pattern: /\b(vorkasse|vorauskasse|western\s*union|moneygram|wire\s+transfer)\b|\bpaypal\s*(freunde|friends|f&f)\b|\b(ue|ü)berweisung\s+vorab\b|\b(krypto|bitcoin)\s*zahlung\b/i,
  },
  {
    code: 'giftCards',
    pattern: /\b(gutscheincode\w*|gutscheinkarte\w*|geschenkkarte\w*|guthabenkarte\w*|paysafe\w*)\b|\bgift\s*cards?\b|\b(steam|psn)\s*codes?\b/i,
  },
  {
    code: 'tooGoodToBeTrue',
    pattern: /\b(schn(ae|ä)ppchen\w*|spottbillig)\b|\bfast\s+geschenkt\b|\bsuper\s*billig\b|\bunschlagbar\s+g(ue|ü)nstig\b|\bdirt\s*cheap\b/i,
  },
  {
    code: 'usedElectronics',
    pattern: /\b(handy\w*|smartphone\w*|iphone\w*|samsung|galaxy|pixel|laptop\w*|notebook\w*|macbook\w*|tablet\w*|ipad\w*|konsole\w*|playstation|xbox|grafikkarte\w*|gpu|fahrrad\w*|e-?bikes?|pedelec\w*)\b|\bnintendo\s*switch\b/i,
  },
  {
    code: 'offPlatform',
    pattern: /\b(whatsapp|telegram|direktkontakt)\b|\bsignal\s+nummer\b|\bprivat\s+kontaktieren\b|\bau(ss|ß)erhalb\s+der\s+plattform\b|\boff\s*platform\b/i,
  },
];

/**
 * Classify a sanitized query.
 *
 * @param {String} sanitizedQuery output of `sanitizeQuery`
 * @returns {Object} {level, reasons} where level is 'ok' | 'caution' | 'blocked' and
 *   reasons is a list of {code} entries, deduplicated and in rule order.
 */
export const assessQuery = sanitizedQuery => {
  const query = typeof sanitizedQuery === 'string' ? sanitizedQuery : '';
  if (!query) {
    return { level: RISK_OK, reasons: [] };
  }

  const collect = rules =>
    rules.reduce((codes, rule) => {
      const isMatch = rule.pattern.test(query);
      return isMatch && !codes.includes(rule.code) ? [...codes, rule.code] : codes;
    }, []);

  const blockedCodes = collect(BLOCK_RULES);
  if (blockedCodes.length > 0) {
    return { level: RISK_BLOCKED, reasons: blockedCodes.map(code => ({ code })) };
  }

  const cautionCodes = collect(CAUTION_RULES);
  return cautionCodes.length > 0
    ? { level: RISK_CAUTION, reasons: cautionCodes.map(code => ({ code })) }
    : { level: RISK_OK, reasons: [] };
};

/**
 * Safety tips to show alongside the results. The generic tips always apply; the rest are
 * derived from the caution rules that matched, so the advice fits the actual search.
 *
 * @param {Object} assessment output of `assessQuery`
 * @returns {Array<String>} tip codes, used as translation keys
 */
export const getSafetyTips = assessment => {
  const reasonCodes = (assessment?.reasons || []).map(r => r.code);
  const perReason = {
    advancePayment: ['noAdvancePayment'],
    giftCards: ['noGiftCards'],
    tooGoodToBeTrue: ['priceTooLow'],
    usedElectronics: ['checkSerialNumber'],
    offPlatform: ['stayOnPlatform'],
  };
  const specific = reasonCodes.flatMap(code => perReason[code] || []);
  const generic = ['payInPlatform', 'meetSafely'];
  return Array.from(new Set([...specific, ...generic]));
};
