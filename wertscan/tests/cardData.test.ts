/**
 * Tests der Kartenlogik ohne Netzwerk und ohne Scrydex-Key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CardCandidate,
  CardQuery,
  EXPANSION_ALIASES,
  EcbFxRateProvider,
  InMemoryCardDataProvider,
  PriceEvidence,
  StaticFxRateProvider,
  cardNumberKey,
  lookupCardMarket,
  matchCandidates,
  normalizeCardCondition,
  parseEcbDailyXml,
} from '../cardData';
import { ScrydexProvider, createScrydexProviderFromEnv } from '../cardData/scrydexProvider';

const NOW = new Date('2026-09-25T10:00:00Z');
const FETCHED = '2026-09-25T09:00:00.000Z';
const EXPIRES = '2026-09-26T09:00:00.000Z';

function card(overrides: Partial<CardCandidate>): CardCandidate {
  return {
    providerId: 'test',
    cardId: 'c1',
    game: 'pokemon',
    name: 'Charizard',
    number: '143',
    printedNumber: '143/S-P',
    expansionId: 'svp_ja',
    expansionName: 'Illustration Grand Prix Promo',
    language: 'Japanese',
    languageCode: 'ja',
    variants: [{ name: 'holofoil' }],
    ...overrides,
  };
}

/** Beleg; ein gesetzter Zustand gilt als Feld der Anbieterantwort, sofern nicht anders angegeben. */
function ev(overrides: Partial<PriceEvidence>): PriceEvidence {
  const row: PriceEvidence = {
    kind: 'sold',
    providerId: 'test',
    source: 'ebay',
    cardId: 'c1',
    variant: 'holofoil',
    title: 'Charizard 143/S-P',
    grading: null,
    condition: null,
    conditionSource: null,
    priceType: null,
    price: 100,
    currency: 'USD',
    url: 'https://example.invalid/item',
    observedAt: '2026-09-20T12:00:00.000Z',
    fetchedAt: FETCHED,
    expiresAt: EXPIRES,
    ...overrides,
  };
  if (!('conditionSource' in overrides)) row.conditionSource = row.condition ? 'provider_field' : null;
  return row;
}

const query = (overrides: Partial<CardQuery> = {}): CardQuery => ({
  game: 'pokemon',
  name: 'Charizard',
  number: '143/S P',
  setName: null,
  setId: null,
  language: 'ja',
  variant: null,
  ...overrides,
});

const fx = new StaticFxRateProvider({ USD: 0.9, JPY: 0.006 }, 'EZB-Referenzkurs (Test)', '2026-09-24');
const pca95 = { type: 'graded' as const, grading: { company: 'pca', grade: '9.5' } };
const rawNM = { type: 'raw' as const, condition: 'NM' as const };

// ---------------------------------------------------------------------------
// Identität
// ---------------------------------------------------------------------------

test('Kartennummer: Schreibweisen 143/S P, 143/S-P, 143/SP, "143/S-P Promo" sind identisch', () => {
  const keys = ['143/S P', '143/S-P', '143/SP', '143/S-P Promo', '#143/s-p'].map(value => cardNumberKey(value).full);
  assert.deepEqual(new Set(keys).size, 1);
  assert.notEqual(cardNumberKey('143/SV-P').full, cardNumberKey('143/S-P').full);
  assert.equal(cardNumberKey('085/SV-P').full, cardNumberKey('85/SV-P').full);
});

test('Japanische Promo 143/S P: exakt 143/S-P (ja) gewählt, 143/SV-P und 143/S-P (en) nicht', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [
      card({}),
      card({ cardId: 'svp', printedNumber: '143/SV-P', expansionName: 'Scarlet & Violet Promo' }),
      card({ cardId: 'en', languageCode: 'en', language: 'English' }),
    ],
    evidence: { c1: [ev({ price: 20, condition: 'NM' }), ev({ price: 22, condition: 'NM' })] },
  });
  const result = await lookupCardMarket(query({ number: '143/S P', language: 'ja' }), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'priced');
  assert.equal(result.card!.cardId, 'c1');
  assert.ok(result.debug.rejectedCandidates.some(item => item.cardId === 'svp' && item.reason === 'number_mismatch'));
  assert.notEqual(result.card!.cardId, 'en');
  const direct = matchCandidates(query({ number: '143/S P', language: 'ja' }), [card({ cardId: 'en', languageCode: 'en', language: 'English' })]);
  assert.ok(direct.rejected.some(item => item.cardId === 'en' && item.reason === 'language_mismatch'));
});

test('Gleiche Kartennummer in mehreren Sprachen oder Varianten → "nicht eindeutig", keine Auswahl, kein Preis', async () => {
  const evidence = { c1: [ev({ price: 20, condition: 'NM' }), ev({ price: 22, condition: 'NM' })] };
  const languages = new InMemoryCardDataProvider({ cards: [card({}), card({ cardId: 'c-en', languageCode: 'en', language: 'English' })], evidence });
  const byLanguage = await lookupCardMarket(query({ language: null }), rawNM, { provider: languages, fx, now: () => NOW });
  assert.equal(byLanguage.status, 'not_unique');
  assert.equal(byLanguage.debug.matchReason, 'language_unknown_multiple_candidates');
  assert.equal(byLanguage.valuation, null);
  assert.equal(byLanguage.fallbackAllowed, false);

  const variants = new InMemoryCardDataProvider({ cards: [card({ variants: [{ name: 'holofoil' }, { name: 'reverseHolofoil' }] })], evidence });
  const byVariant = await lookupCardMarket(query(), rawNM, { provider: variants, fx, now: () => NOW });
  assert.equal(byVariant.status, 'not_unique');
  assert.equal(byVariant.debug.matchReason, 'variant_unknown_multiple_variants');
  assert.equal(byVariant.valuation, null);
  assert.equal(byVariant.fallbackAllowed, false);
  assert.match(byVariant.message, /nicht eindeutig zuordenbar/);
});

test('Variante bekannt → eindeutig; nicht vorhandene Variante → nicht gefunden', () => {
  const twoVariants = card({ variants: [{ name: 'holofoil' }, { name: 'reverseHolofoil' }] });
  const reverse = matchCandidates(query({ variant: 'Reverse Holo' }), [twoVariants]);
  assert.equal(reverse.status, 'unique');
  if (reverse.status === 'unique') assert.equal(reverse.variant, 'reverseHolofoil');
  assert.equal(matchCandidates(query({ variant: '1st Edition' }), [twoVariants]).status, 'not_found');
});

test('Andere Nummer oder andere Sprache → keine Übernahme', () => {
  assert.equal(matchCandidates(query({ number: '144/S-P' }), [card({})]).status, 'not_found');
  assert.equal(matchCandidates(query({ language: 'en' }), [card({})]).status, 'not_found');
  assert.equal(matchCandidates(query({ number: null }), [card({})]).status, 'not_unique');
});

test('Setnamen: nur exakt oder über bestätigten Alias; ohne Alias → nicht eindeutig; Alias-Widerspruch → set_mismatch', () => {
  const obf = card({ expansionId: 'sv3', expansionName: 'Obsidian Flames', printedNumber: '223/197', number: '223', languageCode: 'en', name: 'Charizard ex' });
  const q = query({ number: '223/197', language: 'en', setName: 'Obsidianflammen', name: 'Glurak ex' });
  assert.equal(matchCandidates(q, [obf]).status, 'unique', 'Standard-Aliastabelle enthält Obsidianflammen');
  const noAlias = matchCandidates(q, [obf], { expansionAliases: [] });
  assert.equal(noAlias.status, 'not_unique');
  if (noAlias.status !== 'unique') assert.equal(noAlias.reason, 'set_unverifiable_no_alias');
  const paldea = { ...obf, expansionName: 'Paldea Evolved', expansionId: 'sv2' };
  const conflict = matchCandidates(q, [paldea]);
  assert.equal(conflict.status, 'not_found');
  assert.ok(conflict.rejected.some(item => item.reason === 'set_mismatch'));
  assert.ok(EXPANSION_ALIASES.every(entry => entry.confirmedBy && entry.confirmedAt), 'jeder Alias ist bestätigt');
  const sv = card({ expansionName: 'Scarlet & Violet', expansionId: 'sv1', printedNumber: '001/198', number: '1', languageCode: 'en' });
  assert.equal(matchCandidates(query({ number: '001/198', language: 'en', setName: 'Karmesin und Purpur', name: 'Pineco' }), [sv]).status, 'unique');
});

// ---------------------------------------------------------------------------
// Zustände
// ---------------------------------------------------------------------------

test('Zustände: eigene Begriffe, Mint ≠ Near Mint, keine Umdeutung', () => {
  assert.equal(normalizeCardCondition('Near Mint'), 'NM');
  assert.equal(normalizeCardCondition('NM'), 'NM');
  assert.equal(normalizeCardCondition('Mint'), 'MINT');
  assert.equal(normalizeCardCondition('Mint, graded'), 'MINT');
  assert.equal(normalizeCardCondition('Excellent'), 'EX');
  assert.equal(normalizeCardCondition('Light Played'), 'LP');
  assert.equal(normalizeCardCondition('Moderately Played'), 'MP');
  assert.equal(normalizeCardCondition('Heavily Played'), 'HP');
  assert.equal(normalizeCardCondition('Damaged'), 'DM');
  assert.equal(normalizeCardCondition('sehr gut'), null);
  assert.equal(normalizeCardCondition('played'), null);
  assert.equal(normalizeCardCondition('NM oder LP'), null);
});

test('Erkannter Zustand "Mint" bei Anbieter ohne Mint-Kategorie → kein Zustandswert, auch wenn NM-Belege existieren', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ price: 20, condition: 'NM' }), ev({ price: 22, condition: 'NM' })] },
  });
  const result = await lookupCardMarket(query(), { type: 'raw', condition: 'MINT' }, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.valuation!.headline.value, null);
  assert.match(result.message, /"Mint" wird vom Datenanbieter nicht geführt/);
  assert.equal(result.fallbackAllowed, true, 'Karte eindeutig → ergänzende Suche wäre erlaubt');
});

test('Zustand nur über Anfragefilter (nicht im Beleg) zählt nicht – außer der Filter ist ausdrücklich verifiziert', async () => {
  const evidence = { c1: [ev({ price: 20, condition: 'NM', conditionSource: 'provider_filter' }), ev({ price: 22, condition: 'NM', conditionSource: 'provider_filter' })] };
  const provider = new InMemoryCardDataProvider({ cards: [card({})], evidence });
  const strict = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  assert.equal(strict.status, 'card_identified_insufficient_evidence');
  const verified = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW, trustConditionFilter: true });
  assert.equal(verified.status, 'priced');
});

test('Raw NM: Belege ohne Zustandsangabe werden NICHT als NM gewertet', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ price: 20 }), ev({ price: 22 }), ev({ price: 25 })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.ok(result.valuation!.rawUnspecifiedValue, 'Information zu Verkäufen ohne Zustand vorhanden');
  assert.match(result.message, /Keine zuverlässige Bewertung möglich/);
});

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

test('Bisheriges Problem: Verkäufe um 20 €, Preisführer und aktives Angebot bei 76 € → Marktwert ≈ 20 €, nie 76 €', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ price: 19, currency: 'EUR', condition: 'NM' }),
        ev({ price: 20, currency: 'EUR', condition: 'NM' }),
        ev({ price: 21, currency: 'EUR', condition: 'NM' }),
        ev({ kind: 'listing', price: 76, currency: 'EUR', condition: 'NM', observedAt: null }),
        ev({ kind: 'listing', price: 76, currency: 'EUR', condition: 'NM', observedAt: null }),
        ev({ kind: 'guide', source: 'cardmarket', priceType: 'trend', price: 76, currency: 'EUR', condition: 'NM' }),
      ],
    },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  const value = result.valuation!.headline.value!;
  assert.equal(value.basis, 'sold');
  assert.equal(value.median, 20);
  assert.ok(value.high < 76 && value.low > 0);
  assert.equal(result.valuation!.priceGuides[0].price, 76, 'Preisführer bleibt separat sichtbar');
});

test('Grading: PCA 9,5 wird nicht mit PSA 9, PSA 10, BGS 9,5 oder ungegradeten Karten vermischt', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ grading: { company: 'pca', grade: '9.5' }, price: 200 }),
        ev({ grading: { company: 'pca', grade: '9.5' }, price: 220 }),
        ev({ grading: { company: 'psa', grade: '9' }, price: 400 }),
        ev({ grading: { company: 'psa', grade: '10' }, price: 900 }),
        ev({ grading: { company: 'bgs', grade: '9.5' }, price: 600 }),
        ev({ price: 95, condition: 'NM' }),
        ev({ price: 105 }),
        ev({ kind: 'guide', source: 'scrydex', priceType: 'market', grading: { company: 'pca', grade: '9.5' }, price: 5000 }),
      ],
    },
  });
  const result = await lookupCardMarket(query(), pca95, { provider, fx, now: () => NOW });
  const valuation = result.valuation!;
  assert.equal(valuation.headline.kind, 'exact_grading');
  const exact = valuation.exactValue!;
  assert.equal(exact.count, 2);
  assert.ok(exact.evidence.every(row => row.grading?.company === 'pca' && row.grading.grade === '9.5'));
  assert.equal(exact.median, 210);
  assert.equal(valuation.excluded.other_grading, 3);
  assert.ok(valuation.cardBaseValue!.evidence.every(row => row.grading === null), 'Basiswert nur ungegradet');
  assert.equal(valuation.cardBaseValue!.median, 100);
  assert.equal(valuation.priceGuides.length, 1);
});

test('Graded ohne PCA-9,5-Verkäufe → Kartenbasiswert (NM/ohne Zustand), LP und Mint ausgeschlossen, mit Pflichtsatz', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ price: 90 }),
        ev({ price: 110 }),
        ev({ price: 40, condition: 'LP' }),
        ev({ price: 300, condition: 'MINT' }),
        ev({ grading: { company: 'psa', grade: '10' }, price: 900 }),
      ],
    },
  });
  const result = await lookupCardMarket(query(), pca95, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'priced');
  assert.equal(result.valuation!.headline.kind, 'card_base');
  assert.equal(result.valuation!.headline.value!.median, 100);
  assert.equal(
    result.valuation!.headline.note,
    'Für PCA 9,5 wurden keine ausreichenden direkten Vergleichsverkäufe gefunden. Der angezeigte Wert ist der Marktwert der zugrunde liegenden Karte.'
  );
  assert.equal(result.valuation!.excluded.raw_not_nm_for_base, 2);
});

test('Nur Angebote (keine Verkäufe) → Wert aus Angeboten, klar gekennzeichnet; einzelner Verkauf nicht eingemischt', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ kind: 'listing', price: 30, condition: 'NM' }), ev({ kind: 'listing', price: 34, condition: 'NM' }), ev({ price: 20, condition: 'NM' })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  const value = result.valuation!.headline.value!;
  assert.equal(value.basis, 'listing');
  assert.equal(value.count, 2);
  assert.match(value.description, /aktive Angebote/);
});

test('Nur Preisführer → keine Bewertung, Preisführer separat sichtbar', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ kind: 'guide', source: 'scrydex', priceType: 'market', condition: 'NM', price: 76 })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'card_identified_no_market_evidence');
  assert.equal(result.valuation!.headline.value, null);
  assert.equal(result.valuation!.priceGuides.length, 1);
  assert.equal(result.valuation!.priceGuides[0].eur!.amount, 68.4);
});

test('JPY: Originalwährung bleibt; ohne Kurs keine EUR-Zahl', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ currency: 'JPY', price: 2500, condition: 'NM' }), ev({ currency: 'JPY', price: 2700, condition: 'NM' })] },
  });
  const withFx = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  const value = withFx.valuation!.headline.value!;
  assert.equal(value.currency, 'JPY');
  assert.equal(value.median, 2600);
  assert.equal(value.eur!.median, 15.6);
  assert.equal(value.eur!.rateSource, 'EZB-Referenzkurs (Test)');
  assert.ok(value.evidence.every(row => row.currency === 'JPY' && row.price >= 2500), 'Originalbelege unverändert');
  const withoutFx = await lookupCardMarket(query(), rawNM, { provider, now: () => NOW });
  assert.equal(withoutFx.valuation!.headline.value!.eur, null);
});

test('Gemischte Währungen ohne Kurs → kein Wert', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ currency: 'JPY', price: 2500, condition: 'NM' }), ev({ currency: 'USD', price: 17, condition: 'NM' })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, now: () => NOW });
  assert.equal(result.status, 'card_identified_insufficient_evidence');
});

test('Abgelaufene Belege, falsche Variante und Belege ohne Variante (bei mehreren Varianten) zählen nicht', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({ variants: [{ name: 'holofoil' }, { name: 'reverseHolofoil' }] })],
    evidence: {
      c1: [
        ev({ price: 20, condition: 'NM', expiresAt: '2026-09-24T00:00:00.000Z' }),
        ev({ price: 21, condition: 'NM', variant: 'reverseHolofoil' }),
        ev({ price: 22, condition: 'NM', variant: null }),
        ev({ price: 23, condition: 'NM' }),
      ],
    },
  });
  const result = await lookupCardMarket(query({ variant: 'Holo' }), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.deepEqual(result.valuation!.excluded.expired, 1);
  assert.deepEqual(result.valuation!.excluded.other_variant, 1);
  assert.deepEqual(result.valuation!.excluded.variant_not_stated, 1);
});

test('Fallback-Freigabe: nur bei eindeutiger Karte ohne ausreichende Preise', async () => {
  const unique = new InMemoryCardDataProvider({ cards: [card({})], evidence: { c1: [ev({ price: 20, condition: 'NM' })] } });
  assert.equal((await lookupCardMarket(query(), rawNM, { provider: unique, fx, now: () => NOW })).fallbackAllowed, true);
  const cases: [string, CardQuery][] = [
    ['Nummer widerspricht', query({ number: '144/S-P' })],
    ['Sprache widerspricht', query({ language: 'en' })],
    ['Variante widerspricht', query({ variant: 'Reverse Holo' })],
    ['Set widerspricht', query({ setName: 'Obsidianflammen' })],
    ['Set ohne Alias', query({ setName: 'Unbekanntes Set' })],
    ['Sprache nicht geführt', query({ language: 'de' })],
  ];
  for (const [label, q] of cases) {
    const result = await lookupCardMarket(q, rawNM, { provider: unique, fx, now: () => NOW });
    assert.equal(result.fallbackAllowed, false, label + ' → kein Fallback (' + result.status + ')');
  }
  const failing = new InMemoryCardDataProvider({ cards: [card({})], evidence: {}, failFind: true });
  const error = await lookupCardMarket(query(), rawNM, { provider: failing, fx, now: () => NOW });
  assert.equal(error.status, 'provider_error');
  assert.equal(error.fallbackAllowed, false);
});

// ---------------------------------------------------------------------------
// Wechselkurse (EZB)
// ---------------------------------------------------------------------------

const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube><Cube time='2026-09-24'><Cube currency='USD' rate='1.1111'/><Cube currency='JPY' rate='160.00'/></Cube></Cube></gesmes:Envelope>`;

test('EZB: Kurs 1/x mit Quelle und Stand; unbekannte Währung, Fehler oder veralteter Kurs → null', async () => {
  assert.equal(parseEcbDailyXml('kein xml'), null);
  assert.deepEqual(parseEcbDailyXml(ECB_XML)!.perEur, { USD: 1.1111, JPY: 160 });
  let calls = 0;
  const provider = new EcbFxRateProvider({
    now: () => NOW,
    fetch: async () => (calls++, { ok: true, status: 200, text: async () => ECB_XML }),
  });
  const jpy = (await provider.getRate('JPY'))!;
  assert.equal(jpy.rate, 0.00625);
  assert.equal(jpy.asOf, '2026-09-24');
  assert.match(jpy.source, /EZB-Referenzkurs \(1 EUR = 160 JPY\)/);
  assert.equal((await provider.getRate('USD'))!.rate, 0.900009);
  assert.equal(await provider.getRate('CHF'), null);
  assert.equal(calls, 1, 'Kurssatz wird zwischengespeichert');
  const failing = new EcbFxRateProvider({ now: () => NOW, fetch: async () => ({ ok: false, status: 503, text: async () => '' }) });
  assert.equal(await failing.getRate('USD'), null);
  const stale = new EcbFxRateProvider({ now: () => new Date('2026-10-10T10:00:00Z'), fetch: async () => ({ ok: true, status: 200, text: async () => ECB_XML }) });
  assert.equal(await stale.getRate('USD'), null);
});

// ---------------------------------------------------------------------------
// Scrydex-Adapter (gemocktes fetch, kein Netzwerk, kein echter Key)
// ---------------------------------------------------------------------------

type Call = { url: string; headers: Record<string, string> };

function mockFetch(routes: (url: string) => unknown, calls: Call[]) {
  return async (url: string, init: { method: string; headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return { ok: true, status: 200, json: async () => routes(url) };
  };
}

test('Scrydex-Adapter: Mapping, Header, include=prices, Preisführer vs. Verkäufe, Zustand nur aus Belegfeld', async () => {
  const calls: Call[] = [];
  const provider = new ScrydexProvider({
    apiKey: 'test-key',
    teamId: 'test-team',
    now: () => NOW,
    fetch: mockFetch(url => {
      if (url.includes('/listings')) {
        return {
          data: [
            { source: 'ebay', card_id: 'sx-1', title: 'Charizard 143/S-P PCA 9.5', variant: 'holofoil', company: 'PCA', grade: '9.5', price: 210, currency: 'USD', sold_at: '2026-09-10', url: 'https://ebay/1' },
            { source: 'ebay', card_id: 'sx-1', title: 'Charizard 143/S-P NM Near Mint', variant: 'holofoil', price: 95, currency: 'USD', sold_at: '2026-09-11', url: 'https://ebay/2' },
            { source: 'ebay', card_id: 'sx-1', title: 'Charizard 143/S-P', variant: 'holofoil', condition: 'NM', price: 99, currency: 'USD', sold_at: '2026-09-12', url: 'https://ebay/3' },
            { source: 'ebay', card_id: 'sx-1', title: 'nur Firma', variant: 'holofoil', company: 'PSA', price: 300, currency: 'USD', sold_at: '2026-09-12' },
          ],
        };
      }
      return {
        data: [
          {
            id: 'sx-1',
            name: 'Charizard',
            number: '143',
            printed_number: '143/S-P',
            expansion: { id: 'svp', name: 'Promo' },
            language: 'Japanese',
            language_code: 'ja',
            variants: [
              {
                name: 'holofoil',
                prices: [
                  { type: 'raw', condition: 'NM', low: 2400, market: 2600, currency: 'JPY' },
                  { type: 'graded', company: 'PSA', grade: '10', low: 800, mid: 900, high: 1000, market: 950, currency: 'USD' },
                ],
              },
            ],
          },
        ],
      };
    }, calls),
  });

  const candidates = await provider.findCards(query());
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].printedNumber, '143/S-P');
  assert.match(calls[0].url, /include=prices/);
  assert.equal(calls[0].headers['X-Api-Key'], 'test-key');
  assert.equal(calls[0].headers['X-Team-ID'], 'test-team');

  const evidence = (await provider.getPriceEvidence({ candidate: candidates[0], variant: 'holofoil', soldWithinDays: 90 })).evidence;
  const guides = evidence.filter(row => row.kind === 'guide');
  const sold = evidence.filter(row => row.kind === 'sold');
  assert.equal(guides.length, 6);
  assert.equal(sold.length, 3, 'unvollständiges Grading (nur Firma) wird verworfen');
  assert.deepEqual(sold[0].grading, { company: 'pca', grade: '9.5' });
  assert.equal(sold[1].condition, null, 'kein Zustand aus dem Titel ("NM Near Mint")');
  assert.equal(sold[1].conditionSource, null);
  assert.equal(sold[2].condition, 'NM');
  assert.equal(sold[2].conditionSource, 'provider_field');
  assert.equal(sold[0].observedAt, '2026-09-10');
  assert.ok(evidence.every(row => row.fetchedAt === NOW.toISOString() && row.expiresAt > row.fetchedAt));
  assert.match(calls[1].url, /\/pokemon\/v1\/cards\/sx-1\/listings\?days=90/);
  assert.ok(!calls.some(call => /condition=/.test(call.url)), 'kein Zustandsfilter in Anfragen');
});

test('Scrydex-Adapter: Zugangsdaten nur aus Server-Umgebung, nie ohne Key, nie im Browser', () => {
  assert.equal(createScrydexProviderFromEnv({}), null);
  assert.ok(createScrydexProviderFromEnv({ SCRYDEX_API_KEY: 'k', SCRYDEX_TEAM_ID: 't' }, { fetch: mockFetch(() => ({}), []) }));
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {};
  try {
    assert.throws(() => new ScrydexProvider({ apiKey: 'k', teamId: 't', fetch: mockFetch(() => ({}), []) }), /serverseitig/);
  } finally {
    delete g.window;
  }
});

test('Scrydex-Suche früh eingegrenzt: printed_number + exakter Name zuerst, breiter nur ohne exakten Treffer', async () => {
  const qOf = (call: Call) => decodeURIComponent(new URL(call.url).searchParams.get('q') || '');
  const japanese = { id: 'sx-9', name: 'リザードン', number: '143', printed_number: '143/S-P', expansion: { id: 'svp' }, language_code: 'ja', variants: [{ name: 'holofoil' }] };

  // Sprache bekannt (ja): Namensstufen finden nichts (japanischer Name), printed_number trifft → Stopp.
  const calls: Call[] = [];
  const provider = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    fetch: mockFetch(url => (/printed_number/.test(decodeURIComponent(url)) && !/name:/.test(decodeURIComponent(url)) ? { data: [japanese] } : { data: [] }), calls),
  });
  const found = await provider.findCards(query({ name: 'Charizard ex', number: '143/S-P', language: 'ja' }));
  assert.deepEqual(found.map(c => c.cardId), ['sx-9']);
  assert.deepEqual(calls.map(qOf), [
    '!name:"Charizard ex" printed_number:"143/S-P"',
    '!name:"Charizard ex" number:143',
    'name:"Charizard ex" number:143',
    'printed_number:"143/S-P"',
  ]);
  assert.ok(calls.every(call => new URL(call.url).pathname === '/pokemon/v1/cards'), 'allgemeiner Endpunkt, keine en/ja-Pfade');
  assert.ok(calls.map(qOf).every(q => !/language/.test(q)), 'Sprache nicht in q');

  // Exakter Treffer in der ersten Stufe → keine weiteren Anfragen (Sprache bekannt).
  const early: Call[] = [];
  const direct = new ScrydexProvider({ apiKey: 'k', teamId: 't', fetch: mockFetch(() => ({ data: [japanese] }), early) });
  await direct.findCards(query({ name: 'Charizard', number: '143/S-P', language: 'ja' }));
  assert.equal(early.length, 1);

  // Sprache UNBEKANNT: nach dem Treffer zusätzlich sprachunabhängig suchen (printed_number),
  // damit eine gleichnummerige Karte anderer Sprache nicht fehlt.
  const english = { ...japanese, id: 'sx-en', name: 'Charizard', language_code: 'en' };
  const both: Call[] = [];
  const unknownLanguage = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    fetch: mockFetch(url => (/name:/.test(decodeURIComponent(url)) ? { data: [english] } : { data: [english, japanese] }), both),
  });
  const candidates = await unknownLanguage.findCards(query({ name: 'Charizard', number: '143/S-P', language: null }));
  assert.deepEqual(both.map(qOf), ['!name:Charizard printed_number:"143/S-P"', 'printed_number:"143/S-P"']);
  assert.equal(candidates.length, 2);
  const result = await lookupCardMarket(query({ name: 'Charizard', number: '143/S-P', language: null }), rawNM, {
    provider: unknownLanguage,
    fx,
    now: () => NOW,
  });
  assert.equal(result.status, 'not_unique', 'Sprache unbekannt + zwei Sprachfassungen → nicht eindeutig');

  // Set-ID bekannt → Set-Endpunkt.
  const setCalls: Call[] = [];
  const scoped = new ScrydexProvider({ apiKey: 'k', teamId: 't', fetch: mockFetch(() => ({ data: [] }), setCalls) });
  await scoped.findCards(query({ setId: 'sv3', number: '223/197', name: null, language: 'en' }));
  assert.ok(setCalls.every(call => new URL(call.url).pathname === '/pokemon/v1/expansions/sv3/cards'));
  assert.deepEqual(setCalls.map(qOf), ['printed_number:"223/197"', 'number:223']);
});

test('Scrydex-Adapter: Einzelkarte nachladen, market/low/mid/high nur Preisführer, Listings nur mit sold_at, Duplikate per id', async () => {
  const calls: Call[] = [];
  const provider = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    now: () => NOW,
    fetch: mockFetch(url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/listings')) {
        return {
          data: [
            { id: 'l1', source: 'ebay', card_id: 'sx-1', title: 'A', variant: 'holofoil', price: 20, currency: 'USD', sold_at: '2026-09-01' },
            { id: 'l1', source: 'ebay', card_id: 'sx-1', title: 'A', variant: 'holofoil', price: 20, currency: 'USD', sold_at: '2026-09-01' },
            { id: 'l2', source: 'ebay', card_id: 'sx-1', title: 'ohne Verkaufsdatum', variant: 'holofoil', price: 76, currency: 'USD' },
            { id: 'l3', source: 'ebay', card_id: 'sx-1', title: 'B', variant: 'holofoil', company: 'TAG', grade: '10', price: 300, currency: 'USD', sold_at: '2026-09-02' },
          ],
        };
      }
      if (path === '/pokemon/v1/cards/sx-1') {
        return {
          data: {
            id: 'sx-1',
            variants: [
              {
                name: 'holofoil',
                prices: [
                  { type: 'raw', condition: 'NM', low: 18, market: 76, currency: 'USD', trends: {} },
                  { type: 'graded', company: 'PSA', grade: '10', low: 800, mid: 900, high: 1000, market: 950, currency: 'USD' },
                ],
              },
            ],
          },
        };
      }
      return { data: [] };
    }, calls),
  });
  const evidence = (await provider.getPriceEvidence({ candidate: card({ cardId: 'sx-1' }), variant: 'holofoil', soldWithinDays: 30 })).evidence;
  assert.equal(new URL(calls[0].url).pathname, '/pokemon/v1/cards/sx-1');
  assert.equal(new URL(calls[0].url).searchParams.get('include'), 'prices');
  const guides = evidence.filter(row => row.kind === 'guide');
  assert.deepEqual(guides.map(row => row.priceType).sort(), ['high', 'low', 'low', 'market', 'market', 'mid']);
  assert.ok(guides.every(row => /kein Einzelverkauf/.test(row.title || '')));
  const sold = evidence.filter(row => row.kind === 'sold');
  assert.deepEqual(sold.map(row => row.externalId), ['l1', 'l3'], 'ohne sold_at verworfen, Duplikat entfernt');
  assert.deepEqual(sold[1].grading, { company: 'tag', grade: '10' });
  assert.ok(!evidence.some(row => row.kind === 'listing'), 'keine erfundenen aktiven Angebote');
  assert.ok(!calls.some(call => new URL(call.url).searchParams.has('condition')), 'kein Zustandsfilter');

  // Scrydex-market (76 USD) ist Preisführer: Marktwert kommt nicht daraus.
  const result = await lookupCardMarket(query(), rawNM, {
    provider: new InMemoryCardDataProvider({ cards: [card({ cardId: 'sx-1' })], evidence: { 'sx-1': evidence } }),
    fx,
    now: () => NOW,
  });
  assert.equal(result.status, 'card_identified_insufficient_evidence', 'Verkäufe ohne Zustandsfeld ergeben keinen NM-Wert');
  assert.ok(result.valuation!.priceGuides.some(entry => entry.price === 76 && entry.priceType === 'market'));
});

test('Scrydex-Paginierung: alle Seiten laden (page/page_size, totalCount); unvollständige Suche → nicht eindeutig', async () => {
  const makeCards = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: 'p' + (from + index), name: 'Pikachu', number: '25', printed_number: '25/' + (100 + from + index), language_code: 'en', variants: [] }));
  const calls: Call[] = [];
  const paged = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    fetch: mockFetch(url => {
      const page = Number(new URL(url).searchParams.get('page'));
      return page === 1
        ? { data: makeCards(0, 100), page: 1, pageSize: 100, totalCount: 150 }
        : { data: makeCards(100, 50), page: 2, pageSize: 100, totalCount: 150 };
    }, calls),
  });
  const all = await paged.findCards(query({ name: 'Pikachu', number: '25', language: 'en' }));
  assert.equal(all.length, 150);
  assert.deepEqual(calls.map(call => new URL(call.url).searchParams.get('page')), ['1', '2']);
  assert.ok(calls.every(call => new URL(call.url).searchParams.get('page_size') === '100'));

  const capped = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    pageSize: 500, // wird auf das dokumentierte Maximum 100 begrenzt
    maxSearchPages: 1,
    fetch: mockFetch(() => ({ data: makeCards(0, 100), page: 1, pageSize: 100, totalCount: 150 }), []),
  });
  const result = await lookupCardMarket(query({ name: 'Pikachu', number: '25/102', language: 'en' }), rawNM, { provider: capped, fx, now: () => NOW });
  assert.equal(result.status, 'provider_search_incomplete');
  assert.equal(result.debug.matchReason, 'search_result_incomplete');
  assert.equal(result.fallbackAllowed, false);
});

test('Scrydex-Listings: mehrere Seiten werden zusammengeführt', async () => {
  const calls: Call[] = [];
  const provider = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    now: () => NOW,
    fetch: mockFetch(url => {
      const u = new URL(url);
      if (!u.pathname.endsWith('/listings')) return { data: { id: 'sx-1', variants: [] } };
      const page = Number(u.searchParams.get('page'));
      const rows = (offset: number, count: number) =>
        Array.from({ length: count }, (_, index) => ({ id: 'l' + (offset + index), source: 'ebay', card_id: 'sx-1', title: 'x', price: 20, currency: 'USD', sold_at: '2026-09-01' }));
      return page === 1 ? { data: rows(0, 100), page: 1, pageSize: 100, totalCount: 130 } : { data: rows(100, 30), page: 2, pageSize: 100, totalCount: 130 };
    }, calls),
  });
  const evidence = (await provider.getPriceEvidence({ candidate: card({ cardId: 'sx-1', variants: [] }), variant: null, soldWithinDays: 90 })).evidence;
  assert.equal(evidence.filter(row => row.kind === 'sold').length, 130);
  assert.deepEqual(calls.filter(call => call.url.includes('/listings')).map(call => new URL(call.url).searchParams.get('page')), ['1', '2']);
});
