import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerModule } from '@nestjs/throttler';

import { ActorThrottlerGuard } from '../common/security/actor-throttler.guard';
import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

describe('Operator OpenAPI contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'sensitive', ttl: 60_000, limit: 10 }])],
      controllers: [OperatorController],
      providers: [ActorThrottlerGuard, { provide: OperatorService, useValue: {} }],
    }).compile();
    app = module.createNestApplication();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes explicit success and error responses for operator endpoints', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('contract-test').addBearerAuth().build(),
    );

    expect(document.paths['/operator/snapshots/latest']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/operator/proposals']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/operator/proposals/{id}']?.get?.responses?.['404']).toBeDefined();
    expect(document.paths['/operator/proposals/{id}/revisions']?.post?.responses?.['201']).toBeDefined();
    expect(document.paths['/operator/proposals/{id}/revisions']?.post?.responses?.['422']).toBeDefined();
    expect(document.paths['/operator/proposals/{id}/activate']?.post?.responses?.['409']).toBeDefined();
    expect(document.paths['/operator/proposals/{id}/activate']?.post?.responses?.['429']).toBeDefined();
    expect(document.paths['/operator/campaigns/{id}/cancel']?.post?.responses?.['201']).toBeDefined();
    expect(document.paths['/operator/reports/operations']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/operator/offers']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/operator/audit']?.get?.responses?.['200']).toBeDefined();
    expect(document.components?.schemas?.AuditPageResponseDto).toBeDefined();
    expect(document.paths['/drivers']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/offers/{id}/expire']?.post?.responses?.['201']).toBeDefined();

    const schemas = JSON.stringify(document.components?.schemas);
    expect(schemas).toContain('ProposalResponseDto');
    expect(schemas).toContain('CampaignResponseDto');
    expect(schemas).toContain('OperationsReportResponseDto');
    expect(schemas).toContain('ApiErrorDto');
    expect(schemas).toContain('requestId');
    expect(schemas).toContain('integer VND');
  });
});
