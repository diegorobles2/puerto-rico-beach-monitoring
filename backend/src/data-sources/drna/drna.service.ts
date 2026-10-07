import { Injectable, Optional } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type { WaterQualityObservation } from '../../types/domain';
import { mapDrnaWaterQuality } from './drna.mapper';
import type { DrnaCatalog, DrnaMonitoringRecord } from './drna.types';

const ARCHIVE_URL =
  'https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/';
const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const REQUEST_TIMEOUT_MS = 10_000;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type PdfTextExtractor = (data: Uint8Array) => Promise<string>;

@Injectable()
export class DrnaService {
  constructor(
    @Optional() private readonly fetcher: Fetcher = fetch,
    @Optional() private readonly extractPdfText: PdfTextExtractor = defaultPdfTextExtractor,
  ) {}

  async getWaterQuality(stationId: string): Promise<WaterQualityObservation | null> {
    return (await this.getCatalog()).observations.find((item) => item.stationId === stationId) ?? null;
  }

  async getCatalog(): Promise<DrnaCatalog> {
    const archive = await this.getText(ARCHIVE_URL, 'notification archive');
    const notificationUrl = findUrl(archive, ARCHIVE_URL, /href=["']([^"']*\/notificacion-monitoria-de-playas-\d+\/?)['"]/i);
    if (!notificationUrl) throw new Error('DRNA archive does not contain a monitoring notification');
    const notification = await this.getText(notificationUrl, 'notification');
    const pdfUrl = findUrl(notification, notificationUrl, /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i);

    if (!pdfUrl) throw new Error('DRNA notification does not link to monitoring results');

    const pdf = await this.getResponse(pdfUrl, 'monitoring results');
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== '%PDF') {
      throw new Error('DRNA monitoring results are not a valid PDF');
    }

    const { records, rejectedRows, sourceRows } = parseMonitoringRecords(await this.extractPdfText(bytes));
    const metadata = await this.findStationMetadata(archive);
    const retrievedAt = new Date().toISOString();
    const latest = new Map<string, DrnaMonitoringRecord>();
    const stations = new Map<string, DrnaCatalog['stations'][number]>();

    const reference = new Map(metadata.filter((record) => record.beachId).map((record) => [record.beachId!, record]));
    for (const record of records) {
      if (!record.beachId || !record.beachName) continue;
      const existing = stations.get(record.beachId);
      const baseline = reference.get(record.beachId);
      const coordinates = validatedCoordinates(record, existing ?? {
        latitude: numberOrNull(baseline?.latitude ?? null),
        longitude: numberOrNull(baseline?.longitude ?? null),
      });
      stations.set(record.beachId, {
        stationId: record.beachId,
        name: record.beachName,
        municipality: inferMunicipality(record) ?? existing?.municipality ?? 'Unavailable',
        ...coordinates,
      });
      if (record.date && record.enterococcus && (!latest.has(record.beachId) || dateValue(record.date) >= dateValue(latest.get(record.beachId)!.date!))) {
        latest.set(record.beachId, record);
      }
    }

    const stationList = [...stations.values()];
    validateCatalog(stationList, metadata.length >= 30);
    await Promise.all(stationList.map(async (station) => {
      station.municipality = await this.getMunicipality(station.latitude!, station.longitude!);
    }));

    return {
      stations: stationList,
      observations: [...latest.values()].map((record) => mapDrnaWaterQuality({ record, sourceUrl: pdfUrl, retrievedAt })),
      rejectedRows,
      sourceRows,
    };
  }

  private async getText(url: string, label: string): Promise<string> {
    return (await this.getResponse(url, label)).text();
  }

  private async findStationMetadata(archive: string): Promise<DrnaMonitoringRecord[]> {
    let fallback: DrnaMonitoringRecord[] = [];
    const archiveUrls = findArchivePageUrls(archive);
    for (const archiveUrl of archiveUrls.length ? archiveUrls : [ARCHIVE_URL]) {
      const html = archiveUrl === ARCHIVE_URL ? archive : await this.getText(archiveUrl, 'metadata archive');
      const urls = findUrls(html, archiveUrl, /href=["']([^"']*\/notificacion-monitoria-de-playas-\d+\/?)["']/gi);
      const notifications = await Promise.all(urls.map(async (url) => ({ url, html: await this.getText(url, 'metadata notification') })));
      for (const notification of notifications) {
        const pdfUrl = findUrl(notification.html, notification.url, /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i);
        if (!pdfUrl) continue;
        const pdf = await this.getResponse(pdfUrl, 'station metadata');
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        if (new TextDecoder().decode(bytes.slice(0, 4)) !== '%PDF') continue;
        const records = parseMonitoringRecords(await this.extractPdfText(bytes)).records;
        const coordinateStations = new Set(records.filter((record) => record.beachId && record.latitude && record.longitude).map((record) => record.beachId));
        if (coordinateStations.size >= 30) return records;
        if (!fallback.length && coordinateStations.size) fallback = records;
      }
    }
    if (fallback.length) return fallback;
    throw new Error('DRNA archive does not contain usable station metadata');
  }

  private async getMunicipality(latitude: number, longitude: number): Promise<string> {
    const url = new URL(CENSUS_GEOCODER_URL);
    url.search = new URLSearchParams({
      x: String(longitude), y: String(latitude), benchmark: 'Public_AR_Current',
      vintage: 'Current_Current', layers: 'Counties', format: 'json',
    }).toString();
    const body = await (await this.getResponse(url.toString(), 'municipality')).json() as {
      result?: { geographies?: { Counties?: Array<{ BASENAME?: string }> } };
    };
    const municipality = body.result?.geographies?.Counties?.[0]?.BASENAME?.trim();
    if (!municipality) throw new Error(`No municipality found for DRNA coordinates ${latitude}, ${longitude}`);
    return municipality;
  }

  private async getResponse(url: string, label: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new Error(`Unable to retrieve DRNA ${label}`);
    }
    if (!response.ok) throw new Error(`DRNA ${label} returned HTTP ${response.status}`);
    return response;
  }
}

function findUrl(html: string, baseUrl: string, pattern: RegExp): string | null {
  const href = pattern.exec(html)?.[1]?.replaceAll('&amp;', '&');
  return href ? new URL(href, baseUrl).toString() : null;
}

function findUrls(html: string, baseUrl: string, pattern: RegExp): string[] {
  return [...new Set([...html.matchAll(pattern)].map((match) => new URL(match[1].replaceAll('&amp;', '&'), baseUrl).toString()))];
}

function findArchivePageUrls(html: string): string[] {
  const pages = [...html.matchAll(/href=["']([^"']*\/notificaciones-ambientales\/page\/(\d+)\/?)['"]/gi)];
  return [...new Set(pages
    .sort((a, b) => Number(b[2]) - Number(a[2]))
    .map((page) => new URL(page[1].replaceAll('&amp;', '&'), ARCHIVE_URL).toString()))];
}

export function findLatestRecord(text: string, stationId: string): DrnaMonitoringRecord | null {
  return parseMonitoringRecords(text).records.filter((record) => record.beachId?.toLowerCase() === stationId.toLowerCase()).at(-1) ?? null;
}

export function parseMonitoringRecords(text: string): { records: DrnaMonitoringRecord[]; rejectedRows: number; sourceRows: number } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: string[] = [];
  for (const line of lines) {
    if (/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}-[A-Za-z]{3}-\d{4})[|\s]+RW-/i.test(line)) rows.push(line);
    else if (rows.length && !/^--|^Beach Monitoring|^Departamento/i.test(line)) rows[rows.length - 1] += ` ${line}`;
  }

  const records: DrnaMonitoringRecord[] = [];
  let rejectedRows = 0;
  for (const row of rows) {
    const parsed = row.includes('|') ? parsePipeRow(row) : parsePdfRow(row);
    if (parsed) records.push(parsed); else rejectedRows++;
  }
  return { records, rejectedRows, sourceRows: rows.length };
}

function parsePipeRow(row: string): DrnaMonitoringRecord | null {
  const values = row.split('|');
  if (values.length < 10) return null;
  return { date: values[0] || null, beachId: values[1] || null, beachName: values[2] || null, latitude: values[3] || null, longitude: values[4] || null, samplingRoute: values[5] || null, samplingType: values[6] || null, enterococcus: values[7] || null, temperatureCelsius: values[8] || null, ph: values[9] || null, observations: values[10] || null };
}

function parsePdfRow(row: string): DrnaMonitoringRecord | null {
  const match = /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(RW-[\w-]+)\s+(.+?)\s+(?:(1\d\.\d+)\s+)?(-6\d\.\d+)\s+(Route.*?)(Routine|Re-Sampling|re-sampling)\s*([<>]?\s*[\d,]+)?\s*(\d+(?:\.\d+)?)?\s*(\d+(?:\.\d+)?)?\s*(.*)$/i.exec(row);
  if (match) return { date: match[1], beachId: match[2], beachName: match[3].trim(), latitude: match[4] ?? null, longitude: match[5], samplingRoute: match[6].trim(), samplingType: match[7], enterococcus: match[8]?.replace(/\s+/g, '') ?? null, temperatureCelsius: match[9] ?? null, ph: match[10] ?? null, observations: match[11] || null };
  const withoutCoordinates = /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(RW-[\w-]+)\s+(.+?)\s+(?:(Route.*?))?(Routine|Re-Sampling|re-sampling)\s*([<>]?\s*[\d,]+)?\s*(\d+(?:\.\d+)?)?\s*(\d+(?:\.\d+)?)?\s*(.*)$/i.exec(row);
  return withoutCoordinates ? { date: withoutCoordinates[1], beachId: withoutCoordinates[2], beachName: withoutCoordinates[3].trim(), latitude: null, longitude: null, samplingRoute: withoutCoordinates[4]?.trim() ?? null, samplingType: withoutCoordinates[5], enterococcus: withoutCoordinates[6]?.replace(/\s+/g, '') ?? null, temperatureCelsius: withoutCoordinates[7] ?? null, ph: withoutCoordinates[8] ?? null, observations: withoutCoordinates[9] || null } : null;
}

function inferMunicipality(record: DrnaMonitoringRecord): string | null {
  const fromName = record.beachName?.match(/,\s*([^,]+)$/)?.[1]?.trim();
  const route = record.samplingRoute?.replace(/^Route:?\s*\d*:?\s*/i, '').trim();
  return fromName ?? (route && !/[–-]/.test(route) ? route : null);
}

function numberOrNull(value: string | null): number | null { const number = Number(value); return value && Number.isFinite(number) ? number : null; }
function dateValue(value: string): number { const parsed = Date.parse(value); return Number.isNaN(parsed) ? 0 : parsed; }

function validatedCoordinates(
  record: DrnaMonitoringRecord,
  baseline: { latitude: number | null; longitude: number | null },
): { latitude: number | null; longitude: number | null } {
  const latitude = numberOrNull(record.latitude);
  const longitude = numberOrNull(record.longitude);
  if (latitude === null || longitude === null || !inPuertoRico(latitude, longitude)) return baseline;
  if (baseline.latitude !== null && baseline.longitude !== null &&
      Math.hypot(latitude - baseline.latitude, longitude - baseline.longitude) > 0.01) return baseline;
  return { latitude, longitude };
}

function validateCatalog(stations: DrnaCatalog['stations'], enforceCoverage: boolean): void {
  if (enforceCoverage && stations.length < 30) throw new Error(`DRNA catalog coverage is suspiciously low: ${stations.length} stations`);
  const coordinates = new Map<string, string>();
  for (const station of stations) {
    if (station.latitude === null || station.longitude === null || !inPuertoRico(station.latitude, station.longitude)) {
      throw new Error(`DRNA station ${station.stationId} has invalid coordinates`);
    }
    const key = `${station.latitude.toFixed(7)},${station.longitude.toFixed(7)}`;
    const duplicate = coordinates.get(key);
    if (duplicate) throw new Error(`DRNA stations ${duplicate} and ${station.stationId} share coordinates`);
    coordinates.set(key, station.stationId);
  }
}

function inPuertoRico(latitude: number, longitude: number): boolean {
  return latitude >= 17.8 && latitude <= 18.6 && longitude >= -67.4 && longitude <= -65.2;
}

async function defaultPdfTextExtractor(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
