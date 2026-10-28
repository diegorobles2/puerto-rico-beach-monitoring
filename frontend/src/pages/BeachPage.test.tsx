import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaterQualityCondition } from '../types';
import { BeachPage } from './BeachPage';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => <div />,
  CircleMarker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const PICO_DE_PIEDRA = { id: 7, name: 'Pico de Piedra', municipality: 'Aguada', latitude: 18.3843639, longitude: -67.2129889 };
const SOURCE_URL = 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf';

// Response body from GET /conditions/7/water-quality for the RW-22 fixture record.
const ADVISORY: WaterQualityCondition = {
  status: 'advisory',
  source: 'DRNA',
  sourceUrl: SOURCE_URL,
  observedAt: '2026-09-21',
  retrievedAt: '2026-10-07T12:00:00.000Z',
  availability: 'available',
  enterococcusValue: 231,
  enterococcusQualifier: null,
  samplingType: 'routine',
  temperatureCelsius: 29,
  ph: 8.19,
};

const UNAVAILABLE: WaterQualityCondition = {
  status: 'unknown',
  source: 'DRNA',
  observedAt: null,
  retrievedAt: null,
  availability: 'unavailable',
};

function mockApi(waterQuality: { status: number; body?: unknown }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/beaches')) return new Response(JSON.stringify([PICO_DE_PIEDRA]));
    if (url.endsWith('/conditions/7/water-quality')) {
      return new Response(JSON.stringify(waterQuality.body ?? {}), { status: waterQuality.status });
    }
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function waterQualityCard() {
  const heading = await screen.findByRole('heading', { name: 'Water quality' });
  return heading.closest('article') as HTMLElement;
}

describe('BeachPage water quality', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state before the backend responds', async () => {
    mockApi({ status: 200, body: ADVISORY });
    render(<BeachPage />);

    expect(within(await waterQualityCard()).getByText(/Loading water-quality status/i)).toBeInTheDocument();
    await screen.findByText('Advisory');
  });

  it('renders status, source, and timestamps from the backend response', async () => {
    const fetchMock = mockApi({ status: 200, body: ADVISORY });
    render(<BeachPage />);

    await screen.findByText('Advisory');
    const card = await waterQualityCard();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/conditions\/7\/water-quality$/), expect.anything());
    expect(within(card).getByText(/under advisory conditions/i)).toBeInTheDocument();
    expect(within(card).getByText('DRNA')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /read report/i })).toHaveAttribute('href', SOURCE_URL);
    expect(within(card).getByText('Observed').nextElementSibling).toHaveTextContent('2026-09-21');
    expect(within(card).getByText('Retrieved').nextElementSibling).toHaveTextContent(/Oct 7, 2026/);
    expect(within(card).getByText('231 colonies/100 mL')).toBeInTheDocument();
  });

  it('keeps ocean risk out of the water-quality card', async () => {
    mockApi({ status: 200, body: ADVISORY });
    render(<BeachPage />);

    await screen.findByText('Advisory');
    const card = await waterQualityCard();

    expect(card).not.toHaveTextContent(/risk|rip current|surf/i);
    expect(screen.getByRole('heading', { name: 'Ocean risk' }).closest('article')).not.toBe(card);
  });

  it('renders the unavailable state without implying the water is safe', async () => {
    mockApi({ status: 200, body: UNAVAILABLE });
    render(<BeachPage />);

    await screen.findByText(/No recent water-quality data available/i);
    const card = await waterQualityCard();

    expect(within(card).getByText('Water quality unavailable')).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/safe|suitable/i);
  });

  it('renders an error state when the backend request fails', async () => {
    mockApi({ status: 500 });
    render(<BeachPage />);

    await screen.findByText('Unable to load water-quality conditions');
    const card = await waterQualityCard();

    expect(card).not.toHaveTextContent(/safe|suitable/i);
  });

  it('loads NWS resources independently and retains the selected beach data after refresh failure', async () => {
    let failed = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/beaches')) return new Response(JSON.stringify([PICO_DE_PIEDRA]));
      if (url.endsWith('/water-quality')) return new Response(JSON.stringify(ADVISORY));
      if (failed) return new Response('', { status: 503 });
      if (url.endsWith('/ocean-risk')) return new Response(JSON.stringify({
        beachId: 7, zoneId: 'PRZ001', status: 'high', summary: 'Dangerous rip currents.',
        forecastPeriod: 'TODAY', source: 'NWS', observedAt: null, retrievedAt: null, availability: 'available',
      }));
      return new Response(JSON.stringify({
        beachId: 7, zoneId: 'PRZ001', status: 'no-active-alerts', source: 'NWS',
        retrievedAt: null, availability: 'available', alerts: [],
      }));
    }));
    render(<BeachPage />);
    await screen.findByText('Current rip-current risk: high');
    await screen.findByText(/No active alerts reported/);
    failed = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh NWS data' }));
    expect(screen.getByText('Last-known risk: high (historical)')).toBeInTheDocument();
    await screen.findByText(/Unable to load ocean risk/);
    await screen.findByText(/Unable to load alerts/);
    expect(screen.getByText('Dangerous rip currents.')).toBeInTheDocument();
    expect(screen.queryByText(/No active alerts reported/)).not.toBeInTheDocument();
  });

  it('does not display another beach risk while the new selection loads', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/beaches')) return new Response(JSON.stringify([PICO_DE_PIEDRA, { ...PICO_DE_PIEDRA, id: 8, name: 'Other beach' }]));
      if (url.includes('/conditions/8/')) return new Promise<Response>(() => {});
      if (url.endsWith('/water-quality')) return new Response(JSON.stringify(ADVISORY));
      if (url.endsWith('/ocean-risk')) return new Response(JSON.stringify({
        beachId: 7, status: 'high', summary: 'First beach forecast', availability: 'available',
      }));
      return new Response('', { status: 503 });
    }));
    render(<BeachPage />);
    await screen.findByText('Current rip-current risk: high');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '8' } });
    expect(screen.queryByText('First beach forecast')).not.toBeInTheDocument();
    expect(screen.getByText('Loading ocean risk...')).toBeInTheDocument();
  });
});
