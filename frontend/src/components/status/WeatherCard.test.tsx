import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WeatherCard } from './WeatherCard';
import type { WeatherResponse } from '../../types';

const weather: WeatherResponse = {
  beachId: 1, availability: 'available', source: 'NWS', observedAt: '2026-11-17T00:00:00Z', retrievedAt: '2026-11-17T01:00:00Z',
  sourceUrl: 'https://api.weather.gov/gridpoints/SJU/163,132/forecast',
  forecast: { name: 'Tonight', validFrom: '2026-11-17T00:00:00Z', validTo: '2026-11-17T12:00:00Z',
    temperature: 81, temperatureUnit: 'F', windSpeed: '6 to 9 mph', windDirection: 'E',
    precipitationProbabilityPercent: null, shortForecast: 'Synthetic showers', detailedForecast: 'Synthetic weather details.' },
};

describe('WeatherCard', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-17T01:00:00Z')));
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('labels forecasts and units, preserving unknown probability and provenance', () => {
    render(<WeatherCard condition={weather} />);
    expect(screen.getByText('81°F')).toBeInTheDocument();
    expect(screen.getByText('6 to 9 mph E')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.getByText(/not live observations/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read NWS source' })).toHaveAttribute('href', weather.sourceUrl);
    expect(screen.getAllByText('2026-11-17T00:00:00Z', { selector: 'time' })).toHaveLength(2);
  });

  it.each(['stale', 'failed-refresh', 'loading', 'old-issuance', 'expired-period'])(
    'retains historical values without currentness claims: %s', state => {
      const condition = structuredClone(weather);
      if (state === 'stale') condition.availability = 'stale';
      if (state === 'old-issuance') condition.observedAt = '2026-11-15T00:00:00Z';
      if (state === 'expired-period') condition.forecast!.validTo = '2026-11-17T01:00:00Z';
      render(<WeatherCard condition={condition} loading={state === 'loading'} error={state === 'failed-refresh' ? 'Unable to load weather forecast' : undefined} />);
      expect(screen.getByText(/Last-known forecast \(historical\)/)).toBeInTheDocument();
      expect(screen.getByText('81°F')).toBeInTheDocument();
    },
  );

  it('shows unsupported coverage without invented values', () => {
    render(<WeatherCard condition={{ ...weather, availability: 'unavailable', forecast: null, unavailableReason: 'unsupported-location', observedAt: null, retrievedAt: null, sourceUrl: undefined }} />);
    expect(screen.getByText(/no supported forecast mapping/)).toBeInTheDocument();
    expect(screen.queryByText('81°F')).not.toBeInTheDocument();
  });

  it('renders initial loading/failure without last-known values', () => {
    const { rerender } = render(<WeatherCard loading />);
    expect(screen.getByText('Loading weather forecast...')).toBeInTheDocument();
    rerender(<WeatherCard error="Unable to load weather forecast" />);
    expect(screen.getByText(/Current forecast could not be verified/)).toBeInTheDocument();
    expect(screen.queryByText(/Last-known forecast/)).not.toBeInTheDocument();
  });

  it('preserves Celsius and a genuine zero precipitation probability', () => {
    render(<WeatherCard condition={{ ...weather, forecast: { ...weather.forecast!, temperature: 27, temperatureUnit: 'C', precipitationProbabilityPercent: 0 } }} />);
    expect(screen.getByText('27°C')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('automatically marks an idle card historical when its freshness deadline passes', () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T01:00:00Z'));
    render(<WeatherCard condition={weather} />);
    expect(screen.queryByText(/Last-known forecast/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1); });
    expect(screen.getByText(/Last-known forecast \(historical\)/)).toBeInTheDocument();
  });
});
