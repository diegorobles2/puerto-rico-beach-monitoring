import { Injectable } from '@nestjs/common';
import type { WaterQualityObservation } from '../../types/domain';
@Injectable()
export class DrnaService {
  async getWaterQuality(): Promise<WaterQualityObservation | null> {
    // TODO: Fetch DRNA data and pass the raw response through drna.mapper.ts.
    return null;
  }
}
