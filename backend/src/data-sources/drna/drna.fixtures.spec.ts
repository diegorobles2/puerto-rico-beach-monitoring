import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapDrnaWaterQuality } from './drna.mapper';
import { DrnaService, parseMonitoringRecords } from './drna.service';
import type { DrnaMonitoringRecord } from './drna.types';

const SOURCE_URL = 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf';
const RETRIEVED_AT = '2026-10-07T12:00:00.000Z';

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8');
}

function parsedFixture(name: string) {
  return parseMonitoringRecords(fixture(name));
}

function record(records: DrnaMonitoringRecord[], date: string, beachId: string): DrnaMonitoringRecord {
  const match = records.find((item) => item.date === date && item.beachId === beachId);
  if (!match) throw new Error(`Fixture has no ${beachId} row for ${date}`);
  return match;
}

function map(item: DrnaMonitoringRecord) {
  return mapDrnaWaterQuality({ record: item, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
}

describe('DRNA parser with real PDF text (monitoring-results-pdf-text.txt)', () => {
  const { records, rejectedRows, sourceRows } = parsedFixture('monitoring-results-pdf-text.txt');

  it('parses every sample row and ignores page headers and footers', () => {
    expect(sourceRows).toBe(10);
    expect(records).toHaveLength(10);
    expect(rejectedRows).toBe(0);
    expect(record(records, '9-Jan-2023', 'RW-34').observations).toBeNull();
  });

  it('maps a normal advisory row with status and provenance', () => {
    expect(map(record(records, '21-Sep-2026', 'RW-22'))).toEqual({
      stationId: 'RW-22',
      beachName: 'Pico de Piedra',
      status: 'advisory',
      sampleType: 'routine',
      enterococcus: { value: 231, qualifier: null, unit: 'colonies/100 mL' },
      temperatureCelsius: 29,
      ph: 8.19,
      source: { sourceName: 'DRNA', sourceUrl: SOURCE_URL, observedAt: '21-Sep-2026', retrievedAt: RETRIEVED_AT },
    });
  });

  it('maps a normal row at or below the Beach Action Value as suitable', () => {
    expect(map(record(records, '21-Sep-2026', 'RW-16'))).toMatchObject({
      status: 'suitable',
      enterococcus: { value: 10, qualifier: null },
      temperatureCelsius: 29.7,
      ph: 8.22,
    });
  });

  it('joins beach names that wrap onto a second line', () => {
    expect(map(record(records, '21-Sep-2026', 'RW-15'))).toMatchObject({
      beachName: 'Balneario de Añasco or Balneario Tres Hermanos',
      status: 'suitable',
      enterococcus: { value: 10, qualifier: 'less-than' },
      temperatureCelsius: 29.2,
      ph: 8.04,
    });
  });

  it('maps resampling rows without a pH value', () => {
    expect(map(record(records, '14-Sep-2026', 'RW-25A'))).toMatchObject({
      sampleType: 'resampling',
      enterococcus: { value: 10, qualifier: 'less-than' },
      temperatureCelsius: 29.3,
      ph: null,
      notes: 're-sampling',
    });
  });

  it.each(['RW-18', 'RW-25A'])('marks the unsampled %s row as unknown, not suitable', (beachId) => {
    expect(map(record(records, '21-Sep-2026', beachId))).toMatchObject({
      status: 'unknown',
      enterococcus: { value: null, qualifier: null },
      temperatureCelsius: null,
      ph: null,
    });
  });

  it('does not read a temperature as an Enterococcus result when the result is missing', () => {
    expect(map(record(records, '21-Sep-2026', 'RW-12B'))).toMatchObject({
      status: 'unknown',
      enterococcus: { value: null, qualifier: null },
      temperatureCelsius: 30.9,
      ph: 8.17,
    });
  });

  it('keeps the laboratory note on a row without results', () => {
    const result = map(record(records, '21-Sep-2026', 'RW-17'));

    expect(result).toMatchObject({ beachName: 'Balneario Cerro Gordo or Javier Calderón Nieves', status: 'unknown' });
    expect(result.notes).toContain('el laboratorio no tenía los medios');
  });
});

describe('DRNA parser with pipe-separated fixture (monitoring-results-extracted.txt)', () => {
  const { records, rejectedRows } = parsedFixture('monitoring-results-extracted.txt');

  it('parses every data row and skips comments and the header', () => {
    expect(records.map((item) => item.beachId)).toEqual(['RW-22', 'RW-25A', 'RW-16']);
    expect(rejectedRows).toBe(0);
  });

  it('maps a normal record with coordinates', () => {
    expect(record(records, '2023-01-23', 'RW-22')).toMatchObject({ latitude: '18.3843639', longitude: '-67.2129889' });
    expect(map(record(records, '2023-01-23', 'RW-22'))).toMatchObject({
      status: 'suitable',
      enterococcus: { value: 20, qualifier: null },
      source: { sourceName: 'DRNA', observedAt: '2023-01-23' },
    });
  });

  it('maps an irregular record with missing coordinates and pH', () => {
    expect(record(records, '2023-01-30', 'RW-16')).toMatchObject({ latitude: null, longitude: null, ph: null });
    expect(map(record(records, '2023-01-30', 'RW-16'))).toMatchObject({
      sampleType: 'resampling',
      ph: null,
      notes: 'Re-sampling',
    });
  });
});

describe('DRNA notification fixtures', () => {
  const archive = '<a href="https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-269/">Notificación</a>';

  function serviceFor(notification: string) {
    const fetcher = jest.fn(async (url: string) => {
      if (url.includes('/cat/')) return new Response(archive);
      if (url.endsWith('/notificacion-monitoria-de-playas-269/')) return new Response(notification);
      return new Response('not a pdf');
    });
    return { service: new DrnaService(fetcher), fetcher };
  }

  it('follows the advisory notification to its monitoring-results PDF', async () => {
    const { service, fetcher } = serviceFor(fixture('notification-advisory.html'));

    await expect(service.getCatalog()).rejects.toThrow('not a valid PDF');
    expect(fetcher).toHaveBeenCalledWith(SOURCE_URL, { signal: expect.any(AbortSignal) });
  });

  it('rejects an all-clear notification that links to no results', async () => {
    const { service } = serviceFor(fixture('notification-all-clear.html'));

    await expect(service.getCatalog()).rejects.toThrow('does not link to monitoring results');
  });
});
