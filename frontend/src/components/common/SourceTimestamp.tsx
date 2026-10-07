import type { SourceMetadata } from '../../types';

export function SourceTimestamp({ source }: { source: SourceMetadata }) {
  const updatedAt = source.observedAt ? new Date(source.observedAt).toLocaleString() : 'No timestamp available';

  return <small>Source: {source.sourceName} · Updated: {updatedAt}</small>;
}
