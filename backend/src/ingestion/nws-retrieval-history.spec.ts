
import { NwsPersistenceService } from './nws-persistence.service';

describe('NWS retrieval history', () => {
  let service: NwsPersistenceService;
  let healthInsert: jest.Mock;
  let historyInsert: jest.Mock;
  let transaction: jest.Mock;

  beforeEach(() => {
    const merge = jest.fn().mockResolvedValue(undefined);
    const onConflict = jest.fn(() => ({ merge }));

    healthInsert = jest.fn(() => ({ onConflict }));
    historyInsert = jest.fn().mockResolvedValue(undefined);

    const trx = Object.assign(
      jest.fn((table: string) => {
        if (table === 'nws_source_health') {
          return { insert: healthInsert };
        }

        if (table === 'source_refresh_history') {
          return { insert: historyInsert };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      {
        raw: jest.fn((sql: string) => sql),
        fn: { now: jest.fn(() => 'NOW()') },
      },
    );

    transaction = jest.fn(async (callback) => callback(trx));

    service = new NwsPersistenceService({
      transaction,
    } as never);
  });

  it('records successful retrievals in both tables', async () => {
    await service.recordRetrieval(
      'conditions',
      'PRZ001',
      true,
      new Date().toISOString(),
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(healthInsert).toHaveBeenCalledTimes(1);

    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'nws',
        source_key: 'conditions',
        zone_id: 'PRZ001',
        succeeded: true,
      }),
    );
  });

  it('records failed retrieval attempts', async () => {
    await service.recordRetrieval(
      'alerts',
      'PRZ002',
      false,
      new Date().toISOString(),
    );

    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'nws',
        source_key: 'alerts',
        zone_id: 'PRZ002',
        succeeded: false,
      }),
    );
  });

  it('propagates failures when history insertion fails', async () => {
    historyInsert.mockRejectedValueOnce(
      new Error('History insert failed'),
    );

    await expect(
      service.recordRetrieval(
        'conditions',
        'PRZ003',
        true,
        new Date().toISOString(),
      ),
    ).rejects.toThrow('History insert failed');
  });
});
