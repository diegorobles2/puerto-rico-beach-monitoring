import { MapContainer, TileLayer } from 'react-leaflet';
export function BeachMap() {
  return <div aria-label="Beach map" className="h-80 overflow-hidden rounded-lg"><MapContainer center={[18.22, -66.59]} zoom={9} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /></MapContainer></div>;
}
