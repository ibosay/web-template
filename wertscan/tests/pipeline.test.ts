/**
 * Tests der Marktpreis-Pipeline mit simulierten Seiten (ai.scrape / ai.extract gemockt).
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCalls, setAi } from './setupGlobals';
import { liveMarketLookup, marketValuation } from '../marketPricePipeline';
import { CardCandidate, InMemoryCardDataProvider, PriceEvidence, StaticFxRateProvider } from '../cardData';
import { buildMarketDisplay } from '../marketDisplay';
import { ScrydexProvider } from '../cardData/scrydexProvider';

// Die Tests simulieren eBay-"Verkauft"-Seiten (wie mit Login lesbar), daher ausdrücklich eingeschaltet.
const silent = { log: () => {}, ebaySoldPages: true };

type Item = { title: string; price: string; condition?: string };

/** Seite mit Listings: Titelzeile, optional Zustand, Preiszeile. */
const page = (items: Item[]) =>
  'Navigation\n'.repeat(10) + items.map(item => [item.title, item.condition || '', item.price].filter(Boolean).join('\n')).join('\n\n');

/** Extraktion wie ein korrekt arbeitendes Modell: jede Titelzeile mit folgendem Preis. */
function extractAll(content: string) {
  const out: unknown[] = [];
  const parts = content.split(/=== SECTION (\d+)[^\n]*\n/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const id = Number(parts[i]);
    const lines = parts[i + 1].split('\n');
    lines.forEach((line, index) => {
      if (/EUR$/.test(line) || line === 'Navigation' || /^(Gebraucht|Neu|Neuwertig|Near Mint|Mint)$/.test(line) || !line.trim()) return;
      const next = lines.slice(index + 1, index + 3);
      const priceLine = next.find(value => /EUR$/.test(value));
      if (!priceLine) return;
      const condition = next.find(value => /^(Gebraucht|Neu|Neuwertig|Near Mint|Mint)$/.test(value)) || '';
      out.push({
        sectionId: id,
        title: line,
        priceText: priceLine,
        price: Number(priceLine.replace(/[^\d,]/g, '').replace(',', '.')),
        currency: 'EUR',
        conditionText: condition,
        conditionGroup: 'unknown',
        grading: 'raw',
        date: '',
        relevance: 0.9,
      });
    });
  }
  return { data: { items: out } };
}

const airpods = {
  category: 'Audio',
  objectType: 'Kopfhörer',
  brand: 'Apple',
  model: 'AirPods Pro 2',
  title: 'Apple AirPods Pro 2',
  condition: 'gebraucht',
  confidence: 0.9,
  categoryConfidence: 0.9,
  universalDetails: { manufacturer: '', modelName: '', modelNumber: '', skuOrPartNumber: '', barcodeOrEan: '', productFamily: '', generation: '2. Generation', editionOrVariant: '', capacityOrStorage: '' },
} as unknown as Analysis;

test('Nicht-Karten-Produkt: unverändert über Scraping, nur Verkäufe im Wert, Zeitstempel je Beleg', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page([{ title: 'Apple AirPods Pro 2 Ladecase', condition: 'Gebraucht', price: '120,00 EUR' }, { title: 'Apple AirPods Pro 2 USB-C', condition: 'Gebraucht', price: '130,00 EUR' }]) }
        : url.includes('ebay.de')
          ? { status: 200, text: page([{ title: 'Apple AirPods Pro 2 Angebot', condition: 'Gebraucht', price: '180,00 EUR' }, { title: 'AirPods Pro 2 wie neu Box', condition: 'Gebraucht', price: '175,00 EUR' }]) }
          : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(airpods, silent);
  assert.equal(result.status, 'found');
  assert.equal(result.cardMarket, null);
  assert.equal(result.headline.kind, 'condition');
  assert.equal(result.headline.price, 125, 'Median nur aus Verkäufen, Angebote nicht eingemischt');
  assert.ok(result.soldComparables.every(row => row.fetchedAt && row.expiresAt && row.expiresAt > row.fetchedAt));
  assert.equal(marketValuation(airpods, result)!.market, 125);
});

test('Nicht-Karten-Produkt: nur Angebote → bisherige Logik bleibt, Wert aus Angeboten (klar gekennzeichnet)', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page([]) }
        : url.includes('ebay.de')
          ? { status: 200, text: page([{ title: 'Apple AirPods Pro 2 Angebot', condition: 'Gebraucht', price: '180,00 EUR' }, { title: 'Apple AirPods Pro 2 Box', condition: 'Gebraucht', price: '170,00 EUR' }]) }
          : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(airpods, silent);
  assert.equal(result.cardMarket, null);
  assert.equal(result.status, 'found');
  assert.equal(result.headline.kind, 'condition');
  assert.equal(result.headline.price, 175);
  assert.match(result.headline.basis, /Marktangebot/);
});

test('Kein Zusammenlegen von Zuständen: Zielzustand ohne Belege → kein Wert (früher "pooled")', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page([{ title: 'Apple AirPods Pro 2', condition: 'Neuwertig', price: '150,00 EUR' }, { title: 'Apple AirPods Pro 2 USB-C', condition: 'Neuwertig', price: '160,00 EUR' }]) }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(airpods, silent); // Zustand: gebraucht
  assert.equal(result.headline.kind, 'none');
  assert.equal(result.status, 'low_sample');
  assert.equal(marketValuation(airpods, result), null);
  assert.equal(result.conditionPrices.likeNew.price, 155, 'Neuwertig-Wert existiert, wird aber nicht als gebraucht ausgegeben');
});

// ---------------------------------------------------------------------------
// Sammelkarten
// ---------------------------------------------------------------------------

const charizard = (extra: Record<string, string> = {}) =>
  ({
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon',
    model: '',
    title: 'Charizard 143/S P',
    condition: 'Mint, graded',
    confidence: 0.92,
    categoryConfidence: 0.9,
    cardDetails: {
      franchise: 'Pokémon',
      cardName: 'Charizard',
      cardNumber: '143/S P',
      setName: 'Illustration Grand Prix Promo',
      rarity: 'Promo',
      finish: 'Holo',
      gradingCompany: 'PCA',
      grade: '9,5',
      ...extra,
    },
  }) as unknown as Analysis;

const rawNearMint = () => {
  const analysis = charizard({ gradingCompany: '', grade: '' });
  (analysis as unknown as { condition: string }).condition = 'Near Mint';
  return analysis;
};

const candidate = (overrides: Partial<CardCandidate> = {}): CardCandidate => ({
  providerId: 'test',
  cardId: 'c1',
  game: 'pokemon',
  name: 'Charizard',
  number: '143',
  printedNumber: '143/S-P',
  expansionId: 'svp',
  expansionName: 'Illustration Grand Prix Promo',
  language: 'Japanese',
  languageCode: 'ja',
  variants: [{ name: 'holofoil' }],
  ...overrides,
});

const sold = (price: number, overrides: Partial<PriceEvidence> = {}): PriceEvidence => ({
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
  price,
  currency: 'USD',
  url: null,
  observedAt: '2026-09-20',
  fetchedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600e3).toISOString(),
  ...overrides,
});

const fx = new StaticFxRateProvider({ USD: 0.9 }, 'EZB-Referenzkurs (Test)', '2026-09-24');

test('Karte mit Provider, PCA 9,5 ohne PCA-Verkäufe: kein Marktwert, PSA/Raw nicht verwendet, Preisführer separat', async () => {
  setAi(async () => ({ status: 403, text: '' }), async () => ({ data: { items: [] } }));
  const provider = new InMemoryCardDataProvider({
    cards: [candidate()],
    evidence: {
      c1: [
        sold(100),
        sold(120),
        sold(900, { grading: { company: 'psa', grade: '10' } }),
        sold(13000, { kind: 'guide', source: 'scrydex', priceType: 'market', currency: 'JPY', condition: 'NM', conditionSource: 'provider_field' }),
      ],
    },
  });
  const analysis = charizard({ language: 'Japanisch' });
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(result.status, 'card_identified_insufficient_evidence', 'Anbieterstatus bleibt, auch nach ergänzender Suche ohne Ergebnis');
  assert.equal(result.headline.kind, 'none');
  assert.equal(result.headline.price, null);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.soldComparables.length, 0, 'weder PSA noch Raw als Vergleichsverkauf');
  assert.equal(result.priceGuides.length, 1);
  assert.equal(result.priceGuides[0].price, 13000);
  assert.ok(aiCalls.scrape.length > 0, 'erlaubte ergänzende Suche nach PCA-9,5-Verkäufen lief');
  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.marketValue.value, null);
  assert.equal(display.priceGuides.items[0].price.original, '13.000 JPY');
});

test('Karte mit Provider, PCA 9,5 mit zwei PCA-9,5-Verkäufen: Marktwert nur daraus, EUR gekennzeichnet', async () => {
  setAi(async () => ({ status: 403, text: '' }), async () => ({ data: { items: [] } }));
  const provider = new InMemoryCardDataProvider({
    cards: [candidate()],
    evidence: {
      c1: [
        sold(200, { grading: { company: 'pca', grade: '9.5' } }),
        sold(220, { grading: { company: 'pca', grade: '9.5' } }),
        sold(100),
        sold(900, { grading: { company: 'psa', grade: '10' } }),
      ],
    },
  });
  const analysis = charizard({ language: 'Japanisch' });
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(aiCalls.scrape.length, 0, 'kein Scraping bei ausreichenden Anbieterdaten');
  assert.equal(result.status, 'found');
  assert.equal(result.headline.kind, 'exact_grading');
  assert.deepEqual(result.headline.original, { price: 210, from: 205, to: 215, currency: 'USD' });
  assert.equal(result.headline.price, 189);
  assert.match(result.headline.fxNote, /kein Marktpreis der Quelle/);
  assert.ok(result.soldComparables.every(row => row.gradingClass === 'exact'));
  assert.match(marketValuation(analysis, result)!.basis, /Umgerechneter Anzeigewert/);
});

test('Karte mit Provider, Sprache unbekannt, en+ja vorhanden → nicht eindeutig, kein Preis, kein Scraping', async () => {
  setAi(async () => ({ status: 200, text: '' }), async () => ({ data: { items: [] } }));
  const provider = new InMemoryCardDataProvider({
    cards: [candidate(), candidate({ cardId: 'c-en', languageCode: 'en', language: 'English' })],
    evidence: { c1: [sold(100), sold(120)] },
  });
  const analysis = charizard();
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(result.status, 'card_not_unique');
  assert.equal(result.headline.kind, 'none');
  assert.equal(aiCalls.scrape.length, 0);
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.debug.lossStage, 'card_provider');
});

test('Karte ohne Wechselkurs: Wert nur in Originalwährung, keine EUR-Bewertung', async () => {
  setAi(async () => ({ status: 200, text: '' }), async () => ({ data: { items: [] } }));
  const pca = { grading: { company: 'pca', grade: '9.5' } };
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: { c1: [sold(100, pca), sold(120, pca)] } });
  const analysis = charizard({ language: 'ja' });
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider });
  assert.equal(result.headline.price, null);
  assert.equal(result.headline.original!.currency, 'USD');
  assert.match(result.headline.fxNote, /Kein Wechselkurs/);
  assert.equal(marketValuation(analysis, result), null);
});

test('Deutsche Karte bei en/ja-Anbieter → kein Fallback (Identität beim Anbieter nicht bestätigt), kein Preis', async () => {
  setAi(async () => ({ status: 200, text: page([{ title: 'Glurak 143/S-P Promo Deutsch', price: '95,00 EUR' }]) }), async ({ content }) => extractAll(content));
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: {} });
  const result = await liveMarketLookup(charizard({ language: 'Deutsch' }), { ...silent, cardProvider: provider });
  assert.equal(result.status, 'unsupported_language');
  assert.equal(aiCalls.scrape.length, 0);
  assert.equal(result.headline.kind, 'none');
});

test('Karte eindeutig, Anbieter ohne ausreichende Preise → ergänzende Marktplatzsuche nur für genau diese Karte', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Charizard 143/S-P Promo Japanese', price: '95,00 EUR' },
              { title: 'Glurak 143/S-P Promo japanisch', price: '105,00 EUR' },
              { title: 'Glurak 143/S-P Promo Deutsch', price: '40,00 EUR' },
              { title: 'Charizard 143/S-P Reverse Holo', price: '300,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: { c1: [sold(100)] } });
  const result = await liveMarketLookup(charizard({ language: 'Japanisch' }), { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(result.cardMarket!.status, 'card_identified_insufficient_evidence');
  assert.equal(result.cardMarket!.fallbackAllowed, true);
  assert.ok(aiCalls.scrape.length > 0);
  assert.ok(result.debug.rejectionReasons.language_mismatch >= 1, 'deutscher Titel verworfen');
  assert.ok(result.debug.rejectionReasons.variant_mismatch >= 1, 'Reverse Holo widerspricht der bestätigten Variante');
  assert.ok(result.debug.rejectionReasons.raw_not_used_for_graded >= 1, 'ungegradete Titel zählen nicht für PCA 9,5');
  assert.equal(result.headline.kind, 'none');
  assert.equal(result.status, 'card_identified_insufficient_evidence');
  assert.match(result.message, /Ergänzende Marktplatzsuche für genau diese Karte/);
});

test('Scraping: Cardmarket ist Preisführer und fließt nicht in den Wert ein', async () => {
  setAi(
    async url =>
      url.includes('cardmarket')
        ? { status: 200, text: page([{ title: 'Charizard 143/S-P Illustration Grand Prix Promo', price: '500,00 EUR' }, { title: 'Charizard 143/S-P Promo', price: '520,00 EUR' }]) }
        : url.includes('LH_Sold')
          ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo', condition: 'Near Mint', price: '95,00 EUR' }, { title: 'Glurak 143/S-P Promo', condition: 'Near Mint', price: '105,00 EUR' }]) }
          : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(rawNearMint(), { ...silent, cardProvider: null });
  assert.equal(result.headline.kind, 'condition');
  assert.equal(result.headline.price, 100);
  assert.ok(result.priceGuides.length >= 1);
  assert.ok(result.priceGuides.every(entry => entry.price >= 500));
  assert.ok([...result.soldComparables, ...result.currentOffers].every(row => row.price < 500));
  assert.match(result.message, /Preisführer werden separat angezeigt/);
});

test('Scraping: Reverse-Holo-Titel bei unbekannter Variante wird nicht übernommen', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Charizard 143/S-P Reverse Holo', condition: 'Near Mint', price: '300,00 EUR' },
              { title: 'Charizard 143/S-P', condition: 'Near Mint', price: '95,00 EUR' },
              { title: 'Charizard 143/S-P Promo', condition: 'Near Mint', price: '105,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(rawNearMint(), { ...silent, cardProvider: null });
  assert.ok(result.debug.rejectionReasons.variant_unverified >= 1);
  assert.equal(result.headline.price, 100);
});

test('Bisheriges Problem (Scraping): Verkäufe um 20 €, Angebote und Cardmarket bei 76 € → Marktwert 20 €', async () => {
  setAi(
    async url =>
      url.includes('cardmarket')
        ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo', condition: 'Near Mint', price: '76,00 EUR' }]) }
        : url.includes('LH_Sold')
          ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo', condition: 'Near Mint', price: '19,00 EUR' }, { title: 'Glurak 143/S-P Promo', condition: 'Near Mint', price: '21,00 EUR' }]) }
          : url.includes('ebay.de')
            ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo Angebot', condition: 'Near Mint', price: '76,00 EUR' }, { title: 'Glurak 143/S-P Promo Sofort', condition: 'Near Mint', price: '76,00 EUR' }]) }
            : { status: 403, text: '' },
    async ({ content }) => extractAll(content).data.items.length ? extractAll(content) : { data: { items: [] } }
  );
  const raw = charizard({ gradingCompany: '', grade: '' });
  (raw as unknown as { condition: string }).condition = 'Near Mint';
  const result = await liveMarketLookup(raw, { ...silent, cardProvider: null });
  assert.equal(result.status, 'found');
  assert.equal(result.headline.price, 20);
  assert.notEqual(marketValuation(raw, result)!.market, 76);
  assert.ok(result.priceGuides.some(entry => entry.price === 76), 'Cardmarket bleibt als Preisführer sichtbar');
});

test('Raw-Karte "Mint" per Scraping: Near-Mint-Verkäufe werden nicht als Mint gewertet → kein Wert', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo', condition: 'Near Mint', price: '19,00 EUR' }, { title: 'Glurak 143/S-P Promo', condition: 'Near Mint', price: '21,00 EUR' }]) }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const raw = charizard({ gradingCompany: '', grade: '' });
  (raw as unknown as { condition: string }).condition = 'Mint';
  const result = await liveMarketLookup(raw, { ...silent, cardProvider: null });
  assert.equal(result.headline.kind, 'none');
  assert.ok(result.debug.rejectionReasons.card_condition_mismatch >= 2);
});

test('Anzeige: drei getrennte Bereiche; Preisführer nie als Verkauf, Marktwert ohne Belege = "keine Bewertung"', async () => {
  setAi(async () => ({ status: 200, text: '' }), async () => ({ data: { items: [] } }));
  const provider = new InMemoryCardDataProvider({
    cards: [candidate()],
    evidence: {
      c1: [
        sold(100, { grading: { company: 'pca', grade: '9.5' } }),
        sold(120, { grading: { company: 'pca', grade: '9.5' } }),
        sold(5000, { kind: 'guide', source: 'scrydex', priceType: 'market', grading: { company: 'pca', grade: '9.5' } }),
      ],
    },
  });
  const market = await liveMarketLookup(charizard({ language: 'ja' }), { ...silent, cardProvider: provider, fxRateProvider: fx });
  const display = buildMarketDisplay(market);
  assert.equal(display.marketValue.state, 'value');
  assert.equal(display.marketValue.value!.original, '110,00 USD');
  assert.match(display.marketValue.value!.fxNote!, /kein Marktpreis der Quelle/);
  assert.equal(display.soldComparables.sold.length, 2);
  assert.ok(display.soldComparables.sold.every(item => item.variant === 'sold' && item.badge === 'Verkauft'));
  assert.equal(display.priceGuides.items.length, 1);
  assert.ok(display.priceGuides.items.every(item => item.variant === 'guide' && item.badge === 'Preisführer'));
  assert.ok(!display.soldComparables.sold.some(item => item.price.original === '5.000,00 USD'), 'Preisführer nicht unter Verkäufen');

  const empty = buildMarketDisplay(await liveMarketLookup(charizard(), { ...silent, cardProvider: new InMemoryCardDataProvider({ cards: [candidate(), candidate({ cardId: 'x', languageCode: 'en' })], evidence: {} }) }));
  assert.equal(empty.marketValue.state, 'no_value');
  assert.equal(empty.marketValue.value, null);
  assert.match(empty.marketValue.noValueReason!, /nicht eindeutig zuordenbar/);
});

test('Scrydex: zweite Karte gleicher Nummer nur über breitere Suche sichtbar → card_not_unique, kein Marktwert, kein Fallback', async () => {
  setAi(async () => ({ status: 200, text: page([{ title: 'Charizard 4/102 Base', condition: 'Near Mint', price: '300,00 EUR' }]) }), async ({ content }) => extractAll(content));
  const cardA = { id: 'base1-4', name: 'Charizard', number: '4', printed_number: '4/102', expansion: { id: 'base1', name: 'Base' }, language_code: 'en', variants: [{ name: 'holofoil' }] };
  const cardB = { ...cardA, id: 'base1-4-shadowless', name: 'Charizard (Shadowless)' };
  const provider = new ScrydexProvider({
    apiKey: 'k',
    teamId: 't',
    fetch: async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
      const body = new URL(url).pathname.endsWith('/listings') ? { data: [] } : q.includes('!name') ? { data: [cardA] } : { data: [cardA, cardB] };
      return { ok: true, status: 200, json: async () => body };
    },
  });
  const analysis = charizard({ cardName: 'Charizard', cardNumber: '4/102', setName: 'Base', language: 'en', gradingCompany: '', grade: '' });
  (analysis as unknown as { condition: string }).condition = 'Near Mint';
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(result.status, 'card_not_unique');
  assert.equal(result.headline.kind, 'none');
  assert.equal(marketValuation(analysis, result), null);
  assert.equal(result.cardMarket!.fallbackAllowed, false);
  assert.equal(aiCalls.scrape.length, 0, 'kein Marktplatz-Fallback');
  assert.equal(buildMarketDisplay(result).marketValue.state, 'no_value');
});
