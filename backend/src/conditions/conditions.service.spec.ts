jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

import { Pool } from 'pg';
import { ConditionsService } from './conditions.service';

describe('ConditionsService', () => {
  const queryMock = jest.fn();

  beforeEach(() => {
    queryMock.mockReset();
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query: queryMock }));
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/postgres';
  });

  it('loads the latest water quality observation for the requested beach', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'obs-42',
          beach_id: 5,
          sampled_at: '2026-10-06T18:00:00.000Z',
          enterococcus_value: 41,
          enterococcus_qualifier: 'moderate',
          temperature_celsius: 28.4,
          ph: 7.6,
          status: 'advisory',
          sampling_type: 'routine',
          source_url: 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf',
          source_published_at: null,
          observations: null,
        },
      ],
    });

    const service = new ConditionsService();
    const result = await service.findByBeach('playa-sucia');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.water_quality_observations'),
      ['5'],
    );
    expect(result.waterQuality.status).toBe('advisory');
    expect(result.waterQuality.observation).toMatchObject({
      id: 'obs-42',
      beach_id: '5',
      enterococcus_value: 41,
      temperature_celsius: 28.4,
      ph: 7.6,
      status: 'advisory',
    });
  });
});
