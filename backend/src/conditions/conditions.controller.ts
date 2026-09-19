import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConditionsService } from './conditions.service';
@ApiTags('conditions')
@Controller('conditions')
export class ConditionsController {
  constructor(private readonly service: ConditionsService) {}
  @Get(':beachId') @ApiOperation({ summary: 'Get current conditions for a beach' }) findByBeach(@Param('beachId') beachId: string) { return this.service.findByBeach(beachId); }
}
