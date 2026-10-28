import { useEffect, useState } from 'react';
import { BeachDetails } from '../components/beach/BeachDetails';
import { BeachMap } from '../components/map/BeachMap';
import { OceanRiskCard } from '../components/status/OceanRiskCard';
import { AlertsCard } from '../components/status/AlertsCard';
import { WaterQualityCard } from '../components/status/WaterQualityCard';
import { getAlerts, getOceanRisk, getBeachConditions, getBeaches } from '../services/beachApi';
import type { AlertsResponse, OceanRiskResponse, Beach, WaterQualityCondition } from '../types';

interface Resource<T> { data?: T; loading: boolean; error?: string }

export function BeachPage() {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [selectedBeachId, setSelectedBeachId] = useState<number | string | null>(null);
  const [beach, setBeach] = useState<Beach | null>(null);
  const [condition, setCondition] = useState<WaterQualityCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [risks, setRisks] = useState<Record<string, Resource<OceanRiskResponse>>>({});
  const [alerts, setAlerts] = useState<Record<string, Resource<AlertsResponse>>>({});
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (selectedBeachId == null) return;
    const id = String(selectedBeachId);
    const controller = new AbortController();
    setRisks(previous => ({ ...previous, [id]: { data: previous[id]?.data, loading: true } }));
    setAlerts(previous => ({ ...previous, [id]: { data: previous[id]?.data, loading: true } }));
    void getOceanRisk(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setRisks(previous => ({ ...previous, [id]: { data, loading: false } }));
    }).catch(() => {
      if (!controller.signal.aborted) setRisks(previous => ({ ...previous, [id]: { ...previous[id], loading: false, error: 'Unable to load ocean risk' } }));
    });
    void getAlerts(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setAlerts(previous => ({ ...previous, [id]: { data, loading: false } }));
    }).catch(() => {
      if (!controller.signal.aborted) setAlerts(previous => ({ ...previous, [id]: { ...previous[id], loading: false, error: 'Unable to load alerts' } }));
    });
    return () => controller.abort();
  }, [selectedBeachId, refresh]);

  useEffect(() => {
    async function loadBeaches() {
      try {
        const items = await getBeaches();
        setBeaches(items);
        if (items.length > 0) {
          setSelectedBeachId(items[0].id);
        } else {
          setLoading(false);
        }
      } catch {
        setError('Unable to load beaches');
        setLoading(false);
      }
    }

    void loadBeaches();
  }, []);

  useEffect(() => {
    if (selectedBeachId == null) return;

    const beachId = selectedBeachId;
    const controller = new AbortController();

    async function loadConditions() {
      setLoading(true);
      setError(null);

      try {
        const nextCondition = await getBeachConditions(beachId, controller.signal);
        setCondition(nextCondition);
      } catch {
        if (controller.signal.aborted) return;
        setError('Unable to load water-quality conditions');
        setCondition(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadConditions();

    return () => controller.abort();
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

      <BeachMap beaches={beaches} selectedBeachId={selectedBeachId} onSelect={setSelectedBeachId} />

      {beach ? <BeachDetails beach={beach} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <WaterQualityCard condition={condition} loading={loading} error={error} />
        <OceanRiskCard condition={risks[String(selectedBeachId)]?.data} loading={risks[String(selectedBeachId)]?.loading} error={risks[String(selectedBeachId)]?.error} />
        <AlertsCard response={alerts[String(selectedBeachId)]?.data} loading={alerts[String(selectedBeachId)]?.loading} error={alerts[String(selectedBeachId)]?.error} />
      </div>
      {selectedBeachId != null && <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={() => setRefresh(value => value + 1)}>Refresh NWS data</button>}
    </main>
  );
}
