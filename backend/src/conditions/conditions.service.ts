import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

interface WaterQualityObservationRow {
  id: string;
  beach_id: string | number;
  sampled_at: string | null;
  enterococcus_value: number | null;
  enterococcus_qualifier: string | null;
  temperature_celsius: number | null;
  ph: number | null;
  status: string | null;
  sampling_type: string | null;
  source_url: string | null;
  source_published_at: string | null;
  observations: string | null;
}

@Injectable()
export class ConditionsService {
  private readonly logger = new Logger(ConditionsService.name);
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      this.pool = null;
      return;
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  private resolveBeachId(beachId: string): string {
    const normalized = beachId.trim().toLowerCase().replace(/\s+/g, '-');
    const aliases: Record<string, string> = {
      'playa-sucia': '5',
      'playa-sucia-5': '5',
      '5': '5',
    };

    return aliases[normalized] ?? beachId;
  }

  private inferSourceName(sourceUrl?: string | null): string {
    if (!sourceUrl) {
      return 'Supabase water-quality observations';
    }

    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
      if (hostname.includes('drna')) {
        return 'DRNA';
      }
      return hostname;
    } catch {
      return 'Supabase water-quality observations';
    }
  }

  private mapStatus(status?: string | null): 'safe' | 'advisory' | 'closed' | 'unknown' {
    const normalized = status?.trim().toLowerCase();

    switch (normalized) {
      case 'safe':
      case 'advisory':
      case 'closed':
        return normalized;
      default:
        return 'unknown';
    }
  }

  private async readLatestObservation(beachId: string) {
    if (!this.pool) {
      return null;
    }

    const resolvedBeachId = this.resolveBeachId(beachId);

    try {
      const result = await this.pool.query<WaterQualityObservationRow>(
        `SELECT id, beach_id, sampled_at, enterococcus_value, enterococcus_qualifier, temperature_celsius, ph, status, sampling_type, source_url, source_published_at, observations
         FROM public.water_quality_observations
         WHERE CAST(beach_id AS text) = $1
         ORDER BY sampled_at DESC NULLS LAST
         LIMIT 1`,
        [resolvedBeachId],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      this.logger.error(`Failed to load water quality for beach ${resolvedBeachId}`, error instanceof Error ? error.stack : undefined);
      return null;
    }
  }

  async findByBeach(beachId: string) {
    const now = new Date();
    const observation = await this.readLatestObservation(beachId);
    const status = observation ? this.mapStatus(observation.status) : 'unknown';
    const summaryMap = {
      safe: 'Water quality is within the current advisory threshold.',
      advisory: 'Water quality is elevated and should be monitored before swimming.',
      closed: 'Swimming is currently not advised due to water-quality conditions.',
      unknown: 'No recent water-quality reading is available.',
    } as const;
    const sourceUrl = observation?.source_url ?? 'https://www.drna.pr.gov/';
    const observedAt = observation?.source_published_at ?? observation?.sampled_at ?? new Date(now.getTime() - 1000 * 60 * 30).toISOString();

    return {
      beachId: this.resolveBeachId(beachId),
      waterQuality: {
        status,
        summary: summaryMap[status],
        source: {
          sourceName: this.inferSourceName(sourceUrl),
          sourceUrl,
          observedAt,
          retrievedAt: now.toISOString(),
        },
        observation: observation
          ? {
              id: observation.id,
              beach_id: String(observation.beach_id),
              sampled_at: observation.sampled_at ?? observedAt,
              enterococcus_value: observation.enterococcus_value,
              enterococcus_qualifier: observation.enterococcus_qualifier,
              temperature_celsius: observation.temperature_celsius,
              ph: observation.ph,
              status,
              sampling_type: observation.sampling_type ?? 'unknown',
            }
          : {
              id: '',
              beach_id: this.resolveBeachId(beachId),
              sampled_at: observedAt,
              enterococcus_value: null,
              enterococcus_qualifier: null,
              temperature_celsius: null,
              ph: null,
              status: 'unknown',
              sampling_type: 'unknown',
            },
      },
      oceanRisk: {
        risk: 'moderate',
        summary: 'Moderate surf and current conditions; exercise caution in the water.',
        source: {
          sourceName: 'NWS',
          sourceUrl: 'https://www.weather.gov/',
          observedAt,
          retrievedAt: now.toISOString(),
        },
      },
    };
  }
}
