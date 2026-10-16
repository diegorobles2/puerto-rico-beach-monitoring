import { Module } from '@nestjs/common';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [IngestionModule],
  controllers: [BeachesController],
  providers: [BeachesService],
})
export class BeachesModule {}
