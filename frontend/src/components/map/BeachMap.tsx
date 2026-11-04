import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Beach } from '../../types';
import type { Coordinates } from '../../utils/distance';
import { UserLocationMarker } from './UserLocationMarker';

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
    <div aria-label="Beach map" className="h-80 overflow-hidden rounded-lg">
      <MapContainer center={[18.22, -66.59]} zoom={9} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {beaches.map((beach) => (
          <CircleMarker
            key={beach.id}
            center={[beach.latitude, beach.longitude]}
            radius={String(beach.id) === String(selectedBeachId) ? 10 : 7}
            eventHandlers={{ click: () => onSelect?.(beach.id) }}
          >
            <Popup>
              {beach.name}
              {beach.municipality ? `, ${beach.municipality}` : ''}
            </Popup>
          </CircleMarker>
        ))}
        {userLocation ? <UserLocationMarker position={[userLocation.latitude, userLocation.longitude]} /> : null}
      </MapContainer>
    </div>
  );
}
