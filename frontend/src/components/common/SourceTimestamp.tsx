import type { SourceMetadata } from '../../types';
export function SourceTimestamp({ source }: { source: SourceMetadata }) { return <small>Source: {source.sourceName} · Updated: {new Date(source.observedAt).toLocaleString()}</small>; }
