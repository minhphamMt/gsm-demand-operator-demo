import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 'NOT_FOUND' })
  code: string;

  @ApiProperty({ example: 'Không tìm thấy dữ liệu được yêu cầu.' })
  message: string;

  @ApiPropertyOptional({
    example: { issues: ['targetDriverCount must not be less than 1'] },
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;

  @ApiProperty({ example: '9f57be2a-760b-4b5e-8b5e-fd2d6df370bb' })
  requestId: string;
}
