import { Module } from '@nestjs/common';
import { DrnaService } from './drna/drna.service';
import { NwsService } from './nws/nws.service';
@Module({ providers: [DrnaService, NwsService], exports: [DrnaService, NwsService] })
export class DataSourcesModule {}
