import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NWS_FALLBACK_REVIEWS, NWS_FALLBACK_REGISTRY_VERSION, NWS_FALLBACK_VERIFICATION, type NwsFallbackReview } from './nws-fallback-registry';
import { findVerifiedNwsFallback } from './nws-fallback-selection';

const root = resolve(__dirname, '../../..');
function csvFields(line: string): string[] {
  const fields: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(field); field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('Unclosed CSV field');
  return [...fields, field];
}
const lines = readFileSync(resolve(root, NWS_FALLBACK_VERIFICATION.csv), 'utf8').trimEnd().split(/\r?\n/);
const headers = csvFields(lines[0]);
const rows = lines.slice(1).map(line => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], value])));
const expectedZones: Record<string, string> = {
  'RW-12B': 'PRZ011', 'RW-13': 'PRZ011', 'RW-14A': 'PRZ011', 'RW-19': 'PRZ001', 'RW-1A': 'PRZ002',
  'RW-21C': 'PRZ001', 'RW-23': 'PRZ005', 'RW-28': 'PRZ001', 'RW-29': 'PRZ002', 'RW-31': 'PRZ002',
  'RW-32': 'PRZ002', 'RW-37': 'PRZ011', 'RW-38': 'PRZ005', 'RW-4': 'PRZ002', 'RW-8': 'PRZ011',
};
function assertEvidence(review: NwsFallbackReview, row: Record<string, string>): void {
  expect(row.drna_station_id).toBe(review.stationId);
  expect(row.beach_name).toBe(review.beachName);
  expect(Number(row.latitude)).toBe(review.reviewedCoordinates.latitude);
  expect(Number(row.longitude)).toBe(review.reviewedCoordinates.longitude);
  expect(review.status).toBe('verified');
  if (review.status !== 'verified') throw new Error('Not verified');
  expect(row.verified_zone).toBe(review.fallbackForecastZone);
  expect(review.evidence.stationId).toBe(row.drna_station_id);
  expect(review.evidence.insidePolygon).toBe(row.inside_polygon === 'true');
  expect(review.evidence.nearestPolygonMetres).toBe(Number(row.nearest_distance_m));
  expect(review.evidence.secondNearestPolygonMetres).toBe(Number(row.second_nearest_distance_m));
  expect(review.evidence.secondNearestZone).toBe(row.second_nearest_zone);
  expect(review.evidence.verificationCsv).toBe(NWS_FALLBACK_VERIFICATION.csv);
  expect(review.evidence.verificationDocument).toBe(NWS_FALLBACK_VERIFICATION.document);
  expect(review.reviewedOn).toBe(NWS_FALLBACK_VERIFICATION.reviewedOn);
  expect(review.originalMarineZone).toMatch(/^AMZ\d{3}$/);
  expect(findVerifiedNwsFallback(review.stationId, Number(row.latitude), Number(row.longitude), review.originalMarineZone)).toEqual(review);
}

describe('compact NWS fallback verification package', () => {
  it('records all 15 reviewed stations as verified with the approved assignments', () => {
    expect(rows).toHaveLength(15); expect(NWS_FALLBACK_REVIEWS).toHaveLength(15);
    expect(new Set(rows.map(row => row.drna_station_id)).size).toBe(15);
    expect(new Set(NWS_FALLBACK_REVIEWS.map(row => row.stationId)).size).toBe(15);
    expect(Object.fromEntries(rows.map(row => [row.drna_station_id, row.verified_zone]))).toEqual(expectedZones);
    expect(NWS_FALLBACK_REVIEWS.every(review => review.status === 'verified')).toBe(true);
    expect(NWS_FALLBACK_REGISTRY_VERSION).toBe('2026-10-27.v2');
  });
  it('retains a concise, reproducible offline source and methodology', () => {
    for (const file of [NWS_FALLBACK_VERIFICATION.csv, NWS_FALLBACK_VERIFICATION.document, NWS_FALLBACK_VERIFICATION.script]) {
      expect(existsSync(resolve(root, file))).toBe(true);
    }
    expect(NWS_FALLBACK_VERIFICATION.sourceUrl).toBe('https://www.weather.gov/source/gis/Shapefiles/WSOM/z_16ap26.zip');
    expect(NWS_FALLBACK_VERIFICATION.sourceEffectiveDate).toBe('2026-04-16');
    expect(NWS_FALLBACK_VERIFICATION.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(NWS_FALLBACK_VERIFICATION.geographicCrs).toBe('EPSG:4326');
    expect(NWS_FALLBACK_VERIFICATION.distanceCrs).toBe('EPSG:32620');
  });
  it.each(NWS_FALLBACK_REVIEWS)('binds the compact evidence to $stationId', review => {
    const matches = rows.filter(row => row.drna_station_id === review.stationId);
    expect(matches).toHaveLength(1); assertEvidence(review, matches[0]);
  });
  it('rejects swapped same-zone evidence rows and coordinates', () => {
    const first = NWS_FALLBACK_REVIEWS.find(r => r.stationId === 'RW-12B')!;
    const other = rows.find(row => row.drna_station_id === 'RW-13')!;
    expect(() => assertEvidence(first, other)).toThrow();
    const exact = rows.find(row => row.drna_station_id === first.stationId)!;
    expect(() => assertEvidence(first, { ...exact, latitude: other.latitude })).toThrow();
  });
  it('distinguishes RW-1A containment from the 14 adjacent-polygon reviews', () => {
    const contained = NWS_FALLBACK_REVIEWS.filter(r => r.evidence.insidePolygon);
    expect(contained.map(r => r.stationId)).toEqual(['RW-1A']);
    const review = contained[0];
    expect(review).toMatchObject({ status: 'verified', fallbackForecastZone: 'PRZ002', originalMarineZone: 'AMZ712',
      mappingMethod: 'reviewed-polygon-containment', reviewedCoordinates: { latitude: 18.3855917, longitude: -65.7294722 } });
    expect(review.evidence.nearestPolygonMetres).toBe(0);
    expect(NWS_FALLBACK_REVIEWS.filter(r => !r.evidence.insidePolygon).every(r => r.mappingMethod === 'reviewed-polygon-adjacency')).toBe(true);
  });
  it('continues rejecting unreviewed and unresolved entries', () => {
    const verified = NWS_FALLBACK_REVIEWS[0];
    if (verified.status !== 'verified') throw new Error('Expected verified fixture');
    const { fallbackForecastZone, ...base } = verified;
    const unresolved: NwsFallbackReview = { ...base, status: 'unresolved', candidateForecastZone: fallbackForecastZone, reason: 'Pending review' };
    expect(findVerifiedNwsFallback(base.stationId, base.reviewedCoordinates.latitude, base.reviewedCoordinates.longitude, base.originalMarineZone, [unresolved])).toBeUndefined();
    expect(findVerifiedNwsFallback('unknown', 18.3855917, -65.7294722, 'AMZ712')).toBeUndefined();
  });
});
