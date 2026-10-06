import { Module } from '@nestjs/common';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { DataSourcesModule } from '../data-sources/data-sources.module';
@Module({ controllers: [ConditionsController], providers: [ConditionsService] })
export class ConditionsModule {}
