import { NotFoundException } from '@nestjs/common';
import { ConditionsService } from './conditions.service';

describe('ConditionsService', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T12:00:00Z')));
  afterEach(() => jest.restoreAllMocks());
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

  it.each([
    ['2026-10-02', '2026-10-04T00:00:00Z', 'available'],
    ['2026-10-02', '2026-10-04T00:00:00.001Z', 'stale'],
    ['2000-01-01', '2026-10-04T12:00:00Z', 'stale'],
    ['2026-10-05', '2026-10-04T12:00:00Z', 'stale'],
    [null, '2026-10-04T12:00:00Z', 'stale'],
    ['invalid', '2026-10-04T12:00:00Z', 'stale'],
    ['2026-02-30', '2026-10-04T12:00:00Z', 'stale'],
  ])('classifies sample %s at %s as %s independently of fresh retrieval', async (sampled_at, now, availability) => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
    const service = new ConditionsService(createDbMock({ id: 1 }, {
      status: 'suitable', sampled_at, retrieved_at: now, source_url: 'https://www.drna.pr.gov/',
      enterococcus_value: 20, enterococcus_qualifier: null, sampling_type: 'routine',
      temperature_celsius: null, ph: null,
    }) as never);
    const result = await service.getWaterQuality(1);
    expect(result.availability).toBe(availability);
    expect(result.status).toBe(availability === 'stale' ? 'unknown' : 'suitable');
    expect(result.lastKnownStatus).toBe(availability === 'stale' ? 'suitable' : undefined);
    expect(result.enterococcusValue).toBe(20);
  });
});

function createDbMock(
  beach: { id: number } | undefined,
  observation:
    | {
        status: string;
        sampled_at: Date | string | null;
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
