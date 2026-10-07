import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => <div />,
}));

describe('App', () => {
  it('renders the project heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Puerto Rico Beach Monitoring/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Beach map')).toBeInTheDocument();
  });
});
