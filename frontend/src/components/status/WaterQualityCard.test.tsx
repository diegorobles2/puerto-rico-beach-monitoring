import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaterQualityCard } from './WaterQualityCard';

describe('WaterQualityCard', () => {
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
});
