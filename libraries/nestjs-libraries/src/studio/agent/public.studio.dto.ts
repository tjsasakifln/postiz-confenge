import { IsIn, IsString, Matches } from 'class-validator';
import { StudioApproveDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';
import type { StudioApprovalStage } from '@gitroom/helpers/studio/studio.types';

export class PublicStudioReviewDto {
  @IsIn(['identity', 'script', 'package'])
  stage: StudioApprovalStage;
}

export class PublicStudioApproveDto extends StudioApproveDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  reviewHash: string;
}
