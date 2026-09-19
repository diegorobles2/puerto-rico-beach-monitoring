import { Module } from '@nestjs/common';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
@Module({ controllers: [BeachesController], providers: [BeachesService] })
export class BeachesModule {}
