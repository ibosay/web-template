import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardCandidate, CardQuery, TcgDexProvider, lookupCardMarket, matchCandidates, tcgdexLocalId } from '../cardData';
import { CARD_STATUS_TO_MARKET_STATUS } from '../marketPricePipeline';

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

const card = (id: string, localId: string, name: string, setId: string, setName: string, official = 200) => ({
  id,
  localId,
  name,
  set: { id: setId, name: setName, cardCount: { official, total: official } },
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

test('TCGdex 223/197 sucht localId=223; der Nenner wird über set.cardCount.official bestätigt', async () => {
  const cards = [
    card('sv03-223', '223', 'Charizard ex', 'sv03', 'Obsidian Flames', 197),
    card('sv04-223', '223', 'Gouging Fire ex', 'sv04', 'Paradox Rift', 182),
  ];
  const calls: string[] = [];
  const provider = new TcgDexProvider({ now: () => NOW, fetchFn: mockFetch(routesFor('en', '223', cards), calls) });

  const query = en({ name: 'Charizard ex', number: '223/197' });
  const candidates = await provider.findCards(query);
  assert.ok(calls[0].endsWith('/v2/en/cards?localId=223'), '223/197 → localId=223');
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(c => [c.cardId, c.printedNumber, c.setOfficialCount]), [
    ['sv03-223', null, 197],
    ['sv04-223', null, 182],
  ], 'official nur als Beleg gespeichert, keine erfundene gedruckte Nummer');

  const match = matchCandidates(query, candidates);
  assert.equal(match.status, 'unique', 'localId 223 + official 197 belegen die vollständige Nummer');
  if (match.status === 'unique') assert.equal(match.candidate.cardId, 'sv03-223');
  assert.ok(match.rejected.some(entry => entry.cardId === 'sv04-223' && entry.reason === 'number_mismatch'), 'official 182 ≠ 197 → abgelehnt');

  // Zusätzlich mit exakt passendem Setnamen: gleiches Ergebnis.
  const withSet = en({ name: 'Charizard ex', number: '223/197', setName: 'Obsidian Flames' });
  const confirmed = matchCandidates(withSet, await provider.findCards(withSet));
  assert.equal(confirmed.status, 'unique');
  if (confirmed.status === 'unique') assert.equal(confirmed.candidate.cardId, 'sv03-223');
});

test('Nennerprüfung: 223/197 mit official 197 akzeptabel, mit official 182 abgelehnt', async () => {
  const provider = (official: number) =>
    new TcgDexProvider({ now: () => NOW, fetchFn: mockFetch(routesFor('en', '223', [card('sv03-223', '223', 'Charizard ex', 'sv03', 'Obsidian Flames', official)]), []) });
  const query = en({ name: 'Charizard ex', number: '223/197' });

  const ok = matchCandidates(query, await provider(197).findCards(query));
  assert.equal(ok.status, 'unique');

  // Auch mit bestätigtem Setnamen: falscher Nenner bleibt abgelehnt.
  const wrongQuery = en({ name: 'Charizard ex', number: '223/197', setName: 'Obsidian Flames' });
  const wrong = matchCandidates(wrongQuery, await provider(182).findCards(wrongQuery));
  assert.equal(wrong.status, 'not_found');
  assert.deepEqual(wrong.rejected, [{ cardId: 'sv03-223', reason: 'number_mismatch' }]);
});

test('Nennerprüfung: "223" ohne Nenner prüft nicht gegen official', async () => {
  const provider = new TcgDexProvider({
    now: () => NOW,
    fetchFn: mockFetch(routesFor('en', '223', [card('sv03-223', '223', 'Charizard ex', 'sv03', 'Obsidian Flames', 182)]), []),
  });
  const query = en({ name: 'Charizard ex', number: '223' });
  const match = matchCandidates(query, await provider.findCards(query));
  assert.equal(match.status, 'unique', 'ohne erkannten Nenner kein Abgleich mit official');
});

test('Nennerprüfung gilt nicht für Sondernummern: 143/S-P bleibt bei der Promo-Normalisierung', async () => {
  const provider = new TcgDexProvider({
    now: () => NOW,
    fetchFn: mockFetch(routesFor('ja', '143/S-P', [card('jp-promo-143', '143/S-P', 'リザードン', 'promo-ja', 'プロモ', 200)]), []),
  });
  const query: CardQuery = { game: 'pokemon', name: 'リザードン', number: '143/S P', setName: null, setId: null, language: 'ja', variant: null };
  const candidates = await provider.findCards(query);
  assert.equal(candidates[0].printedNumber, '143/S-P');
  const match = matchCandidates({ ...query, number: '143/S-P' }, candidates);
  assert.equal(match.status, 'unique', 'official 200 spielt bei 143/S-P keine Rolle');
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

test('TCGdex localId=136 liefert viele Karten: nur passendes Set/Name/Sprache/Nummer wird akzeptiert, sonst card_not_unique', async () => {
  // Obermenge wie im echten Browser-Test: viele Karten mit localId 136 aus verschiedenen Sets.
  const many = [
    card('swsh3-136', '136', 'Furret', 'swsh3', 'Darkness Ablaze', 189),
    card('sm1-136', '136', 'Ultra Ball', 'sm1', 'Sun & Moon'),
    card('xy1-136', '136', 'Furret', 'xy1', 'XY'),
    card('sv01-136', '136', 'Lokix', 'sv01', 'Scarlet & Violet'),
    card('swsh1-136', '136', 'Dubwool V', 'swsh1', 'Sword & Shield'),
    card('dp1-136', '136', 'Wurmple', 'dp1', 'Diamond & Pearl'),
  ];
  const calls: string[] = [];
  const routes: Route[] = [
    ...routesFor('en', '136', many),
    ...routesFor('de', '136', [card('swsh3-136', '136', 'Wiesenior', 'swsh3', 'Flammende Finsternis')]),
    ...routesFor('ja', '136', [card('s3-136', '136', 'オオタチ', 's3', 'ムゲンゾーン')]),
  ];
  const provider = new TcgDexProvider({ now: () => NOW, fetchFn: mockFetch(routes, calls) });
  const nm = { type: 'raw' as const, condition: 'NM' as const };

  // 1) Set, Name, Sprache und Nummer bekannt → genau eine Karte.
  const exact = en({ name: 'Furret', number: '136/189', setName: 'Darkness Ablaze' });
  const candidates = await provider.findCards(exact);
  assert.ok(calls[0].endsWith('/v2/en/cards?localId=136'));
  assert.equal(candidates.length, many.length, 'Obermenge aus der API');
  const match = matchCandidates(exact, candidates);
  assert.equal(match.status, 'unique');
  if (match.status === 'unique') assert.equal(match.candidate.cardId, 'swsh3-136');
  assert.equal(match.rejected.length, many.length - 1, 'alle anderen Karten abgelehnt');
  const priced = await lookupCardMarket(exact, nm, { provider, now: () => NOW });
  assert.equal(priced.card?.cardId, 'swsh3-136');
  assert.equal(priced.valuation?.headline.value ?? null, null, 'TCGdex liefert nie einen Marktwert');

  // 2) Set unbekannt: zwei "Furret 136" (swsh3, xy1) bleiben übrig → card_not_unique.
  const twoLeft = await lookupCardMarket(en({ name: 'Furret', number: '136' }), nm, { provider, now: () => NOW });
  assert.equal(twoLeft.status, 'not_unique');
  assert.equal(CARD_STATUS_TO_MARKET_STATUS[twoLeft.status], 'card_not_unique');
  assert.deepEqual([...twoLeft.debug.remainingCandidates].sort(), ['swsh3-136', 'xy1-136']);
  assert.equal(twoLeft.valuation, null);
  assert.equal(twoLeft.fallbackAllowed, false);

  // 3) Sprache unbekannt: DE/EN/JA getrennt abgefragt, mehrere Sprachfassungen → card_not_unique.
  const noLanguage = await lookupCardMarket(
    { game: 'pokemon', name: 'Furret', number: '136', setName: null, setId: null, language: null, variant: null },
    nm,
    { provider, now: () => NOW }
  );
  assert.equal(CARD_STATUS_TO_MARKET_STATUS[noLanguage.status], 'card_not_unique');
  assert.equal(noLanguage.debug.matchReason, 'language_unknown_multiple_candidates');
  assert.ok(['/v2/de/', '/v2/en/', '/v2/ja/'].every(part => calls.some(url => url.includes(part))));
  assert.equal(noLanguage.valuation, null);
});
