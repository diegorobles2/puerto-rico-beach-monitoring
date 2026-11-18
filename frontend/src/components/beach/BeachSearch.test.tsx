import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BeachSearch, type BeachSearchProps } from './BeachSearch';

function renderSearch(props: Partial<BeachSearchProps> = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onMunicipalityChange: vi.fn(),
    onRequestLocation: vi.fn(),
    onClearLocation: vi.fn(),
  };
  render(
    <BeachSearch
      query=""
      municipality=""
      municipalities={['Aguada', 'Rincón', 'San Juan']}
      resultCount={3}
      totalCount={3}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('BeachSearch', () => {
  it('reports typed searches to the parent', () => {
    const { onQueryChange } = renderSearch();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search beaches' }), { target: { value: 'rincon' } });

    expect(onQueryChange).toHaveBeenCalledWith('rincon');
  });

  it('shows the controlled query value', () => {
    renderSearch({ query: 'pico' });

    expect(screen.getByRole('searchbox', { name: 'Search beaches' })).toHaveValue('pico');
  });

  it('lists municipalities with an all option and reports changes', () => {
    const { onMunicipalityChange } = renderSearch();
    const select = screen.getByRole('combobox', { name: 'Municipality' });

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All municipalities', 'Aguada', 'Rincón', 'San Juan']);
    fireEvent.change(select, { target: { value: 'Aguada' } });
    expect(onMunicipalityChange).toHaveBeenCalledWith('Aguada');
  });

  it('shows a result count and clears both filters', () => {
    const { onQueryChange, onMunicipalityChange } = renderSearch({ query: 'x', municipality: 'Aguada', resultCount: 0, totalCount: 3 });

    expect(screen.getByText('0 of 3 beaches')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(onMunicipalityChange).toHaveBeenCalledWith('');
  });

  it('hides clear filters when nothing is filtered', () => {
    renderSearch();

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(screen.getByText('3 beaches')).toBeInTheDocument();
  });

  it('requests location only when the button is pressed', () => {
    const { onRequestLocation } = renderSearch();

    expect(onRequestLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by nearest to me' }));
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('disables the location button while locating', () => {
    renderSearch({ locationStatus: 'locating' });

    expect(screen.getByRole('button', { name: 'Sort by nearest to me' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Finding your location');
  });

  it.each([
    ['denied', /permission was denied/i],
    ['timeout', /took too long/i],
    ['unsupported', /does not support location/i],
  ] as const)('explains the %s state and keeps the button available', (locationStatus, message) => {
    renderSearch({ locationStatus });

    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Sort by nearest to me' })).toBeEnabled();
  });

  it('offers to stop using location after success', () => {
    const { onClearLocation } = renderSearch({ locationStatus: 'success' });

    expect(screen.getByRole('status')).toHaveTextContent(/sorted by distance/i);
    fireEvent.click(screen.getByRole('button', { name: 'Stop using my location' }));
    expect(onClearLocation).toHaveBeenCalled();
  });
});
