import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConditionsService } from './conditions.service';
import { AlertsResponseDto } from './dto/alerts-response.dto';
import { OceanRiskResponseDto } from './dto/ocean-risk-response.dto';
import { WaterQualityResponseDto } from './dto/water-quality-response.dto';
import { NwsConditionsService } from './nws-conditions.service';

@ApiTags('conditions')
@ApiNotFoundResponse({
  description: 'The requested beach identifier was not found.',
})
@ApiBadRequestResponse({
  description: 'The beach identifier is not a number.',
})
@Controller('conditions')
export class ConditionsController {
  constructor(
    private readonly service: ConditionsService,
    private readonly nws: NwsConditionsService,
  ) {}

  @Get(':beachId/water-quality')
  @ApiOperation({
    summary: 'Get normalized water-quality conditions for a beach',
  })
  @ApiOkResponse({
    description:
      'Returns normalized water-quality information. If source data is unavailable, availability is "unavailable" and status is "unknown".',
    type: WaterQualityResponseDto,
  })
  getWaterQuality(
    @Param('beachId', ParseIntPipe) beachId: number,
  ): Promise<WaterQualityResponseDto> {
    return this.service.getWaterQuality(beachId);
  }

  @Get(':beachId/ocean-risk')
  @ApiOperation({
    summary: 'Get the NWS rip-current risk for a beach',
    description:
      'Returns the stored NWS surf-forecast rip-current risk for the forecast zone the beach belongs to. status is "unknown" whenever availability is "stale" or "unavailable".',
  })
  @ApiOkResponse({
    description:
      'Normalized ocean risk. Unmapped beaches, missing data, and out-of-date data are reported through availability, never as a low risk.',
    type: OceanRiskResponseDto,
  })
  getOceanRisk(
    @Param('beachId', ParseIntPipe) beachId: number,
  ): Promise<OceanRiskResponseDto> {
    return this.nws.getOceanRisk(beachId);
  }

  @Get(':beachId/alerts')
  @ApiOperation({
    summary: 'Get active NWS alerts for a beach',
    description:
      'Returns unexpired NWS alerts for the forecast zone the beach belongs to. An empty alerts array with status "no-active-alerts" means a current check found none; alerts is null when alert data is unavailable.',
  })
  @ApiOkResponse({
    description: 'Normalized active alerts with availability and freshness.',
    type: AlertsResponseDto,
  })
  getAlerts(
    @Param('beachId', ParseIntPipe) beachId: number,
  ): Promise<AlertsResponseDto> {
    return this.nws.getAlerts(beachId);
  }
}
