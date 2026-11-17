import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeachPage } from './BeachPage';
import type { WeatherResponse } from '../types';

vi.mock('../components/map/BeachMap', () => ({ BeachMap: () => <div>Map fixture</div> }));
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const forecast = (id: number): WeatherResponse => ({
  beachId: id, availability: 'available', source: 'NWS', observedAt: '2026-11-17T00:00:00Z', retrievedAt: '2026-11-17T01:00:00Z',
  sourceUrl: 'https://api.weather.gov/gridpoints/SJU/163,132/forecast',
  forecast: { name: 'Tonight', validFrom: '2026-11-17T00:00:00Z', validTo: '2026-11-17T12:00:00Z', temperature: id === 1 ? 81 : 87,
    temperatureUnit: 'F', windSpeed: '6 mph', windDirection: 'E', precipitationProbabilityPercent: 30,
    shortForecast: `Weather for beach ${id}`, detailedForecast: 'Synthetic details.' },
});
function setup(weather: (id: number) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/beaches')) return response([1, 2].map(id => ({ id, name: `Beach ${id}`, municipality: 'San Juan', latitude: 18.4, longitude: -66.1 })));
    const id = Number(/conditions\/(\d+)/.exec(url)?.[1]);
    if (url.endsWith('/weather')) return weather(id);
    if (url.endsWith('/water-quality')) return response({ availability: 'unavailable', source: 'DRNA', status: 'unknown' });
    if (url.endsWith('/ocean-risk')) return response({ availability: 'unavailable', status: 'unknown', source: 'NWS' });
    return response({ availability: 'unavailable', status: 'unknown', source: 'NWS', alerts: null });
  }));
}
beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-17T01:00:00Z')));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('BeachPage weather requests', () => {
  it('retains only the selected beach forecast when a refresh fails and recovers on retry', async () => {
    let failed = false;
    setup(async id => response(failed ? {} : forecast(id), failed ? 503 : 200));
    render(<BeachPage />);
    const card = screen.getByRole('article', { name: 'Weather' });
    await within(card).findByText('81°F');
    failed = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh NWS data' }));
    await within(card).findByText(/Unable to load weather forecast/);
    expect(within(card).getByText(/Last-known forecast \(historical\)/)).toBeInTheDocument();
    expect(within(card).getByText('81°F')).toBeInTheDocument();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Refresh NWS data' }));
    await within(card).findByText('81°F');
    await screen.findByText('Tonight: Weather for beach 1');
    await waitFor(() => expect(within(card).queryByText(/Unable to load weather forecast/)).not.toBeInTheDocument());
    expect(within(card).queryByText(/Last-known forecast/)).not.toBeInTheDocument();
  });

  it('ignores a late response for the previous beach', async () => {
    let resolveFirst!: (response: Response) => void;
    setup(id => id === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(response(forecast(id))));
    render(<BeachPage />);
    const select = await screen.findByRole('combobox', { name: 'Select beach' });
    await waitFor(() => expect(resolveFirst).toBeDefined());
    fireEvent.change(select, { target: { value: '2' } });
    await screen.findByText('87°F');
    await act(async () => { resolveFirst(response(forecast(1))); });
    expect(screen.getByText('87°F')).toBeInTheDocument();
    expect(screen.queryByText('81°F')).not.toBeInTheDocument();
  });

  it('retains client history if a restarted backend returns unavailable without history', async () => {
    let unavailable = false;
    setup(async id => response(unavailable ? { ...forecast(id), availability: 'unavailable', forecast: null,
      observedAt: null, retrievedAt: null, sourceUrl: undefined, unavailableReason: 'upstream-error' } : forecast(id)));
    render(<BeachPage />);
    const card = screen.getByRole('article', { name: 'Weather' });
    await within(card).findByText('81°F');
    unavailable = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh NWS data' }));
    await waitFor(() => expect(card).toHaveAttribute('aria-busy', 'false'));
    expect(within(card).getByText(/Last-known forecast \(historical\)/)).toBeInTheDocument();
    expect(within(card).getByText('81°F')).toBeInTheDocument();
  });
});
