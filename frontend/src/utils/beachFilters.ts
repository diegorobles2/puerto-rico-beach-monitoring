import type { Beach } from '../types';
import { distanceKm, type Coordinates } from './distance';

export interface BeachResult {
  beach: Beach;
  distanceKm: number | null;
}

/** Lowercases and strips accents so "rincon" matches "Rincón". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function listMunicipalities(beaches: Beach[]): string[] {
  const names = new Set(beaches.map((beach) => beach.municipality).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Filters beaches by a free-text query (name or municipality) and an exact
 * municipality, then orders by distance when a location is known. Without a
 * location the catalog order is kept.
 */
export function filterBeaches(
  beaches: Beach[],
  { query = '', municipality = '', location = null }: { query?: string; municipality?: string; location?: Coordinates | null },
): BeachResult[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);

  const results = beaches
    .filter((beach) => !municipality || beach.municipality === municipality)
    .filter((beach) => {
      if (terms.length === 0) return true;
      const haystack = normalizeText(`${beach.name} ${beach.municipality}`);
      return terms.every((term) => haystack.includes(term));
    })
    .map((beach) => ({ beach, distanceKm: location ? distanceKm(location, beach) : null }));

  if (location) results.sort((a, b) => a.distanceKm! - b.distanceKm!);
  return results;
}
