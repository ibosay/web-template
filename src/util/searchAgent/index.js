/**
 * Search agent.
 *
 * One entry point, `runSearchAgent`, that takes what the user typed and returns everything the
 * UI needs: the parsed intent, the SearchPage query parameters, a human-readable summary of the
 * filters that were applied, and the safety verdict.
 *
 * Design notes:
 * - Everything runs locally. The query is never sent to a third party; the only request that
 *   leaves the app is the marketplace's own listing search with the derived parameters.
 * - The agent is deterministic: the same query always produces the same parameters. That is
 *   what makes the result reproducible ("treffsicher") and reviewable.
 * - The agent only ever proposes parameters. Applying them stays a normal SearchPage
 *   navigation, so all existing filters, validation and access rules still apply.
 */

import { types as sdkTypes } from '../sdkLoader';
import { constructQueryParamName, isFilterEnabled } from '../search';
import { boundsFromCenter, CITIES, COUNTRIES } from './locations';
import { parseIntent } from './parser';
import {
  assessQuery,
  getSafetyTips,
  sanitizeQuery,
  MAX_QUERY_LENGTH,
  RISK_BLOCKED,
  RISK_CAUTION,
  RISK_OK,
} from './safety';

const { LatLng, LatLngBounds } = sdkTypes;

export {
  assessQuery,
  sanitizeQuery,
  getSafetyTips,
  MAX_QUERY_LENGTH,
  RISK_BLOCKED,
  RISK_CAUTION,
  RISK_OK,
};
export { parseIntent, parseAmount } from './parser';
export {
  boundsFromCenter,
  citiesForCountry,
  CITIES,
  COUNTRIES,
  findCities,
  findCountry,
  normalizeTerm,
} from './locations';

export const AGENT_STATUS_OK = 'ok';
export const AGENT_STATUS_EMPTY = 'empty';
export const AGENT_STATUS_BLOCKED = 'blocked';

/**
 * Build an SDK LatLngBounds from a plain {ne, sw} object.
 *
 * @param {Object} bounds {ne: {lat, lng}, sw: {lat, lng}}
 * @returns {LatLngBounds}
 */
export const toSdkBounds = bounds =>
  new LatLngBounds(
    new LatLng(bounds.ne.lat, bounds.ne.lng),
    new LatLng(bounds.sw.lat, bounds.sw.lng)
  );

/**
 * The search area for an intent: the city (optionally with a custom radius) if there is one,
 * otherwise the country, otherwise nothing.
 *
 * @param {Object} intent
 * @returns {Object|null} {label, bounds, origin, city, country}
 */
export const getSearchArea = intent => {
  const { city, country, radiusKm } = intent;

  if (city) {
    const bounds = radiusKm ? boundsFromCenter(city.center, radiusKm) : city.bounds;
    const label = city.countryName ? `${city.name}, ${city.countryName}` : city.name;
    return { label, bounds, origin: city.center, city, country: country || null };
  }
  if (country) {
    return { label: country.name, bounds: country.bounds, origin: null, city: null, country };
  }
  return null;
};

const clampPrice = (value, { min, max }) => Math.min(Math.max(Math.round(value), min), max);

/**
 * Turn a price intent into the `price` query parameter ("min,max" in major units).
 * Sharetribe's price filter always needs both ends, so an open end is filled from the
 * configured filter range.
 *
 * @param {Object} price {min, max}
 * @param {Object} range configured price filter range {min, max}
 * @returns {String|null}
 */
export const toPriceParam = (price, range) => {
  if (!price || (price.min == null && price.max == null)) {
    return null;
  }
  const bounds = { min: range?.min ?? 0, max: range?.max ?? 1000 };
  const min = clampPrice(price.min ?? bounds.min, bounds);
  const max = clampPrice(price.max ?? bounds.max, bounds);
  return min <= max ? `${min},${max}` : `${max},${min}`;
};

// How a parsed condition can be spelled in a marketplace's own listing field options.
const CONDITION_OPTION_ALIASES = {
  new: ['new', 'neu', 'brand-new', 'brandnew', 'neuwertig', 'unused', 'ovp'],
  used: ['used', 'gebraucht', 'second-hand', 'secondhand', 'pre-owned', 'preowned'],
  broken: ['broken', 'defekt', 'kaputt', 'for-parts', 'parts', 'bastler'],
};

/**
 * Map a parsed condition ("used") onto the marketplace's own condition listing field.
 *
 * The agent only adds a filter that actually exists: the marketplace must have an enum field
 * named "condition" (or "zustand") that is in use as a filter, and that field must offer an
 * option matching the parsed condition. Otherwise no condition filter is added and the word
 * simply stays in the keywords.
 *
 * @param {Array} listingFieldsConfig listing fields from the app configuration
 * @param {String} condition 'new' | 'used' | 'broken'
 * @returns {Object|null} {queryParam, value}
 */
export const getConditionFilter = (listingFieldsConfig, condition) => {
  const aliases = CONDITION_OPTION_ALIASES[condition];
  if (!aliases || !Array.isArray(listingFieldsConfig)) {
    return null;
  }
  const field = listingFieldsConfig.find(
    f =>
      ['condition', 'zustand'].includes(String(f?.key).toLowerCase()) &&
      ['enum', 'multi-enum'].includes(f?.schemaType) &&
      isFilterEnabled(f?.filterConfig || {})
  );
  const option = (field?.enumOptions || []).find(o =>
    aliases.includes(String(o?.option).toLowerCase())
  );
  return option
    ? { queryParam: constructQueryParamName(field.key, field.scope), value: option.option }
    : null;
};

/**
 * Build SearchPage query parameters from an intent.
 *
 * @param {Object} intent output of `parseIntent`
 * @param {Object} [options]
 * @param {boolean} [options.keywordsEnabled=true] marketplace has the keywords filter in use
 * @param {boolean} [options.originInUse=false] search sorts by distance and needs an origin
 * @param {boolean} [options.priceFilterEnabled=true]
 * @param {Object} [options.priceRange] configured price filter range {min, max}
 * @param {boolean} [options.sortEnabled=true]
 * @param {Array} [options.listingFieldsConfig] used to map a condition onto a real filter
 * @returns {Object} query parameters for the SearchPage URL
 */
export const buildSearchParams = (intent, options = {}) => {
  const {
    keywordsEnabled = true,
    originInUse = false,
    priceFilterEnabled = true,
    priceRange = { min: 0, max: 1000 },
    sortEnabled = true,
    listingFieldsConfig = [],
  } = options;

  const area = getSearchArea(intent);
  const priceParam = priceFilterEnabled ? toPriceParam(intent.price, priceRange) : null;
  const conditionFilter = getConditionFilter(listingFieldsConfig, intent.condition);

  return {
    ...(keywordsEnabled && intent.keywords ? { keywords: intent.keywords } : {}),
    ...(area ? { address: area.label, bounds: toSdkBounds(area.bounds) } : {}),
    ...(area && originInUse && area.origin
      ? { origin: new LatLng(area.origin.lat, area.origin.lng) }
      : {}),
    ...(priceParam ? { price: priceParam } : {}),
    ...(sortEnabled && intent.sort ? { sort: intent.sort } : {}),
    ...(conditionFilter ? { [conditionFilter.queryParam]: conditionFilter.value } : {}),
  };
};

/**
 * Replace the location of an intent with an explicit choice from the country/city filters.
 * Passing `null` for a field clears it; passing `undefined` keeps what the parser found.
 *
 * @param {Object} intent
 * @param {Object} override {countryCode, cityId, radiusKm}
 * @returns {Object} a new intent
 */
export const withLocationOverride = (intent, override = {}) => {
  const { countryCode, cityId, radiusKm } = override;

  const country =
    countryCode === undefined
      ? intent.country
      : countryCode
      ? COUNTRIES.find(c => c.code === countryCode) || null
      : null;

  const city =
    cityId === undefined
      ? // Keep the parsed city only while it still belongs to the selected country.
        !country || !intent.city || intent.city.countryCode === country.code
        ? intent.city
        : null
      : cityId
      ? CITIES.find(c => c.id === cityId) || null
      : null;

  return {
    ...intent,
    country: country || (city ? COUNTRIES.find(c => c.code === city.countryCode) || null : null),
    city,
    radiusKm: radiusKm === undefined ? intent.radiusKm : radiusKm,
    // An explicit choice resolves the ambiguity the parser could not.
    cityCandidates: cityId === undefined ? intent.cityCandidates : [],
    warnings:
      cityId === undefined && countryCode === undefined
        ? intent.warnings
        : (intent.warnings || []).filter(
            w => !['ambiguousCity', 'cityNotInCountry'].includes(w.code)
          ),
  };
};

/**
 * A short, translatable description of every filter the agent derived. The UI renders these
 * as chips, so the user can see what the agent understood before running the search.
 *
 * @param {Object} intent
 * @returns {Array<Object>} [{type, labelKey, values}]
 */
export const getIntentSummary = intent => {
  const chips = [];
  if (intent.keywords) {
    chips.push({ type: 'keywords', values: { keywords: intent.keywords } });
  }
  if (intent.country) {
    chips.push({ type: 'country', values: { country: intent.country.name } });
  }
  if (intent.city) {
    chips.push({ type: 'city', values: { city: intent.city.name } });
  }
  if (intent.radiusKm) {
    chips.push({ type: 'radius', values: { radius: intent.radiusKm } });
  }
  if (intent.price) {
    const { min, max, currency } = intent.price;
    const type = min != null && max != null ? 'priceRange' : min != null ? 'priceMin' : 'priceMax';
    chips.push({ type, values: { min, max, currency } });
  }
  if (intent.condition) {
    chips.push({ type: 'condition', values: { condition: intent.condition } });
  }
  if (intent.sort) {
    chips.push({ type: 'sort', values: { sort: intent.sort } });
  }
  return chips;
};

/**
 * Run the agent on a raw query.
 *
 * @param {String} rawQuery what the user typed
 * @param {Object} [options] see `buildSearchParams`, plus:
 * @param {String} [options.currency] marketplace currency
 * @param {String} [options.defaultCountryCode] country to assume for ambiguous city names
 * @returns {Object} {status, query, intent, searchParams, summary, safety, tips}
 *   status is 'ok' (searchParams are ready), 'empty' (nothing usable in the query) or
 *   'blocked' (the safety layer refused to run this search; searchParams is empty).
 */
export const runSearchAgent = (rawQuery, options = {}) => {
  const query = sanitizeQuery(rawQuery);
  const safety = assessQuery(query);

  if (!query) {
    return {
      status: AGENT_STATUS_EMPTY,
      query,
      intent: null,
      searchParams: {},
      summary: [],
      safety,
      tips: [],
    };
  }

  if (safety.level === RISK_BLOCKED) {
    return {
      status: AGENT_STATUS_BLOCKED,
      query,
      intent: null,
      searchParams: {},
      summary: [],
      safety,
      tips: [],
    };
  }

  const intent = parseIntent(query, options);
  const searchParams = buildSearchParams(intent, options);
  const hasUsableParams = Object.keys(searchParams).length > 0;

  return {
    status: hasUsableParams ? AGENT_STATUS_OK : AGENT_STATUS_EMPTY,
    query,
    intent,
    searchParams,
    summary: getIntentSummary(intent),
    safety,
    tips: getSafetyTips(safety),
  };
};
