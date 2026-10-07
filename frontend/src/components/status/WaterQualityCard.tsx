import type { SourceMetadata, WaterQualityCondition, WaterQualityStatus } from '../../types';

const statusLabels: Record<WaterQualityStatus, string> = {
  safe: 'Safe',
  advisory: 'Advisory',
  closed: 'Closed',
  unknown: 'Unknown',
};

function formatTimestamp(value?: string) {
  if (!value) return 'No timestamp available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Timestamp unavailable';
  return date.toLocaleString();
}

export function WaterQualityCard({
  condition,
  status,
  source,
  loading = false,
  error,
  unavailable = false,
}: {
  condition?: WaterQualityCondition | null;
  status?: WaterQualityStatus;
  source?: SourceMetadata;
  loading?: boolean;
  error?: string | null;
  unavailable?: boolean;
}) {
  const resolvedStatus = condition?.status ?? status ?? 'unknown';
  const resolvedSource = condition?.source ?? source;
  const observation = condition?.observation ?? null;
  const summary =
    condition?.summary ??
    (resolvedStatus === 'safe'
      ? 'Water quality is within the current advisory threshold.'
      : resolvedStatus === 'advisory'
        ? 'Water quality is under watch and should be treated as cautionary.'
        : resolvedStatus === 'closed'
          ? 'Water quality is closed for swimming.'
          : 'No current water-quality data available.');

  if (loading) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-medium text-sky-700">Loading water-quality status…</p>
        <p className="mt-2 text-sm text-slate-600">Checking the latest source before reporting conditions.</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-semibold text-red-700">Water quality unavailable</p>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </article>
    );
  }

  if (unavailable || !resolvedSource) {
    return (
      <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-semibold text-amber-800">Water quality unavailable</p>
        <p className="mt-2 text-sm text-amber-800">No recent data available.</p>
      </article>
    );
  }

  const isStale = new Date(resolvedSource.observedAt).getTime() < Date.now() - 1000 * 60 * 60 * 24 * 2;

  const observationRows = observation
    ? [
        { label: 'Observation ID', value: observation.id },
        { label: 'Sampled', value: formatTimestamp(observation.sampled_at) },
        {
          label: 'Enterococcus',
          value: `${observation.enterococcus_value ?? 'No value'}${observation.enterococcus_qualifier ? ` (${observation.enterococcus_qualifier})` : ''}`,
        },
        { label: 'Temperature', value: observation.temperature_celsius != null ? `${observation.temperature_celsius}°C` : 'No value' },
        { label: 'pH', value: observation.ph != null ? `${observation.ph}` : 'No value' },
        { label: 'Status', value: statusLabels[observation.status] ?? observation.status },
        { label: 'Sampling type', value: observation.sampling_type },
      ]
    : [];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            resolvedStatus === 'safe'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : resolvedStatus === 'advisory'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : resolvedStatus === 'closed'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}
          aria-live="polite"
        >
          {statusLabels[resolvedStatus]}
        </span>
      </div>

      <p className="mt-3 text-sm font-medium text-slate-700">{summary}</p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source</p>
        <p className="mt-1 text-sm text-slate-700">{resolvedSource.sourceName}</p>
      </div>

      <dl className="mt-4 space-y-2 text-sm text-slate-600">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="font-medium text-slate-800">Observed</dt>
          <dd>{formatTimestamp(resolvedSource.observedAt)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="font-medium text-slate-800">Retrieved</dt>
          <dd>{formatTimestamp(resolvedSource.retrievedAt)}</dd>
        </div>
      </dl>

      {observationRows.length > 0 ? (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Observation details</p>
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {observationRows.map((row) => (
              <div key={row.label} className="rounded-md border border-sky-100 bg-white/70 p-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{row.label}</dt>
                <dd className="mt-1 break-words text-slate-700">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {isStale ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Stale data: this reading is more than 48 hours old.
        </p>
      ) : null}
    </article>
  );
}
