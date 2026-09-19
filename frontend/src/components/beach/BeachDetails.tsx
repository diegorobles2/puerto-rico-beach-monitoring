import type { Beach } from '../../types';
export function BeachDetails({ beach }: { beach: Beach }) { return <section><h2 className="font-semibold">Beach details</h2><p>Coordinates: {beach.latitude}, {beach.longitude}</p></section>; }
