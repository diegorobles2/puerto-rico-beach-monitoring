import { Logger } from '@nestjs/common';
import { IngestionScheduler, NWS_REFRESH_INTERVAL_MS } from './ingestion.scheduler';
import { NwsIngestionService } from './nws-ingestion.service';

describe('IngestionScheduler', () => {
  let scheduler: IngestionScheduler;
  let query: jest.Mock;
  let refreshZones: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    query = jest.fn().mockResolvedValue([{ nws_forecast_zone: 'PRZ001' }]);
    const db = jest.fn(() => ({ distinct: () => ({ whereNotNull: query }) }));
    refreshZones = jest.fn().mockResolvedValue({ attempted: 2, failed: 0 });
    scheduler = new IngestionScheduler(db as never, { refreshZones } as unknown as NwsIngestionService);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
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
});
