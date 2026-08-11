import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiErrorDto } from '../common/http/api-error.dto';
import type { RequestWithId } from '../common/http/request-id.middleware';
import { SensitiveMutation } from '../common/security/sensitive-mutation.decorator';
import {
  ActivateProposalDto,
  AuditQueryDto,
  ApproveProposalDto,
  DriverStatusDto,
  OfferResponseDto,
  OffersQueryDto,
  OperationsReportQueryDto,
  RejectProposalDto,
  ReviseProposalDto,
  SnapshotQueryDto,
  SnapshotWindowQueryDto,
} from './dto/operator.dto';
import {
  AuditPageResponseDto,
  BaselineResponseDto,
  CampaignResponseDto,
  DriverSummaryResponseDto,
  DriverViewResponseDto,
  OfferViewDto,
  OperationsReportResponseDto,
  ProposalResponseDto,
  SnapshotResponseDto,
} from './dto/operator-response.dto';
import { OperatorService } from './operator.service';

@ApiTags('operator')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-request-id',
  required: false,
  description: 'Optional caller correlation ID. A UUID is generated when omitted or unsafe.',
  example: 'operator-review-42',
})
@ApiBadRequestResponse({ description: 'Invalid path, query, or request body.', type: ApiErrorDto })
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token.', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'The authenticated profile lacks the required role.', type: ApiErrorDto })
@ApiInternalServerErrorResponse({ description: 'Unexpected errors use a safe envelope and request ID.', type: ApiErrorDto })
@Controller()
export class OperatorController {
  constructor(private readonly service: OperatorService) {}

  @Get('operator/snapshots/latest')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: SnapshotResponseDto })
  @ApiNotFoundResponse({ description: 'No supply-demand snapshot exists.', type: ApiErrorDto })
  latestSnapshot(@Query() query: SnapshotQueryDto) {
    return this.service.latestSnapshot(query);
  }

  @Get('operator/snapshots')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: SnapshotResponseDto, isArray: true })
  snapshotWindow(@Query() query: SnapshotWindowQueryDto) {
    return this.service.snapshotWindow(query);
  }

  @Get('operator/baselines')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: BaselineResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'No supply-demand snapshot exists.', type: ApiErrorDto })
  baselines() {
    return this.service.baselines();
  }

  @Get('operator/proposals')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: ProposalResponseDto, isArray: true })
  listProposals() {
    return this.service.listProposals();
  }

  @Get('operator/proposals/:id')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiNotFoundResponse({ description: 'Proposal was not found.', type: ApiErrorDto })
  getProposal(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProposal(id);
  }

  @Post('operator/proposals/:id/revisions')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: ProposalResponseDto })
  @ApiNotFoundResponse({ description: 'Proposal was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Proposal state or version changed.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Revision violates the DB workflow or policy.', type: ApiErrorDto })
  reviseProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseProposalDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.reviseProposal(id, dto, request.user.id, request.requestId);
  }

  @Post('operator/proposals/:id/approve')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: ProposalResponseDto })
  @ApiNotFoundResponse({ description: 'Proposal was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Proposal was already reviewed or is stale.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Proposal cannot be approved in its current state.', type: ApiErrorDto })
  approveProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveProposalDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.reviewProposal(id, 'APPROVED', dto, request.user.id, request.requestId);
  }

  @Post('operator/proposals/:id/reject')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: ProposalResponseDto })
  @ApiNotFoundResponse({ description: 'Proposal was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Proposal was already reviewed or is stale.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Proposal cannot be rejected in its current state.', type: ApiErrorDto })
  rejectProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProposalDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.reviewProposal(id, 'REJECTED', dto, request.user.id, request.requestId);
  }

  @Post('operator/proposals/:id/activate')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: CampaignResponseDto })
  @ApiNotFoundResponse({ description: 'Proposal was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'The proposal already has a campaign.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Proposal is not eligible for activation.', type: ApiErrorDto })
  activateProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivateProposalDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.activateProposal(id, dto, request.user.id, request.requestId);
  }

  @Get('operator/campaigns')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: CampaignResponseDto, isArray: true })
  listCampaigns() {
    return this.service.listCampaigns();
  }

  @Get('operator/reports/operations')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: OperationsReportResponseDto })
  operationsReport(@Query() query: OperationsReportQueryDto) {
    return this.service.operationsReport(query);
  }

  @Post('operator/campaigns/:id/cancel')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: CampaignResponseDto })
  @ApiNotFoundResponse({ description: 'Campaign was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Campaign is already terminal.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Campaign cannot be cancelled.', type: ApiErrorDto })
  cancelCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.cancelCampaign(id, request.user.id, request.requestId);
  }

  @Get('operator/offers')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: OfferViewDto, isArray: true })
  listOffers(@Query() query: OffersQueryDto) {
    return this.service.listOffers(query.campaignId);
  }

  @Get('operator/audit')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: AuditPageResponseDto })
  listAudit(@Query() query: AuditQueryDto) {
    return this.service.listAudit(query);
  }

  @Get('drivers')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: DriverSummaryResponseDto, isArray: true })
  listDrivers() {
    return this.service.listDrivers();
  }

  @Get('drivers/:id')
  @Roles('OPERATOR')
  @ApiOkResponse({ type: DriverViewResponseDto })
  @ApiNotFoundResponse({ description: 'Driver was not found.', type: ApiErrorDto })
  getDriverView(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDriverView(id);
  }

  @Get('driver/me')
  @Roles('DRIVER')
  @ApiOkResponse({ type: DriverViewResponseDto })
  @ApiNotFoundResponse({ description: 'Driver profile was not found.', type: ApiErrorDto })
  getOwnDriverView(@Req() request: Request & { user: AuthenticatedUser }) {
    return this.service.getDriverView(request.user.id);
  }

  @Patch('drivers/:id/status')
  @SensitiveMutation()
  @Roles('DRIVER', 'OPERATOR')
  @ApiOkResponse({ type: DriverSummaryResponseDto })
  @ApiNotFoundResponse({ description: 'Driver was not found.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'A driver attempted to update another driver.', type: ApiErrorDto })
  updateDriverStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DriverStatusDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.updateDriverStatus(id, dto, request.user.id, request.user.appRole, request.requestId);
  }

  @Post('offers/:id/respond')
  @SensitiveMutation()
  @Roles('DRIVER')
  @ApiCreatedResponse({ type: OfferViewDto })
  @ApiNotFoundResponse({ description: 'Offer was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Offer was already answered or expired.', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'Offer cannot be answered in its current state.', type: ApiErrorDto })
  respondToOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfferResponseDto,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.respondToOffer(id, dto, request.user.id, request.user.appRole, request.requestId);
  }

  @Post('offers/:id/expire')
  @SensitiveMutation()
  @Roles('OPERATOR')
  @ApiCreatedResponse({ type: OfferViewDto })
  @ApiNotFoundResponse({ description: 'Offer was not found.', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Offer was already answered or expired.', type: ApiErrorDto })
  expireOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId & { user: AuthenticatedUser },
  ) {
    return this.service.expireOffer(id, request.user.id, request.requestId);
  }
}
