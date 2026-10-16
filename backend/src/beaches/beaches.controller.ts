
import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BeachesService } from './beaches.service';
import { NwsPersistenceService } from '../ingestion/nws-persistence.service';

@ApiTags('beaches')
@Controller('beaches')
export class BeachesController {
  constructor(
    private readonly beachesService: BeachesService,
    private readonly nwsPersistence: NwsPersistenceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List beaches' })
  findAll() {
    return this.beachesService.findAll();
  }

  @Get(':id/conditions')
  @ApiOperation({
    summary: 'Get stored NWS conditions for a beach',
  })
  async getConditions(@Param('id') id: string) {
    const result =
      await this.nwsPersistence.getStoredConditionsByBeach(id);

    if (!result) {
      throw new NotFoundException('Beach not found');
    }

    return result;
  }

  @Get(':id/alerts')
  @ApiOperation({
    summary: 'Get stored NWS alerts for a beach',
  })
  async getAlerts(@Param('id') id: string) {
    const result =
      await this.nwsPersistence.getStoredAlertsByBeach(id);

    if (!result) {
      throw new NotFoundException('Beach not found');
    }

    return result;
  }
}