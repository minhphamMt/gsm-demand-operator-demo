import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/auth.decorators';
import { SensitiveMutation } from '../common/security/sensitive-mutation.decorator';
import { AiService } from './ai.service';
import { GenerateAiDecisionDto, OptimizeAiDecisionDto, RunNextAiDecisionDto, RunReplayAiDecisionDto } from './dto/generate-ai-decision.dto';

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

  @Post('run-next')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Ingest the next frozen dataset snapshot and run trained AI inference' })
  @ApiOkResponse({ description: 'Persisted source snapshot, forecast and proposal.' })
  runNext(@Body() body: RunNextAiDecisionDto) {
    return this.service.runNext(body.horizonMinutes, body.regime);
  }

  @Post('optimize')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Run the trained optimizer for a forecasted snapshot and persist its proposal' })
  optimize(@Body() body: OptimizeAiDecisionDto) {
    return this.service.optimize(body.snapshotId, body.horizonMinutes);
  }

  @Post('forecast')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Run and persist a trained forecast for the selected snapshot without creating a proposal' })
  forecast(@Body() body: OptimizeAiDecisionDto) {
    return this.service.forecast(body.snapshotId, body.horizonMinutes);
  }

  @Post('replay')
  @SensitiveMutation(40)
  @ApiOperation({ summary: 'Load an exact observed replay bucket without running inference' })
  replay(@Body() body: RunReplayAiDecisionDto) {
    return this.service.runReplay(body.sourceAt);
  }

  @Post('replay-window')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Read actual rain metrics around a replay bucket' })
  replayWindow(@Body() body: RunReplayAiDecisionDto) {
    return this.service.replayWindow(body.sourceAt);
  }
}
