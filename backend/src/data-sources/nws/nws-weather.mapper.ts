import type { WeatherForecast } from '../../types/domain';

export class NwsWeatherUnavailableError extends Error {
  constructor(readonly reason: 'unsupported-location' | 'no-forecast') { super(`NWS weather ${reason}`); }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function date(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }

export function mapNwsWeather(payload: unknown, sourceUrl: string, retrievedAt: string): WeatherForecast {
  const now = Date.parse(retrievedAt);
  if (!object(payload) || !object(payload.properties)) throw new Error('NWS weather properties are malformed');
  const { updateTime, periods } = payload.properties;
  if (!date(updateTime) || Date.parse(updateTime) > now || !Array.isArray(periods)) {
    throw new Error('NWS weather issuance or periods are malformed');
  }
  const parsed = periods.map(period => {
    if (!object(period) || !text(period.name) || !date(period.startTime) || !date(period.endTime)
      || Date.parse(period.endTime) <= Date.parse(period.startTime)
      || typeof period.temperature !== 'number' || !Number.isFinite(period.temperature)
      || (period.temperatureUnit !== 'C' && period.temperatureUnit !== 'F') || !text(period.windSpeed)
      || !text(period.windDirection) || !text(period.shortForecast) || !text(period.detailedForecast)) {
      throw new Error('NWS weather period is malformed');
    }
    const probability = period.probabilityOfPrecipitation;
    let precipitationProbabilityPercent: number | null = null;
    if (probability != null) {
      if (!object(probability) || probability.unitCode !== 'wmoUnit:percent'
        || (probability.value !== null && (typeof probability.value !== 'number'
          || !Number.isFinite(probability.value) || probability.value < 0 || probability.value > 100))) {
        throw new Error('NWS weather precipitation probability is malformed');
      }
      precipitationProbabilityPercent = probability.value as number | null;
    }
    return {
      name: period.name, validFrom: new Date(period.startTime).toISOString(), validTo: new Date(period.endTime).toISOString(),
      temperature: period.temperature, temperatureUnit: period.temperatureUnit as 'C' | 'F',
      windSpeed: period.windSpeed, windDirection: period.windDirection, precipitationProbabilityPercent,
      shortForecast: period.shortForecast, detailedForecast: period.detailedForecast,
    };
  });
  const active = parsed.find(period => Date.parse(period.validFrom) <= now && Date.parse(period.validTo) > now);
  if (!active) throw new NwsWeatherUnavailableError('no-forecast');
  return { ...active, source: { sourceName: 'NWS', sourceUrl, observedAt: new Date(updateTime).toISOString(), retrievedAt } };
}
