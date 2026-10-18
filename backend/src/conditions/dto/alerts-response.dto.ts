import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NWS_AVAILABILITY_VALUES,
  type NwsAvailability,
  type NwsUnavailableReason,
} from './ocean-risk-response.dto';

export type AlertsStatus = 'active-alerts' | 'no-active-alerts' | 'unknown';

export class BeachAlertDto {
  @ApiProperty({
    example: 'urn:oid:2.49.0.1.840.0.abc123',
    description: 'NWS alert identifier.',
  })
  id!: string;

  @ApiProperty({
    example: 'High Rip Current Risk issued October 17 at 6:00AM AST',
    description: 'Alert headline, or event name when no headline is published.',
  })
  title!: string;

  @ApiProperty({ description: 'Full alert description.' })
  description!: string;

  @ApiProperty({
    nullable: true,
    description: 'Recommended actions, when NWS provides them.',
  })
  instruction!: string | null;

  @ApiProperty({
    example: 'Moderate',
    description: 'NWS severity (Extreme, Severe, Moderate, Minor, Unknown).',
  })
  severity!: string;

  @ApiProperty({
    example: 'Likely',
    description: 'NWS certainty (Observed, Likely, Possible, Unlikely, Unknown).',
  })
  certainty!: string;

  @ApiProperty({
    example: 'Expected',
    description: 'NWS urgency (Immediate, Expected, Future, Past, Unknown).',
  })
  urgency!: string;

  @ApiProperty({
    example: '2026-10-17T10:00:00.000Z',
    description: 'Time the alert takes effect.',
  })
  effectiveAt!: string;

  @ApiProperty({
    example: '2026-10-18T22:00:00.000Z',
    description: 'Time the alert ends or expires.',
  })
  expiresAt!: string;

  @ApiProperty({
    example: '2026-10-17T10:00:00.000Z',
    nullable: true,
    description: 'Time NWS sent the alert.',
  })
  observedAt!: string | null;

  @ApiProperty({
    example: '2026-10-17T12:00:00.000Z',
    description: 'Time the application last retrieved this alert from NWS.',
  })
  retrievedAt!: string;

  @ApiPropertyOptional({
    example: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.abc123',
    description: 'URL of the NWS alert, when available.',
  })
  sourceUrl?: string;
}

export class AlertsResponseDto {
  @ApiProperty({ example: 7, description: 'Beach identifier.' })
  beachId!: number;

  @ApiProperty({
    example: 'PRZ001',
    nullable: true,
    description: 'NWS forecast zone used to match alerts to the beach.',
  })
  zoneId!: string | null;

  @ApiProperty({
    example: 'no-active-alerts',
    enum: ['active-alerts', 'no-active-alerts', 'unknown'],
    description:
      '"no-active-alerts" is returned only when a current NWS check found no alerts. Stale or unavailable data without alerts is "unknown".',
  })
  status!: AlertsStatus;

  @ApiProperty({
    example: 'NWS',
    description: 'Name of the official alert data source.',
  })
  source!: 'NWS';

  @ApiProperty({
    example: '2026-10-17T12:00:00.000Z',
    nullable: true,
    description: 'Time the application last successfully checked NWS for alerts in this zone.',
  })
  retrievedAt!: string | null;

  @ApiProperty({
    example: 'available',
    enum: NWS_AVAILABILITY_VALUES,
    description:
      '"available": recently checked. "stale": the last check is too old to rule out new alerts. "unavailable": alerts were never retrieved for this beach.',
  })
  availability!: NwsAvailability;

  @ApiPropertyOptional({
    example: 'no-data',
    enum: ['beach-not-mapped', 'no-data'],
    description: 'Why data is unavailable. Present only when availability is "unavailable".',
  })
  unavailableReason?: Exclude<NwsUnavailableReason, 'risk-not-published'>;

  @ApiProperty({
    type: [BeachAlertDto],
    nullable: true,
    description:
      'Unexpired alerts from the last check. An empty array means no alerts were found; null means alert data is unavailable.',
  })
  alerts!: BeachAlertDto[] | null;
}
