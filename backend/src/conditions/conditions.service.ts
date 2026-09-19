import { Injectable } from '@nestjs/common';
@Injectable()
export class ConditionsService { findByBeach(beachId: string) { return { beachId, waterQuality: 'unknown', oceanRisk: 'unknown' }; } }
