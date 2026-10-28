import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AlertsResponse, OceanRiskResponse } from '../../types';
import { OceanRiskCard } from './OceanRiskCard';
import { AlertsCard } from './AlertsCard';

const risk: OceanRiskResponse = {
  beachId: 7, zoneId: 'PRZ001', status: 'low', summary: 'Low rip-current risk.',
  forecastPeriod: 'TODAY', source: 'NWS', sourceUrl: 'https://api.weather.gov/products/test',
  observedAt: '2026-10-27T10:00:00Z', retrievedAt: '2026-10-27T11:00:00Z', availability: 'available',
};
const empty: AlertsResponse = { beachId: 7, zoneId: 'PRZ001', status: 'no-active-alerts', source: 'NWS', retrievedAt: risk.retrievedAt, availability: 'available', alerts: [] };

describe('NWS cards', () => {
  it('shows current risk and source provenance', () => {
    render(<OceanRiskCard condition={risk} />);
    expect(screen.getByText('Current rip-current risk: low')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', risk.sourceUrl);
    expect(screen.getByText(risk.observedAt!)).toBeInTheDocument();
  });
  it.each([{ loading: true }, { error: 'Request failed' }])('keeps retained risk historical during %j', props => {
    render(<OceanRiskCard condition={risk} {...props} />);
    expect(screen.getByText('Last-known risk: low (historical)')).toBeInTheDocument();
    expect(screen.getByText('Current rip-current risk: unknown')).toBeInTheDocument();
  });
  it('labels stale risk as historical', () => {
    render(<OceanRiskCard condition={{ ...risk, availability: 'stale', status: 'unknown', lastKnownStatus: 'low' }} />);
    expect(screen.getByText(/Stale data/)).toBeInTheDocument();
    expect(screen.getByText('Last-known risk: low (historical)')).toBeInTheDocument();
  });
  it('shows unavailable risk', () => {
    render(<OceanRiskCard condition={{ ...risk, status: 'unknown', availability: 'unavailable' }} />);
    expect(screen.getByText(/Ocean risk unavailable/)).toBeInTheDocument();
  });
  it('shows a truthful current empty alert check', () => {
    render(<AlertsCard response={empty} />);
    expect(screen.getByText(/No active alerts reported/)).toBeInTheDocument();
  });
  it.each(['stale', 'unavailable'] as const)('does not claim no alerts when %s', availability => {
    render(<AlertsCard response={{ ...empty, availability, status: 'unknown', alerts: availability === 'unavailable' ? null : [] }} />);
    expect(screen.queryByText(/No active alerts reported/)).not.toBeInTheDocument();
    expect(screen.getByText(/Current alerts are unknown/)).toBeInTheDocument();
  });
  it('shows alert content and preserves it during a failed refresh', () => {
    render(<AlertsCard error="Request failed" response={{ ...empty, status: 'active-alerts', alerts: [{
      id: 'a', title: 'High Surf Advisory', description: 'Hazardous surf.', instruction: 'Avoid swimming.',
      severity: 'Moderate', urgency: 'Expected', certainty: 'Likely', effectiveAt: risk.observedAt!,
      expiresAt: '2026-10-28T10:00:00Z', observedAt: risk.observedAt, retrievedAt: risk.retrievedAt!, sourceUrl: 'https://api.weather.gov/alerts/a',
    }] }} />);
    expect(screen.getByRole('heading', { name: 'High Surf Advisory' })).toBeInTheDocument();
    expect(screen.getByText(/Last-known alerts/)).toBeInTheDocument();
    expect(screen.getByText(/Recommended action/)).toHaveTextContent('Avoid swimming.');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://api.weather.gov/alerts/a');
  });
});
