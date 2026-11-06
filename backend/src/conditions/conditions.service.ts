import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';

// Application policy retained from the UI warning, not a DRNA sampling/publication guarantee.
export const WATER_QUALITY_SAMPLE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

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

    const observedAt = toIsoDate(observation.sampled_at);
    const sampleTime = observedAt === null ? NaN : Date.parse(observedAt);
    const now = Date.now();
    const stale = !Number.isFinite(sampleTime) || sampleTime > now
      || now - sampleTime > WATER_QUALITY_SAMPLE_STALE_AFTER_MS;

    return {
      status: stale ? 'unknown' : observation.status,
      ...(stale ? { lastKnownStatus: observation.status } : {}),
      source: 'DRNA',
      sourceUrl: observation.source_url,
      observedAt,
      retrievedAt: toIsoString(observation.retrieved_at),
      availability: stale ? 'stale' : 'available',
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

function toIsoDate(value: Date | string | null): string | null {
  if (value == null || (value instanceof Date && !Number.isFinite(value.getTime()))) return null;
  const date = typeof value === 'string' ? value
    : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
