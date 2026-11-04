import { NotFoundException } from '@nestjs/common';
import { ConditionsService } from './conditions.service';

describe('ConditionsService', () => {
  it('returns normalized water-quality data when an observation exists', async () => {
    const db = createDbMock(
      { id: 1 },
      {
        status: 'suitable',
        sampled_at: new Date(2026, 9, 4),
        retrieved_at: new Date('2026-10-04T12:30:00.000Z'),
        source_url: 'https://www.drna.pr.gov/',
        enterococcus_value: 20,
        enterococcus_qualifier: 'less-than',
        sampling_type: 'routine',
        temperature_celsius: '29.2',
        ph: '8.04',
      },
    );

    const service = new ConditionsService(db as never);

    const result = await service.getWaterQuality(1);

    expect(result).toEqual({
      status: 'suitable',
      source: 'DRNA',
      sourceUrl: 'https://www.drna.pr.gov/',
      observedAt: '2026-10-04',
      retrievedAt: '2026-10-04T12:30:00.000Z',
      availability: 'available',
      enterococcusValue: 20,
      enterococcusQualifier: 'less-than',
      samplingType: 'routine',
      temperatureCelsius: 29.2,
      ph: 8.04,
    });
  });

  it('returns unavailable when the beach exists but has no observation', async () => {
    const db = createDbMock({ id: 1 }, undefined);
    const service = new ConditionsService(db as never);

    const result = await service.getWaterQuality(1);

    expect(result).toEqual({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });
  });

  it('throws NotFoundException when the beach does not exist', async () => {
    const db = createDbMock(undefined, undefined);
    const service = new ConditionsService(db as never);

    await expect(service.getWaterQuality(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function createDbMock(
  beach: { id: number } | undefined,
  observation:
    | {
        status: string;
        sampled_at: Date | string;
        retrieved_at: Date | string;
        source_url: string;
        enterococcus_value: number | null;
        enterococcus_qualifier: 'less-than' | 'greater-than' | null;
        sampling_type: 'routine' | 'resampling' | 'unknown';
        temperature_celsius: number | string | null;
        ph: number | string | null;
      }
    | undefined,
) {
  return jest.fn((table: string) => {
    if (table === 'beaches') {
      return {
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(beach),
        }),
      };
    }

    if (table === 'water_quality_observations') {
      const query = {
        where: jest.fn(),
        orderBy: jest.fn(),
        first: jest.fn().mockResolvedValue(observation),
      };

      query.where.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);

      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}
