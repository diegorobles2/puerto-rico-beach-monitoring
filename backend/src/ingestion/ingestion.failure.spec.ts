import { IngestionService } from './ingestion.service';

describe('DRNA pre-persistence failures', () => {
  it('does not touch stored data when the upstream fetch fails', async () => {
    const drna = { getCatalog: jest.fn().mockRejectedValue(new Error('DRNA timeout')) };
    const db = { transaction: jest.fn() };
    const service = new IngestionService(drna as never, db as never);
    await expect(service.refresh()).rejects.toThrow('DRNA timeout');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does not touch stored data when parser loss exceeds the threshold', async () => {
    const drna = { getCatalog: jest.fn().mockResolvedValue({ sourceRows: 100, rejectedRows: 3 }) };
    const db = { transaction: jest.fn() };
    const service = new IngestionService(drna as never, db as never);
    await expect(service.refresh()).rejects.toThrow('rejected 3 of 100 rows');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
