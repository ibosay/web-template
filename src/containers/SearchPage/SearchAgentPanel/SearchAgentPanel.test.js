import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';

import SearchAgentPanel from './SearchAgentPanel';

const { screen, userEvent, within } = testingLibrary;

const config = {
  currency: 'EUR',
  search: {
    mainSearch: { searchType: 'keywords' },
    defaultFilters: [{ key: 'price', schemaType: 'price', min: 0, max: 1000 }],
    sortConfig: { active: true },
  },
  listing: { listingFields: [] },
};

const renderPanel = (props = {}) =>
  render(<SearchAgentPanel config={config} onSubmit={() => null} {...props} />);

describe('SearchAgentPanel', () => {
  it('shows what it understood and submits matching search params', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.type(
      screen.getByTestId('search-agent-query'),
      'Suche Handy iPhone 13 in Berlin unter 300 Euro'
    );

    const summary = screen.getByTestId('search-agent-summary');
    expect(within(summary).getByText('SearchAgent.chip.keywords')).toBeInTheDocument();
    expect(within(summary).getByText('SearchAgent.chip.city')).toBeInTheDocument();
    expect(within(summary).getByText('SearchAgent.chip.priceMax')).toBeInTheDocument();

    await user.click(screen.getByText('SearchAgent.submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const params = onSubmit.mock.calls[0][0];
    expect(params.keywords).toBe('Handy iPhone 13');
    expect(params.address).toBe('Berlin, Deutschland');
    expect(params.price).toBe('0,300');
    expect(params.bounds).toBeDefined();
  });

  it('fills the country and city filters from the query', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByTestId('search-agent-query'), 'Sofa in Hamburg');
    await user.click(screen.getByText('SearchAgent.showFilters'));

    expect(screen.getByLabelText('SearchAgent.countryLabel')).toHaveValue('DE');
    expect(screen.getByLabelText('SearchAgent.cityLabel')).toHaveValue('de-hamburg');
  });

  it('lets the user override the location with the dropdowns', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.type(screen.getByTestId('search-agent-query'), 'Sofa in Hamburg');
    await user.click(screen.getByText('SearchAgent.showFilters'));
    await user.selectOptions(screen.getByLabelText('SearchAgent.cityLabel'), 'de-dresden');
    await user.click(screen.getByText('SearchAgent.submit'));

    expect(onSubmit.mock.calls[0][0].address).toBe('Dresden, Deutschland');
  });

  it('clears the city when another country is selected', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.type(screen.getByTestId('search-agent-query'), 'Sofa in Hamburg');
    await user.click(screen.getByText('SearchAgent.showFilters'));
    await user.selectOptions(screen.getByLabelText('SearchAgent.countryLabel'), 'AT');
    await user.click(screen.getByText('SearchAgent.submit'));

    expect(screen.getByLabelText('SearchAgent.cityLabel')).toHaveValue('');
    expect(onSubmit.mock.calls[0][0].address).toBe('Österreich');
  });

  it('refuses a search that would put the user at risk', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.type(screen.getByTestId('search-agent-query'), 'Adresse von Max Mustermann');

    expect(screen.getByTestId('search-agent-blocked')).toBeInTheDocument();
    expect(screen.getByText('SearchAgent.blocked.reason.personSearch')).toBeInTheDocument();

    await user.click(screen.getByText('SearchAgent.submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('warns about a known scam pattern but still allows the search', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.type(screen.getByTestId('search-agent-query'), 'iPhone in Berlin gegen Vorkasse');

    expect(screen.getByTestId('search-agent-caution')).toBeInTheDocument();
    expect(screen.getByText('SearchAgent.tip.noAdvancePayment')).toBeInTheDocument();

    await user.click(screen.getByText('SearchAgent.submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit an empty query', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderPanel({ onSubmit });

    await user.click(screen.getByText('SearchAgent.submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
