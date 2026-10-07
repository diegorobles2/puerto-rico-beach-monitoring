export interface SourceMetadata {
  sourceName: string;
  sourceUrl?: string | null;
  observedAt: string | null;
  retrievedAt: string | null;
}

export interface Beach {
  id: number | string;
  name: string;
  municipality: string;
  latitude: number;
  longitude: number;
}

export type WaterQualityStatus = 'suitable' | 'advisory' | 'unknown';
export type WaterQualityAvailability = 'available' | 'unavailable';

export interface WaterQualityCondition {
  status: WaterQualityStatus;
  source: string;
  sourceUrl?: string | null;
  observedAt: string | null;
  retrievedAt: string | null;
  availability: WaterQualityAvailability;
}

export type OceanRisk = 'low' | 'moderate' | 'high' | 'extreme' | 'unknown';

export interface OceanCondition {
  risk: OceanRisk;
  summary: string;
  source: SourceMetadata;
}

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

