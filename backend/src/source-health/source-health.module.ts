import { Module } from '@nestjs/common';
import { SourceHealthService } from './source-health.service';
@Module({ providers: [SourceHealthService], exports: [SourceHealthService] })
export class SourceHealthModule {}
