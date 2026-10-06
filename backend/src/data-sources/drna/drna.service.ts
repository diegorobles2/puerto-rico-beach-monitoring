import { Injectable, Optional } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type { WaterQualityObservation } from '../../types/domain';
import { mapDrnaWaterQuality } from './drna.mapper';
import type { DrnaMonitoringRecord } from './drna.types';

const ARCHIVE_URL =
  'https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/';
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
    const notificationUrl = await this.findLatestNotificationUrl();
    const notification = await this.getText(notificationUrl, 'notification');
    const pdfUrl = findUrl(notification, notificationUrl, /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i);

    if (!pdfUrl) throw new Error('DRNA notification does not link to monitoring results');

    const pdf = await this.getResponse(pdfUrl, 'monitoring results');
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== '%PDF') {
      throw new Error('DRNA monitoring results are not a valid PDF');
    }

    const record = findLatestRecord(await this.extractPdfText(bytes), stationId);
    return record
      ? mapDrnaWaterQuality({ record, sourceUrl: pdfUrl, retrievedAt: new Date().toISOString() })
      : null;
  }

  private async findLatestNotificationUrl(): Promise<string> {
    const archive = await this.getText(ARCHIVE_URL, 'notification archive');
    const url = findUrl(
      archive,
      ARCHIVE_URL,
      /href=["']([^"']*\/notificacion-monitoria-de-playas-\d+\/?)["']/i,
    );
    if (!url) throw new Error('DRNA archive does not contain a monitoring notification');
    return url;
  }

  private async getText(url: string, label: string): Promise<string> {
    return (await this.getResponse(url, label)).text();
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

export function findLatestRecord(text: string, stationId: string): DrnaMonitoringRecord | null {
  const escapedStationId = stationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stationPattern = new RegExp(`\\b${escapedStationId}\\b`, 'i');
  const row = text
    .split(/\r?\n/)
    .filter((line) => stationPattern.test(line))
    .at(-1);
  if (!row) return null;

  const match = /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(RW-[\w-]+)\s+(.+?)\s+(Routine|Re-Sampling|re-sampling)\s+(<?\s*[\d,]+)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i.exec(
    row.trim(),
  );
  if (!match) return null;

  const beachName = match[3].split(/\s+-\d{2,3}\.\d+\s+Route\b/i)[0].trim();
  return {
    date: match[1],
    beachId: match[2],
    beachName,
    samplingType: match[4],
    enterococcus: match[5].replace(/\s+/g, ''),
    temperatureCelsius: match[6],
    ph: match[7] ?? null,
    observations: match[8] ?? null,
  };
}

async function defaultPdfTextExtractor(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
