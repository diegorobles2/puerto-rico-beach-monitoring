import type { BeachAlert, OceanCondition } from '../../types/domain';
import type { NwsAlertCollection, NwsSurfForecastProduct } from './nws.types';

export function mapNwsCondition(
  product: NwsSurfForecastProduct,
  zoneId: string,
  retrievedAt: string,
): OceanCondition {
  const text = typeof product.productText === 'string' ? product.productText : '';
  const section = new RegExp(`(?:^|\\n)${zoneId}-\\d{6}-\\n([\\s\\S]*?)(?=\\n\\$\\$|$)`, 'i').exec(text)?.[1] ?? '';
  const forecast = /\.([A-Z][A-Z ]+)\.\.\.\s*\nRip Current Risk\*\.*\s*([^\n.]+)\.?/i.exec(section);
  const value = forecast?.[2]?.trim().toLowerCase();
  const risk = value === 'low' || value === 'moderate' || value === 'high' ? value : 'unknown';

  return {
    zoneId,
    forecastPeriod: forecast?.[1]?.trim() ?? null,
    risk,
    summary: risk === 'unknown' ? 'NWS rip-current risk is unavailable for this zone.' : `${capitalize(risk)} rip-current risk.`,
    source: {
      sourceName: 'NWS',
      sourceUrl: string(product['@id']) ?? (typeof product.id === 'string' ? `https://api.weather.gov/products/${product.id}` : undefined),
      observedAt: isoString(product.issuanceTime),
      retrievedAt,
    },
  };
}

export function mapNwsAlerts(collection: NwsAlertCollection, retrievedAt: string): BeachAlert[] {
  if (!Array.isArray(collection.features)) throw new Error('NWS alert response has invalid features');
  return collection.features.map((feature, index) => {
    if (!isObject(feature) || !isObject(feature.properties)) throw new Error(`NWS alert ${index} is malformed`);
    const properties = feature.properties;
    const id = requiredString(properties.id ?? feature.id, `alert ${index} id`);
    const sent = requiredIsoString(properties.sent, `alert ${id} sent time`);
    const effectiveAt = requiredIsoString(properties.effective, `alert ${id} effective time`);
    const expiresAt = requiredIsoString(properties.ends ?? properties.expires, `alert ${id} expiration time`);
    const affectedZones = Array.isArray(properties.affectedZones)
      ? properties.affectedZones.filter((zone): zone is string => typeof zone === 'string')
      : [];

    return {
      id,
      title: requiredString(properties.headline ?? properties.event, `alert ${id} title`),
      description: requiredString(properties.description, `alert ${id} description`),
      instruction: typeof properties.instruction === 'string' ? properties.instruction : null,
      severity: requiredString(properties.severity, `alert ${id} severity`),
      certainty: requiredString(properties.certainty, `alert ${id} certainty`),
      urgency: requiredString(properties.urgency, `alert ${id} urgency`),
      effectiveAt,
      expiresAt,
      zones: affectedZones.map((zone) => zone.split('/').at(-1)!),
      source: { sourceName: 'NWS', sourceUrl: typeof feature.id === 'string' ? feature.id : undefined, observedAt: sent, retrievedAt },
    };
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  const parsed = string(value);
  if (!parsed) throw new Error(`NWS ${field} is missing`);
  return parsed;
}

function isoString(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function requiredIsoString(value: unknown, field: string): string {
  const parsed = isoString(value);
  if (!parsed) throw new Error(`NWS ${field} is invalid`);
  return parsed;
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
