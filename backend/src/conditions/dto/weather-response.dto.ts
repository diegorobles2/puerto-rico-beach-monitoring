import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WeatherForecast } from '../../types/domain';

export class WeatherPeriodDto implements Omit<WeatherForecast, 'source'> {
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date-time' }) validFrom!: string;
  @ApiProperty({ format: 'date-time' }) validTo!: string;
  @ApiProperty() temperature!: number;
  @ApiProperty({ enum: ['C', 'F'] }) temperatureUnit!: 'C' | 'F';
  @ApiProperty({ description: 'Verbatim NWS wind speed with units, e.g. "6 to 9 mph".' }) windSpeed!: string;
  @ApiProperty() windDirection!: string;
  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 }) precipitationProbabilityPercent!: number | null;
  @ApiProperty() shortForecast!: string;
  @ApiProperty() detailedForecast!: string;
}

export class WeatherResponseDto {
  @ApiProperty() beachId!: number;
  @ApiProperty({ enum: ['available', 'stale', 'unavailable'] }) availability!: 'available' | 'stale' | 'unavailable';
  @ApiProperty({ type: WeatherPeriodDto, nullable: true, description: 'Historical only when availability is stale. Forecast, not a sensor observation.' }) forecast!: WeatherPeriodDto | null;
  @ApiProperty({ enum: ['NWS'] }) source!: 'NWS';
  @ApiPropertyOptional() sourceUrl?: string;
  @ApiProperty({ nullable: true, description: 'NWS forecast updateTime (issuance), not an observed weather measurement.' }) observedAt!: string | null;
  @ApiProperty({ nullable: true }) retrievedAt!: string | null;
  @ApiPropertyOptional({ enum: ['unsupported-location', 'no-forecast', 'upstream-error'] }) unavailableReason?: 'unsupported-location' | 'no-forecast' | 'upstream-error';
}
