import { Injectable } from '@nestjs/common';
import type { OceanCondition } from '../../types/domain';
@Injectable()
export class NwsService {
  async getConditions(): Promise<OceanCondition | null> {
    // TODO: Fetch NWS data and pass the raw response through nws.mapper.ts.
    return null;
  }
}
