import { Injectable } from '@nestjs/common';
import { DrnaService } from '../data-sources/drna/drna.service';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';

@Injectable()
export class ConditionsService {
  constructor(private readonly drnaService: DrnaService) {}

  async getWaterQuality(
    beachId: string,
  ): Promise<WaterQualityResponseDto> {
    const waterQuality = await this.drnaService.getWaterQuality();

    if (!waterQuality) {
      return {
        status: 'unknown',
        source: 'DRNA',
        observedAt: null,
        retrievedAt: null,
        availability: 'unavailable',
      };
    }

    return {
      status: waterQuality.status,
      source: waterQuality.source.sourceName,
      sourceUrl: waterQuality.source.sourceUrl,
      observedAt: waterQuality.source.observedAt,
      retrievedAt: waterQuality.source.retrievedAt,
      availability: 'available',
    };
  }
}