import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/auth.decorators';
import { SensitiveMutation } from '../common/security/sensitive-mutation.decorator';
import { AiService } from './ai.service';
import { GenerateAiDecisionDto } from './dto/generate-ai-decision.dto';

@ApiTags('operator-ai')
@Controller('operator/ai')
@Roles('OPERATOR')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Read AI service and model-artifact readiness' })
  @ApiOkResponse({ description: 'AI service readiness report.' })
  status() {
    return this.service.status();
  }

  @Post('generate')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Generate and persist an AI proposal from the latest live snapshot' })
  @ApiOkResponse({ description: 'Persisted forecast/hotspot/plan output.' })
  generate(@Body() body: GenerateAiDecisionDto) {
    return this.service.generate(body.horizonMinutes);
  }
}
