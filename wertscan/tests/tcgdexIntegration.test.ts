/**
 * Integration: TcgDexProvider als Standard-Kartenanbieter für Pokémon in liveMarketLookup.
 * TCGdex-Antworten werden über ein ersetztes globales fetch simuliert (kein Netzwerk).
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCalls, setAi } from './setupGlobals';
import { liveMarketLookup, marketValuation } from '../marketPricePipeline';
import { buildMarketDisplay } from '../marketDisplay';

const silent = { log: () => {} };
const g = globalThis as unknown as { fetch: typeof fetch };

type Route = { match: (url: string) => boolean; body?: unknown; status?: number; fail?: boolean };

/** Ersetzt fetch für die Dauer von fn; protokolliert alle TCGdex-Aufrufe. */
async function withTcgdex<T>(routes: Route[], fn: (calls: string[]) => Promise<T>): Promise<T> {
  const original = g.fetch;
  const calls: string[] = [];
  g.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find(entry => entry.match(url));
    if (!route) return new Response('not found', { status: 404 });
    if (route.fail) throw new Error('TCGdex nicht erreichbar (simuliert)');
    return new Response(JSON.stringify(route.body ?? null), { status: route.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    g.fetch = original;
  }
}

const obsidianCharizard = {
  id: 'sv03-223',
  localId: '223',
  name: 'Charizard ex',
  set: { id: 'sv03', name: 'Obsidian Flames', cardCount: { official: 197, total: 230 } },
  variants: { normal: false, holo: true, reverse: false, firstEdition: false, wPromo: false },
  pricing: {
    cardmarket: { updated: '2026-09-24T00:00:00.000Z', unit: 'EUR', trend: 76, avg30: 74, 'trend-holo': 76 },
    tcgplayer: { updated: '2026-09-24T00:00:00.000Z', unit: 'USD', holofoil: { marketPrice: 82, lowPrice: 70 } },
  },
};

const tcgdexRoutes: Route[] = [
  { match: url => url.includes('/v2/en/cards?localId=223'), body: [{ id: 'sv03-223', localId: '223', name: 'Charizard ex' }] },
  { match: url => url.endsWith('/v2/en/cards/sv03-223'), body: obsidianCharizard },
];

const pokemon = (card: Record<string, string>, condition: string) =>
  ({
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon',
    model: '',
    title: 'Charizard ex 223/197',
    condition,
    confidence: 0.95,
    categoryConfidence: 0.95,
    cardDetails: {
      franchise: 'Pokémon',
      cardName: 'Charizard ex',
      cardNumber: '223/197',
      setName: '',
      rarity: '',
      finish: '',
      gradingCompany: '',
      grade: '',
      language: 'en',
      ...card,
    },
  }) as unknown as Analysis;

type Listing = { title: string; condition?: string; price: string };

const page = (items: Listing[]) =>
  'Navigation\n'.repeat(5) + items.map(item => [item.title, item.condition || '', item.price].filter(Boolean).join('\n')).join('\n\n');

/** Extraktion wie ein korrekt arbeitendes Modell: Titelzeile, optional Zustand, Preiszeile. */
function extractAll(content: string) {
  const items: unknown[] = [];
  const parts = content.split(/=== SECTION (\d+)[^\n]*\n/).slice(1);
  const isCondition = (line: string) => /^(Near Mint|Mint|Gebraucht)$/.test(line);
  for (let i = 0; i < parts.length; i += 2) {
    const lines = parts[i + 1].split('\n');
    lines.forEach((line, index) => {
      if (!line.trim() || /EUR$/.test(line) || line === 'Navigation' || isCondition(line)) return;
      const next = lines.slice(index + 1, index + 3);
      const priceLine = next.find(value => /EUR$/.test(value));
      if (!priceLine) return;
      items.push({
        sectionId: Number(parts[i]),
        title: line,
        priceText: priceLine,
        price: Number(priceLine.replace(/[^\d,]/g, '').replace(',', '.')),
        currency: 'EUR',
        conditionText: next.find(isCondition) || '',
        conditionGroup: 'unknown',
        grading: 'raw',
        date: '',
        relevance: 0.9,
      });
    });
  }
  return { data: { items } };
}

function marketplace(sold: Listing[], offers: Listing[] = []) {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page(sold) }
        : url.includes('ebay.de') && offers.length
          ? { status: 200, text: page(offers) }
          : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
}

test('Pokémon ohne explizites cardProvider → TCGdex ist Standard; 76 € Preisführer, echte Verkäufe um 20 € → Marktwert 20 €', async () => {
  marketplace(
    [
      { title: 'Charizard ex 223/197 Obsidian Flames', condition: 'Near Mint', price: '19,00 EUR' },
      { title: 'Charizard ex 223/197 SIR', condition: 'Near Mint', price: '21,00 EUR' },
    ],
    [{ title: 'Charizard ex 223/197 Sofortkauf', condition: 'Near Mint', price: '76,00 EUR' }]
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, async calls => {
    const market = await liveMarketLookup(analysis, silent);
    assert.ok(calls.some(url => url.includes('api.tcgdex.net/v2/en/cards?localId=223')), 'TCGdex wurde abgefragt');
    return market;
  });

  // Kartenidentität über TCGdex, exakt geprüft (localId 223 + official 197).
  assert.equal(result.cardMarket!.providerId, 'tcgdex');
  assert.equal(result.cardMarket!.card!.cardId, 'sv03-223');
  assert.equal(result.cardMarket!.status, 'card_identified_no_market_evidence', 'TCGdex liefert keine Verkäufe');
  assert.equal(result.cardMarket!.fallbackAllowed, true);
  assert.ok(aiCalls.scrape.length > 0, 'erlaubte Marktplatzsuche lief');

  // Marktwert nur aus echten Verkäufen.
  assert.equal(result.status, 'found');
  assert.equal(result.headline.price, 20);
  assert.equal(result.headline.soldCount, 2);
  assert.ok(result.soldComparables.every(row => row.price < 76));
  assert.equal(marketValuation(analysis, result)!.market, 20);

  // Cardmarket/TCGplayer über TCGdex nur als Preisführer.
  const guideSources = new Set(result.priceGuides.map(entry => entry.source));
  assert.ok(guideSources.has('Cardmarket über TCGdex'));
  assert.ok(guideSources.has('TCGplayer über TCGdex'));
  assert.ok(result.priceGuides.some(entry => entry.price === 76 && entry.currency === 'EUR'));
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.value!.eur, '20,00 €');
  assert.ok(display.soldComparables.sold.every(item => item.variant === 'sold' && item.sortValueEur < 76));
  assert.ok(display.priceGuides.items.some(item => item.price.eur === '76,00 €' && item.badge === 'Preisführer'));
});

test('TCGdex bestätigt Karte, aber keine echten Verkäufe → kein Marktwert, 76 € bleibt Preisführer', async () => {
  marketplace([]);
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.cardMarket!.card!.cardId, 'sv03-223');
  assert.equal(result.headline.kind, 'none');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.status, 'card_identified_no_market_evidence');
  assert.ok(result.priceGuides.some(entry => entry.price === 76));
  assert.equal(buildMarketDisplay(result).marketValue.state, 'no_value');
});

test('Gegradete Karte über TCGdex: Marktwert nur aus exakt gleicher Firma und Note', async () => {
  marketplace([
    { title: 'Charizard ex 223/197 PCA 9.5', price: '300,00 EUR' },
    { title: 'Charizard ex 223/197 PCA 9,5 Gem Mint', price: '320,00 EUR' },
    { title: 'Charizard ex 223/197 PSA 10', price: '900,00 EUR' },
    { title: 'Charizard ex 223/197', condition: 'Near Mint', price: '20,00 EUR' },
  ]);
  const analysis = pokemon({ gradingCompany: 'PCA', grade: '9,5' }, 'Mint, graded');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.cardMarket!.card!.cardId, 'sv03-223');
  assert.equal(result.headline.kind, 'exact_grading');
  assert.equal(result.headline.price, 310);
  assert.ok(result.debug.rejectionReasons.grading_other_company >= 1, 'PSA 10 nicht verwendet');
  assert.ok(result.debug.rejectionReasons.raw_not_used_for_graded >= 1, 'Raw nicht verwendet');
  assert.ok(result.priceGuides.every(entry => entry.price !== result.headline.price));
});

test('Sammelkarte (Marktplatz): keine Verkäufe, fünf Angebote 70–80 € → kein Marktwert, Angebote nur separat', async () => {
  marketplace(
    [],
    [70, 72, 75, 78, 80].map(price => ({ title: 'Charizard ex 223/197 Angebot ' + price, condition: 'Near Mint', price: price + ',00 EUR' }))
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.cardMarket!.card!.cardId, 'sv03-223');
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.headline.kind, 'none');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.currentOffers.length, 5, 'Angebote bleiben sichtbar');
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.soldComparables.sold.length, 0);
  assert.equal(display.soldComparables.offers.length, 5);
  assert.ok(display.priceGuides.items.some(item => item.price.eur === '76,00 €'), 'Preisführer weiter getrennt');
});

test('Sammelkarte (Marktplatz): ein Verkauf 20 € plus zehn Angebote → noch kein Marktwert', async () => {
  marketplace(
    [{ title: 'Charizard ex 223/197 Obsidian Flames', condition: 'Near Mint', price: '20,00 EUR' }],
    Array.from({ length: 10 }, (_, index) => ({ title: 'Charizard ex 223/197 Sofortkauf ' + index, condition: 'Near Mint', price: 18 + index + ',00 EUR' }))
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.soldComparables.length, 1);
  assert.equal(result.currentOffers.length, 10);
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.soldComparables.offers.length, 10);
});

test('Sammelkarte (Marktplatz): Verkauf 20 € wird nicht durch Angebote 60–75 € als Ausreißer entfernt; kein Marktwert', async () => {
  marketplace(
    [{ title: 'Charizard ex 223/197 Obsidian Flames', condition: 'Near Mint', price: '20,00 EUR' }],
    [60, 65, 70, 75].map(price => ({ title: 'Charizard ex 223/197 Angebot ' + price, condition: 'Near Mint', price: price + ',00 EUR' }))
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.soldComparables.length, 1, 'Verkauf bleibt erhalten');
  assert.equal(result.soldComparables[0].price, 20);
  assert.equal(result.debug.rejectionReasons.price_outlier || 0, 0, 'kein Beleg als Ausreißer verworfen');
  assert.equal(result.currentOffers.length, 4);
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.soldComparables.sold.length, 1);
  assert.equal(display.soldComparables.sold[0].sortValueEur, 20);
  assert.equal(display.soldComparables.offers.length, 4);
});

test('Sammelkarte (Marktplatz): Verkäufe 19 € und 21 € plus Angebote um 70 € → Marktwert 20 €, beide Verkäufe bleiben', async () => {
  marketplace(
    [
      { title: 'Charizard ex 223/197 Obsidian Flames', condition: 'Near Mint', price: '19,00 EUR' },
      { title: 'Charizard ex 223/197 SIR', condition: 'Near Mint', price: '21,00 EUR' },
    ],
    [68, 69, 70, 71, 72].map(price => ({ title: 'Charizard ex 223/197 Angebot ' + price, condition: 'Near Mint', price: price + ',00 EUR' }))
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.deepEqual(result.soldComparables.map(row => row.price).sort((a, b) => a - b), [19, 21]);
  assert.equal(result.debug.rejectionReasons.price_outlier || 0, 0);
  assert.equal(result.currentOffers.length, 5);
  assert.equal(result.status, 'found');
  assert.equal(result.headline.price, 20);
  assert.equal(result.headline.soldCount, 2);
  assert.equal(marketValuation(analysis, result)!.market, 20);
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.value!.eur, '20,00 €');
  assert.equal(display.soldComparables.sold.length, 2);
  assert.equal(display.soldComparables.offers.length, 5);
});

test('Sammelkarte (Marktplatz): Angebote 5/65/70/500 € bleiben alle sichtbar, Verkäufe 19/21 € → Marktwert 20 €', async () => {
  marketplace(
    [
      { title: 'Charizard ex 223/197 Obsidian Flames', condition: 'Near Mint', price: '19,00 EUR' },
      { title: 'Charizard ex 223/197 SIR', condition: 'Near Mint', price: '21,00 EUR' },
    ],
    [5, 65, 70, 500].map(price => ({ title: 'Charizard ex 223/197 Angebot ' + price, condition: 'Near Mint', price: price + ',00 EUR' }))
  );
  const analysis = pokemon({}, 'Near Mint');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.deepEqual(result.soldComparables.map(row => row.price).sort((a, b) => a - b), [19, 21]);
  assert.deepEqual(result.currentOffers.map(row => row.price).sort((a, b) => a - b), [5, 65, 70, 500], 'kein Angebot per Preisfilter entfernt');
  assert.equal(result.debug.rejectionReasons.price_outlier || 0, 0);
  assert.equal(result.status, 'found');
  assert.equal(result.headline.price, 20);
  assert.equal(result.headline.soldCount, 2);
  assert.equal(marketValuation(analysis, result)!.market, 20);
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.value!.eur, '20,00 €');
  assert.equal(display.soldComparables.sold.length, 2);
  assert.equal(display.soldComparables.offers.length, 4);
});

test('Sammelkarte (Marktplatz): PCA 9,5 – PCA-9,5-Angebote, PSA, Raw und Preisführer ersetzen fehlende PCA-Verkäufe nicht', async () => {
  marketplace(
    [
      { title: 'Charizard ex 223/197 PCA 9.5', price: '300,00 EUR' },
      { title: 'Charizard ex 223/197 PSA 10', price: '900,00 EUR' },
      { title: 'Charizard ex 223/197 PSA 10 Gem', price: '950,00 EUR' },
      { title: 'Charizard ex 223/197', condition: 'Near Mint', price: '20,00 EUR' },
      { title: 'Charizard ex 223/197 Obsidian', condition: 'Near Mint', price: '21,00 EUR' },
    ],
    [
      { title: 'Charizard ex 223/197 PCA 9,5 Angebot', price: '400,00 EUR' },
      { title: 'Charizard ex 223/197 PCA 9.5 Sofort', price: '410,00 EUR' },
      { title: 'Charizard ex 223/197 PCA 9.5 Top', price: '420,00 EUR' },
    ]
  );
  const analysis = pokemon({ gradingCompany: 'PCA', grade: '9,5' }, 'Mint, graded');
  const result = await withTcgdex(tcgdexRoutes, () => liveMarketLookup(analysis, silent));
  assert.equal(result.cardMarket!.card!.cardId, 'sv03-223');
  assert.equal(result.headline.price, null);
  assert.notEqual(result.headline.kind, 'exact_grading');
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.equal(buildMarketDisplay(result).marketValue.state, 'no_value');
});

test('TCGdex technisch nicht erreichbar → provider_error, kein TCGdex-Preis, kein Marktwert, keine Marktplatzsuche', async () => {
  marketplace([{ title: 'Charizard ex 223/197', condition: 'Near Mint', price: '20,00 EUR' }]);
  const analysis = pokemon({}, 'Near Mint');
  const unreachable: Route[] = [{ match: url => url.includes('api.tcgdex.net'), fail: true }];
  const result = await withTcgdex(unreachable, () => liveMarketLookup(analysis, silent));
  assert.equal(result.status, 'provider_error');
  assert.equal(result.cardMarket!.fallbackAllowed, false);
  assert.equal(result.priceGuides.length, 0, 'kein TCGdex-Preis übernommen');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(aiCalls.scrape.length, 0);

  const http503: Route[] = [{ match: url => url.includes('api.tcgdex.net'), status: 503, body: {} }];
  const result503 = await withTcgdex(http503, () => liveMarketLookup(analysis, silent));
  assert.equal(result503.status, 'provider_error');
  assert.equal(result503.priceGuides.length, 0);
});

test('Nur Pokémon nutzt TCGdex standardmäßig; andere Karten und Produkte bleiben unverändert', async () => {
  setAi(async () => ({ status: 403, text: '' }), async () => ({ data: { items: [] } }));
  const magic = pokemon({ franchise: 'Magic: The Gathering', cardName: 'Black Lotus', cardNumber: '232' }, 'Near Mint');
  const product = {
    category: 'Audio',
    objectType: 'Kopfhörer',
    brand: 'Apple',
    model: 'AirPods Pro 2',
    title: 'Apple AirPods Pro 2',
    condition: 'gebraucht',
    confidence: 0.9,
    categoryConfidence: 0.9,
  } as unknown as Analysis;
  await withTcgdex(tcgdexRoutes, async calls => {
    const magicResult = await liveMarketLookup(magic, silent);
    const productResult = await liveMarketLookup(product, silent);
    assert.equal(calls.length, 0, 'kein TCGdex-Aufruf');
    assert.equal(magicResult.cardMarket, null);
    assert.equal(productResult.cardMarket, null);
  });
});

test('cardProvider: null schaltet den Standardanbieter bewusst ab', async () => {
  marketplace([]);
  await withTcgdex(tcgdexRoutes, async calls => {
    const result = await liveMarketLookup(pokemon({}, 'Near Mint'), { ...silent, cardProvider: null });
    assert.equal(calls.length, 0);
    assert.equal(result.cardMarket, null);
  });
});
