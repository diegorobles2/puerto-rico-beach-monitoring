export interface SourceMetadata { sourceName: string; sourceUrl?: string; observedAt: string; retrievedAt: string; }
export interface WaterQualityObservation {
  id: string;
  beach_id: string;
  sampled_at: string;
  enterococcus_value: number | null;
  enterococcus_qualifier: string | null;
  temperature_celsius: number | null;
  ph: number | null;
  status: WaterQualityStatus;
  sampling_type: string;
}
export interface Beach { id: string; name: string; municipality: string; latitude: number; longitude: number; }
export type WaterQualityStatus = 'safe' | 'advisory' | 'closed' | 'unknown';
export interface OceanCondition { risk: 'low' | 'moderate' | 'high' | 'extreme' | 'unknown'; summary: string; source: SourceMetadata; }
export interface BeachAlert { id: string; title: string; description: string; source: SourceMetadata; }
export interface CommunityReport { id: string; beachId: string; summary: string; createdAt: string; }
