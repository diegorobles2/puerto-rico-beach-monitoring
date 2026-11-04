import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.db.raw('select 1').timeout(2000);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }
}
