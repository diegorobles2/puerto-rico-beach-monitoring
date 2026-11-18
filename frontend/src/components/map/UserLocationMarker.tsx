import { CircleMarker, Popup } from 'react-leaflet';
export function UserLocationMarker({ position }: { position: [number, number] }) { return <CircleMarker center={position} radius={6} pathOptions={{ color: '#7c3aed', fillOpacity: 0.8 }}><Popup>Your location</Popup></CircleMarker>; }
