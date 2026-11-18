import type { Beach } from '../../types';
import { formatDistance } from '../../utils/distance';

export function BeachDetails({ beach, distanceKm = null }: { beach: Beach; distanceKm?: number | null }) {
  return (
    <section>
      <h2 className="font-semibold">Beach details</h2>
      <dl className="mt-1 space-y-1 text-sm text-slate-700">
        {beach.municipality ? (
          <div>
            <dt className="inline font-medium">Municipality: </dt>
            <dd className="inline">{beach.municipality}</dd>
          </div>
        ) : null}
        {distanceKm != null ? (
          <div>
            <dt className="inline font-medium">Distance from you: </dt>
            <dd className="inline">{formatDistance(distanceKm)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium">Coordinates: </dt>
          <dd className="inline">
            {beach.latitude}, {beach.longitude}
          </dd>
        </div>
      </dl>
    </section>
  );
}
