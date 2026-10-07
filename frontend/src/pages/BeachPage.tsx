import { useEffect, useState } from 'react';
import { BeachDetails } from '../components/beach/BeachDetails';
import { WaterQualityCard } from '../components/status/WaterQualityCard';
import { OceanRiskCard } from '../components/status/OceanRiskCard';
import type { Beach, BeachConditionsResponse } from '../types';
import { getBeachConditions, getBeaches } from '../services/beachApi';

export function BeachPage({ beachId = '5' }: { beachId?: string }) {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [selectedBeachId, setSelectedBeachId] = useState<string>(beachId);
  const [beach, setBeach] = useState<Beach | null>(null);
  const [conditions, setConditions] = useState<BeachConditionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBeachId(beachId);
  }, [beachId]);

  useEffect(() => {
    let active = true;

    async function loadBeaches() {
      try {
        const allBeaches = await getBeaches();
        if (!active) return;

        setBeaches(allBeaches);

        const fallbackBeachId = allBeaches.find((item) => item.id === selectedBeachId)?.id ?? allBeaches[0]?.id ?? beachId;
        if (fallbackBeachId && fallbackBeachId !== selectedBeachId) {
          setSelectedBeachId(fallbackBeachId);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load beaches');
      }
    }

    void loadBeaches();

    return () => {
      active = false;
    };
  }, [beachId, selectedBeachId]);

  useEffect(() => {
    if (!selectedBeachId) return;

    let active = true;

    async function loadBeach() {
      try {
        setLoading(true);
        setError(null);

        const nextBeach = beaches.find((item) => item.id === selectedBeachId) ?? null;
        if (!active) return;
        setBeach(nextBeach);

        const beachConditions = await getBeachConditions(selectedBeachId);
        if (!active) return;
        setConditions(beachConditions);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load beach conditions');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBeach();

    return () => {
      active = false;
    };
  }, [beaches, selectedBeachId]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Puerto Rico Beach Monitoring</p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{beach?.name ?? 'Puerto Rico Beach Monitoring'}</h1>
        <p className="text-sm text-slate-600">{beach ? 'Beach detail' : 'Loading beach details…'}</p>
      </header>

      {beaches.length > 0 ? (
        <label className="block text-sm font-medium text-slate-700">
          Select beach
          <select
            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            value={selectedBeachId}
            onChange={(event) => setSelectedBeachId(event.target.value)}
          >
            {beaches.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn’t load the current beach data. Please try again.
        </div>
      ) : null}

      {beach ? <BeachDetails beach={beach} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <WaterQualityCard
          condition={conditions?.waterQuality ?? null}
          loading={loading && !conditions}
          error={error}
          unavailable={!conditions?.waterQuality}
        />
        <OceanRiskCard condition={conditions?.oceanRisk ?? undefined} />
      </div>
    </main>
  );
}
