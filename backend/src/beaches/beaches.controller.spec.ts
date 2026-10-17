import { Test } from '@nestjs/testing';
import { DATABASE } from '../database/database.module';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';

describe('BeachesController', () => {
  it('returns the placeholder beach list', async () => {
    const mockDb = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    });

    const module = await Test.createTestingModule({
      controllers: [BeachesController],
      providers: [
        BeachesService,
        {
          provide: DATABASE,
          useValue: mockDb,
        },
      ],
    }).compile();

    await expect(module.get(BeachesController).findAll()).resolves.toEqual([]);
  });
});
