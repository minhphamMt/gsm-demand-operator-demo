import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ActorThrottlerGuard } from '../common/security/actor-throttler.guard';
import { CampaignLifecycleService } from './campaign-lifecycle.service';
import { DispatchSimulationService } from './dispatch-simulation.service';
import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

@Module({ imports: [AiModule], controllers: [OperatorController], providers: [ActorThrottlerGuard, CampaignLifecycleService, DispatchSimulationService, OperatorService] })
export class OperatorModule {}
