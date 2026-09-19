import type { SourceMetadata, WaterQualityStatus } from '../../types/domain';
import type { DrnaResponsePlaceholder } from './drna.types';
export interface NormalizedWaterQuality { status: WaterQualityStatus; source: SourceMetadata; }
export function mapDrnaWaterQuality(_raw: DrnaResponsePlaceholder): NormalizedWaterQuality {
  // TODO: Normalize an actual DRNA response after integration is implemented.
  return { status: 'unknown', source: { sourceName: 'DRNA', observedAt: new Date(0).toISOString(), retrievedAt: new Date(0).toISOString() } };
}
