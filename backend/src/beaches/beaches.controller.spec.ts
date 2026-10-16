
import { NotFoundException } from '@nestjs/common';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
import { NwsPersistenceService } from '../ingestion/nws-persistence.service';

describe('BeachesController', () => {
  const beachesService = {
    findAll: jest.fn(),
  };

  const nwsPersistence = {
    getStoredConditionsByBeach: jest.fn(),
    getStoredAlertsByBeach: jest.fn(),
  };

  let controller: BeachesController;

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new BeachesController(
      beachesService as unknown as BeachesService,
      nwsPersistence as unknown as NwsPersistenceService,
    );
  });

  it('returns stored conditions for an existing beach', async () => {
    const stored = {
      beachId: '1',
      zoneId: 'PRZ001',
      condition: {
        risk: 'high',
        summary: 'High rip current risk',
      },
    };

    nwsPersistence.getStoredConditionsByBeach.mockResolvedValue(stored);

    await expect(controller.getConditions('1')).resolves.toEqual(stored);

    expect(
      nwsPersistence.getStoredConditionsByBeach,
    ).toHaveBeenCalledWith('1');
  });

  it('returns 404 when conditions are requested for a nonexistent beach', async () => {
    nwsPersistence.getStoredConditionsByBeach.mockResolvedValue(null);

    await expect(
      controller.getConditions('999999'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns stored alerts for an existing beach', async () => {
    const stored = {
      beachId: '1',
      zoneId: 'PRZ001',
      alerts: [{ id: 'test-alert', title: 'High Surf Advisory' }],
    };

    nwsPersistence.getStoredAlertsByBeach.mockResolvedValue(stored);

    await expect(controller.getAlerts('1')).resolves.toEqual(stored);

    expect(
      nwsPersistence.getStoredAlertsByBeach,
    ).toHaveBeenCalledWith('1');
  });

  it('returns 404 when alerts are requested for a nonexistent beach', async () => {
    nwsPersistence.getStoredAlertsByBeach.mockResolvedValue(null);

    await expect(
      controller.getAlerts('999999'),
    ).rejects.toThrow(NotFoundException);
  });
});
