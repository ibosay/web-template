import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchQueries,
  decideIdentity,
  evaluateCandidate,
  IdentityFact,
  IdentityField,
  ObjectIdentityInput,
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
      fact('shape', 'rechteckig', 0.95, false),
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
