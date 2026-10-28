import type { AlertsResponse } from '../../types';
import { NwsProvenance } from '../common/NwsProvenance';

export function AlertsCard({ response, loading = false, error }: { response?: AlertsResponse; loading?: boolean; error?: string }) {
  const current = !loading && !error && response?.availability === 'available';
  return <article aria-label="Alerts" aria-busy={loading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
    <div role="status" className="mt-3 space-y-2">
      {loading && <p>Loading alerts...</p>}
      {error && <p>{error}. Current alerts could not be verified.</p>}
      {response?.availability === 'stale' && <p>Stale data: new alerts may be missing.</p>}
      {!loading && !error && (!response || response.availability === 'unavailable') && <p>Alert source unavailable. Current alerts are unknown.</p>}
      {current && response.status === 'no-active-alerts' && <p>No active alerts reported by the latest NWS check.</p>}
      {!current && response?.alerts?.length === 0 && <p>Current alerts are unknown.</p>}
    </div>
    {!!response?.alerts?.length && <>
      <p className="mt-3">{current ? 'Active alerts' : 'Last-known alerts (not verified as current)'}</p>
      <ul className="mt-3 space-y-4">
        {response.alerts.map(alert => <li key={alert.id}>
          <h3 className="font-semibold">{alert.title}</h3>
          <p>Severity: {alert.severity}</p>
          <p className="whitespace-pre-line">{alert.description}</p>
          {alert.instruction && <p className="whitespace-pre-line">Recommended action: {alert.instruction}</p>}
          <p>Effective: <time dateTime={alert.effectiveAt}>{alert.effectiveAt}</time></p>
          <p>Expires: <time dateTime={alert.expiresAt}>{alert.expiresAt}</time></p>
          <NwsProvenance {...alert} />
        </li>)}
      </ul>
    </>}
    {response && <NwsProvenance retrievedAt={response.retrievedAt} />}
  </article>;
}
