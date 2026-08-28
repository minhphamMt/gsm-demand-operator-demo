import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/auth.decorators';
import { SensitiveMutation } from '../common/security/sensitive-mutation.decorator';
import { AiService } from './ai.service';
import { AskAgentDto, GenerateAiDecisionDto, OptimizeAiDecisionDto, RunNextAiDecisionDto, RunPipelineDto, RunReplayAiDecisionDto } from './dto/generate-ai-decision.dto';

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
    return this.service.generateForOperator(body.horizonMinutes);
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
    return this.service.replayWindow(body.sourceAt, body.lookbackMinutes);
  }

  @Post('runs')
  @SensitiveMutation()
  @ApiOperation({ summary: 'Start a multi-agent pipeline run and return its polling id' })
  @ApiOkResponse({ description: 'Accepted run with its id for polling.' })
  startRun(@Body() body: RunPipelineDto) {
    return this.service.startRun(body.horizonMinutes, body.snapshotId);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Poll the state of a multi-agent pipeline run' })
  @ApiOkResponse({ description: 'Run state: agents, plan set, explanation, decision.' })
  getRun(@Param('runId') runId: string) {
    return this.service.getRun(runId);
  }

  // Trần 30 lượt/phút thay vì 10 mặc định: đây là ô chat, người gõ nhanh chạm trần 10 rất
  // dễ. Vẫn phải có trần vì mỗi câu có thể là một lượt gọi LLM tính tiền.
  @Post('observe')
  @SensitiveMutation(30)
  @ApiOperation({ summary: 'Ask the read-only observer agent a question in natural language' })
  @ApiOkResponse({ description: 'Accepted, with an optional client-side directive.' })
  observe(@Body() body: AskAgentDto) {
    return this.service.ask(body.sessionId, body.text, body.horizonMinutes, body.snapshotId);
  }

  @Get('observe/:sessionId')
  @ApiOperation({ summary: 'Poll the transcript of one question-and-answer session' })
  @ApiOkResponse({ description: 'Session events, same shape as run events.' })
  observeSession(@Param('sessionId') sessionId: string) {
    return this.service.getSession(sessionId);
  }

  @Get('llm/health')
  @ApiOperation({ summary: 'Preflight the LLM gateway configuration used by the agent layer' })
  @ApiOkResponse({ description: 'Routing flag, key presence, and per-model reachability. Never the key itself.' })
  llmHealth() {
    return this.service.llmHealth();
  }
}
