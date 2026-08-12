import { Module } from '@nestjs/common'

import { ActorThrottlerGuard } from '../common/security/actor-throttler.guard'
import { DriverController } from './driver.controller'
import { DriverService } from './driver.service'

@Module({
  controllers: [DriverController],
  providers: [ActorThrottlerGuard, DriverService],
})
export class DriverModule {}
