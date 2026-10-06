import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WaterQualityStatus } from '../../types/domain';

export type WaterQualityAvailability =
  | 'available'
  | 'stale'
  | 'unavailable';

export class WaterQualityResponseDto {
  @ApiProperty({
    example: 'safe',
    enum: ['safe', 'advisory', 'closed', 'unknown'],
    description: 'Normalized water-quality status.',
  })
  status!: WaterQualityStatus;

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

  @ApiPropertyOptional({
    example: '2026-10-04T12:00:00.000Z',
    description: 'Time the water-quality condition was observed.',
    nullable: true,
  })
  observedAt!: string | null;

  @ApiPropertyOptional({
    example: '2026-10-04T12:30:00.000Z',
    description: 'Time the application retrieved the source data.',
    nullable: true,
  })
  retrievedAt!: string | null;

  @ApiProperty({
    example: 'available',
    enum: ['available', 'stale', 'unavailable'],
    description:
      'Whether normalized water-quality information is currently available.',
  })
  availability!: WaterQualityAvailability;
}