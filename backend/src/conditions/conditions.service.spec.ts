import { Test } from '@nestjs/testing';
import { ConditionsService } from './conditions.service';
import { DrnaService } from '../data-sources/drna/drna.service';

describe('ConditionsService', () => {
  let service: ConditionsService;
  let drnaService: jest.Mocked<DrnaService>;

  beforeEach(async () => {
    const drnaServiceMock = {
      getWaterQuality: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ConditionsService,
        {
          provide: DrnaService,
          useValue: drnaServiceMock,
        },
      ],
    }).compile();

    service = module.get(ConditionsService);
    drnaService = module.get(DrnaService);
  });

  it('returns normalized water-quality data when DRNA data is available', async () => {
    drnaService.getWaterQuality.mockResolvedValue({
      status: 'safe',
      source: {
        sourceName: 'DRNA',
        sourceUrl: 'https://www.drna.pr.gov/',
        observedAt: '2026-10-04T12:00:00.000Z',
        retrievedAt: '2026-10-04T12:30:00.000Z',
      },
    });

    const result = await service.getWaterQuality('test-beach');

    expect(result).toEqual({
      status: 'safe',
      source: 'DRNA',
      sourceUrl: 'https://www.drna.pr.gov/',
      observedAt: '2026-10-04T12:00:00.000Z',
      retrievedAt: '2026-10-04T12:30:00.000Z',
      availability: 'available',
    });
  });

  it('returns unavailable when DRNA data is unavailable', async () => {
    drnaService.getWaterQuality.mockResolvedValue(null);

    const result = await service.getWaterQuality('test-beach');

    expect(result).toEqual({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });
  });
});