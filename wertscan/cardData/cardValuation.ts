/**
 * Bewertung aus Preisbelegen (PriceEvidence) einer bereits exakt bestätigten Karte.
 *
 * Feste Regeln:
 *  - Verkäufe (sold) haben Vorrang vor aktiven Angeboten (listing). Beide werden nie gemischt.
 *  - Preisführer (guide) fließen NIE in einen Wert ein, sie werden separat ausgewiesen.
 *  - Raw und Graded strikt getrennt; Graded nur bei exakt gleicher Firma UND Note.
 *  - Zustandswerte nur aus Belegen, deren Zustand die Quelle geliefert hat – keine Ableitung,
 *    keine Prozentabschläge, kein Zusammenlegen verschiedener Zustände.
 *  - Mindestens MIN_EVIDENCE Belege, sonst kein Wert.
 *  - Originalwährung bleibt erhalten; EUR ist nur ein gekennzeichneter Anzeigewert.
 */
import { formatGrading, normalizeRawCondition, sameGrading, variantKey } from './cardIdentity';
import { EurConversion, FxRate, FxRateProvider, Grading, PriceEvidence, PriceGuideEntry, RawCondition } from './types';

export const MIN_EVIDENCE = 2;

export type ValueSummary = {
  basis: 'sold' | 'listing';
  /** Währung der Kennzahlen: Originalwährung, oder 'EUR' wenn gemischte Währungen umgerechnet wurden. */
  currency: string;
  median: number;
  low: number;
  high: number;
  count: number;
  /** true = Kennzahlen stammen aus in EUR umgerechneten Belegen verschiedener Währungen. */
  convertedFromMixedCurrencies: boolean;
  /** EUR-Anzeigewert, falls Kurs vorhanden (bei 'EUR' oder gemischten Währungen identisch mit den Kennzahlen). */
  eur: { median: number; low: number; high: number; rate: number | null; rateSource: string; rateAsOf: string; note: string } | null;
  description: string;
  oldestObservedAt: string | null;
  newestObservedAt: string | null;
  /** Frühester Ablauf aller verwendeten Belege. */
  expiresAt: string;
  evidence: PriceEvidence[];
};

export type CardSegment = { type: 'raw'; condition: RawCondition | null } | { type: 'graded'; grading: Grading };

export type CardHeadline = {
  kind: 'exact_grading' | 'raw_condition' | 'card_base' | 'none';
  value: ValueSummary | null;
  note: string;
};

export type CardValuation = {
  headline: CardHeadline;
  /** Graded: exakt gleiche Firma+Note. Raw: exakt der Zustand des Exemplars. */
  exactValue: ValueSummary | null;
  /** Nur bei Graded: ungegradete Verkäufe derselben Karte/Variante (NM oder Zustand nicht angegeben). */
  cardBaseValue: ValueSummary | null;
  /** Raw-Verkäufe ohne Zustandsangabe der Quelle – nur zur Information, nie als Zustandspreis. */
  rawUnspecifiedValue: ValueSummary | null;
  priceGuides: PriceGuideEntry[];
  excluded: Record<string, number>;
  message: string;
};

const round = (value: number, currency: string) =>
  currency === 'JPY' ? Math.round(value) : Math.round(value * 100) / 100;

function quantile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + (position - base) * (next - sorted[base]) : sorted[base];
}

/** IQR-Filter erst ab 4 Werten (entfernt Ausreißer, erzeugt keine Werte). */
function withoutOutliers(values: number[]) {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return values.filter(value => value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr);
}

export type FxCache = Map<string, FxRate | null>;

async function rateFor(currency: string, fx: FxRateProvider | undefined, cache: FxCache): Promise<FxRate | null> {
  if (currency === 'EUR') return { from: 'EUR', to: 'EUR', rate: 1, source: 'identisch', asOf: '' };
  if (!fx) return null;
  if (!cache.has(currency)) {
    try {
      cache.set(currency, await fx.getRate(currency));
    } catch {
      cache.set(currency, null);
    }
  }
  return cache.get(currency) || null;
}

const conversionNote = (rate: FxRate) =>
  'Umgerechneter Anzeigewert, kein Marktpreis der Quelle. Kurs ' + rate.from + '→EUR ' + rate.rate + ' (' + rate.source + ', Stand ' + rate.asOf + ').';

export async function toEur(amount: number, currency: string, fx: FxRateProvider | undefined, cache: FxCache): Promise<EurConversion | null> {
  if (currency === 'EUR') return null; // bereits EUR: keine Umrechnung nötig
  const rate = await rateFor(currency, fx, cache);
  if (!rate) return null;
  return { amount: round(amount * rate.rate, 'EUR'), rate: rate.rate, rateSource: rate.source, rateAsOf: rate.asOf, note: conversionNote(rate) };
}

async function summarize(
  rows: PriceEvidence[],
  basis: 'sold' | 'listing',
  description: string,
  fx: FxRateProvider | undefined,
  cache: FxCache
): Promise<{ value: ValueSummary | null; reason: string | null }> {
  if (rows.length < MIN_EVIDENCE) return { value: null, reason: rows.length ? 'too_few_' + basis : null };

  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  let currency = currencies[0];
  let amounts: number[];
  let mixed = false;
  if (currencies.length === 1) {
    amounts = rows.map(row => row.price);
  } else {
    const rates = await Promise.all(currencies.map(code => rateFor(code, fx, cache)));
    if (rates.some(rate => !rate)) return { value: null, reason: 'mixed_currency_without_fx' };
    const byCode = new Map(currencies.map((code, index) => [code, rates[index] as FxRate]));
    amounts = rows.map(row => row.price * (byCode.get(row.currency) as FxRate).rate);
    currency = 'EUR';
    mixed = true;
  }

  const clean = withoutOutliers(amounts);
  if (clean.length < MIN_EVIDENCE) return { value: null, reason: 'too_few_after_outliers' };
  const sorted = [...clean].sort((a, b) => a - b);
  const median = round(quantile(sorted, 0.5), currency);
  const low = round(quantile(sorted, 0.25), currency);
  const high = round(quantile(sorted, 0.75), currency);

  let eur: ValueSummary['eur'] = null;
  if (currency === 'EUR') {
    eur = {
      median, low, high, rate: null, rateSource: mixed ? 'mehrere Kurse' : 'identisch', rateAsOf: '',
      note: mixed ? 'Belege in verschiedenen Währungen, einzeln mit Tageskurs in EUR umgerechnet – kein Marktpreis der Quelle.' : '',
    };
  } else {
    const rate = await rateFor(currency, fx, cache);
    if (rate) {
      eur = {
        median: round(median * rate.rate, 'EUR'),
        low: round(low * rate.rate, 'EUR'),
        high: round(high * rate.rate, 'EUR'),
        rate: rate.rate,
        rateSource: rate.source,
        rateAsOf: rate.asOf,
        note: conversionNote(rate),
      };
    }
  }

  const observed = rows.map(row => row.observedAt).filter((value): value is string => Boolean(value)).sort();
  return {
    value: {
      basis,
      currency,
      median,
      low,
      high,
      count: rows.length,
      convertedFromMixedCurrencies: mixed,
      eur,
      description,
      oldestObservedAt: observed[0] || null,
      newestObservedAt: observed[observed.length - 1] || null,
      expiresAt: rows.map(row => row.expiresAt).sort()[0],
      evidence: rows,
    },
    reason: null,
  };
}

/** Verkäufe bevorzugt; nur wenn es keine ausreichenden Verkäufe gibt, aktive Angebote (nie gemischt). */
async function soldFirst(rows: PriceEvidence[], label: string, fx: FxRateProvider | undefined, cache: FxCache, excluded: Record<string, number>) {
  const sold = await summarize(rows.filter(row => row.kind === 'sold'), 'sold', 'Median aus ' + label + ' (tatsächlich verkauft)', fx, cache);
  if (sold.value) return sold.value;
  if (sold.reason) excluded[sold.reason + ':' + label] = (excluded[sold.reason + ':' + label] || 0) + 1;
  const listing = await summarize(rows.filter(row => row.kind === 'listing'), 'listing', 'Median aus ' + label + ' (aktive Angebote, keine ausreichenden Verkäufe)', fx, cache);
  if (listing.reason) excluded[listing.reason + ':' + label] = (excluded[listing.reason + ':' + label] || 0) + 1;
  return listing.value;
}

export type ValuationInput = {
  evidence: PriceEvidence[];
  /** Bestätigte Variante oder null, wenn die Karte keine Varianten führt. */
  variant: string | null;
  /** Führt die Karte mehrere Varianten? Dann zählen nur Belege mit exakt passender Variantenangabe. */
  cardHasMultipleVariants: boolean;
  segment: CardSegment;
  now: Date;
  fx?: FxRateProvider;
};

export async function valueCard(input: ValuationInput): Promise<CardValuation> {
  const excluded: Record<string, number> = {};
  const count = (reason: string) => (excluded[reason] = (excluded[reason] || 0) + 1);
  const cache: FxCache = new Map();
  const nowIso = input.now.toISOString();
  const wantedVariant = variantKey(input.variant);

  // 1) Grundfilter: gültig, nicht abgelaufen, richtige Variante
  const usable = input.evidence.filter(row => {
    if (!Number.isFinite(row.price) || row.price <= 0) return count('invalid_price'), false;
    if (!row.currency) return count('missing_currency'), false;
    if (row.expiresAt <= nowIso) return count('expired'), false;
    const rowVariant = variantKey(row.variant);
    if (rowVariant && wantedVariant && rowVariant !== wantedVariant) return count('other_variant'), false;
    if (!rowVariant && input.cardHasMultipleVariants) return count('variant_not_stated'), false;
    return true;
  });

  // 2) Preisführer separat – nie Teil eines Werts
  const segment = input.segment;
  const guideRows = usable.filter(row => row.kind === 'guide');
  const priceGuides: PriceGuideEntry[] = [];
  for (const row of guideRows) {
    const isGraded = Boolean(row.grading);
    const matchesTarget =
      segment.type === 'graded'
        ? sameGrading(row.grading, segment.grading)
        : !isGraded && Boolean(segment.condition) && normalizeRawCondition(row.condition) === segment.condition;
    priceGuides.push({
      providerId: row.providerId,
      source: row.source,
      label: (isGraded && row.grading ? formatGrading(row.grading) : 'Raw' + (row.condition ? ' ' + row.condition : '')) + (row.priceType ? ' ' + row.priceType : ''),
      segment: isGraded ? 'graded' : 'raw',
      condition: row.condition,
      grading: row.grading,
      priceType: row.priceType,
      price: row.price,
      currency: row.currency,
      eur: await toEur(row.price, row.currency, input.fx, cache),
      matchesTarget,
      url: row.url,
      observedAt: row.observedAt,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
    });
  }

  const market = usable.filter(row => row.kind !== 'guide');
  const raw = market.filter(row => !row.grading);
  const rawUnspecifiedRows = raw.filter(row => !normalizeRawCondition(row.condition));

  let exactValue: ValueSummary | null = null;
  let cardBaseValue: ValueSummary | null = null;
  let headline: CardHeadline = { kind: 'none', value: null, note: '' };
  let message = '';

  if (segment.type === 'graded') {
    const label = formatGrading(segment.grading);
    const exactRows = market.filter(row => sameGrading(row.grading, segment.grading));
    market.filter(row => row.grading && !sameGrading(row.grading, segment.grading)).forEach(() => count('other_grading'));
    exactValue = await soldFirst(exactRows, label + '-Belegen', input.fx, cache, excluded);

    // Kartenbasiswert: nur NM oder "Zustand nicht angegeben"; bekannte schlechtere Zustände ausgeschlossen.
    const baseRows = raw.filter(row => {
      const condition = normalizeRawCondition(row.condition);
      if (condition && condition !== 'NM') return count('raw_not_nm_for_base'), false;
      return true;
    });
    const nmOnly = baseRows.filter(row => normalizeRawCondition(row.condition) === 'NM');
    cardBaseValue =
      (await soldFirst(nmOnly, 'ungegradeten NM-Belegen derselben Karte', input.fx, cache, excluded)) ||
      (await soldFirst(baseRows, 'ungegradeten Belegen derselben Karte (Zustand teils nicht angegeben)', input.fx, cache, excluded));

    if (exactValue) {
      headline = { kind: 'exact_grading', value: exactValue, note: 'Direkter Vergleich: nur ' + label + '-Belege derselben Karte und Variante.' };
    } else if (cardBaseValue) {
      headline = {
        kind: 'card_base',
        value: cardBaseValue,
        note: 'Für ' + label + ' wurden keine ausreichenden direkten Vergleichsverkäufe gefunden. Der angezeigte Wert ist der Marktwert der zugrunde liegenden Karte.',
      };
    } else {
      message = 'Keine zuverlässige Bewertung möglich: weder für ' + label + ' noch für die ungegradete Karte liegen mindestens ' + MIN_EVIDENCE + ' passende Marktbelege vor.';
    }
  } else {
    market.filter(row => row.grading).forEach(() => count('graded_vs_raw'));
    if (!segment.condition) {
      message = 'Keine zuverlässige Bewertung möglich: Der Zustand ist keiner Marktkategorie (NM, LP, MP, HP, DM) eindeutig zugeordnet. Zustandspreise werden nicht abgeleitet.';
    } else {
      const conditionRows = raw.filter(row => normalizeRawCondition(row.condition) === segment.condition);
      raw.filter(row => {
        const condition = normalizeRawCondition(row.condition);
        return condition && condition !== segment.condition;
      }).forEach(() => count('other_condition'));
      exactValue = await soldFirst(conditionRows, 'Raw-' + segment.condition + '-Belegen', input.fx, cache, excluded);
      if (exactValue) {
        headline = { kind: 'raw_condition', value: exactValue, note: 'Nur Belege im Zustand ' + segment.condition + ' (Zustand von der Quelle angegeben).' };
      } else {
        message = 'Keine zuverlässige Bewertung möglich: Für den Zustand ' + segment.condition + ' liegen nicht mindestens ' + MIN_EVIDENCE + ' Marktbelege mit Zustandsangabe vor.';
      }
    }
  }

  const rawUnspecifiedValue = await soldFirst(rawUnspecifiedRows, 'Raw-Belegen ohne Zustandsangabe', input.fx, cache, excluded);
  if (headline.kind !== 'none') message = headline.note;
  if (priceGuides.length) message += ' Preisführer werden separat angezeigt und sind nicht Teil des Marktwerts.';

  return { headline, exactValue, cardBaseValue, rawUnspecifiedValue, priceGuides, excluded, message: message.trim() };
}
