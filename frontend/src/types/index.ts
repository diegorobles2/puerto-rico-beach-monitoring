export interface SourceMetadata {
  sourceName: string;
  sourceUrl?: string;
  observedAt: string;
  retrievedAt: string;
}

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

export interface WaterQualityCondition {
  status: WaterQualityStatus;
  source: SourceMetadata;
  summary?: string;
  observation?: WaterQualityObservation | null;
}

export interface OceanCondition {
  risk: OceanRisk;
  summary: string;
  source: SourceMetadata;
}

export interface BeachConditionsResponse {
  beachId: string;
  waterQuality?: WaterQualityCondition | null;
  oceanRisk?: OceanCondition | null;
}

export interface Beach {
  id: string;
  name: string;
  municipality: string;
  latitude: number;
  longitude: number;
}

export type WaterQualityStatus = 'safe' | 'advisory' | 'closed' | 'unknown';
export type OceanRisk = 'low' | 'moderate' | 'high' | 'extreme' | 'unknown';

export interface BeachAlert {
  id: string;
  title: string;
  description: string;
  source: SourceMetadata;
}

export interface CommunityReport {
  id: string;
  beachId: string;
  summary: string;
  createdAt: string;
}

