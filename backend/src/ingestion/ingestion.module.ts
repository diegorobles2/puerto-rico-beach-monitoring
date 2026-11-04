import { Module } from '@nestjs/common';
import { DataSourcesModule } from '../data-sources/data-sources.module';
import { IngestionScheduler } from './ingestion.scheduler';
import { IngestionService } from './ingestion.service';
import { NwsMappingService } from './nws-mapping.service';
import { NwsPersistenceService } from './nws-persistence.service';
import { NwsIngestionService } from './nws-ingestion.service';

@Module({
  imports: [DataSourcesModule],
  providers: [
    IngestionService,
    IngestionScheduler,
    NwsMappingService,
    NwsPersistenceService,
    NwsIngestionService,
  ],
})
export class IngestionModule {}
