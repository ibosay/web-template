import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardCandidate, CardQuery, TcgDexProvider, lookupCardMarket, matchCandidates, tcgdexLocalId } from '../cardData';

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
          match: url => url.includes('/v2/ja/cards?') && url.includes('localId=143%2FS-P'),
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
        match: url => url.includes('/v2/' + lang + '/cards?') && url.includes('localId=143%2FS-P'),
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
          match: url => url.includes('/v2/ja/cards?') && url.includes('localId=143%2FS-P'),
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

// ---------------------------------------------------------------------------
// Normaler TCGdex-Filter localId=<nummer>: breiter, liefert nur Kandidaten.
// Die exakte Nummernprüfung macht ausschließlich WertScan (matchCardNumber).
// ---------------------------------------------------------------------------

const card = (id: string, localId: string, name: string, setId: string, setName: string) => ({
  id,
  localId,
  name,
  set: { id: setId, name: setName, cardCount: { official: 200, total: 200 } },
  variants: { normal: false, holo: true, reverse: false, firstEdition: false, wPromo: false },
});

function routesFor(language: string, localIdParam: string, cards: ReturnType<typeof card>[]): Route[] {
  return [
    {
      match: url => url.includes('/v2/' + language + '/cards?') && url.endsWith('localId=' + encodeURIComponent(localIdParam)),
      body: cards.map(entry => ({ id: entry.id, localId: entry.localId, name: entry.name })),
    },
    ...cards.map(entry => ({ match: (url: string) => url.endsWith('/v2/' + language + '/cards/' + entry.id), body: entry })),
  ];
}

const en = (overrides: Partial<CardQuery>): CardQuery => ({
  game: 'pokemon',
  name: null,
  number: null,
  setName: null,
  setId: null,
  language: 'en',
  variant: null,
  ...overrides,
});

test('TCGdex localId=136 (ohne eq:) liefert auch ähnliche Nummern – akzeptiert wird nur die exakt passende', async () => {
  const calls: string[] = [];
  const provider = new TcgDexProvider({
    now: () => NOW,
    fetchFn: mockFetch(
      routesFor('en', '136', [
        card('swsh3-136', '136', 'Furret', 'swsh3', 'Darkness Ablaze'),
        card('swshp-SWSH136', 'SWSH136', 'Furret', 'swshp', 'SWSH Black Star Promos'),
        card('xx-1360', '1360', 'Furret', 'xx', 'Testset'),
      ]),
      calls
    ),
  });
  const query = en({ name: 'Furret', number: '136' });
  const candidates = await provider.findCards(query);
  assert.ok(calls[0].endsWith('/v2/en/cards?localId=136'), 'normaler Filter ohne eq:');
  assert.ok(!calls.some(url => url.includes('eq%3A') || url.includes('eq:')));
  assert.equal(candidates.length, 3, 'breitere API-Suche liefert auch ähnliche Nummern als Kandidaten');

  const match = matchCandidates(query, candidates);
  assert.equal(match.status, 'unique');
  if (match.status === 'unique') assert.equal(match.candidate.cardId, 'swsh3-136');
  assert.deepEqual(
    match.rejected.map(entry => entry.cardId + ':' + entry.reason).sort(),
    ['swshp-SWSH136:number_mismatch', 'xx-1360:number_mismatch']
  );

  const result = await lookupCardMarket(query, { type: 'raw', condition: 'NM' }, { provider, now: () => NOW });
  assert.equal(result.card?.cardId, 'swsh3-136');
  assert.equal(result.valuation?.headline.value ?? null, null, 'TCGdex liefert keinen Marktwert');
});

test('TCGdex 223/197 sucht localId=223; Nenner bzw. Set muss danach durch die WertScan-Prüfung bestätigt werden', async () => {
  const cards = [
    card('sv03-223', '223', 'Charizard ex', 'sv03', 'Obsidian Flames'),
    card('sv04-223', '223', 'Gouging Fire ex', 'sv04', 'Paradox Rift'),
  ];
  const calls: string[] = [];
  const provider = new TcgDexProvider({ now: () => NOW, fetchFn: mockFetch(routesFor('en', '223', cards), calls) });

  // Ohne Set: TCGdex-localId trägt keinen Nenner → nur Hauptnummer passt → keine Zuordnung.
  const withoutSet = en({ name: 'Charizard ex', number: '223/197' });
  const candidates = await provider.findCards(withoutSet);
  assert.ok(calls[0].endsWith('/v2/en/cards?localId=223'), '223/197 → localId=223');
  assert.equal(candidates.length, 2);
  const unconfirmed = matchCandidates(withoutSet, candidates);
  assert.notEqual(unconfirmed.status, 'unique', 'ohne bestätigtes Set keine Zuordnung');
  assert.ok(unconfirmed.rejected.every(entry => entry.reason === 'number_not_exact_without_set'));
  const noSetResult = await lookupCardMarket(withoutSet, { type: 'raw', condition: 'NM' }, { provider, now: () => NOW });
  assert.equal(noSetResult.card, null);
  assert.equal(noSetResult.fallbackAllowed, false);

  // Mit exakt passendem Setnamen: genau diese Karte.
  const withSet = en({ name: 'Charizard ex', number: '223/197', setName: 'Obsidian Flames' });
  const confirmed = matchCandidates(withSet, await provider.findCards(withSet));
  assert.equal(confirmed.status, 'unique');
  if (confirmed.status === 'unique') assert.equal(confirmed.candidate.cardId, 'sv03-223');
  // Anderes Set wird von der bestehenden Set-Prüfung abgelehnt (ohne Alias: set_unverifiable_no_alias).
  assert.ok(confirmed.rejected.some(entry => entry.cardId === 'sv04-223' && entry.reason.startsWith('set_')));
});

test('TCGdex 143/S P wird zu localId=143/S-P (normaler Filter)', async () => {
  assert.equal(tcgdexLocalId('143/S P'), '143/S-P');
  const calls: string[] = [];
  const provider = new TcgDexProvider({
    now: () => NOW,
    fetchFn: mockFetch(routesFor('ja', '143/S-P', [card('jp-promo-143', '143/S-P', 'リザードン', 'promo-ja', 'プロモ')]), calls),
  });
  const query: CardQuery = { game: 'pokemon', name: 'Charizard', number: '143/S P', setName: null, setId: null, language: 'ja', variant: null };
  const candidates = await provider.findCards(query);
  assert.ok(calls[0].endsWith('/v2/ja/cards?localId=143%2FS-P'));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].printedNumber, '143/S-P');
});
