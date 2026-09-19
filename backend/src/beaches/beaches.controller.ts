import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BeachesService } from './beaches.service';
@ApiTags('beaches')
@Controller('beaches')
export class BeachesController {
  constructor(private readonly beachesService: BeachesService) {}
  @Get() @ApiOperation({ summary: 'List beaches' }) findAll() { return this.beachesService.findAll(); }
}
