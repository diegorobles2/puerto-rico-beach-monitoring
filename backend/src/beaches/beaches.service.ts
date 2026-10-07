import { Injectable } from '@nestjs/common';
import type { Beach } from '../types/domain';

@Injectable()
export class BeachesService {
  findAll(): Beach[] {
    return [
      {
        id: '5',
        name: 'Playa Sucia',
        municipality: 'Guánica',
        latitude: 17.9694,
        longitude: -66.8828,
      },
    ];
  }
}
