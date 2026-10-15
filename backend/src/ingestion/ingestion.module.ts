import { Module } from '@nestjs/common';
import { DataSourcesModule } from '../data-sources/data-sources.module';
import { IngestionScheduler } from './ingestion.scheduler';
import { IngestionService } from './ingestion.service';
import { NwsMappingService } from './nws-mapping.service';
@Module({ imports: [DataSourcesModule], providers: [IngestionService, IngestionScheduler, NwsMappingService] })
export class IngestionModule {}
