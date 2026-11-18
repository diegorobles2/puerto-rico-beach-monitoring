import type { GeolocationStatus } from '../../hooks/useGeolocation';

const LOCATION_MESSAGES: Partial<Record<GeolocationStatus, string>> = {
  locating: 'Finding your location...',
  success: 'Beaches are sorted by distance from you. Your location is not saved.',
  denied: 'Location permission was denied. You can still search or pick a beach from the list or map.',
  timeout: 'Finding your location took too long. You can try again or search instead.',
  unavailable: 'Your location could not be determined. You can still search or pick a beach.',
  unsupported: 'This browser does not support location. You can still search or pick a beach.',
};

export interface BeachSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  municipality: string;
  municipalities: string[];
  onMunicipalityChange: (municipality: string) => void;
  resultCount: number;
  totalCount: number;
  locationStatus?: GeolocationStatus;
  onRequestLocation?: () => void;
  onClearLocation?: () => void;
}

export function BeachSearch({
  query,
  onQueryChange,
  municipality,
  municipalities,
  onMunicipalityChange,
  resultCount,
  totalCount,
  locationStatus = 'idle',
  onRequestLocation,
  onClearLocation,
}: BeachSearchProps) {
  const filtered = query.trim() !== '' || municipality !== '';
  const locationMessage = LOCATION_MESSAGES[locationStatus];

  return (
    <section aria-label="Find a beach" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Search beaches
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Beach or municipality"
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Municipality
          <select
            value={municipality}
            onChange={(event) => onMunicipalityChange(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All municipalities</option>
            {municipalities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {onRequestLocation ? (
          locationStatus === 'success' && onClearLocation ? (
            <button type="button" onClick={onClearLocation} className="rounded border border-slate-400 px-3 py-1.5">
              Stop using my location
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={locationStatus === 'locating'}
              className="rounded border border-slate-400 px-3 py-1.5 disabled:opacity-60"
            >
              Sort by nearest to me
            </button>
          )
        ) : null}
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              onQueryChange('');
              onMunicipalityChange('');
            }}
            className="rounded border border-slate-300 px-3 py-1.5"
          >
            Clear filters
          </button>
        ) : null}
        <p aria-live="polite" className="text-slate-600">
          {filtered ? `${resultCount} of ${totalCount} beaches` : `${totalCount} beaches`}
        </p>
      </div>

      {locationMessage ? (
        <p role="status" className="text-sm text-slate-600">
          {locationMessage}
        </p>
      ) : null}
    </section>
  );
}
