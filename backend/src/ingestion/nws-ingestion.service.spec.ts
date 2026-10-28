
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

  it('records upstream failures without saving them and still persists other sources and zones', async () => {
    persistence.saveCondition.mockResolvedValue(undefined);
    persistence.saveAlerts.mockResolvedValue(undefined);
    const condition = { zoneId: 'PRZ002' };
    nws.getConditions.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(condition);
    nws.getActiveAlerts.mockResolvedValue([]);

    await expect(service.refreshZones(['PRZ001', 'PRZ002'])).resolves.toEqual({ attempted: 4, failed: 1 });

    expect(persistence.saveCondition).toHaveBeenCalledTimes(1);
    expect(persistence.saveCondition).toHaveBeenCalledWith(condition);
    expect(persistence.saveAlerts).toHaveBeenCalledTimes(2);
    expect(persistence.recordRetrieval).toHaveBeenCalledWith('conditions', 'PRZ001', false, expect.any(String));
    expect(persistence.recordRetrieval).toHaveBeenCalledWith('alerts', 'PRZ002', true, expect.any(String));
  });
});
