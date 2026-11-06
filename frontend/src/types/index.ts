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
export type WaterQualityAvailability = 'available' | 'stale' | 'unavailable';

export interface WaterQualityCondition {
  status: WaterQualityStatus;
  lastKnownStatus?: WaterQualityStatus;
  source: string;
  sourceUrl?: string | null;
  observedAt: string | null;
  retrievedAt: string | null;
  availability: WaterQualityAvailability;
  enterococcusValue?: number | null;
  enterococcusQualifier?: 'less-than' | 'greater-than' | null;
  samplingType?: 'routine' | 'resampling' | 'unknown' | null;
  temperatureCelsius?: number | null;
  ph?: number | null;
}

export type OceanRisk = 'low' | 'moderate' | 'high' | 'extreme' | 'unknown';

export interface OceanRiskResponse {
  beachId: number;
  zoneId: string | null;
  status: OceanRisk;
  lastKnownStatus?: OceanRisk;
  summary: string;
  forecastPeriod: string | null;
  source: 'NWS';
  sourceUrl?: string;
  observedAt: string | null;
  retrievedAt: string | null;
  availability: 'available' | 'stale' | 'unavailable';
  unavailableReason?: 'beach-not-mapped' | 'no-data' | 'risk-not-published';
}

export interface NwsAlert {
  id: string;
  title: string;
  description: string;
  instruction: string | null;
  severity: string;
  certainty: string;
  urgency: string;
  effectiveAt: string;
  expiresAt: string;
  observedAt: string | null;
  retrievedAt: string;
  sourceUrl?: string;
}

export interface AlertsResponse {
  beachId: number;
  zoneId: string | null;
  status: 'active-alerts' | 'no-active-alerts' | 'unknown';
  source: 'NWS';
  retrievedAt: string | null;
  availability: 'available' | 'stale' | 'unavailable';
  unavailableReason?: 'beach-not-mapped' | 'no-data';
  alerts: NwsAlert[] | null;
}

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

