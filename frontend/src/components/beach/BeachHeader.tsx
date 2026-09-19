import type { Beach } from '../../types';
export function BeachHeader({ beach }: { beach: Beach }) { return <header><h1 className="text-2xl font-bold">{beach.name}</h1><p>{beach.municipality}</p></header>; }
