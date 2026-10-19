
import { NwsIngestionService } from './nws-ingestion.service';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsPersistenceService } from './nws-persistence.service';

describe('NwsIngestionService', () => {
  let service: NwsIngestionService;

  const nws = {
    getConditions: jest.fn(),
    getActiveAlerts: jest.fn(),
  };

  const persistence = {
    saveCondition: jest.fn(),
    saveAlerts: jest.fn(),
    recordRetrieval: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    persistence.recordRetrieval.mockResolvedValue(undefined);

    service = new NwsIngestionService(
      nws as unknown as NwsService,
      persistence as unknown as NwsPersistenceService,
    );
  });

  it('records a failed conditions retrieval without overwriting stored data', async () => {
    const error = new Error('NWS unavailable');

    nws.getConditions.mockRejectedValue(error);

    await expect(
      service.refreshConditions('PRZ001'),
    ).rejects.toThrow('NWS unavailable');

    expect(persistence.saveCondition).not.toHaveBeenCalled();

    expect(persistence.recordRetrieval).toHaveBeenCalledWith(
      'conditions',
      'PRZ001',
      false,
      expect.any(String),
    );
  });

  it('records a failed alerts retrieval without changing stored alerts', async () => {
    const error = new Error('NWS unavailable');

    nws.getActiveAlerts.mockRejectedValue(error);

    await expect(
      service.refreshAlerts('PRZ001'),
    ).rejects.toThrow('NWS unavailable');

    expect(persistence.saveAlerts).not.toHaveBeenCalled();

    expect(persistence.recordRetrieval).toHaveBeenCalledWith(
      'alerts',
      'PRZ001',
      false,
      expect.any(String),
    );
  });

  it('retains last-known condition and alert records after a later refresh fails', async () => {
    const lastKnownCondition = {
      zoneId: 'PRZ001',
      forecastPeriod: 'TODAY',
      risk: 'moderate',
      summary: 'Moderate rip-current risk.',
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://api.weather.gov/products/srf-known',
        observedAt: '2026-10-16T12:00:00.000Z',
        retrievedAt: '2026-10-16T12:05:00.000Z',
      },
    };
    const lastKnownAlerts = [{ id: 'known-alert', title: 'High Surf Advisory' }];
    let storedCondition: typeof lastKnownCondition | undefined;
    let storedAlerts: typeof lastKnownAlerts | undefined;
    persistence.saveCondition.mockImplementation(async (value) => { storedCondition = value; });
    persistence.saveAlerts.mockImplementation(async (_zoneId, value) => { storedAlerts = value; });

    nws.getConditions.mockResolvedValueOnce(lastKnownCondition).mockRejectedValueOnce(new Error('timeout'));
    nws.getActiveAlerts.mockResolvedValueOnce(lastKnownAlerts).mockRejectedValueOnce(new Error('HTTP 503'));

    await service.refreshConditions('PRZ001');
    await expect(service.refreshConditions('PRZ001')).rejects.toThrow('timeout');
    await service.refreshAlerts('PRZ001');
    await expect(service.refreshAlerts('PRZ001')).rejects.toThrow('HTTP 503');

    expect(storedCondition).toBe(lastKnownCondition);
    expect(storedAlerts).toBe(lastKnownAlerts);
    expect(persistence.recordRetrieval).toHaveBeenNthCalledWith(2, 'conditions', 'PRZ001', false, expect.any(String));
    expect(persistence.recordRetrieval).toHaveBeenNthCalledWith(4, 'alerts', 'PRZ001', false, expect.any(String));
  });

  it('records a failed ingestion when saving conditions fails', async () => {
    const condition = {
      zoneId: 'PRZ001',
      forecastPeriod: 'Today',
      risk: 'high',
      summary: 'High rip current risk',
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt: '2026-10-16T12:00:00.000Z',
      },
    };

    const databaseError = new Error('Database write failed');

    nws.getConditions.mockResolvedValue(condition);
    persistence.saveCondition.mockRejectedValue(databaseError);

    await expect(
      service.refreshConditions('PRZ001'),
    ).rejects.toThrow('Database write failed');

    expect(nws.getConditions).toHaveBeenCalledWith('PRZ001');

    expect(persistence.saveCondition).toHaveBeenCalledWith(
      condition,
    );

    expect(persistence.recordRetrieval).toHaveBeenCalledWith(
      'conditions',
      'PRZ001',
      false,
      expect.any(String),
    );

    expect(persistence.recordRetrieval).not.toHaveBeenCalledWith(
      'conditions',
      'PRZ001',
      true,
      expect.any(String),
    );
  });

  it('refreshes both sources once per distinct mapped zone and continues after failures', async () => {
    const conditions = jest.spyOn(service, 'refreshConditions').mockRejectedValue(new Error('unavailable'));
    const alerts = jest.spyOn(service, 'refreshAlerts').mockResolvedValue(undefined);

    await expect(service.refreshZones(['PRZ001', 'PRZ001', 'PRZ002']))
      .resolves.toEqual({ attempted: 4, failed: 2 });
    expect(conditions).toHaveBeenCalledTimes(2);
    expect(alerts).toHaveBeenCalledTimes(2);
  });
});
