import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Beach, WaterQualityCondition } from '../types';
import { BeachPage } from './BeachPage';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => <div />,
  CircleMarker: ({ children }: { children: React.ReactNode }) => <div data-testid="map-marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const BEACHES: Beach[] = [
  { id: '5', name: 'Pico de Piedra', municipality: 'Aguada', latitude: 18.3843639, longitude: -67.2129889 },
  { id: '12', name: 'Balneario de Rincón', municipality: 'Rincón', latitude: 18.3401, longitude: -67.2516 },
  { id: '30', name: 'Balneario El Escambrón', municipality: 'San Juan', latitude: 18.4663, longitude: -66.0868 },
];

function waterQuality(status: WaterQualityCondition['status']): WaterQualityCondition {
  return { status, source: 'DRNA', observedAt: new Date().toISOString().slice(0, 10), retrievedAt: new Date().toISOString(), availability: 'available' };
}

function mockApi() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/beaches')) return new Response(JSON.stringify(BEACHES));
    if (url.endsWith('/conditions/30/water-quality')) return new Response(JSON.stringify(waterQuality('advisory')));
    if (url.endsWith('/water-quality')) return new Response(JSON.stringify(waterQuality('suitable')));
    return new Response('', { status: 503 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubGeolocation(respond: (success: PositionCallback, failure: PositionErrorCallback) => void) {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: vi.fn((success: PositionCallback, failure: PositionErrorCallback) => respond(success, failure)) },
  });
}

const beachSelect = () => screen.getByRole('combobox', { name: 'Select beach' }) as HTMLSelectElement;
const optionLabels = () => within(beachSelect()).getAllByRole('option').map((o) => o.textContent);
const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search beaches' }), { target: { value } });

async function renderPage() {
  render(<BeachPage />);
  await screen.findByRole('combobox', { name: 'Select beach' });
}

describe('BeachPage search and filters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists every supported beach with its municipality by default', async () => {
    mockApi();
    await renderPage();

    expect(optionLabels()).toEqual([
      'Pico de Piedra (Aguada)',
      'Balneario de Rincón (Rincón)',
      'Balneario El Escambrón (San Juan)',
    ]);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(3);
  });

  it('filters the selector and the map by name or municipality', async () => {
    mockApi();
    await renderPage();

    search('rincon');

    expect(optionLabels()).toEqual(['Balneario de Rincón (Rincón)']);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(1);
    expect(screen.getByText('1 of 3 beaches')).toBeInTheDocument();
  });

  it('filters by municipality', async () => {
    mockApi();
    await renderPage();

    fireEvent.change(screen.getByRole('combobox', { name: 'Municipality' }), { target: { value: 'San Juan' } });

    expect(optionLabels()).toEqual(['Balneario El Escambrón (San Juan)']);
  });

  it('shows an empty-results message and restores every beach when cleared', async () => {
    mockApi();
    await renderPage();

    search('culebra');

    expect(screen.getByText(/No beaches match your search/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Select beach' })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('map-marker')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(optionLabels()).toHaveLength(3);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(3);
  });

  it('keeps the selected beach when it still matches the filter', async () => {
    mockApi();
    await renderPage();
    fireEvent.change(beachSelect(), { target: { value: '12' } });

    search('balneario');

    expect(beachSelect()).toHaveValue('12');
  });

  it('moves the selection to the first match when the selected beach is filtered out', async () => {
    mockApi();
    await renderPage();
    expect(beachSelect()).toHaveValue('5');

    search('san juan');

    await waitFor(() => expect(beachSelect()).toHaveValue('30'));
    expect(screen.getByRole('heading', { level: 2, name: 'Balneario El Escambrón' })).toBeInTheDocument();
  });

  it('loads the conditions of the newly selected beach', async () => {
    const fetchMock = mockApi();
    await renderPage();
    await screen.findByText('Suitable');

    fireEvent.change(beachSelect(), { target: { value: '30' } });

    await screen.findByText('Advisory');
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/conditions\/30\/water-quality$/),
      expect.stringMatching(/\/conditions\/30\/ocean-risk$/),
      expect.stringMatching(/\/conditions\/30\/alerts$/),
    ]));
  });
});

describe('BeachPage geolocation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not ask for location until the button is pressed', async () => {
    mockApi();
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    await renderPage();

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('orders beaches by distance and shows the distance after location succeeds', async () => {
    mockApi();
    // Old San Juan: Escambrón is closest, then the west-coast beaches.
    stubGeolocation((success) => success({ coords: { latitude: 18.4655, longitude: -66.1057 } } as GeolocationPosition));
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sort by nearest to me' }));

    await waitFor(() => expect(optionLabels()[0]).toMatch(/^Balneario El Escambrón \(San Juan\) · \d+(\.\d)? km$/));
    expect(optionLabels().map((label) => label?.split(' (')[0])).toEqual([
      'Balneario El Escambrón',
      'Pico de Piedra',
      'Balneario de Rincón',
    ]);
    // The original selection is preserved; its distance appears in the details.
    expect(beachSelect()).toHaveValue('5');
    expect(screen.getByText('Distance from you:').nextElementSibling).toHaveTextContent(/\d+ km/);
  });

  it.each([
    ['denied', 1, /permission was denied/i],
    ['timeout', 3, /took too long/i],
  ])('keeps the default list usable when location is %s', async (_, code, message) => {
    mockApi();
    stubGeolocation((_success, failure) => failure({ code } as GeolocationPositionError));
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sort by nearest to me' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(optionLabels()).toHaveLength(3);
    expect(screen.queryByText('Distance from you:')).not.toBeInTheDocument();
  });

  it('keeps the default list usable when the browser has no geolocation', async () => {
    mockApi();
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sort by nearest to me' }));

    expect(await screen.findByText(/does not support location/i)).toBeInTheDocument();
    expect(optionLabels()).toHaveLength(3);
  });
});
