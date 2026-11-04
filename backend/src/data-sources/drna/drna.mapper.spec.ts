import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapDrnaWaterQuality } from './drna.mapper';
import type { DrnaMonitoringRecord } from './drna.types';

const SOURCE_URL = 'https://www.drna.pr.gov/example.pdf';
const RETRIEVED_AT = '2026-10-03T18:00:00.000Z';

function fixtureRecord(line: number): DrnaMonitoringRecord {
  const rows = readFileSync(join(__dirname, 'fixtures', 'monitoring-results-extracted.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((row) => row && !row.startsWith('#'));
  const headers = rows[0].split('|');
  const values = rows[line].split('|');
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || null]));

  return {
    date: record.date,
    beachId: record.beach_id,
    beachName: record.beach_name,
    latitude: record.latitude,
    longitude: record.longitude,
    samplingRoute: record.sampling_route,
    samplingType: record.sampling_type,
    enterococcus: record.enterococcus,
    temperatureCelsius: record.temperature_c,
    ph: record.ph,
    observations: record.observations,
  };
}

function map(record: DrnaMonitoringRecord) {
  return mapDrnaWaterQuality({ record, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
}

describe('mapDrnaWaterQuality', () => {
  it('maps a routine numeric result with provenance', () => {
    const result = map(fixtureRecord(1));

    expect(result).toMatchObject({
      stationId: 'RW-22',
      beachName: 'Pico de Piedra',
      status: 'suitable',
      sampleType: 'routine',
      enterococcus: { value: 20, qualifier: null, unit: 'colonies/100 mL' },
      source: { sourceName: 'DRNA', sourceUrl: SOURCE_URL, observedAt: '2023-01-23', retrievedAt: RETRIEVED_AT },
    });
  });

  it('preserves a less-than qualifier', () => {
    expect(map(fixtureRecord(2)).enterococcus).toEqual({ value: 10, qualifier: 'less-than', unit: 'colonies/100 mL' });
  });

  it('normalizes a resampling row with missing optional values', () => {
    expect(map(fixtureRecord(3))).toMatchObject({ sampleType: 'resampling', ph: null, notes: 'Re-sampling' });
  });

  it('maps a value above the BAV to an advisory', () => {
    expect(map({ ...fixtureRecord(1), enterococcus: '71' }).status).toBe('advisory');
  });

  it('preserves a greater-than value and treats it as an advisory', () => {
    expect(map({ ...fixtureRecord(1), enterococcus: '>24,196' })).toMatchObject({
      status: 'advisory',
      enterococcus: { value: 24196, qualifier: 'greater-than' },
    });
  });

  it('represents missing identity and observation time explicitly', () => {
    expect(map({ ...fixtureRecord(1), beachId: null, beachName: '', date: null })).toMatchObject({
      stationId: null,
      beachName: null,
      source: { observedAt: null },
    });
  });

  it.each([null, '', 'not reported', '<100'] as const)('does not mark %p as suitable', (enterococcus) => {
    expect(map({ ...fixtureRecord(1), enterococcus }).status).toBe('unknown');
  });
});
