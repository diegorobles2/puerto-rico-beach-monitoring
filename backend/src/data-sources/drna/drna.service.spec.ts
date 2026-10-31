import { DrnaService, findLatestRecord, parseMonitoringRecords } from './drna.service';

const ARCHIVE_URL = 'https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/';
const NOTICE_URL =
  'https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-269/';
const PDF_URL = 'https://www.drna.pr.gov/wp-content/uploads/2026/09/results.pdf';
const archive = `<a href="${NOTICE_URL}">Notificación Monitoria de Playas</a>`;
const notification = `<a href="${PDF_URL}">Resultados</a>`;
const pdf = new TextEncoder().encode('%PDF fixture');
const extractedRow =
  '21-Sep-2026 RW-22 Pico de Piedra 18.3843639 -67.2129889 Route 5: Añasco - Aguadilla Routine 231 29 8.19';

function response(body: BodyInit, status = 200) {
  return new Response(body, { status });
}

function service(responses: Response[], extractedText: string | string[] = extractedRow) {
  const fetcher = jest.fn(async (url: string) => url.startsWith('https://geocoding.geo.census.gov/')
    ? response(JSON.stringify({ result: { geographies: { Counties: [{ BASENAME: 'Aguada' }] } } }))
    : responses.shift() ?? response('', 500));
  const texts = Array.isArray(extractedText) ? [...extractedText] : [extractedText, extractedText];
  return { service: new DrnaService(fetcher, async () => texts.shift() ?? ''), fetcher };
}

describe('DrnaService', () => {
  it('discovers the latest source and maps its newest station result', async () => {
    const adapter = service([response(archive), response(notification), response(pdf), response(notification), response(pdf)]);

    await expect(adapter.service.getWaterQuality('RW-22')).resolves.toMatchObject({
      stationId: 'RW-22',
      beachName: 'Pico de Piedra',
      status: 'advisory',
      enterococcus: { value: 231 },
      source: { sourceName: 'DRNA', sourceUrl: PDF_URL, observedAt: '21-Sep-2026' },
    });
    expect(adapter.fetcher).toHaveBeenNthCalledWith(1, expect.stringContaining('notificaciones-ambientales'), {
      signal: expect.any(AbortSignal),
    });
  });

  it('returns null when the station has no usable result', async () => {
    const adapter = service(
      [response(archive), response(notification), response(pdf), response(notification), response(pdf)],
      ['unrelated content', extractedRow],
    );
    await expect(adapter.service.getWaterQuality('RW-404')).resolves.toBeNull();
  });

  it('rejects a non-success response with source context', async () => {
    const adapter = service([response('unavailable', 503)]);
    await expect(adapter.service.getWaterQuality('RW-22')).rejects.toThrow(
      'DRNA notification archive returned HTTP 503',
    );
  });

  it('rejects transport failures without exposing their details', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('internal network details');
    });
    await expect(new DrnaService(fetcher).getWaterQuality('RW-22')).rejects.toThrow(
      'Unable to retrieve DRNA notification archive',
    );
  });

  it('rejects malformed notifications and non-PDF content', async () => {
    await expect(service([response(archive), response('<html />')]).service.getWaterQuality('RW-22')).rejects.toThrow(
      'does not link to monitoring results',
    );
    await expect(
      service([response(archive), response(notification), response('not a pdf')]).service.getWaterQuality('RW-22'),
    ).rejects.toThrow('not a valid PDF');
  });
});

describe('findLatestRecord', () => {
  it('uses the last matching row and preserves less-than values', () => {
    expect(
      findLatestRecord(
        `${extractedRow}\n22-Sep-2026 RW-22 Pico de Piedra Re-Sampling < 10 29.2 Re-sampling`,
        'RW-22',
      ),
    ).toMatchObject({
      date: '22-Sep-2026',
      beachId: 'RW-22',
      beachName: 'Pico de Piedra',
      samplingType: 'Re-Sampling',
      enterococcus: '<10',
      temperatureCelsius: '29.2',
      ph: null,
      observations: 'Re-sampling',
    });
  });

  it('retrieves DRNA stations without requiring Census geocoding', async () => {
    const adapter = service([
      response(archive),
      response(notification),
      response(pdf),
      response(notification),
      response(pdf),
    ]);

    await expect(adapter.service.getCatalog()).resolves.toMatchObject({
      stations: [
        {
          stationId: 'RW-22',
          municipality: 'Unavailable',
        },
      ],
    });

    expect(adapter.fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('geocoding.geo.census.gov'),
      expect.anything(),
    );
  });

  it('discovers coordinate metadata from the oldest DRNA archive page', async () => {
    const oldNoticeUrl = 'https://www.drna.pr.gov/notificacion-monitoria-de-playas-1/';
    const pagedArchive = `${archive}<a href="${ARCHIVE_URL}page/23/">23</a>`;
    const oldArchive = `<a href="${oldNoticeUrl}">Oldest notification</a>`;
    const adapter = service([
      response(pagedArchive), response(notification), response(pdf), response(oldArchive),
      response(notification), response(pdf),
    ]);

    await adapter.service.getCatalog();

    expect(adapter.fetcher).toHaveBeenCalledWith(`${ARCHIVE_URL}page/23/`, { signal: expect.any(AbortSignal) });
    expect(adapter.fetcher).toHaveBeenCalledWith(oldNoticeUrl, { signal: expect.any(AbortSignal) });
  });

  it('keeps reference coordinates when a newer row moves a station implausibly', async () => {
    const current = '21-Sep-2026 RW-22 Pico de Piedra 18.4611306 -66.0824083 Route 5: Añasco - Aguadilla Routine 20 29 8.1';
    const adapter = service(
      [response(archive), response(notification), response(pdf), response(notification), response(pdf)],
      [current, extractedRow],
    );

    await expect(adapter.service.getCatalog()).resolves.toMatchObject({
      stations: [{ stationId: 'RW-22', latitude: 18.3843639, longitude: -67.2129889 }],
    });
  });

  it('parses routine, resampling, missing-data, and multiline rows while rejecting malformed rows', () => {
    const parsed = parseMonitoringRecords([
      '21-Sep-2026 RW-15 Balneario de Añasco or',
      'Balneario Tres Hermanos 18.2879972 -67.1939222 Route 5: Añasco - Aguadilla Routine <10 29.2 8.04',
      '22-Sep-2026 RW-15 Balneario Tres Hermanos Re-Sampling 20 29.4 Re-sampling',
      '21-Sep-2026 RW-16 Balneario Crash Boat -67.1637778 Route 5: Añasco - Aguadilla Routine',
      '21-Sep-2026 RW-BAD malformed row',
    ].join('\n'));

    expect(parsed.records).toHaveLength(3);
    expect(parsed.records[0]).toMatchObject({ beachId: 'RW-15', beachName: 'Balneario de Añasco or Balneario Tres Hermanos', latitude: '18.2879972', enterococcus: '<10' });
    expect(parsed.records[1]).toMatchObject({ samplingType: 'Re-Sampling', observations: 'Re-sampling' });
    expect(parsed.records[2]).toMatchObject({ beachId: 'RW-16', enterococcus: null });
    expect(parsed.rejectedRows).toBe(1);
  });

  it('parses greater-than measurements without shifting later columns', () => {
    expect(parseMonitoringRecords(
      '20-Jul-2026 RW-34 Playa Cabullón 17.9692833 -66.6027278 Route 3: Lajas - Salinas Re-Sampling >24,196 27.5 Re-sampling',
    ).records[0]).toMatchObject({ enterococcus: '>24,196', temperatureCelsius: '27.5' });
  });
});
