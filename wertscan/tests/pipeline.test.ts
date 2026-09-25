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

test('Zu wenig Fotoidentität startet keine breite Marktsuche', async () => {
  const weak = {
    category: 'Sonstiges',
    objectType: 'Unbekannter Gegenstand',
    brand: '',
    model: '',
    title: 'Roter Gegenstand',
    condition: 'gebraucht',
    confidence: 0.9,
    categoryConfidence: 0.6,
    visualText: ['rot'],
    identifiers: [],
    universalDetails: {
      manufacturer: '',
      modelName: '',
      modelNumber: '',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: '',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      material: '',
      visibleMarks: '',
      primaryColor: 'rot',
      detailConfidence: 0.7,
    },
  } as unknown as Analysis;

  setAi(
    async () => ({ status: 200, text: page([{ title: 'Irgendein roter Gegenstand', condition: 'Gebraucht', price: '999,00 EUR' }]) }),
    async ({ content }) => extractAll(content)
  );

  const market = await liveMarketLookup(weak, silent);
  assert.equal(market.status, 'insufficient_identity');
  assert.equal(market.scanGuidance?.canSearchNow, false);
  assert.equal(aiCalls.scrape.length, 0, 'bei zu schwacher Fotoidentität darf keine Marktsuche gestartet werden');
  assert.equal(marketValuation(weak, market), null);
});

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


test('Flohmarkt Uhr ohne Referenz: nur Vergleichsbereich, kein exakter Marktwert', async () => {
  const watch = {
    category: 'Uhren',
    objectType: 'Armbanduhr',
    brand: 'Aristo',
    model: 'Nicht erkannt',
    title: 'Aristo Armbanduhr',
    material: 'Walzgolddouble',
    condition: 'gebraucht',
    confidence: 0.94,
    categoryConfidence: 0.99,
    brandConfidence: 0.99,
    modelConfidence: 0.2,
    visualText: ['Aristo', 'WALZGOLDDOUBLE 20 MIKRON', 'BODEN EDELSTAHL'],
    identifiers: [],
    universalDetails: {
      manufacturer: 'Aristo',
      modelName: '',
      modelNumber: '',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: 'Armbanduhr',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      material: 'Walzgolddouble',
      visibleMarks: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
      primaryColor: 'schwarz',
      detailConfidence: 0.95,
    },
  } as unknown as Analysis;

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Aristo Vintage Armbanduhr Walzgolddouble 20 Mikron Boden Edelstahl', condition: 'Gebraucht', price: '45,00 EUR' },
              { title: 'Aristo rechteckige Uhr Walzgolddouble 20 Mikron Boden Edelstahl', condition: 'Gebraucht', price: '50,00 EUR' },
              { title: 'Aristo alte Damenuhr Walzgolddouble 20 Mikron Boden Edelstahl', condition: 'Gebraucht', price: '55,00 EUR' },
              { title: 'Aristo Diver Automatik Edelstahl 42 mm', condition: 'Gebraucht', price: '563,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );

  const market = await liveMarketLookup(watch, silent);
  assert.equal(market.status, 'found');
  assert.equal(market.objectMatch?.mode, 'comparable_object');
  assert.equal(market.objectMatch?.label, 'Nur ähnliche Marktobjekte');
  assert.equal(market.objectMatch?.marketValueAllowed, false);
  assert.equal(market.scanGuidance?.canShowExactMarketValue, false);
  assert.ok(market.scanGuidance?.nextViews.some(view => view.id === 'back' || view.id === 'side'));
  assert.equal(marketValuation(watch, market), null, 'vergleichbare Objekte dürfen keinen exakten Marktwert erzeugen');
  assert.ok(market.soldComparables.length >= 3);
  assert.ok(market.soldComparables.every(row => row.price !== 563), 'unpassende moderne Aristo Diver Uhr wird verworfen');
  assert.ok(market.soldComparables.every(row => row.identityMatch?.mode === 'comparable_object'));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.matchedFields.includes('brand')));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.matchedFields.includes('material')));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.matchedFields.includes('marking')));
  assert.ok(!aiCalls.scrape.some(url => url.includes('chrono24')), 'ohne Referenz keine breite Chrono24 Suche');
  assert.ok(!aiCalls.scrape.some(url => url.includes('mediamarkt')), 'Vintage Vergleichsobjekt braucht keinen Händler Neupreis');
  assert.ok(!aiCalls.scrape.some(url => url.includes('geizhals')), 'Vintage Vergleichsobjekt braucht keinen Geizhals Lauf');
  assert.ok(
    aiCalls.scrape.filter(url => url.includes('ebay.de') && url.includes('LH_Sold=1')).length <= 2,
    'Kategorie Matching soll höchstens zwei eBay Verkaufsqueries für Nicht Karten verwenden'
  );

  const display = buildMarketDisplay(market);
  assert.equal(display.statusCategory, 'comparable');
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.comparisonRange.state, 'range');
  assert.equal(display.comparisonRange.label, 'Nur ähnliche Marktobjekte');
  assert.equal(display.scanGuidance?.canShowExactMarketValue, false);
  assert.ok(display.scanGuidance?.nextViews.some(view => view.id === 'back' || view.id === 'side'));
  assert.ok(display.soldComparables.sold.every(row => row.matchQuality === 'similar_only' || row.matchQuality === 'strong_comparable'));
  assert.ok(display.soldComparables.sold.every(row => row.matchedFields.includes('brand')));
  assert.match(display.marketValue.noValueReason || '', /keine.*exakt|Exakte Modellreferenz/i);
});


test('Flohmarkt Vergleich darf wörtliche Identitätsmerkmale aus demselben Listing Snippet nutzen', async () => {
  const watch = {
    category: 'Uhren',
    objectType: 'Armbanduhr',
    brand: 'Aristo',
    model: 'Nicht erkannt',
    title: 'Aristo Armbanduhr',
    material: 'Walzgolddouble',
    condition: 'gebraucht',
    confidence: 0.95,
    categoryConfidence: 0.99,
    brandConfidence: 0.99,
    modelConfidence: 0.2,
    visualText: ['Aristo', 'WALZGOLDDOUBLE 20 MIKRON', 'BODEN EDELSTAHL'],
    identifiers: [],
    universalDetails: {
      manufacturer: 'Aristo',
      modelName: '',
      modelNumber: '',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: 'Armbanduhr',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      material: 'Walzgolddouble',
      visibleMarks: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
      primaryColor: 'schwarz',
      detailConfidence: 0.95,
    },
  } as unknown as Analysis;

  const soldPage = [
    'Navigation',
    'Aristo Vintage Armbanduhr',
    'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
    'Gebraucht',
    '45,00 EUR',
    '',
    'Aristo rechteckige Vintage Uhr',
    'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
    'Gebraucht',
    '50,00 EUR',
    '',
    'Aristo alte Armbanduhr',
    'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
    'Gebraucht',
    '55,00 EUR',
  ].join('\n');

  setAi(
    async url => (url.includes('LH_Sold') ? { status: 200, text: soldPage } : { status: 403, text: '' }),
    async ({ content }) => {
      const id = Number((String(content).match(/=== SECTION (\d+)/) || [])[1] || 0);
      return {
        data: {
          items: [
            {
              sectionId: id,
              title: 'Aristo Vintage Armbanduhr',
              identityEvidence: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
              priceText: '45,00 EUR',
              price: 45,
              currency: 'EUR',
              conditionText: 'Gebraucht',
              conditionGroup: 'used',
              grading: 'raw',
              date: '',
              relevance: 0.9,
            },
            {
              sectionId: id,
              title: 'Aristo rechteckige Vintage Uhr',
              identityEvidence: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
              priceText: '50,00 EUR',
              price: 50,
              currency: 'EUR',
              conditionText: 'Gebraucht',
              conditionGroup: 'used',
              grading: 'raw',
              date: '',
              relevance: 0.9,
            },
            {
              sectionId: id,
              title: 'Aristo alte Armbanduhr',
              identityEvidence: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
              priceText: '55,00 EUR',
              price: 55,
              currency: 'EUR',
              conditionText: 'Gebraucht',
              conditionGroup: 'used',
              grading: 'raw',
              date: '',
              relevance: 0.9,
            },
          ],
        },
      };
    }
  );

  const market = await liveMarketLookup(watch, silent);
  assert.equal(market.status, 'found');
  assert.equal(market.objectMatch?.mode, 'comparable_object');
  assert.equal(market.soldComparables.length, 3);
  assert.ok(market.soldComparables.every(row => /20 MIKRON/.test(row.identityEvidence || '')));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.matchedFields.includes('marking')));
  assert.equal(marketValuation(watch, market), null);

  const display = buildMarketDisplay(market);
  assert.equal(display.marketValue.state, 'no_value');
  assert.equal(display.comparisonRange.state, 'range');
  assert.ok(display.soldComparables.sold.every(row => /20 MIKRON/.test(row.identityEvidence || '')));
  assert.ok(display.soldComparables.sold.every(row => row.matchedFields.includes('marking')));
});

test('Erfundener Identitätsbeleg aus Extraktion wird verworfen', async () => {
  const watch = {
    category: 'Uhren',
    objectType: 'Armbanduhr',
    brand: 'Aristo',
    model: 'Nicht erkannt',
    title: 'Aristo Armbanduhr',
    material: 'Walzgolddouble',
    condition: 'gebraucht',
    confidence: 0.95,
    categoryConfidence: 0.99,
    brandConfidence: 0.99,
    modelConfidence: 0.2,
    visualText: ['Aristo', 'WALZGOLDDOUBLE 20 MIKRON', 'BODEN EDELSTAHL'],
    identifiers: [],
    universalDetails: {
      manufacturer: 'Aristo',
      modelName: '',
      modelNumber: '',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: 'Armbanduhr',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      material: 'Walzgolddouble',
      visibleMarks: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
      primaryColor: 'schwarz',
      detailConfidence: 0.95,
    },
  } as unknown as Analysis;

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: 'Aristo Vintage Uhr\nGebraucht\n45,00 EUR' }
        : { status: 403, text: '' },
    async ({ content }) => {
      const id = Number((String(content).match(/=== SECTION (\d+)/) || [])[1] || 0);
      return {
        data: {
          items: [
            {
              sectionId: id,
              title: 'Aristo Vintage Uhr',
              identityEvidence: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
              priceText: '45,00 EUR',
              price: 45,
              currency: 'EUR',
              conditionText: 'Gebraucht',
              conditionGroup: 'used',
              grading: 'raw',
              date: '',
              relevance: 0.9,
            },
          ],
        },
      };
    }
  );

  const market = await liveMarketLookup(watch, silent);
  assert.equal(market.soldComparables.length, 0);
  assert.ok((market.debug.rejectionReasons.identity_evidence_not_in_source || 0) >= 1);
});

test('Flohmarkt Technik mit sichtbarer Modellnummer bleibt exakter Marktwert', async () => {
  const remote = {
    category: 'Elektronik',
    objectType: 'Fernbedienung',
    brand: 'Apple',
    model: 'Siri Remote',
    title: 'Apple Siri Remote A2540',
    condition: 'gebraucht',
    confidence: 0.98,
    categoryConfidence: 0.99,
    brandConfidence: 0.99,
    modelConfidence: 0.96,
    visualText: ['Apple', 'A2540'],
    identifiers: ['A2540'],
    universalDetails: {
      manufacturer: 'Apple',
      modelName: 'Siri Remote',
      modelNumber: 'A2540',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: 'Fernbedienung',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      detailConfidence: 0.98,
    },
  } as unknown as Analysis;

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Apple Siri Remote A2540', condition: 'Gebraucht', price: '42,00 EUR' },
              { title: 'Apple TV Siri Remote A2540 Fernbedienung', condition: 'Gebraucht', price: '46,00 EUR' },
              { title: 'Apple Siri Remote A1513', condition: 'Gebraucht', price: '15,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );

  const market = await liveMarketLookup(remote, silent);
  assert.equal(market.objectMatch?.mode, 'exact_product');
  assert.equal(market.objectMatch?.marketValueAllowed, true);
  assert.ok(market.soldComparables.every(row => !/A1513/.test(row.title)));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.mode === 'exact_product'));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.quality === 'exact'));
  assert.ok(market.soldComparables.every(row => row.identityMatch?.matchedFields.includes('modelNumber')));
  const valuation = marketValuation(remote, market);
  assert.ok(valuation);
  assert.equal(valuation!.market, 44);
  assert.ok(aiCalls.scrape.some(url => url.includes('geizhals')), 'exakt identifizierte Technik darf Händler Neupreise prüfen');
  assert.ok(aiCalls.scrape.some(url => url.includes('mediamarkt')), 'exakt identifizierte Technik darf Retail Quellen prüfen');
  assert.ok(
    aiCalls.scrape.filter(url => url.includes('ebay.de') && url.includes('LH_Sold=1')).length <= 2,
    'auch exakte Nicht Karten Produkte brauchen höchstens zwei eBay Verkaufsqueries'
  );
});


test('Nicht Karten: aktive Wunschpreise dürfen echten Verkauf nicht als Ausreißer entfernen', async () => {
  const remote = {
    category: 'Elektronik',
    objectType: 'Fernbedienung',
    brand: 'Apple',
    model: 'Siri Remote',
    title: 'Apple Siri Remote A2540',
    condition: 'gebraucht',
    confidence: 0.98,
    categoryConfidence: 0.99,
    brandConfidence: 0.99,
    modelConfidence: 0.96,
    visualText: ['Apple', 'A2540'],
    identifiers: ['A2540'],
    universalDetails: {
      manufacturer: 'Apple',
      modelName: 'Siri Remote',
      modelNumber: 'A2540',
      skuOrPartNumber: '',
      barcodeOrEan: '',
      productFamily: 'Fernbedienung',
      generation: '',
      editionOrVariant: '',
      capacityOrStorage: '',
      detailConfidence: 0.98,
    },
  } as unknown as Analysis;

  setAi(
    async url => {
      if (url.includes('LH_Sold')) {
        return {
          status: 200,
          text: page([{ title: 'Apple Siri Remote A2540 verkauft', condition: 'Gebraucht', price: '20,00 EUR' }]),
        };
      }
      if (url.includes('ebay.de')) {
        return {
          status: 200,
          text: page([
            { title: 'Apple Siri Remote A2540 Angebot 1', condition: 'Gebraucht', price: '60,00 EUR' },
            { title: 'Apple Siri Remote A2540 Angebot 2', condition: 'Gebraucht', price: '65,00 EUR' },
            { title: 'Apple Siri Remote A2540 Angebot 3', condition: 'Gebraucht', price: '70,00 EUR' },
            { title: 'Apple Siri Remote A2540 Angebot 4', condition: 'Gebraucht', price: '75,00 EUR' },
          ]),
        };
      }
      return { status: 403, text: '' };
    },
    async ({ content }) => extractAll(content)
  );

  const market = await liveMarketLookup(remote, silent);
  assert.ok(market.soldComparables.some(row => row.price === 20), 'echter Verkauf bleibt als Beleg erhalten');
  assert.ok((market.debug.rejectionReasons.price_outlier || 0) === 0, 'Angebote dürfen Verkauf nicht als Ausreißer markieren');
  assert.equal(market.soldComparables.length, 1);
  assert.ok(market.currentOffers.length >= 4);
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


test('Non TCG Pokémon Zukan nutzt keinen TCG Katalog und verlangt Name plus Nummer', async () => {
  const zukan = {
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon Zukan / Carddass',
    model: 'Articuno',
    title: 'Articuno 379',
    condition: 'Gem Mint 10, graded',
    confidence: 0.99,
    categoryConfidence: 0.99,
    cardDetails: {
      franchise: 'Pokémon Zukan Carddass',
      cardName: 'Articuno',
      cardNumber: '379',
      setName: 'Pokémon Zukan',
      rarity: '',
      finish: 'Holo',
      gradingCompany: 'PSA',
      grade: '10',
      language: 'Japanese',
    },
  } as unknown as Analysis;

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: '2004 Pokemon Zukan Articuno #379 Holo PSA 10', condition: 'Neuwertig', price: '190,00 EUR' },
              { title: 'Pokemon Zukan Articuno 379 PSA 10 Holo', condition: 'Neuwertig', price: '210,00 EUR' },
              { title: 'Pokemon Zukan Mew #379 PSA 10 Holo', condition: 'Neuwertig', price: '900,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );

  const deliberatelyFailingProvider = new InMemoryCardDataProvider({
    cards: [],
    evidence: {},
    failFind: true,
  });
  const market = await liveMarketLookup(zukan, { ...silent, cardProvider: deliberatelyFailingProvider });

  assert.equal(market.cardMarket, null, 'Zukan darf den Pokémon TCG Provider gar nicht aufrufen');
  assert.equal(market.status, 'found');
  assert.equal(market.headline.kind, 'exact_grading');
  assert.equal(market.headline.price, 200);
  assert.equal(market.soldComparables.length, 2);
  assert.ok(market.soldComparables.every(row => /Articuno/i.test(row.title)));
  assert.ok(market.soldComparables.every(row => /379/.test(row.title)));
  assert.ok(market.soldComparables.every(row => /PSA\s*10/i.test(row.title)));
  assert.ok(market.soldComparables.every(row => !/Mew/i.test(row.title)));
});

test('Pokémon TCG Kataloglücke darf nur mit vollständiger Nummer plus Name oder Set ins Web fallen', async () => {
  const promo = charizard({
    cardName: 'Charizard',
    cardNumber: '143/S-P',
    setName: 'Illustration Grand Prix Promo',
    gradingCompany: '',
    grade: '',
    language: 'Japanese',
  });
  (promo as unknown as { condition: string }).condition = 'Near Mint';

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Charizard 143/S-P Japanese Promo', condition: 'Near Mint', price: '19,00 EUR' },
              { title: 'Pokemon Charizard 143/S-P Promo Holo', condition: 'Near Mint', price: '21,00 EUR' },
              { title: 'Pikachu 143/S-P Japanese Promo', condition: 'Near Mint', price: '500,00 EUR' },
              { title: 'Charizard 143/SV-P Japanese Promo', condition: 'Near Mint', price: '700,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );

  const emptyCatalog = new InMemoryCardDataProvider({ cards: [], evidence: {} });
  const market = await liveMarketLookup(promo, { ...silent, cardProvider: emptyCatalog });

  assert.equal(market.cardMarket?.status, 'not_found');
  assert.equal(market.status, 'found', 'strenge Websuche darf eine echte Kataloglücke auffangen');
  assert.equal(market.headline.price, 20);
  assert.equal(market.soldComparables.length, 2);
  assert.ok(market.soldComparables.every(row => /Charizard/i.test(row.title)));
  assert.ok(market.soldComparables.every(row => /143\/S-P/i.test(row.title)));
  assert.ok(market.soldComparables.every(row => !/Pikachu|143\/SV-P/i.test(row.title)));
});


test('Unverifizierbarer Set Alias darf bei sichtbarem Namen plus voller Nummer streng ins Web fallen', async () => {
  const promo = charizard({
    cardName: 'Charizard',
    cardNumber: '143/S-P',
    setName: 'Illustration Grand Prix Promo',
    gradingCompany: '',
    grade: '',
    language: 'Japanese',
    finish: 'Holo',
  });
  (promo as unknown as { condition: string }).condition = 'Near Mint';

  setAi(
    async url =>
      url.includes('LH_Sold')
        ? {
            status: 200,
            text: page([
              { title: 'Charizard 143/S-P Japanese Holo Promo', condition: 'Near Mint', price: '24,00 EUR' },
              { title: 'Charizard 143/S-P Pokemon Promo Holo', condition: 'Near Mint', price: '26,00 EUR' },
              { title: 'Pikachu 143/S-P Holo Promo', condition: 'Near Mint', price: '800,00 EUR' },
            ]),
          }
        : { status: 403, text: '' },
    async ({ content }) => extractAll(content)
  );

  const provider = new InMemoryCardDataProvider({
    cards: [
      candidate({
        cardId: 'catalog-card',
        name: 'Charizard',
        number: '143',
        printedNumber: '143/S-P',
        expansionId: 'unknown-jp-promo',
        expansionName: 'Japanese Promo Collection',
        language: 'Japanese',
        languageCode: 'ja',
        variants: [{ name: 'holofoil' }],
      }),
    ],
    evidence: {},
  });

  const market = await liveMarketLookup(promo, { ...silent, cardProvider: provider });

  assert.equal(market.cardMarket?.status, 'not_unique');
  assert.equal(market.cardMarket?.debug.matchReason, 'set_unverifiable_no_alias');
  assert.equal(market.status, 'found');
  assert.equal(market.headline.price, 25);
  assert.equal(market.soldComparables.length, 2);
  assert.ok(market.soldComparables.every(row => /Charizard/.test(row.title)));
  assert.ok(market.soldComparables.every(row => !/Pikachu/.test(row.title)));
});

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

test('Scraping: Reverse-Holo-Titel bei erkannter Holo-Variante wird nicht übernommen', async () => {
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
  assert.ok(result.debug.rejectionReasons.variant_mismatch >= 1, 'finish=Holo ist jetzt eine belegte Variante, Reverse Holo widerspricht ihr');
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
