/**
 * Vergleichsobjekte (Flohmarktware ohne Modellnummer) und Kartenidentität bei anderssprachigen
 * Namen, reinen Nummern und Nicht-TCG-Linien (Zukan). Seiten und Extraktion werden simuliert.
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAi } from './setupGlobals';
import { liveMarketLookup, marketValuation } from '../marketPricePipeline';
import { buildMarketDisplay } from '../marketDisplay';
import { pokemonNameForms, titleMentionsName } from '../cardData/pokemonNameAliases';

// Die Tests simulieren eBay-"Verkauft"-Seiten (wie mit Login lesbar), daher ausdrücklich eingeschaltet.
const silent = { log: () => {}, cardProvider: null, ebaySoldPages: true };

type Item = {
  title: string;
  price: string;
  condition?: string;
  /** Zusätzliche Beschreibungszeile im Quelltext (z. B. Material), nicht Teil des Titels. */
  description?: string;
  identity?: Record<string, string>;
};

const page = (items: Item[]) =>
  'Navigation\n'.repeat(5) +
  items.map(item => [item.title, item.description || '', item.condition || '', item.price].filter(Boolean).join('\n')).join('\n\n');

/** Extraktion wie ein korrekt arbeitendes Modell: liefert genau die Treffer der Seite. */
function extractor(sold: Item[], offers: Item[]) {
  return async ({ content }: { content: string }) => {
    const items: unknown[] = [];
    const parts = content.split(/=== SECTION (\d+)[^\n]*\n/).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i + 1];
      [...sold, ...offers].forEach(item => {
        if (!text.includes(item.title + '\n')) return;
        items.push({
          sectionId: Number(parts[i]),
          title: item.title,
          priceText: item.price,
          price: Number(item.price.replace(/[^\d,]/g, '').replace(',', '.')),
          currency: 'EUR',
          conditionText: item.condition || '',
          conditionGroup: 'unknown',
          grading: 'raw',
          date: '',
          relevance: 0.6,
          ...(item.identity ? { identity: item.identity } : {}),
        });
      });
    }
    return { data: { items } };
  };
}

function market(sold: Item[], offers: Item[] = []) {
  setAi(
    async url =>
      url.includes('LH_Sold')
        ? { status: 200, text: page(sold) }
        : url.includes('ebay.de') && offers.length
          ? { status: 200, text: page(offers) }
          : { status: 403, text: '' },
    extractor(sold, offers)
  );
}

const aristo = {
  category: 'Uhren',
  objectType: 'Armbanduhr',
  brand: 'Aristo',
  model: '',
  title: 'Aristo Armbanduhr',
  condition: 'gebraucht',
  confidence: 0.85,
  categoryConfidence: 0.9,
  universalDetails: {
    manufacturer: 'Aristo',
    modelName: '',
    modelNumber: '',
    skuOrPartNumber: '',
    barcodeOrEan: '',
    productFamily: '',
    generation: '',
    editionOrVariant: '',
    capacityOrStorage: '',
    material: 'Walzgolddouble',
    shape: 'rechteckiges Gehäuse',
    marking: 'WALZGOLDDOUBLE 20 MIKRON BODEN EDELSTAHL',
    color: 'schwarz',
  },
} as unknown as Analysis;

test('Aristo ohne Modellnummer: vergleichbare Verkäufe werden akzeptiert, Ergebnis ist eine Vergleichsspanne statt exaktem Marktwert', async () => {
  market([
    { title: 'Aristo Vintage Damenuhr Art Deco vergoldet Handaufzug', condition: 'Gebraucht', price: '45,00 EUR' },
    { title: 'Aristo Vintage Rechteck Damenuhr vergoldet', condition: 'Gebraucht', price: '55,00 EUR' },
    { title: 'Aristo Herrenuhr Walzgold Handaufzug', condition: 'Gebraucht', price: '70,00 EUR' },
    // harte Widersprüche bzw. fehlender Anker → weiterhin verworfen
    { title: 'Aristo Wanduhr Holz Pendel', condition: 'Gebraucht', price: '30,00 EUR' },
    { title: 'Junghans Damenuhr vergoldet Rechteck', condition: 'Gebraucht', price: '90,00 EUR' },
    { title: 'Aristo Lederband 18 mm schwarz', condition: 'Gebraucht', price: '9,00 EUR' },
    { title: 'Aristo Kugelschreiber vergoldet', condition: 'Gebraucht', price: '12,00 EUR' },
  ]);
  const result = await liveMarketLookup(aristo, silent);

  assert.equal(result.status, 'found', 'nicht mehr "keines hat die Prüfung bestanden"');
  assert.deepEqual(result.soldComparables.map(row => row.price).sort((a, b) => a - b), [45, 55, 70]);
  // Jede Seite wird je Suchanfrage geladen: Gründe zählen je Abruf, daher ≥ 1.
  const reasons = result.debug.rejectionReasons;
  assert.ok(reasons.object_type_mismatch >= 2, 'Wanduhr und Uhrenarmband sind keine Armbanduhr');
  assert.ok(reasons.comparable_brand_missing >= 1, 'Junghans ist keine Aristo');
  assert.ok(reasons.comparable_no_feature >= 1, 'Kugelschreiber: nur Marke, kein Merkmal');

  assert.equal(result.headline.kind, 'comparable');
  assert.equal(result.headline.from, 50);
  assert.equal(result.headline.to, 63);
  assert.match(result.headline.note, /kein exakter Modell-Marktwert/);

  const display = buildMarketDisplay(result);
  assert.equal(display.marketValue.state, 'comparable_range');
  assert.equal(display.marketValue.value, null, 'kein Einzelwert "Aristo = 55 €"');
  assert.equal(display.marketValue.range!.from.eur, '50,00 €');
  assert.equal(display.marketValue.range!.to.eur, '63,00 €');
  assert.ok(display.marketValue.comparableLabel);
  assert.equal(display.statusCategory, 'comparable');
  assert.ok(display.soldComparables.sold.every(item => item.badge === 'Verkauft' && item.similarity));

  const valuation = marketValuation(aristo, result)!;
  assert.notEqual(valuation.dataQuality, 'hoch');
  assert.match(valuation.basis, /kein exakter Modell-Marktwert/);
});

test('Vergleichsobjekt: strukturierte Merkmale zählen nur, wenn sie im Quelltext stehen', async () => {
  const grounded: Item = {
    title: 'Aristo Damenuhr Handaufzug',
    description: 'Gehäuse Walzgolddouble, rechteckig, Zifferblatt schwarz',
    condition: 'Gebraucht',
    price: '60,00 EUR',
    identity: { brand: 'Aristo', material: 'Walzgolddouble', shape: 'rechteckig', color: 'schwarz' },
  };
  const invented: Item = {
    title: 'Aristo Damenuhr Automatik',
    condition: 'Gebraucht',
    price: '65,00 EUR',
    identity: { brand: 'Aristo', material: 'Walzgolddouble', shape: 'rechteckig', color: 'schwarz' },
  };
  market([grounded, invented]);
  const result = await liveMarketLookup(aristo, silent);
  const byTitle = new Map(result.soldComparables.map(row => [row.title, row]));
  assert.equal(byTitle.get(grounded.title)!.matchQuality, 'strong_comparable', 'Typ + Material + Form + Farbe belegt');
  assert.equal(byTitle.get(invented.title)!.matchQuality, 'similar_only', 'nicht belegte Merkmale zählen nicht');
  assert.equal(result.headline.kind, 'comparable');
});

test('Exaktes Produkt (mit Modell) bleibt streng: kein Vergleichsmodus, fremde Modelle verworfen', async () => {
  const airpods = {
    category: 'Audio',
    objectType: 'Kopfhörer',
    brand: 'Apple',
    model: 'AirPods Pro 2',
    title: 'Apple AirPods Pro 2',
    condition: 'gebraucht',
    confidence: 0.9,
    categoryConfidence: 0.9,
  } as unknown as Analysis;
  market([
    { title: 'Apple AirPods Pro 2 Ladecase', condition: 'Gebraucht', price: '120,00 EUR' },
    { title: 'Apple AirPods Pro 2 USB-C', condition: 'Gebraucht', price: '130,00 EUR' },
    { title: 'Apple AirPods Max Space Grau', condition: 'Gebraucht', price: '300,00 EUR' },
  ]);
  const result = await liveMarketLookup(airpods, silent);
  assert.equal(result.headline.kind, 'condition');
  assert.equal(result.headline.price, 125);
  assert.ok(result.soldComparables.every(row => !row.matchQuality));
  assert.equal(buildMarketDisplay(result).marketValue.state, 'value');
});

const card = (details: Record<string, string>, condition: string) =>
  ({
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon',
    model: '',
    title: details.cardName + ' ' + details.cardNumber,
    condition,
    confidence: 0.95,
    categoryConfidence: 0.95,
    cardDetails: {
      franchise: 'Pokémon',
      cardName: '',
      cardNumber: '',
      setName: '',
      rarity: '',
      finish: '',
      gradingCompany: '',
      grade: '',
      ...details,
    },
  }) as unknown as Analysis;

test('Zukan: Nummer exakt + Name oder kontrollierter Alias (Freezer = Articuno) + Produktlinie; Grading bleibt exakt', async () => {
  market([
    { title: 'Pokemon Zukan Freezer 379 PSA 10 Japanese', price: '120,00 EUR' },
    { title: 'Pokemon Zukan Articuno No. 379 PSA 10', price: '130,00 EUR' },
    { title: 'Pokemon Zukan Pikachu 379 PSA 10', price: '400,00 EUR' },
    { title: 'Pokemon Articuno 379 PSA 10 Promo', price: '90,00 EUR' },
    { title: 'Pokemon Zukan Freezer 379 PSA 9', price: '60,00 EUR' },
    { title: 'Pokemon Zukan Freezer 379 CGC 10', price: '100,00 EUR' },
    { title: 'Pokemon Zukan Freezer 379 Japanese', price: '20,00 EUR' },
  ]);
  const analysis = card(
    { cardName: 'Articuno', cardNumber: '379', setName: 'Pokémon Zukan', gradingCompany: 'PSA', grade: '10', language: 'ja' },
    'Mint, graded'
  );
  const result = await liveMarketLookup(analysis, silent);
  assert.deepEqual(result.soldComparables.map(row => row.price).sort((a, b) => a - b), [120, 130]);
  assert.equal(result.headline.kind, 'exact_grading');
  assert.equal(result.headline.price, 125);
  const reasons = result.debug.rejectionReasons;
  assert.ok(reasons.card_number_mismatch >= 1, 'Pikachu 379 ist eine andere Karte');
  assert.ok(reasons.product_line_mismatch >= 1, 'ohne Zukan kein Vergleich');
  assert.ok(reasons.grading_other_grade >= 1, 'PSA 9 ≠ PSA 10');
  assert.ok(reasons.grading_other_company >= 1, 'CGC 10 ≠ PSA 10');
  assert.ok(reasons.raw_not_used_for_graded >= 1, 'Raw ≠ PSA 10');
});

test('TCG-Karte: starke Nummer akzeptiert anderssprachige Namen; reine Nummer braucht Name/Alias oder Set; Zukan-Treffer abgelehnt', async () => {
  market([
    { title: 'リザードン ex 223/197 SAR', condition: 'Near Mint', price: '19,00 EUR' },
    { title: 'Glurak ex 223/197 Obsidianflammen', condition: 'Near Mint', price: '21,00 EUR' },
    { title: 'Pokemon Zukan Glurak 223/197', condition: 'Near Mint', price: '5,00 EUR' },
  ]);
  const strong = await liveMarketLookup(card({ cardName: 'Charizard ex', cardNumber: '223/197', language: 'ja' }, 'Near Mint'), silent);
  assert.deepEqual(strong.soldComparables.map(row => row.price).sort((a, b) => a - b), [19, 21]);
  assert.ok(strong.debug.rejectionReasons.product_line_mismatch >= 1);
  assert.equal(strong.headline.price, 20);

  market([
    { title: 'Pokemon Glurak 4 Base Set Holo', condition: 'Near Mint', price: '300,00 EUR' },
    { title: 'Pokemon Charizard 4 holo', condition: 'Near Mint', price: '320,00 EUR' },
    { title: 'Pokemon Pikachu 4 Promo', condition: 'Near Mint', price: '15,00 EUR' },
  ]);
  const weak = await liveMarketLookup(card({ cardName: 'Charizard', cardNumber: '4' }, 'Near Mint'), silent);
  assert.deepEqual(weak.soldComparables.map(row => row.price).sort((a, b) => a - b), [300, 320]);
  assert.ok(weak.debug.rejectionReasons.card_number_mismatch >= 1, 'Pikachu 4: Nummer allein reicht nicht');
});

test('Namensaliase: nur ganze Namen, auch in japanischer Schrift (ミュウ ≠ ミュウツー, Mew ≠ Mewtwo)', () => {
  const mew = pokemonNameForms('Mew');
  assert.equal(titleMentionsName('ミュウ 151 SAR', mew), true);
  assert.equal(titleMentionsName('ミュウツー 150 SAR', mew), false);
  assert.equal(titleMentionsName('Pokemon Mewtwo 150', mew), false);
  assert.equal(titleMentionsName('Pokemon Zukan Freezer 379', pokemonNameForms('Articuno')), true);
  assert.equal(titleMentionsName('リザードンex 223/197', pokemonNameForms('Charizard ex')), true);
});
