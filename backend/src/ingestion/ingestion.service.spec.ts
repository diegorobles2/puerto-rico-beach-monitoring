import 'dotenv/config';
import knex, { type Knex } from 'knex';
import type { DrnaService } from '../data-sources/drna/drna.service';
import type { WaterQualityObservation } from '../types/domain';
import { IngestionService } from './ingestion.service';

const TEST_SOURCE_URL = 'https://example.invalid/drna-integration-test.pdf';
const ROLLBACK = new Error('rollback test transaction');
const observation: WaterQualityObservation = {
  stationId: 'RW-22',
  beachName: 'Pico de Piedra',
  status: 'advisory',
  sampleType: 'routine',
  enterococcus: { value: 231, qualifier: null, unit: 'colonies/100 mL' },
  temperatureCelsius: 29,
  ph: 8.19,
  source: {
    sourceName: 'DRNA',
    sourceUrl: TEST_SOURCE_URL,
    observedAt: '21-Sep-2099',
    retrievedAt: '2099-09-25T14:39:00.000Z',
  },
};

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeDatabase('IngestionService database integration', () => {
  let db: Knex;

  beforeAll(() => {
    db = knex({ client: 'pg', connection: process.env.DATABASE_URL, pool: { min: 0, max: 1 } });
  });

  afterAll(async () => db.destroy());

  it('persists a normalized result once when processed twice', async () => {
    await expectRollback(
      db.transaction(async (trx) => {
        const service = makeService(trx, observation);
        await service.refresh();
        await service.refresh();

        const [{ count }] = await trx('water_quality_observations').where({ source_url: TEST_SOURCE_URL }).count();
        expect(Number(count)).toBe(1);
        throw ROLLBACK;
      }),
    );
  });

  it('rolls back its beach update when the observation write fails', async () => {
    await expectRollback(
      db.transaction(async (trx) => {
        await trx('beaches')
          .insert({ drna_station_id: 'RW-22', name: 'Before rollback', municipality: 'Aguada' })
          .onConflict('drna_station_id')
          .merge({ name: 'Before rollback' });

        const invalid = { ...observation, status: 'invalid' } as unknown as WaterQualityObservation;
        await expect(makeService(trx, invalid).refresh()).rejects.toThrow();

        const beach = await trx('beaches').where({ drna_station_id: 'RW-22' }).first('name');
        expect(beach.name).toBe('Before rollback');
        throw ROLLBACK;
      }),
    );
  });
});

function makeService(db: Knex, result: WaterQualityObservation): IngestionService {
  const drna = { getWaterQuality: jest.fn().mockResolvedValue(result) } as unknown as DrnaService;
  return new IngestionService(drna, db);
}

async function expectRollback(transaction: Promise<unknown>): Promise<void> {
  await expect(transaction).rejects.toBe(ROLLBACK);
}
