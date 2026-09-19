import type { BeachAlert } from '../../types';
export function AlertsCard({ alerts = [] }: { alerts?: BeachAlert[] }) { return <article><h2 className="font-semibold">Alerts</h2><p>{alerts.length ? `${alerts.length} active alert(s)` : 'No alerts loaded'}</p></article>; }
