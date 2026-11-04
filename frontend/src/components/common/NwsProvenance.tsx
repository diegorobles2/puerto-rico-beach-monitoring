export function NwsProvenance({ observedAt, retrievedAt, sourceUrl }: {
  observedAt?: string | null;
  retrievedAt: string | null;
  sourceUrl?: string;
}) {
  return <div className="mt-3 space-y-1 text-sm text-slate-600">
    <p>Source: NWS</p>
    {observedAt && <p>Issued: <time dateTime={observedAt}>{observedAt}</time></p>}
    <p>Retrieved: {retrievedAt ? <time dateTime={retrievedAt}>{retrievedAt}</time> : 'Not available'}</p>
    {sourceUrl && <a className="text-sky-700 underline" href={sourceUrl} target="_blank" rel="noreferrer">Read NWS source</a>}
  </div>;
}
