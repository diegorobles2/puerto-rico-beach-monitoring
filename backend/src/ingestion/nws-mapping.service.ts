import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { NwsService } from '../data-sources/nws/nws.service';

export interface NwsMappingResult {
  mapped: number;
  unsupported: number;
}

@Injectable()
export class NwsMappingService {
  constructor(private readonly nws: NwsService, @Inject(DATABASE) private readonly db: Knex) {}

  async refresh(): Promise<NwsMappingResult> {
    const beaches = await this.db('beaches').select('id', 'latitude', 'longitude');
    const result = { mapped: 0, unsupported: 0 };

    for (const beach of beaches) {
      if (beach.latitude == null || beach.longitude == null) {
        await this.recordError(beach.id, 'Beach has no coordinates');
        result.unsupported++;
        continue;
      }
      try {
        const zone = await this.nws.getForecastZone(Number(beach.latitude), Number(beach.longitude));
        await this.db('beaches').where({ id: beach.id }).update({ nws_forecast_zone: zone, nws_mapping_error: null });
        result.mapped++;
      } catch (error) {
        await this.recordError(beach.id, error instanceof Error ? error.message : 'NWS point lookup failed');
        result.unsupported++;
      }
    }
    return result;
  }

  private async recordError(beachId: number, reason: string): Promise<void> {
    await this.db('beaches').where({ id: beachId }).whereNull('nws_forecast_zone').update({ nws_mapping_error: reason });
  }
}
