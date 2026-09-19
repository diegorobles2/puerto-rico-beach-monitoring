export interface SourceMetadata {
  sourceName: string;
  sourceUrl?: string;
  observedAt: string;
  retrievedAt: string;
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

