import { Controller, Get, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BeachIdPipe } from './beach-id.pipe';
import { WeatherService } from './weather.service';
import { WeatherResponseDto } from './dto/weather-response.dto';

@ApiTags('conditions')
@Controller('conditions')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}
  @Get(':beachId/weather')
  @ApiOperation({ summary: 'Get cached NWS weather forecast for the exact beach coordinates' })
  @ApiOkResponse({ type: WeatherResponseDto, description: 'A forecast, not a live observation. Stale responses retain historical values; unsupported coordinates are explicit.' })
  @ApiBadRequestResponse({ description: 'Beach ID must be a positive safe integer.' })
  @ApiNotFoundResponse({ description: 'Beach not found.' })
  getWeather(@Param('beachId', BeachIdPipe) beachId: number): Promise<WeatherResponseDto> {
    return this.weather.getWeather(beachId);
  }
}
