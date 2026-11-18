import { Injectable, Optional } from '@nestjs/common';
import type { BeachAlert, OceanCondition, WeatherForecast } from '../../types/domain';
import { mapNwsWeather, NwsWeatherUnavailableError } from './nws-weather.mapper';
import { mapNwsAlerts, mapNwsCondition } from './nws.mapper';
import type { NwsAlertCollection, NwsPointResponse, NwsProductIndex, NwsProductReference, NwsSurfForecastProduct } from './nws.types';

const API_URL = 'https://api.weather.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const HEADERS = {
  Accept: 'application/geo+json',
  'User-Agent': 'puerto-rico-beach-monitoring-capstone (github.com/diegorobles2/puerto-rico-beach-monitoring)',
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

class NwsHttpError extends Error {
  constructor(readonly status: number, label: string) { super(`NWS ${label} returned HTTP ${status}`); }
}

@Injectable()
export class NwsService {
  constructor(@Optional() private readonly fetcher: Fetcher = fetch) {}

  async getWeather(latitude: number, longitude: number): Promise<WeatherForecast> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new NwsWeatherUnavailableError('unsupported-location');
    }
    let point: NwsPointResponse;
    try {
      point = await this.getJson<NwsPointResponse>(`${API_URL}/points/${latitude},${longitude}`, 'weather point metadata');
    } catch (error) {
      if (error instanceof NwsHttpError && error.status === 404) throw new NwsWeatherUnavailableError('unsupported-location');
      throw error;
    }
    const properties = point.properties as { forecast?: unknown } | null;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('NWS weather point metadata is malformed');
    if (properties.forecast == null) throw new NwsWeatherUnavailableError('unsupported-location');
    // Only follow the exact SJU grid mapping returned for this point; never apply a surf-zone fallback.
    if (typeof properties.forecast !== 'string'
      || !/^https:\/\/api\.weather\.gov\/gridpoints\/SJU\/\d+,\d+\/forecast$/.test(properties.forecast)) {
      throw new Error('NWS weather forecast URL is malformed or unsupported');
    }
    const payload = await this.getJson<unknown>(properties.forecast, 'weather forecast');
    return mapNwsWeather(payload, properties.forecast, new Date().toISOString());
  }

  async getConditions(zoneId: string): Promise<OceanCondition> {
    validateZoneId(zoneId);
    const index = await this.getJson<NwsProductIndex>(`${API_URL}/products/types/SRF/locations/SJU`, 'surf forecast index');
    if (!Array.isArray(index['@graph'])) throw new Error('NWS surf forecast index is malformed');
    const latest = (index['@graph'] as NwsProductReference[])
      .filter((item) => item && item.productCode === 'SRF' && typeof item.id === 'string' && validDate(item.issuanceTime))
      .sort((a, b) => Date.parse(b.issuanceTime as string) - Date.parse(a.issuanceTime as string))[0];
    if (!latest) throw new Error('NWS surf forecast index contains no usable products');

    const sourceUrl = `${API_URL}/products/${latest.id}`;
    const product = await this.getJson<NwsSurfForecastProduct>(sourceUrl, 'surf forecast');
    if (product.productCode !== 'SRF' || typeof product.productText !== 'string' || !validDate(product.issuanceTime)) {
      throw new Error('NWS surf forecast is malformed');
    }
    product['@id'] = typeof product['@id'] === 'string' ? product['@id'] : sourceUrl;
    return mapNwsCondition(product, zoneId, new Date().toISOString());
  }

  async getActiveAlerts(zoneId: string): Promise<BeachAlert[]> {
    validateZoneId(zoneId);
    const url = `${API_URL}/alerts/active?zone=${zoneId}`;
    const collection = await this.getJson<NwsAlertCollection>(url, 'active alerts');
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('NWS active-alert response is malformed');
    }
    return mapNwsAlerts(collection, new Date().toISOString());
  }

  async getForecastZone(latitude: number, longitude: number): Promise<string> {
    const zoneUrl = await this.getForecastZoneUrl(latitude, longitude);
    const match = /\/zones\/forecast\/(PRZ\d{3})\/?$/.exec(zoneUrl);

    if (!match) {
      throw new Error('NWS point response has no Puerto Rico forecast zone');
    }

    return match[1];
  }

  async getForecastZoneUrl(latitude: number, longitude: number): Promise<string> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Invalid coordinates for NWS point lookup');
    }

    const point = await this.getJson<NwsPointResponse>(
      `${API_URL}/points/${latitude},${longitude}`,
      'point metadata',
    );

    const properties = point.properties as { forecastZone?: unknown } | null;

    if (typeof properties?.forecastZone !== 'string') {
      throw new Error('NWS point response has no Puerto Rico forecast zone');
    }

    return properties.forecastZone;
  }

  private async getJson<T>(url: string, label: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new Error(`Unable to retrieve NWS ${label}`);
    }
    if (!response.ok) throw new NwsHttpError(response.status, label);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`NWS ${label} returned malformed JSON`);
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error(`NWS ${label} response is malformed`);
    }
    return payload as T;
  }
}

function validateZoneId(zoneId: string): void {
  if (!/^PRZ\d{3}$/.test(zoneId)) throw new Error(`Invalid NWS Puerto Rico forecast zone: ${zoneId}`);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
