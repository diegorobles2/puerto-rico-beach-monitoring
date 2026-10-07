import { Test } from '@nestjs/testing';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
describe('BeachesController', () => {
  it('returns the seeded beach list', async () => {
    const module = await Test.createTestingModule({ controllers: [BeachesController], providers: [BeachesService] }).compile();
    expect(module.get(BeachesController).findAll()).toEqual([
      {
        id: '5',
        name: 'Playa Sucia',
        municipality: 'Guánica',
        latitude: 17.9694,
        longitude: -66.8828,
      },
    ]);
  });
});
