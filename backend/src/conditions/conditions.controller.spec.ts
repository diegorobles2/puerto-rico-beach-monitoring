import { Test } from '@nestjs/testing';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';

describe('ConditionsController', () => {
  let controller: ConditionsController;
  let service: jest.Mocked<ConditionsService>;

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
      ],
    }).compile();

    controller = module.get(ConditionsController);
    service = module.get(ConditionsService);
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

    const result = await controller.getWaterQuality('test-beach');

    expect(service.getWaterQuality).toHaveBeenCalledWith('test-beach');

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

    const result = await controller.getWaterQuality('test-beach');

    expect(service.getWaterQuality).toHaveBeenCalledWith('test-beach');

    expect(result).toEqual({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });
  });
});