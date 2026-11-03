import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistance } from './distance';

const SAN_JUAN = { latitude: 18.4655, longitude: -66.1057 };
const PONCE = { latitude: 18.0111, longitude: -66.6141 };
const AGUADA_PICO_DE_PIEDRA = { latitude: 18.3843639, longitude: -67.2129889 };

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(SAN_JUAN, SAN_JUAN)).toBe(0);
  });

  it('matches a hand-computed San Juan to Ponce distance', () => {
    // ~50.5 km north-south and ~53.7 km east-west at this latitude.
    expect(distanceKm(SAN_JUAN, PONCE)).toBeCloseTo(73.7, 1);
  });

  it('is symmetric', () => {
    expect(distanceKm(SAN_JUAN, AGUADA_PICO_DE_PIEDRA)).toBeCloseTo(distanceKm(AGUADA_PICO_DE_PIEDRA, SAN_JUAN), 9);
  });

  it('measures one degree of latitude as about 111 km', () => {
    expect(distanceKm({ latitude: 18, longitude: -66 }, { latitude: 19, longitude: -66 })).toBeCloseTo(111.19, 1);
  });
});

describe('formatDistance', () => {
  it.each([
    [0.25, '250 m'],
    [0.999, '999 m'],
    [3.456, '3.5 km'],
    [12.4, '12 km'],
  ])('formats %s km as %s', (km, expected) => {
    expect(formatDistance(km)).toBe(expected);
  });
});
