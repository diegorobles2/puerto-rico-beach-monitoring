import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConditionsService } from './conditions.service';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';

@ApiTags('conditions')
@Controller('conditions')
export class ConditionsController {
  constructor(private readonly service: ConditionsService) {}

  @Get(':beachId/water-quality')
  @ApiOperation({
    summary: 'Get normalized water-quality conditions for a beach',
  })
  @ApiOkResponse({
    description:
      'Returns normalized water-quality information. If source data is unavailable, availability is "unavailable" and status is "unknown".',
    type: WaterQualityResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The requested beach identifier was not found.',
  })
  getWaterQuality(
    @Param('beachId') beachId: string,
  ): Promise<WaterQualityResponseDto> {
    return this.service.getWaterQuality(beachId);
  }
}