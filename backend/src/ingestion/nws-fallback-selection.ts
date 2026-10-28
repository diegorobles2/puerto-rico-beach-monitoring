import { NWS_FALLBACK_REVIEWS, NWS_FALLBACK_VERIFICATION, type NwsFallbackReview } from './nws-fallback-registry';

type VerifiedReview = Extract<NwsFallbackReview, { status: 'verified' }>;
const nonblank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Select only reviewed metadata. The CSV/Python package is offline review tooling,
 * not a runtime mapping algorithm or a live nearest-zone inference mechanism. */
export function findVerifiedNwsFallback(
  stationId: string, latitude: number, longitude: number, marineZone: string,
  reviews: readonly NwsFallbackReview[] = NWS_FALLBACK_REVIEWS,
): VerifiedReview | undefined {
  const matches = reviews.filter(review => review.stationId === stationId);
  if (matches.length !== 1) return undefined;
  const review = matches[0];
  if (review.status !== 'verified' || review.reviewedCoordinates?.latitude !== latitude
    || review.reviewedCoordinates?.longitude !== longitude || review.originalMarineZone !== marineZone
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !/^AMZ\d{3}$/.test(marineZone) || !/^PRZ\d{3}$/.test(review.fallbackForecastZone)
    || !nonblank(review.beachName) || !nonblank(review.municipality)
    || review.reviewedOn !== NWS_FALLBACK_VERIFICATION.reviewedOn) return undefined;
  const evidence = review.evidence;
  if (!evidence || evidence.stationId !== stationId || evidence.verificationCsv !== NWS_FALLBACK_VERIFICATION.csv
    || evidence.verificationDocument !== NWS_FALLBACK_VERIFICATION.document
    || typeof evidence.insidePolygon !== 'boolean'
    || !Number.isFinite(evidence.nearestPolygonMetres) || evidence.nearestPolygonMetres < 0
    || evidence.nearestPolygonMetres > 100 || !Number.isFinite(evidence.secondNearestPolygonMetres)
    || evidence.secondNearestPolygonMetres < 1000 || !/^PRZ\d{3}$/.test(evidence.secondNearestZone)
    || evidence.secondNearestZone === review.fallbackForecastZone) return undefined;
  if (evidence.insidePolygon) {
    if (review.mappingMethod !== 'reviewed-polygon-containment' || evidence.nearestPolygonMetres !== 0) return undefined;
  } else if (review.mappingMethod !== 'reviewed-polygon-adjacency' || evidence.nearestPolygonMetres <= 0) return undefined;
  return review;
}
