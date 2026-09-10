/**
 * Location dictionary for the search agent.
 *
 * The agent resolves country and city names locally instead of calling a geocoding service.
 * That keeps the "where" part of a query deterministic (the same query always maps to the same
 * search area) and means the raw query never leaves the marketplace.
 *
 * Bounding boxes for countries are stored as-is. Cities are stored as a center point plus a
 * radius, and the bounding box is derived from those. Both are approximations that are good
 * enough for a marketplace search area.
 */

const EARTH_KM_PER_DEGREE_LAT = 111.32;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 500;

/**
 * Normalize a search term so that "München", "Muenchen" and "muenchen" all match.
 * German umlauts are expanded (ä -> ae) before the generic diacritics are stripped,
 * because folding "ä" to "a" would not match the common "Muenchen" spelling.
 *
 * @param {String} str term to normalize
 * @returns {String} normalized term: lower case, ASCII, single spaces
 */
export const normalizeTerm = str => {
  if (typeof str !== 'string') {
    return '';
  }
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

// [code, English name, native/common name, sw.lat, sw.lng, ne.lat, ne.lng, ...aliases]
const COUNTRY_DATA = [
  ['DE', 'Germany', 'Deutschland', 47.27, 5.87, 55.06, 15.04, ['brd', 'allemagne', 'germania']],
  ['AT', 'Austria', 'Österreich', 46.37, 9.53, 49.02, 17.16, ['austria']],
  ['CH', 'Switzerland', 'Schweiz', 45.82, 5.96, 47.81, 10.49, ['suisse', 'svizzera', 'helvetia']],
  ['NL', 'Netherlands', 'Niederlande', 50.75, 3.36, 53.56, 7.23, ['holland', 'nederland']],
  ['BE', 'Belgium', 'Belgien', 49.5, 2.55, 51.51, 6.41, ['belgique', 'belgie']],
  ['LU', 'Luxembourg', 'Luxemburg', 49.45, 5.73, 50.18, 6.53, []],
  ['FR', 'France', 'Frankreich', 41.33, -5.14, 51.09, 9.56, ['francia']],
  ['IT', 'Italy', 'Italien', 36.62, 6.63, 47.09, 18.52, ['italia', 'italie']],
  ['ES', 'Spain', 'Spanien', 36.0, -9.3, 43.79, 3.32, ['espana', 'espagne']],
  ['PT', 'Portugal', 'Portugal', 36.96, -9.5, 42.15, -6.19, []],
  ['PL', 'Poland', 'Polen', 49.0, 14.12, 54.84, 24.15, ['polska']],
  ['CZ', 'Czechia', 'Tschechien', 48.55, 12.09, 51.06, 18.86, ['czech republic', 'cesko']],
  ['DK', 'Denmark', 'Dänemark', 54.56, 8.07, 57.75, 15.16, ['danmark']],
  ['SE', 'Sweden', 'Schweden', 55.34, 11.11, 69.06, 24.16, ['sverige']],
  ['NO', 'Norway', 'Norwegen', 57.98, 4.65, 71.19, 31.08, ['norge']],
  ['FI', 'Finland', 'Finnland', 59.81, 20.55, 70.09, 31.59, ['suomi']],
  [
    'GB',
    'United Kingdom',
    'Großbritannien',
    49.9,
    -8.65,
    60.86,
    1.77,
    ['uk', 'england', 'britain'],
  ],
  ['IE', 'Ireland', 'Irland', 51.42, -10.48, 55.39, -5.99, ['eire']],
  ['US', 'United States', 'USA', 24.4, -125.0, 49.38, -66.93, ['usa', 'us', 'america', 'amerika']],
  ['CA', 'Canada', 'Kanada', 41.68, -141.0, 70.0, -52.62, []],
];

// [name, countryCode, lat, lng, radiusKm, ...aliases]
const CITY_DATA = [
  // Germany
  ['Berlin', 'DE', 52.52, 13.405, 30],
  ['Hamburg', 'DE', 53.5511, 9.9937, 25],
  ['München', 'DE', 48.1372, 11.5755, 25, ['munich', 'muenchen']],
  ['Köln', 'DE', 50.9375, 6.9603, 22, ['cologne', 'koeln']],
  ['Frankfurt am Main', 'DE', 50.1109, 8.6821, 22, ['frankfurt', 'ffm']],
  ['Stuttgart', 'DE', 48.7758, 9.1829, 22],
  ['Düsseldorf', 'DE', 51.2277, 6.7735, 20, ['duesseldorf']],
  ['Leipzig', 'DE', 51.3397, 12.3731, 20],
  ['Dortmund', 'DE', 51.5136, 7.4653, 20],
  ['Essen', 'DE', 51.4556, 7.0116, 18],
  ['Bremen', 'DE', 53.0793, 8.8017, 20],
  ['Dresden', 'DE', 51.0504, 13.7373, 20],
  ['Hannover', 'DE', 52.3759, 9.732, 20, ['hanover']],
  ['Nürnberg', 'DE', 49.4521, 11.0767, 20, ['nuremberg', 'nuernberg']],
  ['Duisburg', 'DE', 51.4344, 6.7623, 18],
  ['Bochum', 'DE', 51.4818, 7.2162, 15],
  ['Wuppertal', 'DE', 51.2562, 7.1508, 15],
  ['Bielefeld', 'DE', 52.0302, 8.5325, 18],
  ['Bonn', 'DE', 50.7374, 7.0982, 15],
  ['Münster', 'DE', 51.9607, 7.6261, 18, ['muenster']],
  ['Karlsruhe', 'DE', 49.0069, 8.4037, 18],
  ['Mannheim', 'DE', 49.4875, 8.466, 15],
  ['Augsburg', 'DE', 48.3705, 10.8978, 15],
  ['Wiesbaden', 'DE', 50.0782, 8.2398, 15],
  ['Mönchengladbach', 'DE', 51.1805, 6.4428, 15, ['moenchengladbach']],
  ['Braunschweig', 'DE', 52.2689, 10.5268, 15, ['brunswick']],
  ['Kiel', 'DE', 54.3233, 10.1228, 15],
  ['Chemnitz', 'DE', 50.8278, 12.9214, 15],
  ['Aachen', 'DE', 50.7753, 6.0839, 15],
  ['Halle (Saale)', 'DE', 51.4825, 11.9705, 15, ['halle']],
  ['Magdeburg', 'DE', 52.1205, 11.6276, 15],
  ['Freiburg im Breisgau', 'DE', 47.999, 7.8421, 15, ['freiburg']],
  ['Krefeld', 'DE', 51.3388, 6.5853, 12],
  ['Mainz', 'DE', 49.9929, 8.2473, 15],
  ['Lübeck', 'DE', 53.8655, 10.6866, 15, ['luebeck']],
  ['Erfurt', 'DE', 50.9848, 11.0299, 15],
  ['Rostock', 'DE', 54.0924, 12.0991, 15],
  ['Kassel', 'DE', 51.3127, 9.4797, 15],
  ['Saarbrücken', 'DE', 49.2402, 6.9969, 15, ['saarbruecken']],
  ['Potsdam', 'DE', 52.3906, 13.0645, 12],
  ['Heidelberg', 'DE', 49.3988, 8.6724, 12],
  ['Regensburg', 'DE', 49.0134, 12.1016, 12],
  ['Ingolstadt', 'DE', 48.7665, 11.4258, 12],
  ['Ulm', 'DE', 48.4011, 9.9876, 12],
  ['Osnabrück', 'DE', 52.2799, 8.0472, 12, ['osnabrueck']],
  ['Oldenburg', 'DE', 53.1435, 8.2146, 12],
  ['Darmstadt', 'DE', 49.8728, 8.6512, 12],
  ['Würzburg', 'DE', 49.7913, 9.9534, 12, ['wuerzburg']],
  // Austria
  ['Wien', 'AT', 48.2082, 16.3738, 25, ['vienna', 'wien']],
  ['Graz', 'AT', 47.0707, 15.4395, 15],
  ['Linz', 'AT', 48.3069, 14.2858, 15],
  ['Salzburg', 'AT', 47.8095, 13.055, 15],
  ['Innsbruck', 'AT', 47.2692, 11.4041, 15],
  ['Klagenfurt', 'AT', 46.6247, 14.3053, 12],
  // Switzerland
  ['Zürich', 'CH', 47.3769, 8.5417, 20, ['zurich', 'zuerich']],
  ['Genf', 'CH', 46.2044, 6.1432, 15, ['geneva', 'geneve']],
  ['Basel', 'CH', 47.5596, 7.5886, 15],
  ['Bern', 'CH', 46.948, 7.4474, 15, ['berne']],
  ['Lausanne', 'CH', 46.5197, 6.6323, 12],
  ['Luzern', 'CH', 47.0502, 8.3093, 12, ['lucerne']],
  ['St. Gallen', 'CH', 47.4245, 9.3767, 12, ['sankt gallen', 'st gallen']],
  // Netherlands / Belgium / Luxembourg
  ['Amsterdam', 'NL', 52.3676, 4.9041, 20],
  ['Rotterdam', 'NL', 51.9244, 4.4777, 18],
  ['Den Haag', 'NL', 52.0705, 4.3007, 15, ['the hague', 'haag']],
  ['Utrecht', 'NL', 52.0907, 5.1214, 15],
  ['Eindhoven', 'NL', 51.4416, 5.4697, 15],
  ['Brüssel', 'BE', 50.8503, 4.3517, 20, ['brussels', 'bruxelles', 'bruessel']],
  ['Antwerpen', 'BE', 51.2194, 4.4025, 18, ['antwerp']],
  ['Gent', 'BE', 51.0543, 3.7174, 15, ['ghent']],
  ['Lüttich', 'BE', 50.6326, 5.5797, 15, ['liege', 'luettich']],
  ['Luxemburg', 'LU', 49.6116, 6.1319, 15, ['luxembourg city', 'luxembourg']],
  // France
  ['Paris', 'FR', 48.8566, 2.3522, 25],
  ['Marseille', 'FR', 43.2965, 5.3698, 18],
  ['Lyon', 'FR', 45.764, 4.8357, 18],
  ['Toulouse', 'FR', 43.6047, 1.4442, 15],
  ['Nizza', 'FR', 43.7102, 7.262, 15, ['nice']],
  ['Straßburg', 'FR', 48.5734, 7.7521, 15, ['strasbourg', 'strassburg']],
  ['Bordeaux', 'FR', 44.8378, -0.5792, 15],
  ['Lille', 'FR', 50.6292, 3.0573, 15],
  // Italy
  ['Rom', 'IT', 41.9028, 12.4964, 25, ['rome', 'roma']],
  ['Mailand', 'IT', 45.4642, 9.19, 20, ['milan', 'milano', 'mailand']],
  ['Neapel', 'IT', 40.8518, 14.2681, 18, ['naples', 'napoli']],
  ['Turin', 'IT', 45.0703, 7.6869, 18, ['torino']],
  ['Florenz', 'IT', 43.7696, 11.2558, 15, ['florence', 'firenze']],
  ['Bologna', 'IT', 44.4949, 11.3426, 15],
  ['Venedig', 'IT', 45.4408, 12.3155, 15, ['venice', 'venezia']],
  ['Bozen', 'IT', 46.4983, 11.3548, 12, ['bolzano']],
  // Spain / Portugal
  ['Madrid', 'ES', 40.4168, -3.7038, 25],
  ['Barcelona', 'ES', 41.3851, 2.1734, 20],
  ['Valencia', 'ES', 39.4699, -0.3763, 18],
  ['Sevilla', 'ES', 37.3891, -5.9845, 15, ['seville']],
  ['Málaga', 'ES', 36.7213, -4.4214, 15, ['malaga']],
  ['Palma', 'ES', 39.5696, 2.6502, 15, ['palma de mallorca']],
  ['Lissabon', 'PT', 38.7223, -9.1393, 20, ['lisbon', 'lisboa', 'lissabon']],
  ['Porto', 'PT', 41.1579, -8.6291, 15],
  // Poland / Czechia
  ['Warschau', 'PL', 52.2297, 21.0122, 22, ['warsaw', 'warszawa', 'warschau']],
  ['Krakau', 'PL', 50.0647, 19.945, 18, ['krakow', 'cracow', 'krakau']],
  ['Danzig', 'PL', 54.352, 18.6466, 18, ['gdansk', 'danzig']],
  ['Breslau', 'PL', 51.1079, 17.0385, 18, ['wroclaw', 'breslau']],
  ['Posen', 'PL', 52.4064, 16.9252, 15, ['poznan', 'posen']],
  ['Prag', 'CZ', 50.0755, 14.4378, 20, ['prague', 'praha', 'prag']],
  ['Brünn', 'CZ', 49.1951, 16.6068, 15, ['brno', 'bruenn']],
  // Nordics
  ['Kopenhagen', 'DK', 55.6761, 12.5683, 20, ['copenhagen', 'kobenhavn', 'kopenhagen']],
  ['Aarhus', 'DK', 56.1629, 10.2039, 15],
  ['Stockholm', 'SE', 59.3293, 18.0686, 20],
  ['Göteborg', 'SE', 57.7089, 11.9746, 18, ['gothenburg', 'goeteborg']],
  ['Malmö', 'SE', 55.605, 13.0038, 15, ['malmo', 'malmoe']],
  ['Oslo', 'NO', 59.9139, 10.7522, 20],
  ['Bergen', 'NO', 60.3913, 5.3221, 15],
  ['Helsinki', 'FI', 60.1699, 24.9384, 20],
  ['Tampere', 'FI', 61.4978, 23.761, 15],
  // UK / Ireland
  ['London', 'GB', 51.5074, -0.1278, 30],
  ['Manchester', 'GB', 53.4808, -2.2426, 20],
  ['Birmingham', 'GB', 52.4862, -1.8904, 20],
  ['Glasgow', 'GB', 55.8642, -4.2518, 18],
  ['Edinburgh', 'GB', 55.9533, -3.1883, 15],
  ['Liverpool', 'GB', 53.4084, -2.9916, 15],
  ['Bristol', 'GB', 51.4545, -2.5879, 15],
  ['Dublin', 'IE', 53.3498, -6.2603, 20],
  ['Cork', 'IE', 51.8985, -8.4756, 12],
  // North America
  ['New York', 'US', 40.7128, -74.006, 30, ['nyc', 'new york city']],
  ['Los Angeles', 'US', 34.0522, -118.2437, 30, ['la']],
  ['Chicago', 'US', 41.8781, -87.6298, 25],
  ['Houston', 'US', 29.7604, -95.3698, 25],
  ['San Francisco', 'US', 37.7749, -122.4194, 20, ['sf']],
  ['Seattle', 'US', 47.6062, -122.3321, 20],
  ['Miami', 'US', 25.7617, -80.1918, 20],
  ['Boston', 'US', 42.3601, -71.0589, 20],
  ['Toronto', 'CA', 43.6532, -79.3832, 25],
  ['Vancouver', 'CA', 49.2827, -123.1207, 20],
  ['Montreal', 'CA', 45.5019, -73.5674, 20, ['montréal']],
];

const buildAliases = (...terms) =>
  Array.from(
    new Set(
      terms
        .flat()
        .map(normalizeTerm)
        .filter(Boolean)
    )
  );

export const COUNTRIES = COUNTRY_DATA.map(
  ([code, name, nativeName, swLat, swLng, neLat, neLng, aliases]) => ({
    type: 'country',
    id: code.toLowerCase(),
    code,
    name: nativeName,
    nameEn: name,
    bounds: { ne: { lat: neLat, lng: neLng }, sw: { lat: swLat, lng: swLng } },
    aliases: buildAliases([code, name, nativeName], aliases),
  })
);

/**
 * Derive a bounding box around a center point.
 *
 * @param {Object} center {lat, lng}
 * @param {Number} radiusKm radius in kilometers, clamped to [1, 500]
 * @returns {Object} {ne: {lat, lng}, sw: {lat, lng}}
 */
export const boundsFromCenter = (center, radiusKm) => {
  const { lat, lng } = center;
  const radius = Math.min(
    Math.max(Number(radiusKm) || MIN_RADIUS_KM, MIN_RADIUS_KM),
    MAX_RADIUS_KM
  );
  const latDelta = radius / EARTH_KM_PER_DEGREE_LAT;
  // Longitude degrees get shorter towards the poles. Guard against cos(lat) ~ 0.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lngDelta = radius / (EARTH_KM_PER_DEGREE_LAT * cosLat);

  const clampLat = value => Math.min(Math.max(value, -90), 90);
  const clampLng = value => Math.min(Math.max(value, -180), 180);

  return {
    ne: { lat: clampLat(lat + latDelta), lng: clampLng(lng + lngDelta) },
    sw: { lat: clampLat(lat - latDelta), lng: clampLng(lng - lngDelta) },
  };
};

export const CITIES = CITY_DATA.map(([name, countryCode, lat, lng, radiusKm, aliases]) => {
  const country = COUNTRIES.find(c => c.code === countryCode);
  return {
    type: 'city',
    id: `${countryCode.toLowerCase()}-${normalizeTerm(name).replace(/ /g, '-')}`,
    name,
    countryCode,
    countryName: country?.name,
    center: { lat, lng },
    defaultRadiusKm: radiusKm,
    bounds: boundsFromCenter({ lat, lng }, radiusKm),
    aliases: buildAliases([name], aliases),
  };
});

const CITIES_BY_ALIAS = CITIES.reduce((map, city) => {
  city.aliases.forEach(alias => {
    const existing = map.get(alias) || [];
    map.set(alias, [...existing, city]);
  });
  return map;
}, new Map());

const COUNTRIES_BY_ALIAS = COUNTRIES.reduce((map, country) => {
  country.aliases.forEach(alias => map.set(alias, country));
  return map;
}, new Map());

/**
 * Look up a country by any of its known names ("Deutschland", "Germany", "DE").
 *
 * @param {String} term
 * @returns {Object|null} country entry
 */
export const findCountry = term => COUNTRIES_BY_ALIAS.get(normalizeTerm(term)) || null;

/**
 * Look up cities by name. A name can exist in several countries, so this returns all matches.
 *
 * @param {String} term
 * @param {String} [countryCode] restrict the result to one country
 * @returns {Array<Object>} city entries
 */
export const findCities = (term, countryCode) => {
  const matches = CITIES_BY_ALIAS.get(normalizeTerm(term)) || [];
  return countryCode ? matches.filter(city => city.countryCode === countryCode) : matches;
};

/**
 * All cities of a country, alphabetically. Used to render the city filter options.
 *
 * @param {String} countryCode
 * @returns {Array<Object>} city entries
 */
export const citiesForCountry = countryCode =>
  CITIES.filter(city => city.countryCode === countryCode).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

/**
 * The longest alias in the dictionary, in words. The parser uses this to know how many
 * consecutive words it needs to test when looking for a place name ("Frankfurt am Main").
 */
export const MAX_PLACE_NAME_WORDS = [...CITIES, ...COUNTRIES].reduce((max, entry) => {
  const longest = entry.aliases.reduce((n, alias) => Math.max(n, alias.split(' ').length), 0);
  return Math.max(max, longest);
}, 1);
