import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsWeatherUnavailableError } from '../data-sources/nws/nws-weather.mapper';
import type { WeatherForecast } from '../types/domain';
import type { WeatherResponseDto } from './dto/weather-response.dto';

export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
export const WEATHER_RETRY_MS = 60 * 1000;
export const WEATHER_RETRIEVAL_STALE_MS = 6 * 60 * 60 * 1000;
export const WEATHER_ISSUANCE_STALE_MS = 24 * 60 * 60 * 1000;
interface Entry {
  coordinates: string;
  data?: WeatherForecast;
  attemptedAt: number;
  failed: boolean;
  reason?: WeatherResponseDto['unavailableReason'];
  inFlight?: Promise<void>;
}

@Injectable()
export class WeatherService {
  // shortcut: process-local cache loses history on restart; add persistence before requiring restart-proof weather retention.
  private readonly cache = new Map<number, Entry>();
  constructor(@Inject(DATABASE) private readonly db: Knex, private readonly nws: NwsService) {}

  async getWeather(beachId: number, force = false): Promise<WeatherResponseDto> {
    const beach = await this.db('beaches').select('id', 'latitude', 'longitude').where({ id: beachId }).first();
    if (!beach) { this.cache.delete(beachId); throw new NotFoundException('Beach not found'); }
    const latitude = beach.latitude == null || beach.latitude === '' ? NaN : Number(beach.latitude);
    const longitude = beach.longitude == null || beach.longitude === '' ? NaN : Number(beach.longitude);
    const coordinates = `${latitude},${longitude}`;
    let entry = this.cache.get(beachId);
    if (!entry || entry.coordinates !== coordinates) {
      entry = { coordinates, attemptedAt: -Infinity, failed: false };
      this.cache.set(beachId, entry);
    }
    const now = Date.now();
    const retry = entry.failed && entry.reason === 'upstream-error' ? WEATHER_RETRY_MS : WEATHER_CACHE_TTL_MS;
    const elapsed = now - entry.attemptedAt;
    const ended = entry.data && Date.parse(entry.data.validTo) <= now && elapsed >= WEATHER_RETRY_MS;
    if (entry.inFlight) await entry.inFlight;
    else if (force || elapsed < 0 || elapsed >= retry || ended) {
      entry.attemptedAt = now;
      entry.inFlight = this.update(entry, latitude, longitude);
      try { await entry.inFlight; } finally { entry.inFlight = undefined; }
    }
    const data = entry.data;
    const time = Date.now();
    const fresh = data && time >= Date.parse(data.source.retrievedAt)
      && time - Date.parse(data.source.retrievedAt) <= WEATHER_RETRIEVAL_STALE_MS
      && data.source.observedAt && time >= Date.parse(data.source.observedAt)
      && time - Date.parse(data.source.observedAt) <= WEATHER_ISSUANCE_STALE_MS
      && Date.parse(data.validFrom) <= time && time < Date.parse(data.validTo);
    let forecast: WeatherResponseDto['forecast'] = null;
    if (data) { const { source: _source, ...period } = data; forecast = period; }
    return {
      beachId, availability: data ? (entry.failed || !fresh ? 'stale' : 'available') : 'unavailable', forecast,
      source: 'NWS', sourceUrl: data?.source.sourceUrl, observedAt: data?.source.observedAt ?? null,
      retrievedAt: data?.source.retrievedAt ?? null, ...(entry.reason ? { unavailableReason: entry.reason } : {}),
    };
  }

  private async update(entry: Entry, latitude: number, longitude: number): Promise<void> {
    try {
      entry.data = await this.nws.getWeather(latitude, longitude);
      entry.failed = false;
      entry.reason = undefined;
    } catch (error) {
      entry.failed = true;
      entry.reason = error instanceof NwsWeatherUnavailableError ? error.reason : 'upstream-error';
    }
  }

  async refreshCached(): Promise<{ attempted: number; failed: number }> {
    let failed = 0;
    const ids = [...this.cache.keys()];
    for (const id of ids) {
      try { if ((await this.getWeather(id, true)).availability !== 'available') failed++; }
      catch { failed++; }
    }
    return { attempted: ids.length, failed };
  }
}
