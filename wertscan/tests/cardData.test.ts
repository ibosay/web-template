/**
 * Tests der Kartenlogik ohne Netzwerk und ohne Scrydex-Key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CardCandidate,
  CardQuery,
  InMemoryCardDataProvider,
  PriceEvidence,
  StaticFxRateProvider,
  cardNumberKey,
  lookupCardMarket,
  matchCandidates,
  normalizeRawCondition,
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

function ev(overrides: Partial<PriceEvidence>): PriceEvidence {
  return {
    kind: 'sold',
    providerId: 'test',
    source: 'ebay',
    cardId: 'c1',
    variant: 'holofoil',
    title: 'Charizard 143/S-P',
    grading: null,
    condition: null,
    priceType: null,
    price: 100,
    currency: 'USD',
    url: 'https://example.invalid/item',
    observedAt: '2026-09-20T12:00:00.000Z',
    fetchedAt: FETCHED,
    expiresAt: EXPIRES,
    ...overrides,
  };
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

test('Eindeutiger Treffer bei exakter Nummer, Sprache und einziger Variante', () => {
  const result = matchCandidates(query(), [card({}), card({ cardId: 'c2', printedNumber: '144/S-P', number: '144' })]);
  assert.equal(result.status, 'unique');
  if (result.status === 'unique') {
    assert.equal(result.candidate.cardId, 'c1');
    assert.equal(result.variant, 'holofoil');
  }
});

test('Sprache unbekannt und Karte in en + ja vorhanden → nicht eindeutig, keine Auswahl', () => {
  const result = matchCandidates(query({ language: null }), [card({}), card({ cardId: 'c-en', languageCode: 'en', language: 'English' })]);
  assert.equal(result.status, 'not_unique');
  if (result.status !== 'unique') assert.equal(result.reason, 'language_unknown_multiple_candidates');
});

test('Variante unbekannt bei mehreren Varianten → nicht eindeutig; bekannte Variante → eindeutig', () => {
  const twoVariants = card({ variants: [{ name: 'holofoil' }, { name: 'reverseHolofoil' }] });
  const unknown = matchCandidates(query(), [twoVariants]);
  assert.equal(unknown.status, 'not_unique');
  if (unknown.status !== 'unique') assert.equal(unknown.reason, 'variant_unknown_multiple_variants');
  const reverse = matchCandidates(query({ variant: 'Reverse Holo' }), [twoVariants]);
  assert.equal(reverse.status, 'unique');
  if (reverse.status === 'unique') assert.equal(reverse.variant, 'reverseHolofoil');
  const missing = matchCandidates(query({ variant: '1st Edition' }), [twoVariants]);
  assert.equal(missing.status, 'not_found');
});

test('Andere Nummer, andere Sprache oder anderes Set → keine Übernahme', () => {
  assert.equal(matchCandidates(query({ number: '144/S-P' }), [card({})]).status, 'not_found');
  assert.equal(matchCandidates(query({ language: 'en' }), [card({})]).status, 'not_found');
  assert.equal(matchCandidates(query({ setName: 'Obsidian Flames' }), [card({})]).status, 'not_found');
  assert.equal(matchCandidates(query({ number: null }), [card({})]).status, 'not_unique');
});

test('Setname nur über exakten Namen oder explizite Alias-Tabelle', () => {
  const obf = card({ expansionId: 'sv3', expansionName: 'Obsidian Flames', printedNumber: '223/197', number: '223', languageCode: 'en', name: 'Charizard ex' });
  const q = query({ number: '223/197', language: 'en', setName: 'Obsidianflammen', name: 'Glurak ex' });
  assert.equal(matchCandidates(q, [obf]).status, 'not_found');
  assert.equal(matchCandidates(q, [obf], { expansionAliases: { Obsidianflammen: 'sv3' } }).status, 'unique');
});

test('Zustand wird nur bei festen Bezeichnungen erkannt, nie umgedeutet', () => {
  assert.equal(normalizeRawCondition('Near Mint'), 'NM');
  assert.equal(normalizeRawCondition('NM'), 'NM');
  assert.equal(normalizeRawCondition('Lightly Played'), 'LP');
  assert.equal(normalizeRawCondition('Mint'), null);
  assert.equal(normalizeRawCondition('sehr gut'), null);
  assert.equal(normalizeRawCondition('played'), null);
  assert.equal(normalizeRawCondition('NM oder LP'), null);
});

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

test('Graded PCA 9,5: nur exakte Firma+Note; PSA/CGC/andere Note zählen nicht; Preisführer getrennt', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ grading: { company: 'pca', grade: '9.5' }, price: 200 }),
        ev({ grading: { company: 'pca', grade: '9.5' }, price: 220 }),
        ev({ grading: { company: 'psa', grade: '10' }, price: 900 }),
        ev({ grading: { company: 'cgc', grade: '9.5' }, price: 400 }),
        ev({ grading: { company: 'pca', grade: '10' }, price: 500 }),
        ev({ kind: 'guide', source: 'scrydex', priceType: 'market', grading: { company: 'pca', grade: '9.5' }, price: 5000 }),
      ],
    },
  });
  const result = await lookupCardMarket(query(), pca95, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'priced');
  const value = result.valuation!.headline.value!;
  assert.equal(result.valuation!.headline.kind, 'exact_grading');
  assert.equal(value.count, 2);
  assert.equal(value.median, 210);
  assert.equal(value.currency, 'USD');
  assert.equal(value.eur!.median, 189);
  assert.match(value.eur!.note, /kein Marktpreis der Quelle/);
  assert.equal(result.valuation!.excluded.other_grading, 3);
  assert.equal(result.valuation!.priceGuides.length, 1);
  assert.equal(result.valuation!.priceGuides[0].matchesTarget, true);
});

test('Graded ohne PCA-9,5-Verkäufe → Kartenbasiswert (NM/ohne Zustand), LP ausgeschlossen, mit Pflichtsatz', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ price: 90 }),
        ev({ price: 110 }),
        ev({ price: 40, condition: 'LP' }),
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
  assert.equal(result.valuation!.excluded.raw_not_nm_for_base, 1);
});

test('Raw NM: Belege ohne Zustandsangabe werden NICHT als NM gewertet', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ price: 20 }), ev({ price: 22 }), ev({ price: 25 })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.valuation!.headline.kind, 'none');
  assert.ok(result.valuation!.rawUnspecifiedValue, 'Information zu Verkäufen ohne Zustand vorhanden');
  assert.match(result.message, /Keine zuverlässige Bewertung möglich/);
});

test('Raw NM mit Zustandsangabe der Quelle → Wert nur aus NM; Verkäufe vor Angeboten, nie gemischt', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: {
      c1: [
        ev({ price: 20, condition: 'NM' }),
        ev({ price: 24, condition: 'NM' }),
        ev({ price: 60, condition: 'NM', kind: 'listing', observedAt: null }),
        ev({ price: 8, condition: 'DM' }),
      ],
    },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  const value = result.valuation!.headline.value!;
  assert.equal(value.basis, 'sold');
  assert.equal(value.count, 2);
  assert.equal(value.median, 22);
  assert.equal(result.valuation!.excluded.other_condition, 1);
});

test('Nur Angebote (keine Verkäufe) → Wert aus Angeboten, klar als solcher gekennzeichnet', async () => {
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
  assert.equal(result.status, 'insufficient_data');
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
  const withoutFx = await lookupCardMarket(query(), rawNM, { provider, now: () => NOW });
  assert.equal(withoutFx.valuation!.headline.value!.eur, null);
});

test('Gemischte Währungen ohne Kurs → kein Wert', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [card({})],
    evidence: { c1: [ev({ currency: 'JPY', price: 2500, condition: 'NM' }), ev({ currency: 'USD', price: 17, condition: 'NM' })] },
  });
  const result = await lookupCardMarket(query(), rawNM, { provider, now: () => NOW });
  assert.equal(result.status, 'insufficient_data');
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
  assert.equal(result.status, 'insufficient_data');
  assert.deepEqual(result.valuation!.excluded.expired, 1);
  assert.deepEqual(result.valuation!.excluded.other_variant, 1);
  assert.deepEqual(result.valuation!.excluded.variant_not_stated, 1);
});

test('Deutsche Karte bei Anbieter mit en/ja → unsupported_language, keine Suche', async () => {
  const provider = new InMemoryCardDataProvider({ cards: [card({})], evidence: {} });
  const result = await lookupCardMarket(query({ language: 'de' }), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'unsupported_language');
  assert.equal(provider.calls.findCards.length, 0);
});

test('Anbieterfehler → provider_error, kein Preis', async () => {
  const provider = new InMemoryCardDataProvider({ cards: [card({})], evidence: {}, failFind: true });
  const result = await lookupCardMarket(query(), rawNM, { provider, fx, now: () => NOW });
  assert.equal(result.status, 'provider_error');
  assert.equal(result.valuation, null);
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

test('Scrydex-Adapter: Mapping, Header, include=prices, Preisführer vs. Verkäufe, kein erfundener Zustand', async () => {
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
            { source: 'ebay', card_id: 'sx-1', title: 'Charizard 143/S-P', variant: 'holofoil', price: 95, currency: 'USD', sold_at: '2026-09-11', url: 'https://ebay/2' },
            { source: 'ebay', card_id: 'sx-1', title: 'Charizard 143/S-P NM', variant: 'holofoil', condition: 'NM', price: 99, currency: 'USD', sold_at: '2026-09-12', url: 'https://ebay/3' },
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
  assert.equal(candidates[0].languageCode, 'ja');
  assert.match(calls[0].url, /\/pokemon\/v1\/cards\?/);
  assert.match(calls[0].url, /include=prices/);
  assert.equal(calls[0].headers['X-Api-Key'], 'test-key');
  assert.equal(calls[0].headers['X-Team-ID'], 'test-team');

  const evidence = await provider.getPriceEvidence({ candidate: candidates[0], variant: 'holofoil', soldWithinDays: 90 });
  const guides = evidence.filter(row => row.kind === 'guide');
  const sold = evidence.filter(row => row.kind === 'sold');
  assert.equal(guides.length, 6); // raw market+low, graded market+low+mid+high
  assert.ok(guides.every(row => row.fetchedAt === NOW.toISOString() && row.expiresAt > row.fetchedAt));
  assert.equal(sold.length, 3, 'unvollständiges Grading (nur Firma) wird verworfen');
  assert.deepEqual(sold[0].grading, { company: 'pca', grade: '9.5' });
  assert.equal(sold[1].grading, null);
  assert.equal(sold[1].condition, null, 'kein Zustand ohne Angabe der Quelle');
  assert.equal(sold[2].condition, 'NM');
  assert.equal(sold[0].observedAt, '2026-09-10');
  assert.match(calls[1].url, /\/pokemon\/v1\/cards\/sx-1\/listings\?days=90/);

  const end2end = await lookupCardMarket(query(), pca95, { provider, fx, now: () => NOW });
  assert.equal(end2end.status, 'priced');
  assert.equal(end2end.valuation!.headline.kind, 'card_base', 'nur 1 PCA-9,5-Verkauf → Basiswert');
});

test('Scrydex-Adapter: Zugangsdaten nur aus Server-Umgebung, nie ohne Key', () => {
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
