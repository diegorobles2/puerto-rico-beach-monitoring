import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get() @ApiOperation({ summary: 'List community reports (placeholder)' }) findAll() { return this.service.findAll(); }
}
