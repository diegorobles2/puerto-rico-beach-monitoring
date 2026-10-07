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

  it('updates a corrected batch without creating duplicates', async () => {
    await expectRollback(
      db.transaction(async (trx) => {
        const service = makeService(trx, observation);
        await service.refresh();
        await makeService(trx, {
          ...observation,
          status: 'suitable',
          enterococcus: { ...observation.enterococcus, value: 20 },
          temperatureCelsius: 28.4,
          ph: 8.05,
          source: { ...observation.source, retrievedAt: '2099-09-26T14:39:00.000Z' },
        }).refresh();

        const [{ count }] = await trx('water_quality_observations').where({ source_url: TEST_SOURCE_URL }).count();
        expect(Number(count)).toBe(2);
        const rows = await trx('water_quality_observations').where({ source_url: TEST_SOURCE_URL });
        expect(rows).toEqual(expect.arrayContaining([
          expect.objectContaining({ enterococcus_value: 20, status: 'suitable', temperature_celsius: '28.4', ph: '8.05' }),
        ]));
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

  it('rejects suspicious parser loss before changing the database', async () => {
    await expectRollback(db.transaction(async (trx) => {
      await trx('beaches').insert({ drna_station_id: 'RW-22', name: 'Unchanged', municipality: 'Aguada' })
        .onConflict('drna_station_id').merge({ name: 'Unchanged' });
      await expect(makeService(trx, observation, { rejectedRows: 3, sourceRows: 100 }).refresh())
        .rejects.toThrow('rejected 3 of 100 rows');
      expect(await trx('beaches').where({ drna_station_id: 'RW-22' }).first('name')).toEqual({ name: 'Unchanged' });
      throw ROLLBACK;
    }));
  });
});

function makeService(db: Knex, result: WaterQualityObservation, quality = { rejectedRows: 0, sourceRows: 35 }): IngestionService {
  const drna = { getCatalog: jest.fn().mockResolvedValue({
    stations: [
      { stationId: 'RW-22', name: 'Pico de Piedra', municipality: 'Aguada', latitude: 18.3843639, longitude: -67.2129889 },
      { stationId: 'RW-23', name: 'Puerto Nuevo', municipality: 'Vega Baja', latitude: 18.4913667, longitude: -66.3990444 },
    ],
    observations: [result, { ...result, stationId: 'RW-23' }], ...quality,
  }) } as unknown as DrnaService;
  return new IngestionService(drna, db);
}

async function expectRollback(transaction: Promise<unknown>): Promise<void> {
  await expect(transaction).rejects.toBe(ROLLBACK);
}
