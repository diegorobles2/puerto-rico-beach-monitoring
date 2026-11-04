import { describe, expect, it } from 'vitest';
import type { Beach } from '../types';
import { filterBeaches, listMunicipalities, normalizeText } from './beachFilters';

const BEACHES: Beach[] = [
  { id: 1, name: 'Balneario de Rincón', municipality: 'Rincón', latitude: 18.34, longitude: -67.25 },
  { id: 2, name: 'Pico de Piedra', municipality: 'Aguada', latitude: 18.384, longitude: -67.213 },
  { id: 3, name: 'Balneario El Escambrón', municipality: 'San Juan', latitude: 18.466, longitude: -66.087 },
  { id: 4, name: 'Playa Ocean Park', municipality: 'San Juan', latitude: 18.455, longitude: -66.05 },
];

const ids = (results: ReturnType<typeof filterBeaches>) => results.map((r) => r.beach.id);

describe('normalizeText', () => {
  it('ignores case and accents', () => {
    expect(normalizeText('  RINCÓN ')).toBe('rincon');
  });
});

describe('listMunicipalities', () => {
  it('returns unique municipalities in alphabetical order', () => {
    expect(listMunicipalities(BEACHES)).toEqual(['Aguada', 'Rincón', 'San Juan']);
  });
});

describe('filterBeaches', () => {
  it('returns every beach in catalog order with no filters', () => {
    expect(ids(filterBeaches(BEACHES, {}))).toEqual([1, 2, 3, 4]);
  });

  it('matches beach names without accents or case', () => {
    expect(ids(filterBeaches(BEACHES, { query: 'escambron' }))).toEqual([3]);
  });

  it('matches municipality names in the text search', () => {
    expect(ids(filterBeaches(BEACHES, { query: 'san juan' }))).toEqual([3, 4]);
  });

  it('requires every search word to match', () => {
    expect(ids(filterBeaches(BEACHES, { query: 'balneario juan' }))).toEqual([3]);
  });

  it('filters by exact municipality and combines with the text search', () => {
    expect(ids(filterBeaches(BEACHES, { municipality: 'San Juan' }))).toEqual([3, 4]);
    expect(ids(filterBeaches(BEACHES, { municipality: 'San Juan', query: 'ocean' }))).toEqual([4]);
  });

  it('returns no results when nothing matches', () => {
    expect(filterBeaches(BEACHES, { query: 'culebra' })).toEqual([]);
  });

  it('orders by distance and reports it when a location is known', () => {
    const results = filterBeaches(BEACHES, { location: { latitude: 18.38, longitude: -67.21 } });

    expect(ids(results)).toEqual([2, 1, 3, 4]);
    expect(results[0].distanceKm).toBeLessThan(1);
    expect(results.every((r) => typeof r.distanceKm === 'number')).toBe(true);
  });

  it('reports no distance without a location', () => {
    expect(filterBeaches(BEACHES, {}).every((r) => r.distanceKm === null)).toBe(true);
  });
});
