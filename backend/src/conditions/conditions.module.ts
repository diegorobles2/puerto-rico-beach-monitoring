import { Module } from '@nestjs/common';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { NwsConditionsService } from './nws-conditions.service';

@Module({
  controllers: [ConditionsController],
  providers: [ConditionsService, NwsConditionsService],
})
export class ConditionsModule {}
