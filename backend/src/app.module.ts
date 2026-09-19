import { Module } from '@nestjs/common';
import { BeachesModule } from './beaches/beaches.module';
import { ConditionsModule } from './conditions/conditions.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ReportsModule } from './reports/reports.module';
import { SourceHealthModule } from './source-health/source-health.module';
@Module({ imports: [BeachesModule, ConditionsModule, ReportsModule, DataSourcesModule, IngestionModule, SourceHealthModule] })
export class AppModule {}
