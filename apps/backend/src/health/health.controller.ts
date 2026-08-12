import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/auth.decorators';
import { HealthResponseDto } from './health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: HealthResponseDto })
  check() {
    return this.health.liveness();
  }

  @Get('live')
  @Public()
  @ApiOkResponse({ type: HealthResponseDto })
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  @Public()
  @ApiOkResponse({ description: 'Service and Supabase are ready to serve traffic.' })
  ready() {
    return this.health.readiness();
  }

  @Get('metrics')
  @Public()
  @ApiOkResponse({ description: 'Minimal process metrics for production monitoring.' })
  metrics() {
    return this.health.metrics();
  }
}
