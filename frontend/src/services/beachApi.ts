import type { AlertsResponse, Beach, OceanRiskResponse, WaterQualityCondition } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getOceanRisk(beachId: number | string, signal?: AbortSignal): Promise<OceanRiskResponse> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}/ocean-risk`, { signal });
  if (!response.ok) throw new Error('Unable to load ocean risk');
  return response.json() as Promise<OceanRiskResponse>;
}

export async function getAlerts(beachId: number | string, signal?: AbortSignal): Promise<AlertsResponse> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}/alerts`, { signal });
  if (!response.ok) throw new Error('Unable to load alerts');
  return response.json() as Promise<AlertsResponse>;
}

export async function getBeaches(): Promise<Beach[]> {
  const response = await fetch(`${apiUrl}/beaches`);
  if (!response.ok) throw new Error('Unable to load beaches');
  return response.json() as Promise<Beach[]>;
}

export async function getBeachConditions(beachId: number | string, signal?: AbortSignal): Promise<WaterQualityCondition> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}/water-quality`, { signal });
  if (!response.ok) {
    throw new Error('Unable to load water-quality conditions');
  }

  return response.json() as Promise<WaterQualityCondition>;
}
