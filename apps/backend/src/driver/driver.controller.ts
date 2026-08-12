import { Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { Request } from 'express'

import { Roles } from '../auth/auth.decorators'
import type { AuthenticatedUser } from '../auth/auth.types'
import { ApiErrorDto } from '../common/http/api-error.dto'
import type { RequestWithId } from '../common/http/request-id.middleware'
import { SensitiveMutation } from '../common/security/sensitive-mutation.decorator'
import {
  AcceptDriverOfferResponseDto,
  DeclineDriverOfferResponseDto,
  ResetDriverDemoOfferResponseDto,
} from './dto/driver-response.dto'
import { DriverService } from './driver.service'

type DriverRequest = Request & RequestWithId & { user: AuthenticatedUser }

@ApiTags('driver')
@ApiBearerAuth()
@Roles('DRIVER')
@Controller('driver')
export class DriverController {
  constructor(private readonly service: DriverService) {}

  @Post('offers/:id/accept')
  @SensitiveMutation()
  @ApiCreatedResponse({ type: AcceptDriverOfferResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  acceptOffer(@Param('id', ParseUUIDPipe) id: string, @Req() request: DriverRequest) {
    return this.service.acceptOffer(id, request.user.id, request.requestId)
  }

  @Post('offers/:id/decline')
  @SensitiveMutation()
  @ApiOkResponse({ type: DeclineDriverOfferResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  declineOffer(@Param('id', ParseUUIDPipe) id: string, @Req() request: DriverRequest) {
    return this.service.declineOffer(id, request.user.id, request.requestId)
  }

  @Post('debug/reset-offer')
  @SensitiveMutation()
  @ApiOkResponse({ type: ResetDriverDemoOfferResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  resetDemoOffer(@Req() request: DriverRequest) {
    return this.service.resetDemoOffer(request.user.id, request.requestId)
  }
}
