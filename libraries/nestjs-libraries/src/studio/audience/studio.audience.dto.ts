import { Transform } from 'class-transformer';
import {
  Equals,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StudioAudienceSyncDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  integrationId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  postId?: string;
}

export class StudioAudienceRevisionDto {
  @IsInt()
  @Min(1)
  revision: number;
}

export class StudioAudienceDraftDto extends StudioAudienceRevisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reply: string;
}

export class StudioAudienceApproveDto extends StudioAudienceRevisionDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  draftHash: string;

  @Equals(true)
  reviewed: boolean;
}

export class StudioAudienceSendDto extends StudioAudienceRevisionDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  draftHash: string;

  @Equals(true)
  confirmed: boolean;
}

export class StudioAudienceMetricsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 28;
}
