/**
 * Tests der Marktpreis-Pipeline mit simulierten Seiten (ai.scrape / ai.extract gemockt).
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCalls, setAi } from './setupGlobals';
import { liveMarketLookup, marketValuation } from '../marketPricePipeline';
import { CardCandidate, InMemoryCardDataProvider, PriceEvidence, StaticFxRateProvider } from '../cardData';

const silent = { log: () => {} };

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
      if (/EUR$/.test(line) || line === 'Navigation' || /^(Gebraucht|Neu|Neuwertig)$/.test(line) || !line.trim()) return;
      const next = lines.slice(index + 1, index + 3);
      const priceLine = next.find(value => /EUR$/.test(value));
      if (!priceLine) return;
      const condition = next.find(value => /^(Gebraucht|Neu|Neuwertig)$/.test(value)) || '';
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

test('Karte mit Provider: kein Scraping, Basiswert mit Pflichtsatz, EUR als gekennzeichneter Anzeigewert', async () => {
  setAi(async () => ({ status: 200, text: '' }), async () => ({ data: { items: [] } }));
  const provider = new InMemoryCardDataProvider({
    cards: [candidate()],
    evidence: {
      c1: [
        sold(100),
        sold(120),
        sold(900, { grading: { company: 'psa', grade: '10' } }),
        sold(5000, { kind: 'guide', source: 'scrydex', priceType: 'market', grading: { company: 'pca', grade: '9.5' } }),
      ],
    },
  });
  const analysis = charizard({ language: 'Japanisch' });
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider, fxRateProvider: fx });
  assert.equal(aiCalls.scrape.length, 0, 'kein Scraping bei Provider-Treffer');
  assert.equal(result.status, 'found');
  assert.equal(result.headline.kind, 'card_base');
  assert.deepEqual(result.headline.original, { price: 110, from: 105, to: 115, currency: 'USD' });
  assert.equal(result.headline.price, 99);
  assert.match(result.headline.fxNote, /kein Marktpreis der Quelle/);
  assert.match(result.message, /Für PCA 9,5 wurden keine ausreichenden direkten Vergleichsverkäufe gefunden/);
  assert.equal(result.priceGuides.length, 1);
  assert.ok(result.soldComparables.every(row => row.rawCardBase && row.originalCurrency === 'USD' && row.eurConversion));
  const valuation = marketValuation(analysis, result)!;
  assert.equal(valuation.market, 99);
  assert.match(valuation.basis, /Umgerechneter Anzeigewert/);
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
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: { c1: [sold(100), sold(120)] } });
  const analysis = charizard({ language: 'ja' });
  const result = await liveMarketLookup(analysis, { ...silent, cardProvider: provider });
  assert.equal(result.headline.price, null);
  assert.equal(result.headline.original!.currency, 'USD');
  assert.match(result.headline.fxNote, /Kein Wechselkurs/);
  assert.equal(marketValuation(analysis, result), null);
});

test('Deutsche Karte bei en/ja-Anbieter → Rückfall auf Scraping mit Sprachprüfung der Titel', async () => {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Glurak 143/S-P Promo Deutsch', price: '95,00 EUR' },
              { title: 'Glurak 143/S-P Promo deutsch NM', price: '105,00 EUR' },
              { title: 'Charizard 143/S-P Japanese', price: '60,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const provider = new InMemoryCardDataProvider({ cards: [candidate()], evidence: {} });
  const result = await liveMarketLookup(charizard({ language: 'Deutsch' }), { ...silent, cardProvider: provider });
  assert.ok(aiCalls.scrape.length > 0);
  assert.equal(result.cardMarket!.status, 'unsupported_language');
  assert.ok(result.debug.rejectionReasons.language_mismatch >= 1, 'japanischer Titel verworfen');
  assert.equal(result.headline.kind, 'card_base');
  assert.equal(result.headline.price, 100);
});

test('Scraping: Cardmarket ist Preisführer und fließt nicht in den Wert ein', async () => {
  setAi(
    async url =>
      url.includes('cardmarket')
        ? { status: 200, text: page([{ title: 'Charizard 143/S-P Illustration Grand Prix Promo', price: '500,00 EUR' }, { title: 'Charizard 143/S-P Promo', price: '520,00 EUR' }]) }
        : url.includes('LH_Sold')
          ? { status: 200, text: page([{ title: 'Charizard 143/S-P Promo', price: '95,00 EUR' }, { title: 'Glurak 143/S-P Promo', price: '105,00 EUR' }]) }
          : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(charizard(), silent);
  assert.equal(result.headline.kind, 'card_base');
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
        ? { status: 200, text: page([{ title: 'Charizard 143/S-P Reverse Holo', price: '300,00 EUR' }, { title: 'Charizard 143/S-P', price: '95,00 EUR' }, { title: 'Charizard 143/S-P Promo', price: '105,00 EUR' }]) }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );
  const result = await liveMarketLookup(charizard(), silent);
  assert.ok(result.debug.rejectionReasons.variant_unverified >= 1);
  assert.equal(result.headline.price, 100);
});
