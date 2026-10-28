import type { OceanRiskResponse } from '../../types';
import { NwsProvenance } from '../common/NwsProvenance';

export function OceanRiskCard({ condition, loading = false, error }: { condition?: OceanRiskResponse; loading?: boolean; error?: string }) {
  const historical = loading || !!error || condition?.availability === 'stale';
  const current = !historical && condition?.availability === 'available';
  return (
    <article aria-label="Ocean risk" aria-busy={loading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">Ocean risk</h2>
      <div role="status" className="mt-3 space-y-2">
        {loading && <p>Loading ocean risk...</p>}
        {error && <p>{error}. Current risk could not be verified.</p>}
        {condition?.availability === 'stale' && <p>Stale data: current ocean risk is unknown.</p>}
        <p>Current rip-current risk: {current ? condition.status : 'unknown'}</p>
        {historical && condition && <p>Last-known risk: {condition.lastKnownStatus ?? condition.status} (historical)</p>}
        {!loading && !error && (!condition || condition.availability === 'unavailable') && <p>Ocean risk unavailable. No usable published risk is available for this beach.</p>}
      </div>
      {condition && <>
        <p className="mt-3">{condition.summary}</p>
        {condition.forecastPeriod && <p>Forecast period: {condition.forecastPeriod}</p>}
        <NwsProvenance {...condition} />
      </>}
      <p className="mt-3 text-sm">Low risk does not mean swimming is safe.</p>
    </article>
  );
}
