import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class GenerateAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;
}

export class OptimizeAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId!: number;
}

export class RunNextAiDecisionDto extends GenerateAiDecisionDto {
  @IsOptional()
  @IsIn(['normal', 'peak', 'rain', 'rain_peak'])
  regime?: 'normal' | 'peak' | 'rain' | 'rain_peak';
}

export class RunReplayAiDecisionDto {
  @IsDateString()
  sourceAt!: string;

  // Cửa sổ nhìn lại cho biểu đồ xu hướng. Bỏ trống = giữ mặc định 60 phút của AI service.
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(5)
  @Max(1440)
  lookbackMinutes?: number;
}

export class RunPipelineDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId?: number;
}

/**
 * Câu hỏi của điều phối viên gõ vào nhật ký agent.
 *
 * Kèm horizon và snapshot vì observer phải nhìn **cùng một snapshot** với lượt chạy đang
 * hiển thị — trả lời về một thế giới khác với thế giới trên màn hình là dạng sai tệ nhất
 * mà một câu trả lời có thể mắc.
 */
export class AskAgentDto {
  @IsString()
  @Length(1, 64)
  sessionId!: string;

  @IsString()
  @Length(1, 500)
  text!: string;

  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId?: number;
}
