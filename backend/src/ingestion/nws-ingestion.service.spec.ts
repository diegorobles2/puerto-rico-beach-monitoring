
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
      false,
      expect.any(String),
    );

    expect(persistence.recordRetrieval).not.toHaveBeenCalledWith(
      'conditions',
      true,
      expect.any(String),
    );
  });
});