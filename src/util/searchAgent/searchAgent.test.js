import {
  AGENT_STATUS_BLOCKED,
  AGENT_STATUS_EMPTY,
  AGENT_STATUS_OK,
  buildSearchParams,
  getConditionFilter,
  parseAmount,
  parseIntent,
  runSearchAgent,
  toPriceParam,
  withLocationOverride,
} from './index';
import { assessQuery, sanitizeQuery, MAX_QUERY_LENGTH, RISK_BLOCKED, RISK_CAUTION } from './safety';
import { boundsFromCenter, CITIES, findCities, findCountry } from './locations';

describe('searchAgent sanitizing', () => {
  it('removes markup, control characters and injected protocols', () => {
    const raw = 'iPhone <script>alert(1)</script> https://evil.example/x in Berlin';
    expect(sanitizeQuery(raw)).toBe('iPhone script alert(1) /script evil.example/x in Berlin');
  });

  it('removes zero-width and bidi characters', () => {
    expect(sanitizeQuery('Han​dy‮ in Berlin')).toBe('Handy in Berlin');
  });

  it('caps the length', () => {
    expect(sanitizeQuery('a'.repeat(400))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('handles non-string input', () => {
    expect(sanitizeQuery(null)).toBe('');
    expect(sanitizeQuery(undefined)).toBe('');
    expect(sanitizeQuery(42)).toBe('');
  });
});

describe('searchAgent safety assessment', () => {
  it('blocks searches for illegal goods', () => {
    expect(assessQuery('pistole kaufen').level).toBe(RISK_BLOCKED);
    expect(assessQuery('gefälschter Ausweis').level).toBe(RISK_BLOCKED);
    expect(assessQuery('gestohlenes iPhone').level).toBe(RISK_BLOCKED);
  });

  it('blocks attempts to look up a private person', () => {
    expect(assessQuery('Adresse von Max Mustermann').level).toBe(RISK_BLOCKED);
    expect(assessQuery('find someone address').level).toBe(RISK_BLOCKED);
    expect(assessQuery('Person orten').level).toBe(RISK_BLOCKED);
  });

  it('warns about known scam patterns but still allows the search', () => {
    const assessment = assessQuery('iPhone 13 gegen Vorkasse');
    expect(assessment.level).toBe(RISK_CAUTION);
    expect(assessment.reasons.map(r => r.code)).toContain('advancePayment');
  });

  it('leaves ordinary searches alone', () => {
    expect(assessQuery('Kinderwagen in Bremen').level).toBe('ok');
  });
});

describe('searchAgent amount parsing', () => {
  it.each([
    ['300', 300],
    ['1.200', 1200],
    ['1,200', 1200],
    ['1200,50', 1200.5],
    ['1200.50', 1200.5],
    ['1.200,50', 1200.5],
    ['1,200.50', 1200.5],
  ])('parses %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('rejects everything that is not a number', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe('searchAgent intent parsing', () => {
  it('parses the example query: item, city, price', () => {
    const intent = parseIntent('Suche Handy iPhone 13 in Berlin unter 300 Euro');

    expect(intent.keywords).toBe('Handy iPhone 13');
    expect(intent.city.name).toBe('Berlin');
    expect(intent.country.code).toBe('DE');
    expect(intent.price).toEqual({ min: null, max: 300, currency: 'EUR' });
  });

  it('parses a country without a city', () => {
    const intent = parseIntent('Fahrrad in Österreich');
    expect(intent.country.code).toBe('AT');
    expect(intent.city).toBeNull();
    expect(intent.keywords).toBe('Fahrrad');
  });

  it('parses English queries', () => {
    const intent = parseIntent('looking for a used laptop in Amsterdam under 500 eur');
    expect(intent.keywords).toBe('laptop');
    expect(intent.city.name).toBe('Amsterdam');
    expect(intent.condition).toBe('used');
    expect(intent.price.max).toBe(500);
  });

  it('parses a price range', () => {
    const intent = parseIntent('Kamera zwischen 100 und 300 Euro');
    expect(intent.price).toEqual({ min: 100, max: 300, currency: 'EUR' });
  });

  it('parses a lower bound', () => {
    const intent = parseIntent('Rennrad ab 500 Euro');
    expect(intent.price).toEqual({ min: 500, max: null, currency: 'EUR' });
  });

  it('swaps a reversed price range', () => {
    const intent = parseIntent('Kamera zwischen 300 und 100 Euro');
    expect(intent.price.min).toBe(100);
    expect(intent.price.max).toBe(300);
  });

  it('reads a named budget as an upper bound', () => {
    expect(parseIntent('iPhone 17 Pro Max für 500 Euro').price).toEqual({
      min: null,
      max: 500,
      currency: 'EUR',
    });
    expect(parseIntent('Fahrrad um 300 €').price.max).toBe(300);
    expect(parseIntent('Kamera ca. 250 Euro').price.max).toBe(250);
    expect(parseIntent('laptop for 500 eur').price.max).toBe(500);
  });

  it('does not read a budget without a currency', () => {
    expect(parseIntent('Kinderwagen für Zwillinge').price).toBeNull();
    expect(parseIntent('Buch für 3 Jahre').price).toBeNull();
  });

  it('parses a whole country named as "ganz <Land>"', () => {
    const intent = parseIntent('suche nach iPhone 17 Pro Max für 500 Euro ganz Österreich');

    expect(intent.keywords).toBe('iPhone 17 Pro Max');
    expect(intent.country.code).toBe('AT');
    expect(intent.city).toBeNull();
    expect(intent.price.max).toBe(500);
  });

  it('does not read a year as a price', () => {
    const intent = parseIntent('Golf ab 2015 in Köln');
    expect(intent.price).toBeNull();
    expect(intent.city.name).toBe('Köln');
  });

  it('does not read a model number as a price range', () => {
    const intent = parseIntent('iPhone 13 - 14');
    expect(intent.price).toBeNull();
  });

  it('parses a radius', () => {
    const intent = parseIntent('Sofa in Hamburg im Umkreis von 50 km');
    expect(intent.radiusKm).toBe(50);
    expect(intent.city.name).toBe('Hamburg');
  });

  it('converts miles to kilometers', () => {
    expect(parseIntent('sofa within 10 miles of London').radiusKm).toBe(16);
  });

  it('parses sort order', () => {
    expect(parseIntent('Handy günstigste zuerst').sort).toBe('-price');
    expect(parseIntent('Handy neueste zuerst').sort).toBe('createdAt');
    expect(parseIntent('phones cheapest first').sort).toBe('-price');
  });

  it('recognizes city spellings with and without umlauts', () => {
    expect(parseIntent('Sofa in München').city.id).toBe('de-muenchen');
    expect(parseIntent('Sofa in Muenchen').city.id).toBe('de-muenchen');
    expect(parseIntent('sofa in munich').city.id).toBe('de-muenchen');
  });

  it('prefers the longer place name', () => {
    expect(parseIntent('Sofa in Frankfurt am Main').city.name).toBe('Frankfurt am Main');
  });

  it('resolves an ambiguous city with the country in the query', () => {
    const intent = parseIntent('Sofa in Bern Schweiz');
    expect(intent.city.name).toBe('Bern');
    expect(intent.country.code).toBe('CH');
  });

  it('warns when the city is not in the named country', () => {
    const intent = parseIntent('Sofa in Berlin Spanien');
    expect(intent.warnings.map(w => w.code)).toContain('cityNotInCountry');
  });

  it('keeps unrecognized words as keywords', () => {
    expect(parseIntent('Suche mir bitte einen Kühlschrank').keywords).toBe('Kühlschrank');
  });

  it('returns an empty intent for an empty query', () => {
    const intent = parseIntent('');
    expect(intent.keywords).toBe('');
    expect(intent.city).toBeNull();
    expect(intent.country).toBeNull();
  });
});

describe('searchAgent ambiguous city names', () => {
  // The shipped dictionary has no name that exists in two countries, so the ambiguity path is
  // exercised against a dictionary that does - which is what a marketplace gets as soon as it
  // adds, say, London (Ontario) next to London (UK).
  const parseWithAmbiguousBerlin = query => {
    let intent;
    jest.isolateModules(() => {
      jest.doMock('./locations', () => {
        const actual = jest.requireActual('./locations');
        const berlinDE = actual.findCities('Berlin')[0];
        const berlinES = {
          ...berlinDE,
          id: 'es-berlin',
          countryCode: 'ES',
          countryName: 'Spanien',
        };
        return {
          ...actual,
          findCities: (term, countryCode) => {
            const matches =
              actual.normalizeTerm(term) === 'berlin'
                ? [berlinDE, berlinES]
                : actual.findCities(term);
            return countryCode ? matches.filter(c => c.countryCode === countryCode) : matches;
          },
        };
      });
      intent = require('./parser').parseIntent(query);
    });
    return intent;
  };

  it('does not guess a location and reports the candidates', () => {
    const intent = parseWithAmbiguousBerlin('Sofa in Berlin');

    expect(intent.city).toBeNull();
    expect(intent.warnings.map(w => w.code)).toContain('ambiguousCity');
    expect(intent.cityCandidates.map(c => c.countryCode)).toEqual(['DE', 'ES']);
    // The place name stays searchable as a keyword instead of being dropped.
    expect(intent.keywords).toContain('Berlin');
  });

  it('resolves the ambiguity when the query names the country', () => {
    const intent = parseWithAmbiguousBerlin('Sofa in Berlin Spanien');

    expect(intent.city.countryCode).toBe('ES');
    expect(intent.warnings).toEqual([]);
  });
});

describe('searchAgent location dictionary', () => {
  it('finds countries by their German, English and ISO names', () => {
    expect(findCountry('Deutschland').code).toBe('DE');
    expect(findCountry('germany').code).toBe('DE');
    expect(findCountry('DE').code).toBe('DE');
  });

  it('derives bounds around a center point', () => {
    const bounds = boundsFromCenter({ lat: 52.52, lng: 13.405 }, 25);
    expect(bounds.ne.lat).toBeGreaterThan(52.52);
    expect(bounds.sw.lat).toBeLessThan(52.52);
    expect(bounds.ne.lng).toBeGreaterThan(13.405);
    expect(bounds.sw.lng).toBeLessThan(13.405);
  });

  it('clamps a huge radius instead of producing invalid coordinates', () => {
    const bounds = boundsFromCenter({ lat: 60, lng: 20 }, 100000);
    expect(bounds.ne.lat).toBeLessThanOrEqual(90);
    expect(bounds.sw.lat).toBeGreaterThanOrEqual(-90);
    expect(bounds.ne.lng).toBeLessThanOrEqual(180);
    expect(bounds.sw.lng).toBeGreaterThanOrEqual(-180);
  });

  it('has no city name that resolves to more than one country', () => {
    const ambiguous = CITIES.flatMap(city => city.aliases)
      .filter((alias, index, all) => all.indexOf(alias) === index)
      .filter(alias => new Set(findCities(alias).map(c => c.countryCode)).size > 1);
    expect(ambiguous).toEqual([]);
  });

  it('restricts a city lookup to one country', () => {
    expect(findCities('Berlin', 'ES')).toHaveLength(0);
    expect(findCities('Berlin', 'DE')).toHaveLength(1);
  });
});

describe('searchAgent price parameter', () => {
  const range = { min: 0, max: 1000 };

  it('fills the open end from the configured range', () => {
    expect(toPriceParam({ min: null, max: 300 }, range)).toBe('0,300');
    expect(toPriceParam({ min: 500, max: null }, range)).toBe('500,1000');
  });

  it('clamps values to the configured range', () => {
    expect(toPriceParam({ min: null, max: 99999 }, range)).toBe('0,1000');
  });

  it('returns null without a price', () => {
    expect(toPriceParam(null, range)).toBeNull();
    expect(toPriceParam({ min: null, max: null }, range)).toBeNull();
  });
});

describe('searchAgent condition filter', () => {
  const listingFields = [
    {
      key: 'condition',
      scope: 'public',
      schemaType: 'enum',
      enumOptions: [{ option: 'used' }, { option: 'new' }],
      filterConfig: { showFilter: true },
    },
  ];

  it('maps a condition onto the marketplace listing field', () => {
    expect(getConditionFilter(listingFields, 'used')).toEqual({
      queryParam: 'pub_condition',
      value: 'used',
    });
  });

  it('skips conditions the marketplace has no option for', () => {
    expect(getConditionFilter(listingFields, 'broken')).toBeNull();
  });

  it('skips a field that is not in use as a filter', () => {
    const notAFilter = [{ ...listingFields[0], filterConfig: { showFilter: false } }];
    expect(getConditionFilter(notAFilter, 'used')).toBeNull();
  });

  it('is safe without configuration', () => {
    expect(getConditionFilter(undefined, 'used')).toBeNull();
    expect(getConditionFilter(listingFields, null)).toBeNull();
  });
});

describe('searchAgent search params', () => {
  it('builds keywords, area and price params', () => {
    const intent = parseIntent('Handy iPhone 13 in Berlin unter 300 Euro');
    const params = buildSearchParams(intent, { priceRange: { min: 0, max: 1000 } });

    expect(params.keywords).toBe('Handy iPhone 13');
    expect(params.address).toBe('Berlin, Deutschland');
    expect(params.price).toBe('0,300');
    expect(params.bounds).toBeDefined();
    expect(params.origin).toBeUndefined();
  });

  it('adds an origin only when the marketplace sorts by distance', () => {
    const intent = parseIntent('Handy in Berlin');
    expect(buildSearchParams(intent, { originInUse: true }).origin).toBeDefined();
  });

  it('leaves out filters the marketplace does not have', () => {
    const intent = parseIntent('gebrauchtes Handy in Berlin unter 300 Euro günstigste zuerst');
    const params = buildSearchParams(intent, {
      keywordsEnabled: false,
      priceFilterEnabled: false,
      sortEnabled: false,
    });

    expect(params.keywords).toBeUndefined();
    expect(params.price).toBeUndefined();
    expect(params.sort).toBeUndefined();
    expect(params.pub_condition).toBeUndefined();
    expect(params.address).toBe('Berlin, Deutschland');
  });

  it('searches the whole country when no city is named', () => {
    const params = buildSearchParams(parseIntent('Fahrrad in Polen'));
    expect(params.address).toBe('Polen');
  });
});

describe('searchAgent location override', () => {
  it('replaces the parsed city with an explicit choice', () => {
    const intent = parseIntent('Handy in Berlin');
    const overridden = withLocationOverride(intent, { cityId: 'de-hamburg' });
    expect(overridden.city.name).toBe('Hamburg');
    expect(overridden.country.code).toBe('DE');
  });

  it('clears a city that does not belong to the chosen country', () => {
    const intent = parseIntent('Handy in Berlin');
    const overridden = withLocationOverride(intent, { countryCode: 'ES' });
    expect(overridden.city).toBeNull();
    expect(overridden.country.code).toBe('ES');
  });

  it('keeps the parsed location when nothing is overridden', () => {
    const intent = parseIntent('Handy in Berlin');
    expect(withLocationOverride(intent, {}).city.name).toBe('Berlin');
  });

  it('applies a radius override', () => {
    const intent = parseIntent('Handy in Berlin');
    const overridden = withLocationOverride(intent, { radiusKm: 5 });
    const wide = buildSearchParams(intent).bounds;
    const narrow = buildSearchParams(overridden).bounds;
    expect(narrow.ne.lat).toBeLessThan(wide.ne.lat);
  });
});

describe('runSearchAgent', () => {
  it('returns ready-to-use search params for a normal query', () => {
    const result = runSearchAgent('Suche Handy iPhone 13 in Berlin unter 300 Euro');

    expect(result.status).toBe(AGENT_STATUS_OK);
    expect(result.searchParams.keywords).toBe('Handy iPhone 13');
    expect(result.searchParams.address).toBe('Berlin, Deutschland');
    expect(result.summary.map(chip => chip.type)).toEqual([
      'keywords',
      'country',
      'city',
      'priceMax',
    ]);
  });

  it('refuses to run a blocked search and returns no params', () => {
    const result = runSearchAgent('Adresse von Max Mustermann');

    expect(result.status).toBe(AGENT_STATUS_BLOCKED);
    expect(result.searchParams).toEqual({});
    expect(result.intent).toBeNull();
    expect(result.safety.reasons[0].code).toBe('personSearch');
  });

  it('runs a risky-but-legal search and adds matching safety tips', () => {
    const result = runSearchAgent('iPhone 13 in Berlin gegen Vorkasse');

    expect(result.status).toBe(AGENT_STATUS_OK);
    expect(result.tips).toContain('noAdvancePayment');
    expect(result.tips).toContain('payInPlatform');
  });

  it('reports an empty query', () => {
    expect(runSearchAgent('').status).toBe(AGENT_STATUS_EMPTY);
    expect(runSearchAgent('   ').status).toBe(AGENT_STATUS_EMPTY);
  });

  it('is deterministic: the same query always yields the same params', () => {
    const query = 'Fahrrad in München zwischen 100 und 300 Euro neueste zuerst';
    const first = runSearchAgent(query);
    const second = runSearchAgent(query);
    expect(JSON.stringify(first.searchParams)).toBe(JSON.stringify(second.searchParams));
  });
});
