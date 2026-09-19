import type { CommunityReport } from '../../types';
export function CommunityReports({ reports = [] }: { reports?: CommunityReport[] }) { return <section><h2 className="font-semibold">Community reports</h2><p>{reports.length ? `${reports.length} report(s)` : 'No reports yet'}</p></section>; }
