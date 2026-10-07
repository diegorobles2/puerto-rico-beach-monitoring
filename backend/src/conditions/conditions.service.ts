import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';

@Injectable()
export class ConditionsService {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  async getWaterQuality(beachId: number): Promise<WaterQualityResponseDto> {
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
        'enterococcus_value',
        'enterococcus_qualifier',
        'sampling_type',
        'temperature_celsius',
        'ph',
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
      observedAt: toIsoDate(observation.sampled_at),
      retrievedAt: toIsoString(observation.retrieved_at),
      availability: 'available',
      enterococcusValue: numberOrNull(observation.enterococcus_value),
      enterococcusQualifier: observation.enterococcus_qualifier,
      samplingType: observation.sampling_type,
      temperatureCelsius: numberOrNull(observation.temperature_celsius),
      ph: numberOrNull(observation.ph),
    };
  }
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
