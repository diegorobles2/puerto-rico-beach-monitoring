import { Injectable, Optional } from '@nestjs/common';
import type { BeachAlert, OceanCondition } from '../../types/domain';
import { mapNwsAlerts, mapNwsCondition } from './nws.mapper';
import type { NwsAlertCollection, NwsPointResponse, NwsProductIndex, NwsProductReference, NwsSurfForecastProduct } from './nws.types';
import {
  NwsHttpError, NwsInvalidCoordinatesError, NwsInvalidResponseError, NwsInvalidZoneError,
  NwsMarinePointError, NwsTransportError,
} from './nws.errors';

const API_URL = 'https://api.weather.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const HEADERS = {
  Accept: 'application/geo+json',
  'User-Agent': 'puerto-rico-beach-monitoring-capstone (github.com/diegorobles2/puerto-rico-beach-monitoring)',
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

@Injectable()
export class NwsService {
  constructor(@Optional() private readonly fetcher: Fetcher = fetch) {}

  async getConditions(zoneId: string): Promise<OceanCondition> {
    validateZoneId(zoneId);
    const indexUrl = `${API_URL}/products/types/SRF/locations/SJU`;
    const index = await this.getJson<NwsProductIndex>(indexUrl, 'surf forecast index');
    if (!isRecord(index) || !Array.isArray(index['@graph'])) {
      throw new NwsInvalidResponseError('NWS surf forecast index is malformed', indexUrl);
    }
    const latest = (index['@graph'] as NwsProductReference[])
      .filter((item) => item && item.productCode === 'SRF' && typeof item.id === 'string' && validDate(item.issuanceTime))
      .sort((a, b) => Date.parse(b.issuanceTime as string) - Date.parse(a.issuanceTime as string))[0];
    if (!latest) throw new NwsInvalidResponseError('NWS surf forecast index contains no usable products', indexUrl);

    const sourceUrl = `${API_URL}/products/${latest.id}`;
    const product = await this.getJson<NwsSurfForecastProduct>(sourceUrl, 'surf forecast');
    if (!isRecord(product) || product.productCode !== 'SRF' || typeof product.productText !== 'string' || !validDate(product.issuanceTime)) {
      throw new NwsInvalidResponseError('NWS surf forecast is malformed', sourceUrl);
    }
    product['@id'] = typeof product['@id'] === 'string' ? product['@id'] : sourceUrl;
    return mapNwsCondition(product, zoneId, new Date().toISOString());
  }

  async getActiveAlerts(zoneId: string): Promise<BeachAlert[]> {
    validateZoneId(zoneId);
    const url = `${API_URL}/alerts/active?zone=${zoneId}`;
    const collection = await this.getJson<NwsAlertCollection>(url, 'active alerts');
    if (!isRecord(collection) || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new NwsInvalidResponseError('NWS active-alert response is malformed', url);
    }
    try {
      return mapNwsAlerts(collection, new Date().toISOString());
    } catch (error) {
      throw new NwsInvalidResponseError(error instanceof Error ? error.message : 'NWS active-alert response is malformed', url);
    }
  }

  async getForecastZone(latitude: number, longitude: number): Promise<string> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new NwsInvalidCoordinatesError(latitude, longitude);
    }
    const url = `${API_URL}/points/${latitude},${longitude}`;
    const point = await this.getJson<NwsPointResponse>(url, 'point metadata');
    const rawZone = isRecord(point) && isRecord(point.properties) ? point.properties.forecastZone : undefined;
    let zoneUrl: URL | undefined;
    if (typeof rawZone === 'string') {
      try { zoneUrl = new URL(rawZone); } catch { /* Classified as invalid metadata below. */ }
    }
    const match = zoneUrl?.origin === API_URL && !zoneUrl.username && !zoneUrl.password && !zoneUrl.search && !zoneUrl.hash
      ? /^\/zones\/forecast\/(PRZ\d{3}|AMZ\d{3})\/?$/.exec(zoneUrl.pathname)
      : null;
    if (!match) throw new NwsInvalidResponseError('NWS point response has no Puerto Rico forecast zone', url);
    if (match[1].startsWith('AMZ')) throw new NwsMarinePointError(match[1], latitude, longitude, url);
    return match[1];
  }

  private async getJson<T>(url: string, label: string): Promise<T> {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const transportError = (error: unknown) => new NwsTransportError(
      signal.aborted || hasErrorName(error, 'TimeoutError') ? 'timeout' : 'network', label, url,
    );
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: HEADERS, signal });
    } catch (error) {
      throw transportError(error);
    }
    if (!response.ok) throw new NwsHttpError(response.status, label, url);
    try {
      return await response.json() as T;
    } catch (error) {
      if (signal.aborted || hasErrorName(error, 'TimeoutError')) throw transportError(error);
      if (hasErrorName(error, 'SyntaxError')) throw new NwsInvalidResponseError(`NWS ${label} returned malformed JSON`, url);
      throw transportError(error);
    }
  }
}

function validateZoneId(zoneId: string): void {
  if (!/^PRZ\d{3}$/.test(zoneId)) throw new NwsInvalidZoneError(zoneId);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Fetch/DOM exceptions can originate in another JavaScript realm.
function hasErrorName(error: unknown, name: string): boolean {
  return isRecord(error) && error.name === name;
}
