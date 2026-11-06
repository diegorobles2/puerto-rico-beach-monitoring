import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ConditionsController } from '../conditions/conditions.controller';
import { ConditionsService } from '../conditions/conditions.service';
import {
  NWS_CONDITIONS_CLOCK,
  NwsConditionsService,
} from '../conditions/nws-conditions.service';
import { mapNwsAlerts, mapNwsCondition } from '../data-sources/nws/nws.mapper';
import type { NwsAlertCollection, NwsSurfForecastProduct } from '../data-sources/nws/nws.types';
import { parseMonitoringRecords } from '../data-sources/drna/drna.service';
import { mapDrnaWaterQuality } from '../data-sources/drna/drna.mapper';
import type { DrnaMonitoringRecord } from '../data-sources/drna/drna.types';
import { formatDrnaSampleDate } from '../ingestion/ingestion.service';
import { DATABASE } from '../database/database.module';

type JsonObject = Record<string, unknown>;
type Provider = 'DRNA' | 'NWS_RISK' | 'NWS_ALERTS';

interface FieldMapping {
  apiField: string;
  normalizedField?: string;
  literal?: unknown;
  transform?: 'drna-sample-date';
}

interface FidelityCase {
  id: string;
  provider: Provider;
  sourceEvidence: {
    fixture: string;
    sourceUrl: string;
    stationId: string | null;
    sampleDate?: string;
    forecastZone?: string;
    [key: string]: unknown;
  };
  api: { beachId: number; path: string };
  expectedNormalized: JsonObject;
}

interface FidelityManifest {
  version: number;
  minimumAgreementPercent: number;
  drnaReplayRetrievedAt: string;
  nwsReplayAsOf: string;
  nwsReplayRetrievedAt: string;
  fieldMappings: Record<Provider, FieldMapping[]>;
  cases: FidelityCase[];
}

export interface FidelityComparison {
  caseId: string;
  provider: Provider;
  beachId: number;
  stationId: string | null;
  sourceEvidence: FidelityCase['sourceEvidence'];
  field: string;
  expected: unknown;
  actual: unknown;
  matched: boolean;
}

export interface FidelityReport {
  manifestVersion: number;
  minimumAgreementPercent: number;
  totalComparisons: number;
  matchedComparisons: number;
  mismatchCount: number;
  agreementPercent: number;
  passed: boolean;
  comparisons: FidelityComparison[];
}

export interface FidelityRunOptions {
  manifestPath?: string;
  minimumAgreementPercent?: number;
  corruptCaseIds?: string[];
  corruptApiFields?: Array<{ caseId: string; apiField: string }>;
}

interface PreparedCase {
  definition: FidelityCase;
  normalized: JsonObject;
  databaseRecords: DatabaseRecords;
}

interface DatabaseRecords {
  beaches: Array<{ id: number; drna_station_id: string | null; nws_forecast_zone: string | null }>;
  waterQuality: Array<Record<string, unknown> & { beach_id: number }>;
  nwsConditions: Array<Record<string, unknown> & { zone_id: string }>;
  alertSnapshots: Array<{ zone_id: string; retrieved_at: Date }>;
  alerts: Array<Record<string, unknown> & { zone_id: string }>;
}

const DEFAULT_MANIFEST = resolve(__dirname, 'fixtures/source-api-fidelity.v1.json');
const BACKEND_ROOT = resolve(__dirname, '../..');
const PDF_SOURCE_URL = 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf';

export async function verifySourceApiFidelity(options: FidelityRunOptions = {}): Promise<FidelityReport> {
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as FidelityManifest;
  validateManifest(manifest);
  const threshold = options.minimumAgreementPercent ?? manifest.minimumAgreementPercent;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('Agreement threshold must be between 0 and 100');
  }

  const prepared = prepareCases(manifest);
  const records = prepared[0].databaseRecords;
  const queryLog: Array<{ table: string; beachId?: number }> = [];
  const db = createFixtureDatabase(records, queryLog, new Date(manifest.nwsReplayAsOf));
  const moduleRef = await Test.createTestingModule({
    controllers: [ConditionsController],
    providers: [
      ConditionsService,
      NwsConditionsService,
      { provide: DATABASE, useValue: db },
      { provide: NWS_CONDITIONS_CLOCK, useValue: () => new Date(manifest.nwsReplayAsOf) },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  const comparisons: FidelityComparison[] = [];

  try {
    await app.listen(0, '127.0.0.1');
    const apiBaseUrl = await app.getUrl();
    for (const item of prepared) {
      const response = await request(apiBaseUrl).get(item.definition.api.path);
      if (response.status !== 200) {
        throw new Error(`${item.definition.api.path} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
      }
      const apiBody = response.body as JsonObject;
      const expectedNormalized = item.definition.expectedNormalized;
      const identityLookup = queryLog.filter((entry) => entry.table === 'beaches').at(-1);
      const databaseBeach = records.beaches.find((beach) => beach.id === item.definition.api.beachId);

      for (const field of flattenObject(expectedNormalized)) {
        addComparison(comparisons, item.definition, `normalized.${field.path}`, field.value, getPath(item.normalized, field.path));
      }

      if (item.definition.provider === 'DRNA') {
        addComparison(
          comparisons,
          item.definition,
          'apiRequest.beachId.stationIdentity',
          item.definition.sourceEvidence.stationId,
          databaseBeach?.drna_station_id,
        );
        addComparison(
          comparisons,
          item.definition,
          'apiRequest.beachId.lookup',
          item.definition.api.beachId,
          identityLookup?.beachId,
        );
      }

      for (const mapping of manifest.fieldMappings[item.definition.provider]) {
        let expected = Object.prototype.hasOwnProperty.call(mapping, 'literal')
          ? mapping.literal
          : getPath(expectedNormalized, mapping.normalizedField!);
        if (mapping.transform === 'drna-sample-date') {
          expected = formatDrnaSampleDate(String(expected));
        }

        let actual = getPath(apiBody, mapping.apiField);
        const shouldCorruptCase = options.corruptCaseIds?.includes(item.definition.id) ?? false;
        const shouldCorruptField = options.corruptApiFields?.some(
          (field) => field.caseId === item.definition.id && field.apiField === mapping.apiField,
        ) ?? false;
        if (shouldCorruptCase || shouldCorruptField) actual = '__deliberately_corrupted__';

        addComparison(comparisons, item.definition, `api.${mapping.apiField}`, expected, actual);
      }
    }
  } finally {
    await app.close();
  }

  const matchedComparisons = comparisons.filter((comparison) => comparison.matched).length;
  const totalComparisons = comparisons.length;
  if (totalComparisons < 100) {
    throw new Error(`Fidelity manifest produced only ${totalComparisons} field comparisons; at least 100 are required`);
  }
  const agreementPercent = totalComparisons ? roundPercent((matchedComparisons / totalComparisons) * 100) : 0;

  return {
    manifestVersion: manifest.version,
    minimumAgreementPercent: threshold,
    totalComparisons,
    matchedComparisons,
    mismatchCount: totalComparisons - matchedComparisons,
    agreementPercent,
    passed: agreementPercent >= threshold,
    comparisons,
  };
}

function prepareCases(manifest: FidelityManifest): PreparedCase[] {
  const databaseRecords: DatabaseRecords = {
    beaches: [],
    waterQuality: [],
    nwsConditions: [],
    alertSnapshots: [],
    alerts: [],
  };
  const prepared: PreparedCase[] = [];
  const parsedDrna = new Map<string, DrnaMonitoringRecord[]>();
  const sourceJson = new Map<string, unknown>();

  for (const definition of manifest.cases) {
    const fixturePath = resolveFixture(definition.sourceEvidence.fixture);
    if (definition.provider === 'DRNA') {
      let records = parsedDrna.get(fixturePath);
      if (!records) {
        const parsed = parseMonitoringRecords(readFileSync(fixturePath, 'utf8'));
        if (parsed.rejectedRows > 0) {
          throw new Error(`${definition.sourceEvidence.fixture} rejected ${parsed.rejectedRows} source rows`);
        }
        records = parsed.records;
        parsedDrna.set(fixturePath, records);
      }
      const sourceRecord = records.find((record) =>
        record.beachId === definition.sourceEvidence.stationId && record.date === definition.sourceEvidence.sampleDate);
      if (!sourceRecord) throw new Error(`No source row for ${definition.id} in ${definition.sourceEvidence.fixture}`);
      const normalized = mapDrnaWaterQuality({
        record: sourceRecord,
        sourceUrl: definition.sourceEvidence.sourceUrl,
        retrievedAt: manifest.drnaReplayRetrievedAt,
      }) as unknown as JsonObject;
      const stationId = String(definition.sourceEvidence.stationId);
      databaseRecords.beaches.push({ id: definition.api.beachId, drna_station_id: stationId, nws_forecast_zone: null });
      databaseRecords.waterQuality.push({
        beach_id: definition.api.beachId,
        status: normalized.status,
        sampled_at: formatDrnaSampleDate(String(getPath(normalized, 'source.observedAt'))),
        retrieved_at: getPath(normalized, 'source.retrievedAt'),
        source_url: getPath(normalized, 'source.sourceUrl'),
        enterococcus_value: getPath(normalized, 'enterococcus.value'),
        enterococcus_qualifier: getPath(normalized, 'enterococcus.qualifier'),
        sampling_type: normalized.sampleType,
        temperature_celsius: normalized.temperatureCelsius,
        ph: normalized.ph,
      });
      prepared.push({ definition, normalized, databaseRecords });
      continue;
    }

    let fixture = sourceJson.get(fixturePath);
    if (!fixture) {
      fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
      sourceJson.set(fixturePath, fixture);
    }

    if (definition.provider === 'NWS_RISK') {
      const zoneId = definition.sourceEvidence.forecastZone!;
      const normalized = mapNwsCondition(
        fixture as NwsSurfForecastProduct,
        zoneId,
        manifest.nwsReplayRetrievedAt,
      ) as unknown as JsonObject;
      databaseRecords.beaches.push({ id: definition.api.beachId, drna_station_id: null, nws_forecast_zone: zoneId });
      databaseRecords.nwsConditions.push({
        zone_id: zoneId,
        forecast_period: normalized.forecastPeriod,
        risk: normalized.risk,
        summary: normalized.summary,
        source_url: getPath(normalized, 'source.sourceUrl'),
        observed_at: new Date(String(getPath(normalized, 'source.observedAt'))),
        retrieved_at: new Date(String(getPath(normalized, 'source.retrievedAt'))),
      });
      prepared.push({ definition, normalized, databaseRecords });
      continue;
    }

    const zoneId = definition.sourceEvidence.forecastZone!;
    const normalizedAlerts = mapNwsAlerts(fixture as NwsAlertCollection, manifest.nwsReplayRetrievedAt);
    const normalized = normalizedAlerts.find((alert) => alert.zones.includes(zoneId));
    if (!normalized) throw new Error(`No normalized NWS alert for ${zoneId} in ${definition.sourceEvidence.fixture}`);
    const normalizedObject = normalized as unknown as JsonObject;
    databaseRecords.beaches.push({ id: definition.api.beachId, drna_station_id: null, nws_forecast_zone: zoneId });
    databaseRecords.alertSnapshots.push({ zone_id: zoneId, retrieved_at: new Date(manifest.nwsReplayRetrievedAt) });
    databaseRecords.alerts.push({
      zone_id: zoneId,
      id: normalized.id,
      title: normalized.title,
      description: normalized.description,
      instruction: normalized.instruction,
      severity: normalized.severity,
      certainty: normalized.certainty,
      urgency: normalized.urgency,
      effective_at: new Date(normalized.effectiveAt),
      expires_at: new Date(normalized.expiresAt),
      source_url: normalized.source.sourceUrl,
      observed_at: new Date(String(normalized.source.observedAt)),
      retrieved_at: new Date(normalized.source.retrievedAt),
    });
    prepared.push({ definition, normalized: normalizedObject, databaseRecords });
  }

  return prepared;
}

function createFixtureDatabase(records: DatabaseRecords, queryLog: Array<{ table: string; beachId?: number }>, asOf: Date) {
  return (table: string) => {
    const filters: Array<[unknown, unknown] | Record<string, unknown>> = [];
    const query: Record<string, (...args: unknown[]) => unknown> = {
      where: (...args: unknown[]) => { filters.push(args.length === 1 ? args[0] as Record<string, unknown> : [args[0], args[1]]); return query; },
      join: () => query,
      orderBy: () => query,
      first: async () => {
        const objectFilter = filters.find((filter): filter is Record<string, unknown> => !Array.isArray(filter)) ?? {};
        const idFilter = objectFilter.id ?? filters.find((filter): filter is [unknown, unknown] => Array.isArray(filter) && filter[0] === 'id')?.[1];
        const beachIdFilter = objectFilter.beach_id ?? filters.find((filter): filter is [unknown, unknown] => Array.isArray(filter) && filter[0] === 'beach_id')?.[1];
        const zoneIdFilter = objectFilter.zone_id ?? filters.find((filter): filter is [unknown, unknown] => Array.isArray(filter) && filter[0] === 'zone_id')?.[1];
        if (table === 'beaches') {
          const beachId = Number(idFilter);
          queryLog.push({ table, beachId });
          return records.beaches.find((beach) => beach.id === beachId);
        }
        if (table === 'water_quality_observations') return records.waterQuality.find((row) => row.beach_id === Number(beachIdFilter));
        if (table === 'nws_conditions') return records.nwsConditions.find((row) => row.zone_id === zoneIdFilter);
        if (table === 'nws_alert_snapshots') return records.alertSnapshots.find((row) => row.zone_id === zoneIdFilter);
        if (table === 'nws_source_health') return undefined;
        throw new Error(`Unexpected verification query: ${table}.first()`);
      },
      select: async () => {
        if (table !== 'nws_alerts as a') throw new Error(`Unexpected verification query: ${table}.select()`);
        const zoneFilter = filters.find((filter): filter is [unknown, unknown] => Array.isArray(filter) && filter[0] === 'az.zone_id')?.[1];
        return records.alerts.filter((alert) => alert.zone_id === zoneFilter && new Date(String(alert.expires_at)).getTime() > asOf.getTime());
      },
    };
    return query;
  };
}

function addComparison(
  comparisons: FidelityComparison[],
  definition: FidelityCase,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  comparisons.push({
    caseId: definition.id,
    provider: definition.provider,
    beachId: definition.api.beachId,
    stationId: definition.sourceEvidence.stationId,
    sourceEvidence: definition.sourceEvidence,
    field,
    expected,
    actual,
    matched: sameValue(expected, actual),
  });
}

function flattenObject(value: unknown, prefix = ''): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenObject(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as JsonObject).flatMap(([key, item]) => flattenObject(item, prefix ? `${prefix}.${key}` : key));
  }
  return [{ path: prefix, value }];
}

function getPath(value: unknown, path: string): unknown {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function sameValue(expected: unknown, actual: unknown): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function resolveFixture(relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error(`Fixture paths must be relative: ${relativePath}`);
  const fixturePath = resolve(BACKEND_ROOT, relativePath);
  if (!fixturePath.startsWith(`${BACKEND_ROOT}/`)) throw new Error(`Fixture path escapes backend: ${relativePath}`);
  return fixturePath;
}

function validateManifest(manifest: FidelityManifest): void {
  if (manifest.version !== 1) throw new Error(`Unsupported fidelity manifest version: ${manifest.version}`);
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) throw new Error('Fidelity manifest contains no cases');
  const ids = new Set<string>();
  for (const testCase of manifest.cases) {
    if (!testCase.id || ids.has(testCase.id)) throw new Error(`Missing or duplicate fidelity case ID: ${testCase.id}`);
    ids.add(testCase.id);
    if (!testCase.sourceEvidence.fixture || !testCase.sourceEvidence.sourceUrl) throw new Error(`Fidelity case ${testCase.id} is missing source provenance`);
  }
  for (const provider of ['DRNA', 'NWS_RISK', 'NWS_ALERTS'] as const) {
    if (!Array.isArray(manifest.fieldMappings[provider]) || manifest.fieldMappings[provider].length === 0) {
      throw new Error(`Fidelity manifest has no API field mappings for ${provider}`);
    }
  }
}

function roundPercent(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toCsv(report: FidelityReport): string {
  const header = ['caseId', 'provider', 'beachId', 'stationId', 'sourceFixture', 'sourceUrl', 'capturedAt', 'sourceRecord', 'field', 'expected', 'actual', 'matched'];
  const rows = report.comparisons.map((comparison) => [
    comparison.caseId,
    comparison.provider,
    comparison.beachId,
    comparison.stationId,
    comparison.sourceEvidence.fixture,
    comparison.sourceEvidence.sourceUrl,
    comparison.sourceEvidence.capturedAt ?? comparison.sourceEvidence.fixtureRetrievedDate ?? comparison.sourceEvidence.publicationDate,
    comparison.sourceEvidence.sampleDate
      ? `${comparison.sourceEvidence.stationId}@${comparison.sourceEvidence.sampleDate}`
      : comparison.sourceEvidence.forecastZone,
    comparison.field,
    comparison.expected,
    comparison.actual,
    comparison.matched,
  ]);
  const summary = ['SUMMARY', '', '', '', '', '', '', '', 'agreementPercent', report.agreementPercent, '', report.passed];
  return [header, ...rows, summary].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function csvCell(value: unknown): string {
  const text = value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function parseArguments(argv: string[]): {
  format: 'json' | 'csv';
  output?: string;
  threshold?: number;
  corruptCaseIds: string[];
  corruptApiFields: Array<{ caseId: string; apiField: string }>;
} {
  const result = { format: 'json' as 'json' | 'csv', corruptCaseIds: [] as string[], corruptApiFields: [] as Array<{ caseId: string; apiField: string }> };
  let output: string | undefined;
  let threshold: number | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--format') {
      const value = argv[++index];
      if (value !== 'json' && value !== 'csv') throw new Error('--format must be json or csv');
      result.format = value;
    } else if (argument === '--output') {
      output = argv[++index];
      if (!output) throw new Error('--output requires a path');
    } else if (argument === '--threshold') {
      threshold = Number(argv[++index]);
      if (!Number.isFinite(threshold)) throw new Error('--threshold requires a number');
    } else if (argument === '--corrupt-case') {
      const id = argv[++index];
      if (!id) throw new Error('--corrupt-case requires a case ID');
      result.corruptCaseIds.push(id);
    } else if (argument === '--corrupt-field') {
      const value = argv[++index];
      const separator = value?.indexOf(':api.');
      if (!value || separator < 1) throw new Error('--corrupt-field must use CASE_ID:api.FIELD');
      result.corruptApiFields.push({ caseId: value.slice(0, separator), apiField: value.slice(separator + 5) });
    } else if (argument === '--help') {
      process.stdout.write('Usage: npm run verify:fidelity -- [--format json|csv] [--output FILE] [--threshold PERCENT] [--corrupt-field CASE_ID:api.FIELD] [--corrupt-case CASE_ID]\n');
      process.exitCode = 0;
      return { ...result, output, threshold };
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return { ...result, output, threshold };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArguments(argv);
  if (process.exitCode === 0 && argv.includes('--help')) return;
  const report = await verifySourceApiFidelity({
    minimumAgreementPercent: args.threshold,
    corruptCaseIds: args.corruptCaseIds,
    corruptApiFields: args.corruptApiFields,
  });
  const output = args.format === 'csv' ? toCsv(report) : `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(resolve(process.cwd(), args.output), output, 'utf8');
  else process.stdout.write(output);
  process.exitCode = report.passed ? 0 : 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
