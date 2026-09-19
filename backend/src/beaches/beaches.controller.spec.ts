import { Test } from '@nestjs/testing';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
describe('BeachesController', () => {
  it('returns the placeholder beach list', async () => {
    const module = await Test.createTestingModule({ controllers: [BeachesController], providers: [BeachesService] }).compile();
    expect(module.get(BeachesController).findAll()).toEqual([]);
  });
});
