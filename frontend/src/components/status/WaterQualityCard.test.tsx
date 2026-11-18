import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaterQualityCard } from './WaterQualityCard';

describe('WaterQualityCard', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T12:00:00Z')));
  afterEach(() => vi.restoreAllMocks());
  it('warns about an old retained sample even when it was recently retrieved', () => {
    render(<WaterQualityCard condition={{
      status: 'advisory', source: 'DRNA', observedAt: '2000-01-01',
      retrievedAt: new Date().toISOString(), availability: 'available', enterococcusValue: 231,
    }} />);
    expect(screen.getByText(/Stale data: this reading/)).toBeInTheDocument();
    expect(screen.getByText('Observed').nextElementSibling).toHaveTextContent('2000-01-01');
    expect(screen.getByText('231 colonies/100 mL')).toBeInTheDocument();
    expect(screen.queryByText(/currently suitable/i)).not.toBeInTheDocument();
  });
  it('renders the current water quality state and provenance', () => {
    render(
      <WaterQualityCard
        condition={{
          status: 'suitable',
          source: 'DRNA',
          sourceUrl: 'https://www.drna.pr.gov/',
          observedAt: '2026-10-04',
          retrievedAt: '2026-10-04T12:30:00.000Z',
          availability: 'available',
          enterococcusValue: 10,
          enterococcusQualifier: 'less-than',
          samplingType: 'routine',
          temperatureCelsius: 29.2,
          ph: 8.04,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /water quality/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Suitable/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/DRNA/i)).toBeInTheDocument();
    expect(screen.getAllByText('2026-10-04').length).toBeGreaterThan(0);
    expect(screen.getByText(/Source/i)).toBeInTheDocument();
    expect(screen.getByText('<10 colonies/100 mL')).toBeInTheDocument();
    expect(screen.getByText('29.2°C')).toBeInTheDocument();
    expect(screen.getByText('8.04')).toBeInTheDocument();
  });

  it('renders the unavailable state without implying the water is safe', () => {
    render(
      <WaterQualityCard
        condition={{
          status: 'unknown',
          source: 'DRNA',
          observedAt: null,
          retrievedAt: null,
          availability: 'unavailable',
        }}
      />,
    );

    expect(screen.getByText(/Water quality unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent water-quality data available/i)).toBeInTheDocument();
    expect(screen.queryByText(/safe/i)).not.toBeInTheDocument();
  });

  it('shows greater-than measurements clearly', () => {
    render(<WaterQualityCard condition={{
      status: 'advisory', source: 'DRNA', observedAt: '2026-07-20', retrievedAt: '2026-07-21T00:00:00Z',
      availability: 'available', enterococcusValue: 24196, enterococcusQualifier: 'greater-than',
    }} />);
    expect(screen.getByText('>24,196 colonies/100 mL')).toBeInTheDocument();
  });

  it.each(['suitable', 'advisory'] as const)('labels retained %s measurements as historical', (lastKnownStatus) => {
    render(<WaterQualityCard condition={{
      status: 'unknown', lastKnownStatus, source: 'DRNA', observedAt: '2000-01-01',
      retrievedAt: '2026-10-04T12:00:00Z', availability: 'stale', enterococcusValue: 20,
    }} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/Current water quality is unknown/)).toBeInTheDocument();
    expect(screen.getByText(/Last-known sample status:.*\(historical\)/)).toBeInTheDocument();
    expect(screen.getByText('20 colonies/100 mL')).toBeInTheDocument();
    expect(screen.queryByText(/currently suitable|under advisory conditions/i)).not.toBeInTheDocument();
  });

  it.each([null, 'invalid', '2026-02-30', '2026-10-05', '2000-01-01'])('defends against an old API claiming a suitable sample dated %s is available', (observedAt) => {
    render(<WaterQualityCard condition={{
      status: 'suitable', source: 'DRNA', observedAt, retrievedAt: '2026-10-04T12:00:00Z', availability: 'available',
    }} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/Current water quality is unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/latest sample indicates suitable|currently suitable/i)).not.toBeInTheDocument();
  });
});
