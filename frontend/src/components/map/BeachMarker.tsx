import { Marker, Popup } from 'react-leaflet';
import type { Beach } from '../../types';
export function BeachMarker({ beach }: { beach: Beach }) { return <Marker position={[beach.latitude, beach.longitude]}><Popup>{beach.name}</Popup></Marker>; }
