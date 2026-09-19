import { Injectable } from '@nestjs/common';
import type { CommunityReport } from '../types/domain';
@Injectable()
export class ReportsService { findAll(): CommunityReport[] { return []; } }
