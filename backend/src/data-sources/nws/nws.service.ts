import { Injectable, Optional } from '@nestjs/common';
import type { BeachAlert, OceanCondition } from '../../types/domain';
import { mapNwsAlerts, mapNwsCondition } from './nws.mapper';
import type { NwsAlertCollection, NwsPointResponse, NwsProductIndex, NwsProductReference, NwsSurfForecastProduct } from './nws.types';

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
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Invalid coordinates for NWS point lookup');
    }
    const point = await this.getJson<NwsPointResponse>(`${API_URL}/points/${latitude},${longitude}`, 'point metadata');
    const properties = point.properties as { forecastZone?: unknown } | null;
    const match = typeof properties?.forecastZone === 'string'
      ? /\/zones\/forecast\/(PRZ\d{3})\/?$/.exec(properties.forecastZone)
      : null;
    if (!match) throw new Error('NWS point response has no Puerto Rico forecast zone');
    return match[1];
  }

  private async getJson<T>(url: string, label: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new Error(`Unable to retrieve NWS ${label}`);
    }
    if (!response.ok) throw new Error(`NWS ${label} returned HTTP ${response.status}`);
    try {
      return await response.json() as T;
    } catch {
      throw new Error(`NWS ${label} returned malformed JSON`);
    }
  }
}

function validateZoneId(zoneId: string): void {
  if (!/^PRZ\d{3}$/.test(zoneId)) throw new Error(`Invalid NWS Puerto Rico forecast zone: ${zoneId}`);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
