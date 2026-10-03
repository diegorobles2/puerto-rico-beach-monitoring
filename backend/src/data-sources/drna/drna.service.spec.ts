import { DrnaService, findLatestRecord } from './drna.service';

const NOTICE_URL =
  'https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-269/';
const PDF_URL = 'https://www.drna.pr.gov/wp-content/uploads/2026/09/results.pdf';
const archive = `<a href="${NOTICE_URL}">Notificación Monitoria de Playas</a>`;
const notification = `<a href="${PDF_URL}">Resultados</a>`;
const pdf = new TextEncoder().encode('%PDF fixture');
const extractedRow =
  '21-Sep-2026 RW-22 Pico de Piedra -67.2129889 Route 5: Añasco - Aguadilla Routine 231 29 8.19';

function response(body: BodyInit, status = 200) {
  return new Response(body, { status });
}

function service(responses: Response[], extractedText = extractedRow) {
  const fetcher = jest.fn(async () => responses.shift() ?? response('', 500));
  return { service: new DrnaService(fetcher, async () => extractedText), fetcher };
}

describe('DrnaService', () => {
  it('discovers the latest source and maps its newest station result', async () => {
    const adapter = service([response(archive), response(notification), response(pdf)]);

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
    const adapter = service([response(archive), response(notification), response(pdf)], 'unrelated content');
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
    ).toEqual({
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
});
