import { Logger } from '@nestjs/common';
import { DRNA_REFRESH_INTERVAL_MS, IngestionScheduler, NWS_REFRESH_INTERVAL_MS } from './ingestion.scheduler';
import { NwsIngestionService } from './nws-ingestion.service';
import { IngestionService } from './ingestion.service';

describe('IngestionScheduler', () => {
  let scheduler: IngestionScheduler;
  let query: jest.Mock;
  let refreshZones: jest.Mock;
  let refreshDrna: jest.Mock;
  let historyInsert: jest.Mock;
  const originalNwsEnabled = process.env.NWS_SCHEDULER_ENABLED;
  const originalDrnaEnabled = process.env.DRNA_SCHEDULER_ENABLED;

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.NWS_SCHEDULER_ENABLED;
    delete process.env.DRNA_SCHEDULER_ENABLED;
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    query = jest.fn().mockResolvedValue([
      { nws_forecast_zone: 'PRZ001' },
    ]);

    historyInsert = jest.fn().mockResolvedValue(undefined);

    const db = jest.fn((table: string) => {
      if (table === 'source_refresh_history') {
        return { insert: historyInsert };
      }

      return {
        distinct: () => ({ whereNotNull: query }),
      };
    });
    refreshZones = jest.fn().mockResolvedValue({ attempted: 2, failed: 0 });
    refreshDrna = jest.fn().mockResolvedValue(undefined);
    scheduler = new IngestionScheduler(db as never, { refreshZones } as unknown as NwsIngestionService, { refresh: refreshDrna } as unknown as IngestionService);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalNwsEnabled === undefined) delete process.env.NWS_SCHEDULER_ENABLED;
    else process.env.NWS_SCHEDULER_ENABLED = originalNwsEnabled;
    if (originalDrnaEnabled === undefined) delete process.env.DRNA_SCHEDULER_ENABLED;
    else process.env.DRNA_SCHEDULER_ENABLED = originalDrnaEnabled;
  });

  it('starts once, refreshes immediately and every 30 minutes, and stops on shutdown', async () => {
    scheduler.start();
    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshZones).toHaveBeenCalledWith(['PRZ001']);
    await jest.advanceTimersByTimeAsync(NWS_REFRESH_INTERVAL_MS);
    expect(refreshZones).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(NWS_REFRESH_INTERVAL_MS);
    expect(refreshZones).toHaveBeenCalledTimes(2);
  });

  it('skips ticks while an earlier refresh is in progress', async () => {
    let finish!: (value: { attempted: number; failed: number }) => void;
    refreshZones.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = scheduler.tick();
    await Promise.resolve();
    await scheduler.tick();
    expect(refreshZones).toHaveBeenCalledTimes(1);
    finish({ attempted: 2, failed: 0 });
    await first;
    await scheduler.tick();
    expect(refreshZones).toHaveBeenCalledTimes(2);
  });

  it('logs partial failure and allows the next scheduled run', async () => {
    refreshZones.mockResolvedValueOnce({ attempted: 4, failed: 1 });
    await scheduler.tick();
    expect(Logger.prototype.warn).toHaveBeenCalledWith('1 NWS refresh requests failed');
    await scheduler.tick();
    expect(refreshZones).toHaveBeenCalledTimes(2);
  });

  it('recovers from a database query failure on the next tick', async () => {
    query.mockRejectedValueOnce(new Error('offline'));
    await expect(scheduler.tick()).resolves.toBeUndefined();
    await scheduler.tick();
    expect(refreshZones).toHaveBeenCalledTimes(1);
  });

  it('does not start any timers just by constructing the provider for a manual command', () => {
    expect(jest.getTimerCount()).toBe(0);
    expect(refreshDrna).not.toHaveBeenCalled();
    expect(refreshZones).not.toHaveBeenCalled();
  });

  it('refreshes DRNA at startup and every six hours, starts once, and clears both timers', async () => {
    scheduler.start();
    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshDrna).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(DRNA_REFRESH_INTERVAL_MS - 1);
    expect(refreshDrna).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(refreshDrna).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(DRNA_REFRESH_INTERVAL_MS);
    expect(refreshDrna).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['DRNA_SCHEDULER_ENABLED', 0, 13],
    ['NWS_SCHEDULER_ENABLED', 2, 0],
  ])('disables %s independently', async (flag, drnaCalls, nwsCalls) => {
    process.env[flag] = 'false';
    scheduler.start();
    await jest.advanceTimersByTimeAsync(DRNA_REFRESH_INTERVAL_MS);
    expect(refreshDrna).toHaveBeenCalledTimes(Number(drnaCalls));
    expect(refreshZones).toHaveBeenCalledTimes(Number(nwsCalls));
    expect(jest.getTimerCount()).toBe(1);
  });

  it('skips overlapping DRNA ticks without blocking NWS', async () => {
    let finish!: () => void;
    refreshDrna.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const first = scheduler.tickDrna();
    await scheduler.tickDrna();
    await scheduler.tick();
    expect(refreshDrna).toHaveBeenCalledTimes(1);
    expect(refreshZones).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await scheduler.tickDrna();
    expect(refreshDrna).toHaveBeenCalledTimes(2);
  });

  it('retries a failed DRNA run on schedule while NWS keeps running', async () => {
    refreshDrna.mockRejectedValueOnce(new Error('DRNA offline'));
    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(Logger.prototype.error).toHaveBeenCalledWith('DRNA refresh failed; retrying on the next scheduled tick');
    await jest.advanceTimersByTimeAsync(DRNA_REFRESH_INTERVAL_MS);
    expect(refreshDrna).toHaveBeenCalledTimes(2);
    expect(refreshZones).toHaveBeenCalledTimes(13);
  });

  it('does not let an NWS query failure block DRNA', async () => {
    query.mockRejectedValue(new Error('NWS zone query failed'));
    scheduler.start();
    await jest.advanceTimersByTimeAsync(DRNA_REFRESH_INTERVAL_MS);
    expect(refreshDrna).toHaveBeenCalledTimes(2);
  });

  it('records successful DRNA scheduled refreshes', async () => {
    await scheduler.tickDrna();

    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'drna',
        source_key: 'scheduled-run',
        succeeded: true,
        zone_id: null,
      }),
    );
  });

  it('records failed DRNA scheduled refreshes', async () => {
    refreshDrna.mockRejectedValueOnce(new Error('DRNA unavailable'));

    await scheduler.tickDrna();

    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'drna',
        succeeded: false,
      }),
    );
  });

  it('records partial NWS refresh failures', async () => {
    refreshZones.mockResolvedValueOnce({
      attempted: 4,
      failed: 1,
    });

    await scheduler.tick();

    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'nws',
        source_key: 'scheduled-run',
        succeeded: false,
      }),
    );
  });

  it('continues scheduling when history persistence fails', async () => {
    historyInsert.mockRejectedValueOnce(new Error('Database unavailable'));

    await expect(scheduler.tickDrna()).resolves.toBeUndefined();

    await scheduler.tickDrna();

    expect(refreshDrna).toHaveBeenCalledTimes(2);
    expect(historyInsert).toHaveBeenCalledTimes(2);
  });
});
