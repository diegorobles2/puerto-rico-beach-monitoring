import { BeachMap } from '../components/map/BeachMap';
import { BeachSearch } from '../components/beach/BeachSearch';
export function HomePage() { return <main className="mx-auto max-w-5xl space-y-6 p-6"><h1 className="text-3xl font-bold">Puerto Rico Beach Monitoring</h1><p>Official beach information and local reports, with sources and freshness made clear.</p><BeachSearch /><BeachMap /></main>; }
