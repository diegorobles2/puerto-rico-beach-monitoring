import { useEffect, useState } from 'react';
import { BeachDetails } from '../components/beach/BeachDetails';
import { OceanRiskCard } from '../components/status/OceanRiskCard';
import { WaterQualityCard } from '../components/status/WaterQualityCard';
import { getBeachConditions, getBeaches } from '../services/beachApi';
import type { Beach, WaterQualityCondition } from '../types';

export function BeachPage() {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [selectedBeachId, setSelectedBeachId] = useState<number | string>('1');
  const [beach, setBeach] = useState<Beach | null>(null);
  const [condition, setCondition] = useState<WaterQualityCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBeaches() {
      try {
        const items = await getBeaches();
        setBeaches(items);
        if (items.length > 0) {
          setSelectedBeachId(items[0].id);
          setBeach(items[0]);
        }
      } catch {
        setError('Unable to load beaches');
      }
    }

    void loadBeaches();
  }, []);

  useEffect(() => {
    if (!selectedBeachId) return;

    async function loadConditions() {
      setLoading(true);
      setError(null);

      try {
        const nextCondition = await getBeachConditions(selectedBeachId);
        setCondition(nextCondition);
      } catch {
        setError('Unable to load water-quality conditions');
        setCondition(null);
      } finally {
        setLoading(false);
      }
    }

    void loadConditions();
  }, [selectedBeachId]);

  useEffect(() => {
    if (!beaches.length) return;
    const selected = beaches.find((item) => String(item.id) === String(selectedBeachId));
    setBeach(selected ?? beaches[0]);
  }, [beaches, selectedBeachId]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Puerto Rico Beach Monitoring</h1>
        <h2 className="text-xl font-semibold text-slate-800">{beach?.name ?? 'Beach details'}</h2>
      </header>

      {beaches.length > 0 ? (
        <label className="block text-sm font-medium text-slate-700">
          Select beach
          <select
            value={String(selectedBeachId)}
            onChange={(event) => setSelectedBeachId(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {beaches.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {beach ? <BeachDetails beach={beach} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <WaterQualityCard condition={condition} loading={loading} error={error} />
        <OceanRiskCard condition={{
          risk: 'moderate',
          summary: 'Surf and currents may be active; swim with caution.',
          source: {
            sourceName: 'NWS',
            sourceUrl: 'https://www.weather.gov/',
            observedAt: condition?.observedAt ?? null,
            retrievedAt: condition?.retrievedAt ?? null,
          },
        }} />
      </div>
    </main>
  );
}
