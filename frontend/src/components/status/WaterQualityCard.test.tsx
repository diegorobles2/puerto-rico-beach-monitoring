import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaterQualityCard } from './WaterQualityCard';

describe('WaterQualityCard', () => {
  it('renders a current water-quality status with provenance', () => {
    render(
      <WaterQualityCard
        condition={{
          status: 'safe',
          source: {
            sourceName: 'DRNA',
            observedAt: '2024-01-15T12:00:00.000Z',
            retrievedAt: '2024-01-15T12:10:00.000Z',
          },
          observation: {
            id: 'obs-123',
            beach_id: 'playa-sucia',
            sampled_at: '2024-01-15T11:50:00.000Z',
            enterococcus_value: 35,
            enterococcus_qualifier: 'low',
            temperature_celsius: 29.5,
            ph: 7.8,
            status: 'safe',
            sampling_type: 'routine',
          },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /water quality/i })).toBeInTheDocument();
    expect(screen.getAllByText(/safe/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/source/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DRNA/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/obs-123/i)).toBeInTheDocument();
    expect(screen.getByText(/35/i)).toBeInTheDocument();
    expect(screen.getByText(/29\.5\s*°C/i)).toBeInTheDocument();
    expect(screen.getByText(/7\.8/i)).toBeInTheDocument();
    expect(screen.getByText(/routine/i)).toBeInTheDocument();
  });

  it('renders an unavailable state when no data is present', () => {
    render(<WaterQualityCard condition={undefined} />);

    expect(screen.getByText(/water quality unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/no recent data available/i)).toBeInTheDocument();
  });
});
