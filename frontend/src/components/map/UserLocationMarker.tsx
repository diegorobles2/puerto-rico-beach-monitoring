import { CircleMarker, Popup } from 'react-leaflet';
export function UserLocationMarker({ position }: { position: [number, number] }) { return <CircleMarker center={position}><Popup>Your location</Popup></CircleMarker>; }
