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
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /water quality/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Suitable/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/DRNA/i)).toBeInTheDocument();
    expect(screen.getAllByText('2026-10-04').length).toBeGreaterThan(0);
    expect(screen.getByText(/Source/i)).toBeInTheDocument();
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
});
