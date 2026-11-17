import { divIcon, type LeafletEventHandlerFnMap } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { Beach } from '../../types';
import type { Coordinates } from '../../utils/distance';
import { UserLocationMarker } from './UserLocationMarker';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function beachLabel(beach: Beach, selected: boolean): string {
  return `${beach.name}${beach.municipality ? `, ${beach.municipality}` : ''}${selected ? ' (selected)' : ''}`;
}

// Leaflet markers with keyboard: true are focusable role="button" divs, but a
// div does not turn Enter or Space into a click, so the handler below does.
function markerIcon(beach: Beach, selected: boolean) {
  const size = selected ? 32 : 24;
  return divIcon({
    className: `beach-marker${selected ? ' beach-marker--selected' : ''}`,
    html: `<span class="sr-only">${escapeHtml(beachLabel(beach, selected))}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function BeachMap({
  beaches = [],
  selectedBeachId,
  onSelect,
  userLocation = null,
}: {
  beaches?: Beach[];
  selectedBeachId?: number | string | null;
  onSelect?: (beachId: number | string) => void;
  userLocation?: Coordinates | null;
}) {
  return (
    <section aria-label="Beach map" aria-describedby="beach-map-help" className="space-y-2">
      <p id="beach-map-help" className="text-sm text-slate-700">
        Select a marker with a mouse, or press Tab to reach a marker and Enter to select it. The beach list above offers the same choices.
      </p>
      <a
        href="#beach-conditions"
        className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:rounded focus:bg-white focus:px-3 focus:text-sky-800 focus:underline"
      >
        Skip map to beach conditions
      </a>
      <div className="h-64 overflow-hidden rounded-lg sm:h-80">
        <MapContainer center={[18.22, -66.59]} zoom={9} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {beaches.map((beach) => {
            const selected = String(beach.id) === String(selectedBeachId);
            const handlers: LeafletEventHandlerFnMap = {
              click: () => onSelect?.(beach.id),
              keydown: (event) => {
                const key = (event.originalEvent as KeyboardEvent).key;
                if (key !== 'Enter' && key !== ' ') return;
                event.originalEvent.preventDefault();
                onSelect?.(beach.id);
                event.target.openPopup();
              },
            };
            return (
              <Marker
                key={beach.id}
                position={[beach.latitude, beach.longitude]}
                icon={markerIcon(beach, selected)}
                keyboard
                zIndexOffset={selected ? 1000 : 0}
                eventHandlers={handlers}
              >
                <Popup>
                  {beach.name}
                  {beach.municipality ? `, ${beach.municipality}` : ''}
                </Popup>
              </Marker>
            );
          })}
          {userLocation ? <UserLocationMarker position={[userLocation.latitude, userLocation.longitude]} /> : null}
        </MapContainer>
      </div>
    </section>
  );
}
