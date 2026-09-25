import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardCandidate, TcgDexProvider, lookupCardMarket, tcgdexLocalId } from '../cardData';

const NOW = new Date('2026-09-25T10:00:00.000Z');

type Route = { match: (url: string) => boolean; body: unknown; status?: number };

function mockFetch(routes: Route[], calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find(entry => entry.match(url));
    if (!route) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const baseCard = (languageName: string, name: string) => ({
  id: 'jp-promo-143',
  localId: '143/S-P',
  name,
  set: {
    id: 'promo-ja',
    name: languageName,
    cardCount: { official: 200, total: 200 },
  },
  variants: {
    firstEdition: false,
    holo: true,
    normal: false,
    reverse: false,
    wPromo: false,
  },
});

test('TCGdex normalisiert reguläre Nenner und Promo-Suffixe ohne Bedeutungsänderung', () => {
  assert.equal(tcgdexLocalId('223/197'), '223');
  assert.equal(tcgdexLocalId('143/S P'), '143/S-P');
  assert.equal(tcgdexLocalId('# 143 / S-P'), '143/S-P');
});

test('TCGdex nutzt bei bekannter japanischer Sprache nur den ja-Endpunkt', async () => {
  const calls: string[] = [];
  const provider = new TcgDexProvider({
    fetchFn: mockFetch(
      [
        {
          match: url => url.includes('/v2/ja/cards?') && url.includes('localId=eq%3A143%2FS-P'),
          body: [{ id: 'jp-promo-143', localId: '143/S-P', name: 'リザードン' }],
        },
        {
          match: url => url.endsWith('/v2/ja/cards/jp-promo-143'),
          body: baseCard('イラストグランプリ', 'リザードン'),
        },
      ],
      calls
    ),
  });

  const cards = await provider.findCards({
    game: 'pokemon',
    name: 'リザードン',
    number: '143/S P',
    setName: null,
    setId: null,
    language: 'ja',
    variant: null,
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].languageCode, 'ja');
  assert.equal(cards[0].printedNumber, '143/S-P');
  assert.deepEqual(cards[0].variants, [{ name: 'holofoil' }]);
  assert.ok(calls.every(url => !url.includes('/v2/en/') && !url.includes('/v2/de/')));
});

test('TCGdex prüft bei unbekannter Sprache standardmäßig DE, EN und JA getrennt', async () => {
  const calls: string[] = [];
  const routes: Route[] = [];
  for (const [lang, name, setName] of [
    ['de', 'Glurak', 'Promo Satz'],
    ['en', 'Charizard', 'Promo Set'],
    ['ja', 'リザードン', 'プロモ'],
  ]) {
    routes.push(
      {
        match: url => url.includes('/v2/' + lang + '/cards?') && url.includes('localId=eq%3A143%2FS-P'),
        body: [{ id: 'jp-promo-143', localId: '143/S-P', name }],
      },
      {
        match: url => url.endsWith('/v2/' + lang + '/cards/jp-promo-143'),
        body: baseCard(setName, name),
      }
    );
  }

  const provider = new TcgDexProvider({ fetchFn: mockFetch(routes, calls) });
  const cards = await provider.findCards({
    game: 'pokemon',
    name: 'Charizard',
    number: '143/S-P',
    setName: null,
    setId: null,
    language: null,
    variant: null,
  });

  assert.equal(cards.length, 3);
  assert.deepEqual(new Set(cards.map(card => card.languageCode)), new Set(['de', 'en', 'ja']));
  assert.ok(calls.some(url => url.includes('/v2/de/')));
  assert.ok(calls.some(url => url.includes('/v2/en/')));
  assert.ok(calls.some(url => url.includes('/v2/ja/')));
});

test('TCGdex Preise werden ausschließlich als Preisführer ausgegeben', async () => {
  const calls: string[] = [];
  const cardDetail = {
    id: 'sv-test-1',
    localId: '1',
    name: 'Testmon',
    set: { id: 'sv-test', name: 'Test Set', cardCount: { official: 100, total: 120 } },
    variants: { normal: true, holo: true, reverse: true, firstEdition: false, wPromo: false },
    pricing: {
      cardmarket: {
        updated: '2026-09-24T00:00:00.000Z',
        unit: 'EUR',
        trend: 20,
        avg7: 19,
        'trend-holo': 31,
      },
      tcgplayer: {
        updated: '2026-09-24T12:00:00.000Z',
        unit: 'USD',
        normal: { marketPrice: 22, lowPrice: 18 },
        holofoil: { marketPrice: 33 },
      },
    },
  };

  const provider = new TcgDexProvider({
    fetchFn: mockFetch(
      [{ match: url => url.endsWith('/v2/en/cards/sv-test-1'), body: cardDetail }],
      calls
    ),
    now: () => NOW,
  });

  const candidate: CardCandidate = {
    providerId: 'tcgdex',
    cardId: 'sv-test-1',
    game: 'pokemon',
    name: 'Testmon',
    number: '1',
    printedNumber: null,
    expansionId: 'sv-test',
    expansionName: 'Test Set',
    language: 'en',
    languageCode: 'en',
    variants: [{ name: 'normal' }, { name: 'holofoil' }, { name: 'reverseHolofoil' }],
  };

  const result = await provider.getPriceEvidence({ candidate, variant: 'normal', soldWithinDays: 90 });

  assert.ok(result.evidence.length >= 4);
  assert.ok(result.evidence.every(row => row.kind === 'guide'));
  assert.equal(result.salesLoaded, 0);
  assert.equal(result.salesTotal, 0);
  assert.ok(result.evidence.some(row => row.source.includes('Cardmarket') && row.priceType === 'cardmarket_trend' && row.price === 20));
  assert.ok(result.evidence.some(row => row.source.includes('TCGplayer') && row.priceType === 'tcgplayer_marketPrice' && row.price === 22));
});

test('TCGdex identifiziert Karten kostenlos, fehlende echte Verkäufe erlauben danach nur den bestehenden Fallback', async () => {
  const calls: string[] = [];
  const detail = {
    ...baseCard('Promo Set', 'Charizard'),
    pricing: {
      cardmarket: { updated: '2026-09-24T00:00:00.000Z', unit: 'EUR', trend: 76 },
    },
  };
  const provider = new TcgDexProvider({
    fetchFn: mockFetch(
      [
        {
          match: url => url.includes('/v2/ja/cards?') && url.includes('localId=eq%3A143%2FS-P'),
          body: [{ id: 'jp-promo-143', localId: '143/S-P', name: 'Charizard' }],
        },
        { match: url => url.endsWith('/v2/ja/cards/jp-promo-143'), body: detail },
      ],
      calls
    ),
    now: () => NOW,
  });

  const result = await lookupCardMarket(
    {
      game: 'pokemon',
      name: 'Charizard',
      number: '143/S-P',
      setName: 'Promo Set',
      setId: null,
      language: 'ja',
      variant: 'holofoil',
    },
    { type: 'graded', grading: { company: 'pca', grade: '9.5' } },
    { provider, now: () => NOW }
  );

  assert.equal(result.status, 'card_identified_no_market_evidence');
  assert.equal(result.fallbackAllowed, true);
  assert.equal(result.valuation?.headline.kind, 'none');
  assert.ok(result.valuation?.priceGuides.some(guide => guide.price === 76));
  assert.ok(result.valuation?.priceGuides.every(guide => guide.matchesTarget === false));
});
