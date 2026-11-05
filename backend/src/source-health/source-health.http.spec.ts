import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../app.module';
import { DATABASE } from '../database/database.module';

interface Attempt {
  id: number;
  source: 'nws' | 'drna';
  source_key: string;
  started_at: Date | string;
  succeeded: boolean;
}

describe('Source health through the registered application API', () => {
  let app: INestApplication;
  let rows: Attempt[];
  let queryError: Error | undefined;
  const now = Date.parse('2026-11-05T12:00:00Z');
  const recent = '2026-11-05T11:50:00.000Z';
  const empty = { lastAttemptAt: null, lastAttemptSucceeded: null, lastSuccessAt: null, state: 'no-history' };
  const timeout = jest.fn();
  const raw = jest.fn(() => ({ timeout }));
  const db = Object.assign(jest.fn((table: string) => {
    expect(table).toBe('source_refresh_history');
    let matches = [...rows];
    const query = {
      where: (filter: Partial<Attempt>) => {
        matches = matches.filter((row) => Object.entries(filter).every(([key, value]) => row[key as keyof Attempt] === value));
        return query;
      },
      orderBy: () => query,
      first: async () => {
        if (queryError) throw queryError;
        return matches.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime() || b.id - a.id)[0];
      },
    };
    return query;
  }), { raw, destroy: jest.fn().mockResolvedValue(undefined) });

  function add(source: Attempt['source'], started_at: Date | string = recent, succeeded = true, source_key = 'scheduled-run') {
    rows.push({ id: rows.length + 1, source, source_key, started_at, succeeded });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE).useValue(db).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    rows = [];
    queryError = undefined;
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it('returns successful persisted histories with exact fields and UTC timestamps', async () => {
    add('nws', new Date(recent));
    add('drna', '2026-11-05T07:50:00-04:00');
    const expected = { lastAttemptAt: recent, lastAttemptSucceeded: true, lastSuccessAt: recent, state: 'succeeded' };
    await request(app.getHttpServer()).get('/health/sources').expect(200, { nws: expected, drna: expected });
    expect(db).toHaveBeenCalledTimes(4);
  });

  it('retains earlier successes after latest failures independently for each source', async () => {
    for (const source of ['nws', 'drna'] as const) {
      add(source, '2026-11-05T11:30:00Z');
      add(source, recent, false);
    }
    const expected = { lastAttemptAt: recent, lastAttemptSucceeded: false, lastSuccessAt: '2026-11-05T11:30:00.000Z', state: 'failed' };
    await request(app.getHttpServer()).get('/health/sources').expect(200, { nws: expected, drna: expected });
  });

  it.each([
    ['2026-11-05T11:00:00Z', 'succeeded', 'succeeded'],
    ['2026-11-05T10:59:59.999Z', 'stale', 'succeeded'],
    ['2026-11-05T00:00:00Z', 'stale', 'succeeded'],
    ['2026-11-04T23:59:59.999Z', 'stale', 'stale'],
  ])('preserves independent stale thresholds at %s', async (at, nws, drna) => {
    add('nws', at);
    add('drna', at);
    const response = await request(app.getHttpServer()).get('/health/sources').expect(200);
    expect(response.body.nws.state).toBe(nws);
    expect(response.body.drna.state).toBe(drna);
  });

  it('keeps stale precedence while exposing the latest failed attempt', async () => {
    add('nws', '2026-11-05T10:00:00Z');
    add('nws', recent, false);
    const response = await request(app.getHttpServer()).get('/health/sources').expect(200);
    expect(response.body.nws).toEqual({ lastAttemptAt: recent, lastAttemptSucceeded: false, lastSuccessAt: '2026-11-05T10:00:00.000Z', state: 'stale' });
    expect(response.body.drna).toEqual(empty);
  });

  it('returns explicit no-history and ignores individual NWS zone retrievals', async () => {
    add('nws', recent, true, 'conditions');
    add('nws', recent, false, 'alerts');
    await request(app.getHttpServer()).get('/health/sources').expect(200, { nws: empty, drna: empty });
  });

  it('reports failure without inventing a success or changing the other source', async () => {
    add('drna', recent, false);
    await request(app.getHttpServer()).get('/health/sources').expect(200, {
      nws: empty,
      drna: { lastAttemptAt: recent, lastAttemptSucceeded: false, lastSuccessAt: null, state: 'failed' },
    });
  });

  it('sanitizes query failures and preserves liveness/readiness contracts', async () => {
    queryError = new Error('SELECT secret SQL; postgres://user:password@private-host/database');
    await request(app.getHttpServer()).get('/health/sources').expect(503, {
      statusCode: 503, message: 'Source health is unavailable', error: 'Service Unavailable',
    });
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    expect(raw).not.toHaveBeenCalled();
    timeout.mockResolvedValueOnce({ rows: [] });
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ready' });
    expect(raw).toHaveBeenCalledWith('select 1');
    expect(timeout).toHaveBeenCalledWith(2000);
  });
});
