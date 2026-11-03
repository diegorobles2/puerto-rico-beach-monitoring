import { SourceHealthService } from './source-health.service';

describe('SourceHealthService', () => {
  const recent = new Date('2026-11-02T11:50:00Z');
  let service: SourceHealthService;
  let first: jest.Mock;
  let where: jest.Mock;
  let orderBy: jest.Mock;
  let db: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T12:00:00Z'));
    first = jest.fn().mockResolvedValue(undefined);
    where = jest.fn().mockReturnThis();
    orderBy = jest.fn().mockReturnThis();
    db = jest.fn(() => ({ where, orderBy, first }));
    service = new SourceHealthService(db as never);
  });

  afterEach(() => jest.useRealTimers());

  function history(succeeded: boolean, successAt: Date | string | null) {
    for (let i = 0; i < 2; i++) {
      first.mockResolvedValueOnce({ started_at: succeeded ? successAt : recent, succeeded })
        .mockResolvedValueOnce(successAt ? { started_at: successAt } : undefined);
    }
  }

  it('returns nulls with no history and filters both sources to scheduled runs', async () => {
    const empty = {
      lastAttemptAt: null, lastAttemptSucceeded: null, lastSuccessAt: null, state: 'no-history',
    };
    expect(await service.getStatus()).toEqual({ nws: empty, drna: empty });
    expect(db).toHaveBeenCalledTimes(4);
    expect(db).toHaveBeenCalledWith('source_refresh_history');
    for (const source of ['nws', 'drna']) {
      expect(where.mock.calls.filter(([filter]) => filter.source === source))
        .toEqual([[{ source, source_key: 'scheduled-run' }], [{ source, source_key: 'scheduled-run' }]]);
    }
    expect(where.mock.calls.filter(([filter]) => filter.succeeded === true)).toHaveLength(2);
    expect(orderBy).toHaveBeenCalledWith('started_at', 'desc');
    expect(orderBy).toHaveBeenCalledWith('id', 'desc');
  });

  it('returns the latest successful attempt with ISO timestamps', async () => {
    history(true, recent.toISOString());
    for (const status of Object.values(await service.getStatus())) {
      expect(status).toEqual({
        lastAttemptAt: recent.toISOString(), lastAttemptSucceeded: true,
        lastSuccessAt: recent.toISOString(), state: 'succeeded',
      });
    }
  });

  it('retains an earlier success after a failed attempt', async () => {
    history(false, '2026-11-02T11:30:00Z');
    expect((await service.getStatus()).nws).toMatchObject({
      state: 'failed', lastAttemptSucceeded: false, lastSuccessAt: '2026-11-02T11:30:00.000Z',
    });
  });

  it('handles failure without any successful refresh', async () => {
    history(false, null);
    expect((await service.getStatus()).drna).toMatchObject({
      state: 'failed', lastAttemptSucceeded: false, lastSuccessAt: null,
    });
  });

  it.each([
    ['2026-11-02T11:00:00Z', 'succeeded', 'succeeded'],
    ['2026-11-02T10:59:59Z', 'stale', 'succeeded'],
    ['2026-11-02T00:00:00Z', 'stale', 'succeeded'],
    ['2026-11-01T23:59:59Z', 'stale', 'stale'],
  ])('applies source-specific execution freshness at %s', async (timestamp, nws, drna) => {
    history(true, timestamp);
    const result = await service.getStatus();
    expect(result.nws.state).toBe(nws);
    expect(result.drna.state).toBe(drna);
  });

  it('preserves latest failure when the earlier success is stale', async () => {
    history(false, '2026-11-01T23:00:00Z');
    expect((await service.getStatus()).nws).toMatchObject({ state: 'stale', lastAttemptSucceeded: false });
  });

  it('propagates database query failures', async () => {
    first.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.getStatus()).rejects.toThrow('database unavailable');
  });
});
