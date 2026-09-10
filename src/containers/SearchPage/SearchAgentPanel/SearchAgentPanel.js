import React, { useMemo, useState } from 'react';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { isMainSearchTypeKeywords, isOriginInUse } from '../../../util/search';
import {
  AGENT_STATUS_BLOCKED,
  AGENT_STATUS_EMPTY,
  buildSearchParams,
  citiesForCountry,
  COUNTRIES,
  getIntentSummary,
  MAX_QUERY_LENGTH,
  RISK_CAUTION,
  runSearchAgent,
  withLocationOverride,
} from '../../../util/searchAgent';

import css from './SearchAgentPanel.module.css';

const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 200];

/**
 * Read the agent options out of the app configuration, so the agent only ever produces
 * parameters for filters this marketplace actually has.
 *
 * @param {Object} config app configuration
 * @returns {Object} options for `runSearchAgent` / `buildSearchParams`
 */
export const agentOptionsFromConfig = config => {
  const defaultFilters = config?.search?.defaultFilters || [];
  const priceFilter = defaultFilters.find(f => f.schemaType === 'price');
  const hasKeywordsFilter = defaultFilters.some(f => f.key === 'keywords');

  return {
    currency: config?.currency,
    keywordsEnabled: hasKeywordsFilter || isMainSearchTypeKeywords(config || {}),
    originInUse: isOriginInUse(config || {}),
    priceFilterEnabled: !!priceFilter,
    priceRange: { min: priceFilter?.min ?? 0, max: priceFilter?.max ?? 1000 },
    sortEnabled: config?.search?.sortConfig?.active !== false,
    listingFieldsConfig: config?.listing?.listingFields || [],
  };
};

// Sort keys as the Marketplace API expects them, mapped to their message id.
const SORT_LABELS = {
  createdAt: 'newest',
  '-createdAt': 'oldest',
  '-price': 'lowestPrice',
  price: 'highestPrice',
};

const SummaryChips = props => {
  const { summary, intl } = props;
  if (summary.length === 0) {
    return null;
  }
  return (
    <ul className={css.chips} data-testid="search-agent-summary">
      {summary.map(chip => {
        const { min, max, currency, condition, sort } = chip.values;
        const formatPrice = value =>
          currency
            ? intl.formatNumber(value, { style: 'currency', currency, maximumFractionDigits: 0 })
            : `${value}`;
        const sortLabelKey = SORT_LABELS[sort];
        const values = {
          ...chip.values,
          ...(min != null ? { min: formatPrice(min) } : {}),
          ...(max != null ? { max: formatPrice(max) } : {}),
          ...(condition
            ? { condition: intl.formatMessage({ id: `SearchAgent.condition.${condition}` }) }
            : {}),
          ...(sortLabelKey
            ? { sort: intl.formatMessage({ id: `SearchAgent.sort.${sortLabelKey}` }) }
            : {}),
        };
        return (
          <li key={chip.type} className={css.chip}>
            <FormattedMessage id={`SearchAgent.chip.${chip.type}`} values={values} />
          </li>
        );
      })}
    </ul>
  );
};

/**
 * SearchAgentPanel: a search agent for the SearchPage.
 *
 * The user describes what they are looking for in one sentence ("Handy iPhone 13 in Berlin
 * unter 300 Euro"). The agent parses that locally into keywords, a search area, a price range
 * and a sort order, shows what it understood, and applies it as normal SearchPage filters.
 *
 * Country and city stay editable as explicit dropdowns: the sentence is a shortcut, not the
 * only way in. A safety layer stops searches that would put the user at risk and shows tips
 * for the ones that are merely risky.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {Object} props.config - App configuration
 * @param {string} [props.initialQuery] - Query to prefill the input with
 * @param {Function} props.onSubmit - Called with the derived SearchPage query parameters
 * @returns {JSX.Element} search agent panel
 */
const SearchAgentPanel = props => {
  const { className, rootClassName, config, initialQuery = '', onSubmit } = props;
  const intl = useIntl();

  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  // Explicit choices from the dropdowns. `undefined` means "whatever the sentence said".
  const [override, setOverride] = useState({});

  const options = useMemo(() => agentOptionsFromConfig(config), [config]);
  const result = useMemo(() => runSearchAgent(query, options), [query, options]);

  const intent = result.intent ? withLocationOverride(result.intent, override) : null;
  const searchParams = intent ? buildSearchParams(intent, options) : {};
  const summary = intent ? getIntentSummary(intent) : [];

  const selectedCountryCode = intent?.country?.code || '';
  const selectedCityId = intent?.city?.id || '';
  const cityOptions = selectedCountryCode ? citiesForCountry(selectedCountryCode) : [];

  const isBlocked = result.status === AGENT_STATUS_BLOCKED;
  const hasNothingToSearch = result.status === AGENT_STATUS_EMPTY;
  const isCaution = result.safety.level === RISK_CAUTION;
  const hasAmbiguousCity = (intent?.cityCandidates || []).length > 0;

  const handleSubmit = e => {
    e.preventDefault();
    if (isBlocked || hasNothingToSearch) {
      return;
    }
    onSubmit(searchParams);
  };

  const handleCountryChange = e => {
    const value = e.target.value;
    // Changing the country clears a city that no longer fits it.
    setOverride({ ...override, countryCode: value || null, cityId: null });
  };

  const handleCityChange = e => {
    const value = e.target.value;
    const city = cityOptions.find(c => c.id === value);
    setOverride({
      ...override,
      cityId: value || null,
      ...(city ? { countryCode: city.countryCode } : {}),
    });
  };

  const handleRadiusChange = e => {
    const value = e.target.value;
    setOverride({ ...override, radiusKm: value ? Number.parseInt(value, 10) : null });
  };

  const classes = classNames(rootClassName || css.root, className);

  return (
    <section className={classes}>
      <form className={css.form} onSubmit={handleSubmit}>
        <label className={css.label} htmlFor="search-agent-query">
          <FormattedMessage id="SearchAgent.label" />
        </label>
        <div className={css.inputRow}>
          <input
            id="search-agent-query"
            data-testid="search-agent-query"
            className={css.input}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={intl.formatMessage({ id: 'SearchAgent.placeholder' })}
            autoComplete="off"
          />
          <button
            className={css.submitButton}
            type="submit"
            disabled={isBlocked || hasNothingToSearch}
          >
            <FormattedMessage id="SearchAgent.submit" />
          </button>
        </div>
        <button
          className={css.toggleFilters}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="search-agent-filters"
        >
          <FormattedMessage id={isOpen ? 'SearchAgent.hideFilters' : 'SearchAgent.showFilters'} />
        </button>

        <div
          id="search-agent-filters"
          className={classNames(css.filters, { [css.filtersHidden]: !isOpen })}
        >
          <div className={css.filter}>
            <label className={css.filterLabel} htmlFor="search-agent-country">
              <FormattedMessage id="SearchAgent.countryLabel" />
            </label>
            <select
              id="search-agent-country"
              className={css.select}
              value={selectedCountryCode}
              onChange={handleCountryChange}
            >
              <option value="">{intl.formatMessage({ id: 'SearchAgent.anyCountry' })}</option>
              {COUNTRIES.map(country => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>

          <div className={css.filter}>
            <label className={css.filterLabel} htmlFor="search-agent-city">
              <FormattedMessage id="SearchAgent.cityLabel" />
            </label>
            <select
              id="search-agent-city"
              className={css.select}
              value={selectedCityId}
              onChange={handleCityChange}
              disabled={!selectedCountryCode}
            >
              <option value="">{intl.formatMessage({ id: 'SearchAgent.wholeCountry' })}</option>
              {cityOptions.map(city => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className={css.filter}>
            <label className={css.filterLabel} htmlFor="search-agent-radius">
              <FormattedMessage id="SearchAgent.radiusLabel" />
            </label>
            <select
              id="search-agent-radius"
              className={css.select}
              value={intent?.radiusKm || ''}
              onChange={handleRadiusChange}
              disabled={!selectedCityId}
            >
              <option value="">{intl.formatMessage({ id: 'SearchAgent.defaultRadius' })}</option>
              {RADIUS_OPTIONS.map(km => (
                <option key={km} value={km}>
                  {intl.formatMessage({ id: 'SearchAgent.radiusOption' }, { radius: km })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <div className={css.feedback} aria-live="polite">
        {isBlocked ? (
          <div className={css.blocked} data-testid="search-agent-blocked">
            <p className={css.blockedTitle}>
              <FormattedMessage id="SearchAgent.blocked.title" />
            </p>
            <ul className={css.reasonList}>
              {result.safety.reasons.map(reason => (
                <li key={reason.code}>
                  <FormattedMessage id={`SearchAgent.blocked.reason.${reason.code}`} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <SummaryChips summary={summary} intl={intl} />

            {hasAmbiguousCity ? (
              <p className={css.warning}>
                <FormattedMessage
                  id="SearchAgent.warning.ambiguousCity"
                  values={{ city: intent.cityCandidates[0].name }}
                />
              </p>
            ) : null}

            {(intent?.warnings || [])
              .filter(warning => warning.code === 'cityNotInCountry')
              .map(warning => (
                <p key={warning.code} className={css.warning}>
                  <FormattedMessage
                    id="SearchAgent.warning.cityNotInCountry"
                    values={{ city: warning.city, country: warning.country }}
                  />
                </p>
              ))}

            {isCaution ? (
              <p className={css.warning} data-testid="search-agent-caution">
                <FormattedMessage id="SearchAgent.caution" />
              </p>
            ) : null}

            {result.tips.length > 0 ? (
              <ul className={css.tips}>
                {result.tips.map(tip => (
                  <li key={tip}>
                    <FormattedMessage id={`SearchAgent.tip.${tip}`} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default SearchAgentPanel;
