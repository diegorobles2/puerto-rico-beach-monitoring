import type { WaterQualityObservation, WaterQualityStatus } from '../../types/domain';
import type { DrnaMapperInput } from './drna.types';

const BEACH_ACTION_VALUE = 70;

export function mapDrnaWaterQuality({ record, sourceUrl, retrievedAt }: DrnaMapperInput): WaterQualityObservation {
  const measurement = parseEnterococcus(record.enterococcus);

  return {
    stationId: record.beachId?.trim() || null,
    beachName: record.beachName?.trim() || null,
    status: getStatus(measurement.value, measurement.qualifier),
    sampleType: normalizeSampleType(record.samplingType),
    enterococcus: { ...measurement, unit: 'colonies/100 mL' },
    temperatureCelsius: parseNumber(record.temperatureCelsius),
    ph: parseNumber(record.ph),
    ...(record.observations?.trim() ? { notes: record.observations.trim() } : {}),
    source: {
      sourceName: 'DRNA',
      sourceUrl,
      observedAt: record.date?.trim() || null,
      retrievedAt,
    },
  };
}

function parseEnterococcus(raw: string | null): Omit<WaterQualityObservation['enterococcus'], 'unit'> {
  const value = raw?.trim();
  if (!value) return { value: null, qualifier: null };

  const match = /^([<>])?\s*([\d,]+(?:\.\d+)?)$/.exec(value);
  if (!match) return { value: null, qualifier: null };

  return {
    value: Number(match[2].replaceAll(',', '')),
    qualifier: match[1] === '<' ? 'less-than' : match[1] === '>' ? 'greater-than' : null,
  };
}

function getStatus(value: number | null, qualifier: WaterQualityObservation['enterococcus']['qualifier']): WaterQualityStatus {
  if (value === null) return 'unknown';
  if (qualifier === 'less-than' && value > BEACH_ACTION_VALUE) return 'unknown';
  if (qualifier === 'greater-than') return value >= BEACH_ACTION_VALUE ? 'advisory' : 'unknown';
  return value > BEACH_ACTION_VALUE ? 'advisory' : 'suitable';
}

function normalizeSampleType(raw: string | null): WaterQualityObservation['sampleType'] {
  const value = raw?.trim().toLowerCase();
  if (value === 'routine') return 'routine';
  if (value === 're-sampling' || value === 'resampling') return 'resampling';
  return 'unknown';
}

function parseNumber(raw: string | null): number | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}
