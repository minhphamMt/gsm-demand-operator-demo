import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';

export class GenerateAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;
}
