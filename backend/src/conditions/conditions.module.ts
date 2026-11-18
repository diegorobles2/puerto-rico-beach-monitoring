import { Module } from '@nestjs/common';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { NwsConditionsService } from './nws-conditions.service';
import { DataSourcesModule } from '../data-sources/data-sources.module';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  imports: [DataSourcesModule],
  controllers: [ConditionsController, WeatherController],
  providers: [ConditionsService, NwsConditionsService, WeatherService],
  exports: [WeatherService],
})
export class ConditionsModule {}
