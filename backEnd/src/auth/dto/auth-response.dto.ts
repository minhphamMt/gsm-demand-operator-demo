import { ApiProperty } from '@nestjs/swagger';

export class AuthMeResponseDto {
  @ApiProperty({ example: 'd8b43d7a-8a1b-4381-bc36-5c027006ce2b', format: 'uuid' }) id: string;
  @ApiProperty({ nullable: true, example: 'operator@example.com' }) email: string | null;
  @ApiProperty({ enum: ['OPERATOR', 'DRIVER'], example: 'OPERATOR' }) role: string;
}
