/**
 * Referenzfälle für den Anzeigevertrag (buildMarketDisplay). Die Ausgaben stehen in
 * docs/display-examples.json und in der README. Neu erzeugen:
 *   WRITE_DISPLAY_EXAMPLES=1 bash wertscan/run-tests.sh
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAi } from './setupGlobals';
import { liveMarketLookup, MarketData } from '../marketPricePipeline';
import { MarketDisplay, buildMarketDisplay } from '../marketDisplay';
import { CardCandidate, InMemoryCardDataProvider, PriceEvidence, StaticFxRateProvider } from '../cardData';

const silent = { log: () => {} };
const fx = new StaticFxRateProvider({ USD: 0.9, JPY: 0.006 }, 'EZB-Referenzkurs', '2026-09-24');

const candidate = (overrides: Partial<CardCandidate> = {}): CardCandidate => ({
  providerId: 'scrydex',
  cardId: 'base1-4',
  game: 'pokemon',
  name: 'Charizard',
  number: '4',
  printedNumber: '4/102',
  expansionId: 'base1',
  expansionName: 'Base',
  language: 'English',
  languageCode: 'en',
  variants: [{ name: 'holofoil' }],
  ...overrides,
});

const ev = (price: number, overrides: Partial<PriceEvidence> = {}): PriceEvidence => ({
  kind: 'sold',
  providerId: 'scrydex',
  source: 'ebay',
  cardId: 'base1-4',
  variant: 'holofoil',
  title: 'Charizard 4/102 Base Set',
  grading: null,
  condition: null,
  conditionSource: null,
  priceType: null,
  price,
  currency: 'USD',
  url: 'https://www.ebay.com/itm/example',
  observedAt: '2026-09-20',
  fetchedAt: '2026-09-25T09:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  ...overrides,
});
const nm = { condition: 'NM' as const, conditionSource: 'provider_field' as const };

const analysis = (card: Record<string, string>, condition: string) =>
  ({
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon',
    model: '',
    title: card.cardName + ' ' + card.cardNumber,
    condition,
    confidence: 0.95,
    categoryConfidence: 0.95,
    cardDetails: { franchise: 'Pokémon', rarity: '', finish: '', gradingCompany: '', grade: '', setName: '', ...card },
  }) as unknown as Analysis;

async function display(provider: InMemoryCardDataProvider, input: Analysis, extra: Record<string, unknown> = {}) {
  setAi(async () => ({ status: 403, text: '' }), async () => ({ data: { items: [] } }));
  return buildMarketDisplay(await liveMarketLookup(input, { ...silent, cardProvider: provider, fxRateProvider: fx, cardScrapeFallback: false, ...extra }));
}

const examples: Record<string, MarketDisplay> = {};

test('Beispiel 1: normale Karte mit echten Verkäufen', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [candidate()],
    evidence: { 'base1-4': [ev(310, nm), ev(330, nm), ev(350, nm), ev(900, { kind: 'guide', source: 'scrydex', priceType: 'market', ...nm })] },
  });
  const result = await display(provider, analysis({ cardName: 'Charizard', cardNumber: '4/102', language: 'en' }, 'Near Mint'));
  examples['1_normale_karte_mit_verkaeufen'] = result;
  assert.equal(result.marketValue.state, 'value');
  assert.equal(result.marketValue.value!.original, '330,00 USD');
  assert.equal(result.soldComparables.sold.length, 3);
  assert.equal(result.priceGuides.items.length, 1);
});

test('Beispiel 2: eindeutige Karte ohne genügend Verkäufe', async () => {
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: { 'base1-4': [ev(320, nm)] } });
  const result = await display(provider, analysis({ cardName: 'Charizard', cardNumber: '4/102', language: 'en' }, 'Near Mint'));
  examples['2_eindeutige_karte_zu_wenige_verkaeufe'] = result;
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.statusCategory, 'insufficient');
  assert.equal(result.marketValue.state, 'no_value');
  assert.equal(result.soldComparables.sold.length, 1, 'der eine echte Verkauf bleibt sichtbar, ohne Marktwert');
});

test('Beispiel 3: nicht eindeutige Karte', async () => {
  const provider = new InMemoryCardDataProvider({
    cards: [candidate(), candidate({ cardId: 'base1-4-ja', languageCode: 'ja', language: 'Japanese', name: 'リザードン' })],
    evidence: {},
  });
  const result = await display(provider, analysis({ cardName: 'Charizard', cardNumber: '4/102' }, 'Near Mint'));
  examples['3_nicht_eindeutige_karte'] = result;
  assert.equal(result.status, 'card_not_unique');
  assert.equal(result.statusCategory, 'ambiguous');
  assert.equal(result.marketValue.value, null);
});

test('Beispiel 4: gegradete PCA-Karte ohne passende PCA-Verkäufe (PSA 10 und Raw vorhanden)', async () => {
  const promo = candidate({ cardId: 'svp-143', name: 'Charizard', number: '143', printedNumber: '143/S-P', expansionId: 'svp', expansionName: 'Promo', languageCode: 'ja', language: 'Japanese' });
  const provider = new InMemoryCardDataProvider({
    cards: [promo],
    evidence: {
      'svp-143': [
        ev(12000, { cardId: 'svp-143', currency: 'JPY', title: 'リザードン 143/S-P' }),
        ev(14000, { cardId: 'svp-143', currency: 'JPY', title: 'リザードン 143/S-P' }),
        ev(900, { cardId: 'svp-143', grading: { company: 'psa', grade: '10' }, title: 'Charizard 143/S-P PSA 10' }),
        ev(950, { cardId: 'svp-143', grading: { company: 'psa', grade: '10' }, title: 'Charizard 143/S-P PSA 10' }),
        ev(13000, { cardId: 'svp-143', kind: 'guide', source: 'scrydex', priceType: 'market', currency: 'JPY', title: null, ...nm }),
      ],
    },
  });
  const result = await display(provider, analysis({ cardName: 'Charizard', cardNumber: '143/S P', language: 'ja', gradingCompany: 'PCA', grade: '9,5' }, 'Mint, graded'));
  examples['4_pca_ohne_pca_verkaeufe'] = result;
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.marketValue.state, 'no_value');
  assert.equal(result.marketValue.value, null);
  assert.match(result.marketValue.noValueReason!, /Für PCA 9,5 liegen nicht mindestens 2 passende Marktbelege vor/);
  assert.equal(result.soldComparables.sold.length, 0, 'weder PSA 10 noch Raw erscheinen als Vergleich');
  assert.equal(result.priceGuides.items.length, 1);
  assert.equal(result.priceGuides.items[0].price.original, '13.000 JPY');
});

test('Beispiel 5: echte Verkäufe um 20 € plus Preisführer 76 €', async () => {
  const eur = { currency: 'EUR', ...nm };
  const provider = new InMemoryCardDataProvider({
    cards: [candidate({ cardId: 'sv3-223', number: '223', printedNumber: '223/197', expansionId: 'sv3', expansionName: 'Obsidian Flames', name: 'Charizard ex' })],
    evidence: {
      'sv3-223': [
        ev(19, { cardId: 'sv3-223', title: 'Glurak ex 223/197', ...eur }),
        ev(20, { cardId: 'sv3-223', title: 'Charizard ex 223/197', ...eur }),
        ev(21, { cardId: 'sv3-223', title: 'Charizard ex 223/197 SIR', ...eur }),
        ev(76, { cardId: 'sv3-223', kind: 'guide', source: 'cardmarket', priceType: 'trend', title: null, ...eur }),
      ],
    },
  });
  const result = await display(provider, analysis({ cardName: 'Charizard ex', cardNumber: '223/197', language: 'en', setName: 'Obsidianflammen' }, 'Near Mint'));
  examples['5_verkaeufe_20_eur_preisfuehrer_76_eur'] = result;
  assert.equal(result.marketValue.value!.eur, '20,00 €');
  assert.ok(result.soldComparables.sold.every(item => item.sortValueEur < 76));
  assert.equal(result.priceGuides.items[0].price.eur, '76,00 €');
  assert.equal(result.priceGuides.items[0].badge, 'Preisführer');

  const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
  if (g.process?.env.WRITE_DISPLAY_EXAMPLES) {
    const fs = require('fs');
    const path = require('path');
    const target = path.join(g.process.env.WERTSCAN_DIR || '.', 'docs', 'display-examples.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(examples, null, 2) + '\n');
  }
});

test('Status: unvollständige Anbietersuche und Karte ohne Marktbelege sind eigene Status', async () => {
  const incomplete = await display(new InMemoryCardDataProvider({ cards: [], evidence: {}, incompleteSearch: true }), analysis({ cardName: 'Pikachu', cardNumber: '25' }, 'Near Mint'));
  assert.equal(incomplete.status, 'provider_search_incomplete');
  assert.equal(incomplete.statusCategory, 'incomplete');
  assert.equal(incomplete.marketValue.state, 'no_value');

  const failing = await display(new InMemoryCardDataProvider({ cards: [], evidence: {}, failFind: true }), analysis({ cardName: 'Pikachu', cardNumber: '25' }, 'Near Mint'));
  assert.equal(failing.statusCategory, 'technical_error');

  const noEvidence = await display(
    new InMemoryCardDataProvider({ cards: [candidate()], evidence: { 'base1-4': [ev(900, { kind: 'guide', source: 'scrydex', priceType: 'market', ...nm })] } }),
    analysis({ cardName: 'Charizard', cardNumber: '4/102', language: 'en' }, 'Near Mint')
  );
  assert.equal(noEvidence.status, 'card_identified_no_market_evidence');
  assert.equal(noEvidence.statusCategory, 'insufficient');
  assert.equal(noEvidence.priceGuides.items.length, 1, 'Preisführer trotzdem sichtbar');
});

test('Karte ohne Marktbelege beim Anbieter → erlaubter Marktplatz-Fallback greift', async () => {
  setAi(async () => ({ status: 403, text: '' }), async () => ({ data: { items: [] } }));
  const market = await liveMarketLookup(analysis({ cardName: 'Charizard', cardNumber: '4/102', language: 'en' }, 'Near Mint'), {
    ...silent,
    cardProvider: new InMemoryCardDataProvider({ cards: [candidate()], evidence: {} }),
  });
  assert.equal(market.cardMarket!.status, 'card_identified_no_market_evidence');
  assert.equal(market.cardMarket!.fallbackAllowed, true);
  assert.ok(market.debug.pagesRequested.length > 0, 'Marktplatzsuche wurde ausgeführt');
});

test('Teilweise geladene Verkäufe → Wert mit Kennzeichnung "eingeschränkte Datenbasis"', async () => {
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: { 'base1-4': [ev(310, nm), ev(330, nm), ev(350, nm)] }, salesTotal: 2500 });
  const result = await display(provider, analysis({ cardName: 'Charizard', cardNumber: '4/102', language: 'en' }, 'Near Mint'));
  assert.equal(result.marketValue.state, 'value');
  assert.equal(result.marketValue.limitedData, true);
  assert.match(result.message, /Eingeschränkte Datenbasis: nur 3 von 2500 Verkäufen/);
});


test('Vergleichsobjekt zeigt Vergleichsbereich statt exaktem Marktwert und reicht Foto Guidance weiter', () => {
  const market = {
    status: 'found',
    message: 'Drei vergleichbare Verkäufe gefunden.',
    headline: {
      kind: 'condition',
      price: 50,
      from: 45,
      to: 55,
      referencePrice: null,
      soldCount: 3,
      offerCount: 1,
      sampleCount: 4,
      basis: '3 vergleichbare Verkäufe',
      note: '',
      original: null,
      fxNote: '',
      limitedData: false,
    },
    soldComparables: [
      { source: 'eBay verkauft', title: 'Aristo Vintage Walzgolddouble 20 Mikron', price: 45, currency: 'EUR', condition: 'Gebraucht', date: '', type: 'sold', url: '', relevance: 0.9 },
      { source: 'eBay verkauft', title: 'Aristo rechteckige Vintage Uhr 20 Mikron', price: 50, currency: 'EUR', condition: 'Gebraucht', date: '', type: 'sold', url: '', relevance: 0.9 },
      { source: 'eBay verkauft', title: 'Aristo Walzgolddouble Vintage Armbanduhr', price: 55, currency: 'EUR', condition: 'Gebraucht', date: '', type: 'sold', url: '', relevance: 0.9 },
    ],
    currentOffers: [],
    priceGuides: [],
    objectMatch: {
      mode: 'comparable_object',
      quality: 'strong_comparable',
      score: 0.74,
      label: 'Sehr gut vergleichbar',
      marketValueAllowed: false,
      comparisonRangeAllowed: true,
      minimumComparableCount: 3,
      requiredSearchTerms: ['Aristo', 'Walzgolddouble 20 Mikron'],
      missingExactFields: ['modelNumber'],
      explanation: ['Exakte Modellreferenz unbekannt.'],
    },
    scanGuidance: {
      category: 'watches',
      identityMode: 'comparable_object',
      canSearchNow: true,
      canShowExactMarketValue: false,
      missingExactFields: ['modelNumber'],
      recognitionIssues: [],
      nextViews: [
        {
          id: 'side',
          title: 'Seite und Krone',
          reason: 'Kann die Modellfamilie weiter eingrenzen.',
          targetFields: ['shape', 'marking', 'model'],
          priority: 2,
        },
      ],
      message: 'Vergleichssuche ist möglich, aber für einen exakten Marktwert fehlt noch eine sichere Produktidentität.',
    },
    connected: true,
    query: 'Aristo Walzgolddouble 20 Mikron',
    searchedQueries: ['Aristo Walzgolddouble 20 Mikron'],
    sourcesChecked: ['eBay verkauft'],
    soldMedian: 50,
    offerMedian: null,
    conditionPrices: {
      new: { price: null, from: null, to: null, soldCount: 0, offerCount: 0, sampleCount: 0, basis: '', status: 'none', referencePrice: null },
      likeNew: { price: null, from: null, to: null, soldCount: 0, offerCount: 0, sampleCount: 0, basis: '', status: 'none', referencePrice: null },
      used: { price: 50, from: 45, to: 55, soldCount: 3, offerCount: 0, sampleCount: 3, basis: '3 Verkäufe', status: 'ok', referencePrice: null },
      defective: { price: null, from: null, to: null, soldCount: 0, offerCount: 0, sampleCount: 0, basis: '', status: 'none', referencePrice: null },
    },
    searchedAt: '2026-09-25T12:00:00.000Z',
    cardBaseValue: null,
    exactGradingValue: null,
    cardMarket: null,
    debug: {} as never,
    diagnostics: {} as never,
  } as unknown as MarketData;

  const result = buildMarketDisplay(market);
  assert.equal(result.marketValue.state, 'no_value');
  assert.equal(result.comparisonRange.state, 'range');
  assert.equal(result.comparisonRange.label, 'Sehr gut vergleichbar');
  assert.equal(result.comparisonRange.from?.eur, '45,00 €');
  assert.equal(result.comparisonRange.to?.eur, '55,00 €');
  assert.equal(result.scanGuidance?.nextViews[0]?.id, 'side');
  assert.equal(result.statusCategory, 'comparable');
});
