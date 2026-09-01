import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class GenerateAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;
}

export class OptimizeAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId!: number;

  /**
   * Ngưỡng điều phối viên chỉnh trên bảng chỉ số, áp cho ĐÚNG lượt chạy này.
   *
   * Backend cố ý không biết key nào hợp lệ hay khoảng giá trị nào được phép: `policy.yaml`
   * chỉ có một người đọc (CLAUDE.md §3 #2) và đó là `src/common/policy.py`. Kiểm ở đây
   * nghĩa là chép một bản luật thứ hai sang TypeScript, rồi hai bản trôi khỏi nhau. Nên
   * tầng này chỉ chặn thứ nó tự biết — phải là số — và để AI service từ chối phần còn lại
   * bằng 422 POLICY_OVERRIDE_REJECTED.
   */
  @IsOptional()
  @IsObject()
  @IsNumber({}, { each: true })
  policyOverrides?: Record<string, number>;
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
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;

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
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId?: number;
}
