import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import type { Beach } from '../types/domain';

@Injectable()
export class BeachesService {
  constructor(@Inject(DATABASE) private readonly db?: Knex) {}

  async findAll(): Promise<Beach[]> {
    if (!this.db || typeof this.db !== 'function') return [];

    return this.db('beaches')
      .select('id', 'name', 'municipality', 'latitude', 'longitude')
      .orderBy('id');
  }
}
