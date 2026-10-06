import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';

@Injectable()
export class ConditionsService {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  async getWaterQuality(
    beachId: number,
    ): Promise<WaterQualityResponseDto> {
    const beach = await this.db('beaches')
      .where({ id: beachId })
      .first('id');

    if (!beach) {
      throw new NotFoundException(
        `Beach with identifier "${beachId}" was not found`,
      );
    }

    const observation = await this.db('water_quality_observations')
      .where({ beach_id: beach.id })
      .orderBy('sampled_at', 'desc')
      .orderBy('retrieved_at', 'desc')
      .first(
        'status',
        'sampled_at',
        'retrieved_at',
        'source_url',
      );

    if (!observation) {
      return {
        status: 'unknown',
        source: 'DRNA',
        observedAt: null,
        retrievedAt: null,
        availability: 'unavailable',
      };
    }

    return {
      status: observation.status,
      source: 'DRNA',
      sourceUrl: observation.source_url,
      observedAt: toIsoString(observation.sampled_at),
      retrievedAt: toIsoString(observation.retrieved_at),
      availability: 'available',
    };
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
