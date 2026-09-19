import type { OceanCondition } from '../../types';
export function OceanRiskCard({ condition }: { condition?: OceanCondition }) { return <article><h2 className="font-semibold">Ocean risk</h2><p>{condition?.summary ?? 'No current data'}</p></article>; }
