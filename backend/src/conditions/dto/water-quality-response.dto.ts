import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WaterQualityStatus } from '../../types/domain';

export type WaterQualityAvailability =
  | 'available'
  | 'stale'
  | 'unavailable';

export class WaterQualityResponseDto {
  @ApiProperty({
    example: 'suitable',
    enum: ['suitable', 'advisory', 'unknown'],
    description: 'Current normalized status. Always unknown for stale or unavailable observations.',
  })
  status!: WaterQualityStatus;

  @ApiPropertyOptional({ enum: ['suitable', 'advisory', 'unknown'], description: 'Retained sample status, historical only. Present when availability is stale.' })
  lastKnownStatus?: WaterQualityStatus;

  @ApiProperty({
    example: 'DRNA',
    description: 'Name of the official water-quality data source.',
  })
  source!: string;

  @ApiPropertyOptional({
    example: 'https://www.drna.pr.gov/',
    description: 'URL of the original data source, when available.',
  })
  sourceUrl?: string;

  @ApiProperty({
    example: '2026-10-04',
    description: 'Date the water-quality condition was observed.',
    nullable: true,
  })
  observedAt!: string | null;

  @ApiProperty({
    example: '2026-10-04T12:30:00.000Z',
    description: 'Time the application retrieved the source data.',
    nullable: true,
  })
  retrievedAt!: string | null;

  @ApiProperty({
    example: 'available',
    enum: ['available', 'stale', 'unavailable'],
    description:
      'Stale if the sample is older than 48 hours or its date is missing, invalid, or future. Retrieval does not reset sample age.',
  })
  availability!: WaterQualityAvailability;

  @ApiPropertyOptional({ example: 20, nullable: true, description: 'Enterococcus count in colonies per 100 mL.' })
  enterococcusValue?: number | null;

  @ApiPropertyOptional({ example: 'less-than', nullable: true, enum: ['less-than', 'greater-than'] })
  enterococcusQualifier?: 'less-than' | 'greater-than' | null;

  @ApiPropertyOptional({ example: 'routine', nullable: true, enum: ['routine', 'resampling', 'unknown'] })
  samplingType?: 'routine' | 'resampling' | 'unknown' | null;

  @ApiPropertyOptional({ example: 29.2, nullable: true })
  temperatureCelsius?: number | null;

  @ApiPropertyOptional({ example: 8.04, nullable: true })
  ph?: number | null;
}
