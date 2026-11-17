import type { AlertsResponse, Beach, OceanRiskResponse, WaterQualityCondition, WeatherResponse } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getWeather(beachId: number | string, signal?: AbortSignal): Promise<WeatherResponse> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}/weather`, { signal });
  if (!response.ok) throw new Error('Unable to load weather forecast');
  const body = await response.json() as WeatherResponse | null;
  const period = body?.forecast;
  const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (!body || body.beachId !== Number(beachId) || body.source !== 'NWS'
    || !['available', 'stale', 'unavailable'].includes(body.availability)
    || (body.sourceUrl !== undefined && (typeof body.sourceUrl !== 'string'
      || !/^https:\/\/api\.weather\.gov\/gridpoints\/SJU\/\d+,\d+\/forecast$/.test(body.sourceUrl)))
    || (body.availability === 'unavailable' ? period !== null : (!period
      || !Number.isFinite(period.temperature) || !['C', 'F'].includes(period.temperatureUnit)
      || typeof period.name !== 'string' || typeof period.shortForecast !== 'string'
      || typeof period.detailedForecast !== 'string' || typeof period.windSpeed !== 'string' || typeof period.windDirection !== 'string'
      || !validDate(period.validFrom) || !validDate(period.validTo) || Date.parse(period.validFrom) >= Date.parse(period.validTo)
      || !validDate(body.observedAt) || !validDate(body.retrievedAt)
      || !body.sourceUrl
      || (period.precipitationProbabilityPercent !== null && (!Number.isFinite(period.precipitationProbabilityPercent)
        || period.precipitationProbabilityPercent < 0 || period.precipitationProbabilityPercent > 100))))) {
    throw new Error('Malformed weather forecast response');
  }
  return body;
}

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
