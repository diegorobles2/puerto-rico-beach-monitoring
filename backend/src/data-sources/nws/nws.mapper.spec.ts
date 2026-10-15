import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapNwsAlerts, mapNwsCondition } from './nws.mapper';
import type { NwsAlertCollection, NwsSurfForecastProduct } from './nws.types';

const RETRIEVED_AT = '2026-10-15T01:00:00.000Z';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as T;
}

describe('NWS mapper', () => {
  it('maps the first forecast period for a requested SRF zone', () => {
    expect(mapNwsCondition(fixture<NwsSurfForecastProduct>('surf-forecast-success.json'), 'PRZ001', RETRIEVED_AT)).toEqual({
      zoneId: 'PRZ001',
      forecastPeriod: 'THURSDAY',
      risk: 'moderate',
      summary: 'Moderate rip-current risk.',
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://api.weather.gov/products/02f99345-ccbf-4d88-94da-7e6aee5521da',
        observedAt: '2026-10-14T20:08:00.000Z',
        retrievedAt: RETRIEVED_AT,
      },
    });
  });

  it('maps a missing or unrecognized risk to unknown', () => {
    const product = fixture<NwsSurfForecastProduct>('surf-forecast-success.json');
    product.productText = String(product.productText).replace('Moderate.', 'Very High.');

    expect(mapNwsCondition(product, 'PRZ001', RETRIEVED_AT)).toMatchObject({
      risk: 'unknown',
      summary: 'NWS rip-current risk is unavailable for this zone.',
    });
    expect(mapNwsCondition(product, 'PRZ999', RETRIEVED_AT)).toMatchObject({ risk: 'unknown', forecastPeriod: null });
  });

  it('maps alert coverage, severity, validity, and provenance', () => {
    expect(mapNwsAlerts(fixture<NwsAlertCollection>('alerts-active-success.json'), RETRIEVED_AT)[0]).toMatchObject({
      severity: 'Moderate',
      certainty: 'Observed',
      urgency: 'Expected',
      effectiveAt: '2026-10-14T21:20:00.000Z',
      expiresAt: '2026-10-14T22:00:00.000Z',
      zones: ['PRZ006', 'PRZ007'],
      source: { sourceName: 'NWS', observedAt: '2026-10-14T21:20:00.000Z', retrievedAt: RETRIEVED_AT },
    });
  });

  it('keeps an empty alert collection empty and rejects malformed collections', () => {
    expect(mapNwsAlerts(fixture<NwsAlertCollection>('alerts-active-empty.json'), RETRIEVED_AT)).toEqual([]);
    expect(() => mapNwsAlerts(fixture<NwsAlertCollection>('malformed-response.json'), RETRIEVED_AT)).toThrow('invalid features');
  });
});
