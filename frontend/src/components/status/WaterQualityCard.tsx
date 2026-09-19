import type { WaterQualityStatus } from '../../types';
export function WaterQualityCard({ status = 'unknown' }: { status?: WaterQualityStatus }) { return <article><h2 className="font-semibold">Water quality</h2><p>{status}</p></article>; }
