import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { OceanCondition } from '../../types/domain';

export type OceanRisk = OceanCondition['risk'];

export type NwsAvailability = 'available' | 'stale' | 'unavailable';

export type NwsUnavailableReason =
  | 'beach-not-mapped'
  | 'no-data'
  | 'risk-not-published';

export const NWS_AVAILABILITY_VALUES: NwsAvailability[] = [
  'available',
  'stale',
  'unavailable',
];

export const NWS_UNAVAILABLE_REASONS: NwsUnavailableReason[] = [
  'beach-not-mapped',
  'no-data',
  'risk-not-published',
];

const OCEAN_RISK_VALUES: OceanRisk[] = [
  'low',
  'moderate',
  'high',
  'extreme',
  'unknown',
];

export class OceanRiskResponseDto {
  @ApiProperty({ example: 7, description: 'Beach identifier.' })
  beachId!: number;

  @ApiProperty({
    example: 'PRZ001',
    nullable: true,
    description:
      'NWS coastal forecast zone the risk applies to. The risk is published per zone, not per beach.',
  })
  zoneId!: string | null;

  @ApiProperty({
    example: 'moderate',
    enum: OCEAN_RISK_VALUES,
    description:
      'Current NWS rip-current risk. Always "unknown" unless availability is "available". "low" does not mean the beach is safe.',
  })
  status!: OceanRisk;

  @ApiPropertyOptional({
    example: 'low',
    enum: OCEAN_RISK_VALUES,
    description:
      'Last stored risk category, present only when availability is "stale". It is historical and must not be shown as the current risk.',
  })
  lastKnownStatus?: OceanRisk;

  @ApiProperty({
    example: 'Moderate rip-current risk.',
    description: 'Human-readable summary of the normalized risk.',
  })
  summary!: string;

  @ApiProperty({
    example: 'TODAY',
    nullable: true,
    description: 'Forecast period named in the NWS surf forecast.',
  })
  forecastPeriod!: string | null;

  @ApiProperty({
    example: 'NWS',
    description: 'Name of the official ocean-risk data source.',
  })
  source!: 'NWS';

  @ApiPropertyOptional({
    example: 'https://api.weather.gov/products/abc123',
    description: 'URL of the NWS surf forecast product, when available.',
  })
  sourceUrl?: string;

  @ApiProperty({
    example: '2026-10-17T09:15:00.000Z',
    nullable: true,
    description: 'Time NWS issued the surf forecast the risk comes from.',
  })
  observedAt!: string | null;

  @ApiProperty({
    example: '2026-10-17T12:00:00.000Z',
    nullable: true,
    description: 'Time the application last retrieved the forecast from NWS.',
  })
  retrievedAt!: string | null;

  @ApiProperty({
    example: 'available',
    enum: NWS_AVAILABILITY_VALUES,
    description:
      '"available": recently retrieved and current. "stale": stored data is too old to be trusted as current. "unavailable": no usable data.',
  })
  availability!: NwsAvailability;

  @ApiPropertyOptional({
    example: 'no-data',
    enum: NWS_UNAVAILABLE_REASONS,
    description: 'Why data is unavailable. Present only when availability is "unavailable".',
  })
  unavailableReason?: NwsUnavailableReason;
}
