import { Test } from '@nestjs/testing';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import type { AlertsResponseDto } from './dto/alerts-response.dto';
import type { OceanRiskResponseDto } from './dto/ocean-risk-response.dto';
import { NwsConditionsService } from './nws-conditions.service';

describe('ConditionsController', () => {
  let controller: ConditionsController;
  let service: jest.Mocked<ConditionsService>;
  let nws: jest.Mocked<NwsConditionsService>;

  beforeEach(async () => {
    const serviceMock = {
      getWaterQuality: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [ConditionsController],
      providers: [
        {
          provide: ConditionsService,
          useValue: serviceMock,
        },
        {
          provide: NwsConditionsService,
          useValue: { getOceanRisk: jest.fn(), getAlerts: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(ConditionsController);
    service = module.get(ConditionsService);
    nws = module.get(NwsConditionsService);
  });

  it('returns the normalized ocean risk for a beach', async () => {
    const risk: OceanRiskResponseDto = {
      beachId: 1,
      zoneId: 'PRZ001',
      status: 'high',
      summary: 'High rip-current risk.',
      forecastPeriod: 'TODAY',
      source: 'NWS',
      observedAt: '2026-10-17T09:00:00.000Z',
      retrievedAt: '2026-10-17T12:00:00.000Z',
      availability: 'available',
    };
    nws.getOceanRisk.mockResolvedValue(risk);

    await expect(controller.getOceanRisk(1)).resolves.toEqual(risk);
    expect(nws.getOceanRisk).toHaveBeenCalledWith(1);
  });

  it('returns unavailable ocean risk as unknown', async () => {
    const risk: OceanRiskResponseDto = {
      beachId: 1,
      zoneId: null,
      status: 'unknown',
      summary: 'NWS rip-current risk is unavailable for this beach.',
      forecastPeriod: null,
      source: 'NWS',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
      unavailableReason: 'beach-not-mapped',
    };
    nws.getOceanRisk.mockResolvedValue(risk);

    await expect(controller.getOceanRisk(1)).resolves.toEqual(risk);
  });

  it('returns active alerts for a beach', async () => {
    const alerts: AlertsResponseDto = {
      beachId: 1,
      zoneId: 'PRZ001',
      status: 'no-active-alerts',
      source: 'NWS',
      retrievedAt: '2026-10-17T12:00:00.000Z',
      availability: 'available',
      alerts: [],
    };
    nws.getAlerts.mockResolvedValue(alerts);

    await expect(controller.getAlerts(1)).resolves.toEqual(alerts);
    expect(nws.getAlerts).toHaveBeenCalledWith(1);
  });

  it('returns unavailable alerts with null alerts', async () => {
    const alerts: AlertsResponseDto = {
      beachId: 1,
      zoneId: 'PRZ001',
      status: 'unknown',
      source: 'NWS',
      retrievedAt: null,
      availability: 'unavailable',
      unavailableReason: 'no-data',
      alerts: null,
    };
    nws.getAlerts.mockResolvedValue(alerts);

    await expect(controller.getAlerts(1)).resolves.toEqual(alerts);
  });

  it('returns normalized water-quality data for a beach', async () => {
    service.getWaterQuality.mockResolvedValue({
      status: 'suitable',
      source: 'DRNA',
      sourceUrl: 'https://www.drna.pr.gov/',
      observedAt: '2026-10-04',
      retrievedAt: '2026-10-04T12:30:00.000Z',
      availability: 'available',
    });

    const result = await controller.getWaterQuality(1);

    expect(service.getWaterQuality).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      status: 'suitable',
      source: 'DRNA',
      sourceUrl: 'https://www.drna.pr.gov/',
      observedAt: '2026-10-04',
      retrievedAt: '2026-10-04T12:30:00.000Z',
      availability: 'available',
    });
  });

  it('returns unavailable water-quality data for a beach', async () => {
    service.getWaterQuality.mockResolvedValue({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });

    const result = await controller.getWaterQuality(1);

    expect(service.getWaterQuality).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });
  });
});