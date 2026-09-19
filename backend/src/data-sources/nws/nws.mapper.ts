import type { OceanCondition } from '../../types/domain';
import type { NwsResponsePlaceholder } from './nws.types';
export function mapNwsCondition(_raw: NwsResponsePlaceholder): OceanCondition {
  // TODO: Normalize an actual NWS response after integration is implemented.
  return { risk: 'unknown', summary: 'NWS integration not implemented', source: { sourceName: 'NWS', observedAt: new Date(0).toISOString(), retrievedAt: new Date(0).toISOString() } };
}
