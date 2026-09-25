import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchQueries,
  decideIdentity,
  evaluateCandidate,
  IdentityFact,
  IdentityField,
  ObjectIdentityInput,
  objectIdentityFromAnalysis,
} from '../objectMatching';

const fact = (
  field: IdentityField,
  value: string,
  confidence = 0.95,
  observed = true,
): IdentityFact => ({
  field,
  value,
  confidence,
  observed,
  source: observed ? 'visible_text' : 'derived',
});

test('Vintage Aristo Uhr wird als stark vergleichbar statt erfunden exakt behandelt', () => {
  const input: ObjectIdentityInput = {
    category: 'watches',
    objectType: 'Armbanduhr',
    family: 'Vintage Armbanduhr',
    facts: [
      fact('brand', 'Aristo', 0.99),
      fact('marking', 'Walzgolddouble 20 Mikron', 0.99),
      fact('material', 'Boden Edelstahl', 0.98),
      fact('shape', 'rechteckig', 0.95),
      fact('color', 'schwarzes Zifferblatt', 0.92),
      fact('serial', '123456', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'comparable_object');
  assert.equal(decision.quality, 'strong_comparable');
  assert.equal(decision.valuationPolicy.marketValueAllowed, false);
  assert.equal(decision.valuationPolicy.comparisonRangeAllowed, true);
  assert.ok(decision.missingExactFields.includes('modelNumber') || decision.missingExactFields.includes('model'));

  const queries = buildSearchQueries(input).join(' | ');
  assert.match(queries, /Aristo/i);
  assert.match(queries, /Walzgolddouble 20 Mikron/i);
  assert.ok(!/123456/.test(queries), 'Seriennummer darf kein Markt Suchanker sein');

  const good = evaluateCandidate(input, {
    title: 'Aristo rechteckige Armbanduhr Walzgolddouble 20 Mikron Boden Edelstahl schwarzes Zifferblatt',
    fields: {},
  });
  assert.equal(good.accepted, true);

  const bad = evaluateCandidate(input, {
    title: 'Aristo Diver Automatik Edelstahl 42 mm',
    fields: {},
  });
  assert.equal(bad.accepted, false);
});

test('Elektronik mit sichtbarer Modellnummer wird exakt identifiziert', () => {
  const input: ObjectIdentityInput = {
    category: 'electronics',
    objectType: 'Fernbedienung',
    facts: [
      fact('brand', 'Apple', 0.99),
      fact('modelNumber', 'A2540', 0.99),
      fact('name', 'Siri Remote', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_product');
  assert.equal(decision.quality, 'exact');
  assert.equal(decision.valuationPolicy.marketValueAllowed, true);

  const queries = buildSearchQueries(input).join(' | ');
  assert.match(queries, /Apple/i);
  assert.match(queries, /A2540/i);

  const exact = evaluateCandidate(input, {
    title: 'Apple Siri Remote A2540',
    fields: { brand: 'Apple', modelNumber: 'A2540' },
  });
  assert.equal(exact.accepted, true);
  assert.equal(exact.quality, 'exact');

  const wrong = evaluateCandidate(input, {
    title: 'Apple Siri Remote A1513',
    fields: { brand: 'Apple', modelNumber: 'A1513' },
  });
  assert.equal(wrong.accepted, false);
  assert.ok(wrong.conflicts.includes('modelNumber'));
});

test('Pokemon TCG Karte nutzt Name plus vollständige Nummer als exakte Sammleridentität', () => {
  const input: ObjectIdentityInput = {
    category: 'trading_cards',
    objectType: 'Sammelkarte',
    family: 'Pokemon TCG',
    subtype: 'pokemon_tcg',
    facts: [
      fact('name', 'Charizard', 0.98),
      fact('number', '143/S-P', 0.99),
      fact('language', 'Japanese', 0.98),
      fact('set', 'Scarlet & Violet Promo', 0.85),
      fact('variant', 'Holo', 0.88),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');
  assert.equal(decision.quality, 'exact');

  const exact = evaluateCandidate(input, {
    title: 'Pokemon Charizard 143/S-P Japanese Promo Holo',
    fields: {
      name: 'Charizard',
      number: '143/S-P',
      language: 'Japanese',
      variant: 'Holo',
    },
  });
  assert.equal(exact.accepted, true);

  const wrongNumber = evaluateCandidate(input, {
    title: 'Pokemon Charizard 143/SV-P Japanese Promo',
    fields: {
      name: 'Charizard',
      number: '143/SV-P',
      language: 'Japanese',
    },
  });
  assert.equal(wrongNumber.accepted, false);
  assert.ok(wrongNumber.conflicts.includes('number'));
});

test('Pokemon Zukan bleibt Non TCG und verlangt Name plus Nummer gemeinsam', () => {
  const input: ObjectIdentityInput = {
    category: 'trading_cards',
    objectType: 'Sammelkarte',
    family: 'Pokemon Zukan / Carddass',
    subtype: 'pokemon_zukan',
    facts: [
      fact('name', 'Articuno', 0.99),
      fact('number', '379', 0.99),
      fact('set', 'Pokemon Zukan', 0.98),
      fact('year', '2004', 0.99),
      fact('gradingCompany', 'PSA', 0.99),
      fact('grade', '10', 0.99),
      fact('variant', 'Holo', 0.95),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');
  assert.equal(decision.quality, 'exact');
  assert.ok(decision.explanation.some(line => /Non TCG/i.test(line)));

  const exact = evaluateCandidate(input, {
    title: '2004 Pokemon Zukan Articuno #379 Holo PSA 10',
    fields: {
      name: 'Articuno',
      number: '379',
      gradingCompany: 'PSA',
      grade: '10',
    },
  });
  assert.equal(exact.accepted, true);

  const wrongCard = evaluateCandidate(input, {
    title: '2004 Pokemon Zukan Mew #379 Holo PSA 10',
    fields: {
      name: 'Mew',
      number: '379',
      gradingCompany: 'PSA',
      grade: '10',
    },
  });
  assert.equal(wrongCard.accepted, false);
  assert.ok(wrongCard.missingRequired.includes('name') || wrongCard.conflicts.includes('name'));
});

test('Hot Wheels braucht Hersteller plus belastbares Variantenmerkmal', () => {
  const input: ObjectIdentityInput = {
    category: 'toys',
    objectType: 'Modellauto',
    family: 'Hot Wheels',
    subtype: 'hot_wheels',
    facts: [
      fact('manufacturer', 'Mattel', 0.99),
      fact('casting', '67 Camaro', 0.96),
      fact('baseCode', 'S23', 0.97),
      fact('color', 'rot', 0.9),
      fact('variant', 'Treasure Hunt', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');

  const exact = evaluateCandidate(input, {
    title: 'Mattel Hot Wheels 67 Camaro S23 rot Treasure Hunt',
    fields: { manufacturer: 'Mattel', baseCode: 'S23' },
  });
  assert.equal(exact.accepted, true);

  const wrongBase = evaluateCandidate(input, {
    title: 'Mattel Hot Wheels 67 Camaro T18 rot',
    fields: { manufacturer: 'Mattel', baseCode: 'T18' },
  });
  assert.equal(wrongBase.accepted, false);
  assert.ok(wrongBase.conflicts.includes('baseCode'));
});

test('Modellauto trennt Miniaturhersteller vom echten Fahrzeug', () => {
  const input: ObjectIdentityInput = {
    category: 'model_cars',
    objectType: 'Modellauto',
    facts: [
      fact('manufacturer', 'Norev', 0.98),
      fact('vehicleBrand', 'Citroen', 0.98),
      fact('vehicleModel', '2CV', 0.99),
      fact('scale', '1:18', 0.99),
      fact('color', 'grau', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');

  const exact = evaluateCandidate(input, {
    title: 'Norev Citroen 2CV 1:18 grau',
    fields: {
      manufacturer: 'Norev',
      vehicleBrand: 'Citroen',
      vehicleModel: '2CV',
      scale: '1:18',
    },
  });
  assert.equal(exact.accepted, true);

  const wrongMaker = evaluateCandidate(input, {
    title: 'Welly Citroen 2CV 1:18 grau',
    fields: {
      manufacturer: 'Welly',
      vehicleBrand: 'Citroen',
      vehicleModel: '2CV',
      scale: '1:18',
    },
  });
  assert.equal(wrongMaker.accepted, false);
  assert.ok(wrongMaker.conflicts.includes('manufacturer'));
});

test('Teppich ohne Hersteller Modellcode bleibt Vergleichsobjekt', () => {
  const input: ObjectIdentityInput = {
    category: 'rugs',
    objectType: 'Teppich',
    facts: [
      fact('material', 'Wolle', 0.95),
      fact('pattern', 'Medaillon', 0.92),
      fact('size', '200 x 300 cm', 0.99),
      fact('country', 'Iran', 0.85),
      fact('marking', 'handgeknüpft', 0.85, false),
      fact('color', 'rot blau', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'comparable_object');
  assert.equal(decision.valuationPolicy.marketValueAllowed, false);
  assert.equal(decision.valuationPolicy.comparisonRangeAllowed, true);

  const comparable = evaluateCandidate(input, {
    title: 'Persischer Teppich Iran Wolle Medaillon 200 x 300 cm rot blau handgeknüpft',
    fields: {},
  });
  assert.equal(comparable.accepted, true);
  assert.notEqual(comparable.quality, 'exact');
});

test('Porzellan kann über Hersteller plus Dekor exakt werden, Seriennummer allein nie', () => {
  const input: ObjectIdentityInput = {
    category: 'porcelain_glass',
    objectType: 'Porzellanteller',
    facts: [
      fact('manufacturer', 'Rosenthal', 0.99),
      fact('pattern', 'Maria', 0.98),
      fact('marking', 'Rosenthal Germany', 0.97),
      fact('shape', 'Teller', 0.9),
      fact('serial', '84721', 0.99),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');

  const exact = evaluateCandidate(input, {
    title: 'Rosenthal Maria Teller Germany',
    fields: { manufacturer: 'Rosenthal', pattern: 'Maria' },
  });
  assert.equal(exact.accepted, true);

  const serialOnly: ObjectIdentityInput = {
    category: 'watches',
    objectType: 'Armbanduhr',
    facts: [fact('brand', 'Aristo'), fact('serial', '84721')],
  };
  assert.equal(decideIdentity(serialOnly).mode, 'comparable_object');
});


test('Adapter ordnet reale WertScan Daten für Uhr und Non TCG Karte korrekt ein', () => {
  const watch = objectIdentityFromAnalysis({
    category: 'Uhren',
    objectType: 'Armbanduhr',
    brand: 'Aristo',
    model: 'Nicht erkannt',
    title: 'Aristo Armbanduhr',
    material: 'Metall',
    brandConfidence: 0.96,
    modelConfidence: 0.2,
    visualText: ['Aristo', 'WALZGOLDDOUBLE 20 MIKRON', 'BODEN EDELSTAHL'],
    identifiers: [],
    universalDetails: {
      manufacturer: 'Aristo',
      modelName: '',
      modelNumber: '',
      visibleMarks: 'WALZGOLDDOUBLE 20 MIKRON · BODEN EDELSTAHL',
      primaryColor: 'goldfarben',
      detailConfidence: 0.9,
    },
  });

  assert.equal(watch.category, 'watches');
  assert.equal(decideIdentity(watch).mode, 'comparable_object');
  assert.ok(watch.facts.some(row => row.field === 'marking' && /20 MIKRON/i.test(row.value)));

  const zukan = objectIdentityFromAnalysis({
    category: 'Sammelkarten',
    objectType: 'Sammelkarte',
    brand: 'Pokémon Zukan / Carddass',
    title: 'Articuno 379',
    visualText: ['2004 POKEMON ZUKAN', 'ARTICUNO', '#379', 'HOLO', 'PSA', 'GEM MT 10'],
    cardDetails: {
      franchise: 'Pokémon Zukan Carddass',
      cardName: 'Articuno',
      cardNumber: '379',
      setName: 'Pokémon Zukan',
      finish: 'Holo',
      gradingCompany: 'PSA',
      grade: '10',
    },
  });

  assert.equal(zukan.category, 'trading_cards');
  assert.equal(zukan.subtype, 'pokemon_zukan');
  assert.equal(decideIdentity(zukan).mode, 'exact_collectible');
});

test('Adapter unterscheidet Hot Wheels und Modellauto Merkmale', () => {
  const hotWheels = objectIdentityFromAnalysis({
    category: 'Spielzeug',
    objectType: 'Modellauto',
    brand: 'Hot Wheels',
    title: 'Hot Wheels 67 Camaro',
    visualText: ['HOT WHEELS', 'MATTEL', '67 CAMARO', 'S23'],
    hotWheelsDetails: {
      manufacturer: 'Mattel',
      castingName: '67 Camaro',
      baseCode: 'S23',
      color: 'Rot',
      rarityClass: 'Mainline',
    },
  });

  assert.equal(hotWheels.category, 'toys');
  assert.equal(hotWheels.subtype, 'hot_wheels');

  const diecast = objectIdentityFromAnalysis({
    category: 'Modellautos',
    objectType: 'Modellauto',
    brand: 'Norev',
    title: 'Citroën 2CV Modellauto',
    visualText: ['NOREV', 'CITROEN 2CV', '1:18'],
    modelCarDetails: {
      miniatureMaker: 'Norev',
      vehicleBrand: 'Citroën',
      vehicleModel: '2CV',
      scale: '1:18',
      color: 'Grau',
    },
  });

  assert.equal(diecast.category, 'model_cars');
  assert.ok(diecast.facts.some(row => row.field === 'manufacturer' && row.value === 'Norev'));
  assert.ok(diecast.facts.some(row => row.field === 'vehicleModel' && row.value === '2CV'));
});


test('Buch mit ISBN ist exaktes Produkt, falsche ISBN wird verworfen', () => {
  const input: ObjectIdentityInput = {
    category: 'books_media',
    objectType: 'Buch',
    facts: [
      fact('isbn', '9783551551672', 0.99),
      fact('name', 'Harry Potter und der Stein der Weisen', 0.95),
      fact('edition', 'Gebundene Ausgabe', 0.9),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_product');

  const exact = evaluateCandidate(input, {
    title: 'Harry Potter und der Stein der Weisen ISBN 9783551551672',
    fields: { isbn: '9783551551672' },
  });
  assert.equal(exact.accepted, true);

  const wrong = evaluateCandidate(input, {
    title: 'Harry Potter ISBN 9783551551665',
    fields: { isbn: '9783551551665' },
  });
  assert.equal(wrong.accepted, false);
  assert.ok(wrong.conflicts.includes('isbn'));
});

test('Münze nutzt Nominalname, Jahr und Land als Sammleridentität', () => {
  const input: ObjectIdentityInput = {
    category: 'jewelry_coins',
    objectType: 'Münze',
    subtype: 'coin',
    facts: [
      fact('name', '2 Euro', 0.99),
      fact('year', '2002', 0.99),
      fact('country', 'Österreich', 0.99),
      fact('marking', 'Bertha von Suttner', 0.95),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_collectible');

  const exact = evaluateCandidate(input, {
    title: 'Österreich 2 Euro 2002 Bertha von Suttner',
    fields: { name: '2 Euro', year: '2002', country: 'Österreich' },
  });
  assert.equal(exact.accepted, true);

  const wrongYear = evaluateCandidate(input, {
    title: 'Österreich 2 Euro 2003 Bertha von Suttner',
    fields: { name: '2 Euro', year: '2003', country: 'Österreich' },
  });
  assert.equal(wrongYear.accepted, false);
});

test('Werkzeug mit Typenschild Modellnummer wird exakt, ähnliche Serie nicht', () => {
  const input: ObjectIdentityInput = {
    category: 'tools',
    objectType: 'Akkuschrauber',
    facts: [
      fact('brand', 'Bosch', 0.99),
      fact('modelNumber', 'GSR 12V-15', 0.99),
      fact('name', 'Akkuschrauber', 0.9),
    ],
  };

  assert.equal(decideIdentity(input).mode, 'exact_product');

  const exact = evaluateCandidate(input, {
    title: 'Bosch GSR 12V-15 Professional Akkuschrauber',
    fields: { brand: 'Bosch', modelNumber: 'GSR 12V-15' },
  });
  assert.equal(exact.accepted, true);

  const wrong = evaluateCandidate(input, {
    title: 'Bosch GSR 12V-35 Professional',
    fields: { brand: 'Bosch', modelNumber: 'GSR 12V-35' },
  });
  assert.equal(wrong.accepted, false);
  assert.ok(wrong.conflicts.includes('modelNumber'));
});

test('Haushaltsgerät mit E Nummer wird exakt identifiziert', () => {
  const input: ObjectIdentityInput = {
    category: 'household_appliances',
    objectType: 'Geschirrspüler',
    facts: [
      fact('brand', 'Bosch', 0.99),
      fact('modelNumber', 'SMS4HVI00E', 0.99),
      fact('name', 'Geschirrspüler', 0.92),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'exact_product');
  assert.equal(decision.valuationPolicy.marketValueAllowed, true);

  const wrong = evaluateCandidate(input, {
    title: 'Bosch Geschirrspüler SMS4EMI06E',
    fields: { brand: 'Bosch', modelNumber: 'SMS4EMI06E' },
  });
  assert.equal(wrong.accepted, false);
});

test('Antiquität ohne belastbare Signatur bleibt Vergleichsobjekt', () => {
  const input: ObjectIdentityInput = {
    category: 'art_antiques',
    objectType: 'Vase',
    facts: [
      fact('material', 'Messing', 0.95),
      fact('shape', 'bauchige Vase', 0.92),
      fact('size', '28 cm', 0.99),
      fact('marking', 'florales Relief', 0.86),
      fact('year', 'um 1950', 0.65, false),
    ],
  };

  const decision = decideIdentity(input);
  assert.equal(decision.mode, 'comparable_object');
  assert.equal(decision.valuationPolicy.marketValueAllowed, false);

  const similar = evaluateCandidate(input, {
    title: 'Vintage Messing Vase bauchig 28 cm florales Relief',
    fields: {},
  });
  assert.equal(similar.accepted, true);
  assert.notEqual(similar.quality, 'exact');
});

test('Generisches Flohmarktobjekt braucht mehrere sichtbare Merkmale für Vergleich', () => {
  const weak: ObjectIdentityInput = {
    category: 'generic',
    objectType: 'Unbekanntes Objekt',
    facts: [fact('color', 'rot', 0.9)],
  };
  const weakDecision = decideIdentity(weak);
  assert.equal(weakDecision.mode, 'comparable_object');
  assert.equal(weakDecision.requiredSearchTerms.length, 0);

  const useful: ObjectIdentityInput = {
    category: 'generic',
    objectType: 'Dekorationsobjekt',
    facts: [
      fact('name', 'Kerzenhalter', 0.9),
      fact('material', 'Messing', 0.95),
      fact('shape', 'dreiflammig', 0.9),
      fact('size', '25 cm', 0.95),
    ],
  };
  const usefulDecision = decideIdentity(useful);
  assert.equal(usefulDecision.mode, 'comparable_object');
  assert.ok(usefulDecision.requiredSearchTerms.length >= 3);
});
