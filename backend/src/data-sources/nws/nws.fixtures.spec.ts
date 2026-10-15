import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
}

describe('NWS source fixtures', () => {
  it('captures the official SRF risk value by forecast zone and period', () => {
    const product = fixture('surf-forecast-success.json') as Record<string, unknown>;

    expect(product).toMatchObject({ issuingOffice: 'TJSJ', productCode: 'SRF' });
    expect(product.issuanceTime).toBe('2026-10-14T20:08:00+00:00');
    expect(product.productText).toEqual(expect.stringMatching(/PRZ001[\s\S]*\.THURSDAY[\s\S]*Rip Current Risk\*\.{3,}Moderate\./));
  });

  it('captures alert identity, coverage, validity, and severity fields', () => {
    const collection = fixture('alerts-active-success.json') as { features: Array<{ properties: Record<string, unknown> }> };

    expect(collection.features[0].properties).toMatchObject({
      affectedZones: expect.arrayContaining(['https://api.weather.gov/zones/forecast/PRZ007']),
      sent: '2026-10-14T17:20:00-04:00',
      effective: '2026-10-14T17:20:00-04:00',
      expires: '2026-10-14T18:00:00-04:00',
      status: 'Actual',
      messageType: 'Alert',
      severity: 'Moderate',
      event: 'Special Weather Statement',
      senderName: 'NWS San Juan PR',
    });
  });

  it('distinguishes a successful empty response from malformed and unavailable responses', () => {
    expect(fixture('alerts-active-empty.json')).toMatchObject({ type: 'FeatureCollection', features: [] });
    expect(Array.isArray((fixture('malformed-response.json') as { features: unknown }).features)).toBe(false);
    expect(fixture('service-unavailable.json')).toMatchObject({ status: 503, title: 'Service Unavailable' });
  });
});
