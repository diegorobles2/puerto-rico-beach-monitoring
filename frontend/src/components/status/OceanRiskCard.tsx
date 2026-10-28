import type { OceanCondition } from '../../types';

export function OceanRiskCard({ condition }: { condition?: OceanCondition }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">Ocean risk</h2>
      <p className="mt-3 text-sm font-medium text-slate-700">{condition?.summary ?? 'No current data'}</p>
      {condition?.source ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source</p>
          <p className="mt-1">{condition.source.sourceName}</p>
        </div>
      ) : null}
    </article>
  );
}
