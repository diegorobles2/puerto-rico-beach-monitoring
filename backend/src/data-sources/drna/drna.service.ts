import { Injectable } from '@nestjs/common';
import type { NormalizedWaterQuality } from './drna.mapper';
@Injectable()
export class DrnaService {
  async getWaterQuality(): Promise<NormalizedWaterQuality | null> {
    // TODO: Fetch DRNA data and pass the raw response through drna.mapper.ts.
    return null;
  }
}
