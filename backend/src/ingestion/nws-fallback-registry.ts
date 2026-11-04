/** Approved assignments; evidence: docs/architecture/nws-fallback-verification.csv. */
export const NWS_FALLBACK_REGISTRY_VERSION = '2026-10-27.v2';

export interface NwsFallbackReview {
  readonly stationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly originalMarineZone: string;
  readonly fallbackForecastZone: string;
}

export const NWS_FALLBACK_REVIEWS: readonly NwsFallbackReview[] = [
  { stationId: 'RW-12B', latitude: 17.9747944, longitude: -67.2129056,
    originalMarineZone: 'AMZ745', fallbackForecastZone: 'PRZ011' },
  { stationId: 'RW-13', latitude: 18.0194417, longitude: -67.1722444,
    originalMarineZone: 'AMZ745', fallbackForecastZone: 'PRZ011' },
  { stationId: 'RW-14A', latitude: 17.98581, longitude: -67.21459,
    originalMarineZone: 'AMZ745', fallbackForecastZone: 'PRZ011' },
  { stationId: 'RW-19', latitude: 18.4716583, longitude: -66.1859944,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ001' },
  { stationId: 'RW-1A', latitude: 18.3855917, longitude: -65.7294722,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ002' },
  { stationId: 'RW-21C', latitude: 18.4459889, longitude: -66.0035722,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ001' },
  { stationId: 'RW-23', latitude: 18.4913667, longitude: -66.3990444,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ005' },
  { stationId: 'RW-28', latitude: 18.4440917, longitude: -66.02215,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ001' },
  { stationId: 'RW-29', latitude: 18.4478583, longitude: -65.9062306,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ002' },
  { stationId: 'RW-31', latitude: 18.1869278, longitude: -65.7259667,
    originalMarineZone: 'AMZ726', fallbackForecastZone: 'PRZ002' },
  { stationId: 'RW-32', latitude: 18.3818667, longitude: -65.7184583,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ002' },
  { stationId: 'RW-37', latitude: 18.0645333, longitude: -67.1975278,
    originalMarineZone: 'AMZ745', fallbackForecastZone: 'PRZ011' },
  { stationId: 'RW-38', latitude: 18.4792583, longitude: -66.7004667,
    originalMarineZone: 'AMZ712', fallbackForecastZone: 'PRZ005' },
  { stationId: 'RW-4', latitude: 18.1584139, longitude: -65.7551861,
    originalMarineZone: 'AMZ726', fallbackForecastZone: 'PRZ002' },
  { stationId: 'RW-8', latitude: 18.0488722, longitude: -67.198625,
    originalMarineZone: 'AMZ745', fallbackForecastZone: 'PRZ011' },
];

/** Exact matches only; no rounding, proximity tolerance or geographic inference. */
export function findVerifiedNwsFallback(
  stationId: string, latitude: number, longitude: number, marineZone: string,
): NwsFallbackReview | undefined {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return undefined;
  return NWS_FALLBACK_REVIEWS.find(review => review.stationId === stationId
    && review.latitude === latitude && review.longitude === longitude
    && review.originalMarineZone === marineZone);
}
