export interface SourceMetadata { sourceName: string; sourceUrl?: string; observedAt: string | null; retrievedAt: string; }
export interface Beach { id: string; name: string; municipality: string; latitude: number; longitude: number; }
export type WaterQualityStatus = 'suitable' | 'advisory' | 'unknown';
export interface WaterQualityObservation {
  stationId: string | null;
  beachName: string | null;
  status: WaterQualityStatus;
  sampleType: 'routine' | 'resampling' | 'unknown';
  enterococcus: {
    value: number | null;
    qualifier: 'less-than' | null;
    unit: 'colonies/100 mL';
  };
  temperatureCelsius: number | null;
  ph: number | null;
  notes?: string;
  source: SourceMetadata;
}
export interface OceanCondition { risk: 'low' | 'moderate' | 'high' | 'extreme' | 'unknown'; summary: string; source: SourceMetadata; }
export interface BeachAlert { id: string; title: string; description: string; source: SourceMetadata; }
export interface CommunityReport { id: string; beachId: string; summary: string; createdAt: string; }
