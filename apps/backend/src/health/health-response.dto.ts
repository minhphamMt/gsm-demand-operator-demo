import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' }) status: string;
  @ApiProperty({ example: 'gsm-backend' }) service: string;
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) timestamp: string;
}
