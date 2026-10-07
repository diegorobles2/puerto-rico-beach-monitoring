import type { WaterQualityCondition, WaterQualityStatus } from '../../types';

const statusLabels: Record<WaterQualityStatus, string> = {
  suitable: 'Suitable',
  advisory: 'Advisory',
  unknown: 'Unknown',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No timestamp available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function WaterQualityCard({
  condition,
  loading = false,
  error,
}: {
  condition?: WaterQualityCondition | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-medium text-sky-700">Loading water-quality status…</p>
        <p className="mt-1 text-sm text-slate-600">Checking the latest normalized source data.</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-semibold text-red-700">Water quality unavailable</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
      </article>
    );
  }

  if (!condition || condition.availability === 'unavailable') {
    return (
      <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <p className="mt-3 text-sm font-semibold text-amber-800">Water quality unavailable</p>
        <p className="mt-1 text-sm text-amber-800">No recent water-quality data available.</p>
      </article>
    );
  }

  const status = condition.status ?? 'unknown';
  const sourceName = condition.source || 'Unknown source';
  const provenanceDate = formatIsoDate(condition.retrievedAt) ?? formatIsoDate(condition.observedAt);
  const isStale =
    !!condition.observedAt &&
    Date.now() - new Date(condition.observedAt).getTime() > 1000 * 60 * 60 * 24 * 2;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Water quality</h2>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            status === 'suitable'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : status === 'advisory'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}
          aria-live="polite"
        >
          {statusLabels[status]}
        </span>
      </div>

      <p className="mt-3 text-sm font-medium text-slate-700">
        {status === 'suitable'
          ? 'Water quality is currently suitable.'
          : status === 'advisory'
            ? 'Water quality is under advisory conditions.'
            : 'No current water-quality reading is available.'}
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source</p>
        <p className="mt-1 text-sm text-slate-700">{sourceName}</p>
        {condition.sourceUrl ? (
          <a href={condition.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline">
            Read report
          </a>
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 text-sm text-slate-600">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="font-medium text-slate-800">Observed</dt>
          <dd>{formatDate(condition.observedAt)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="font-medium text-slate-800">Retrieved</dt>
          <dd>
            <span>{formatDate(condition.retrievedAt)}</span>
            {provenanceDate ? <span className="ml-2 text-slate-500">{provenanceDate}</span> : null}
          </dd>
        </div>
      </dl>

      {isStale ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Stale data: this reading is more than 48 hours old.
        </p>
      ) : null}
    </article>
  );
}
