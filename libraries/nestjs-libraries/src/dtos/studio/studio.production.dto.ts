import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import type { StudioFormat } from '@gitroom/helpers/studio/studio.types';

export class StudioRenderDto {
  @IsInt() @Min(0) revision: number;
  @IsIn(['vertical', 'horizontal', 'square']) format: StudioFormat;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ArrayUnique()
  @IsString({ each: true })
  sceneIds?: string[];
  @IsOptional() @IsIn(['alloy', 'nova', 'onyx', 'shimmer']) voice?:
    | 'alloy'
    | 'nova'
    | 'onyx'
    | 'shimmer';
  @IsOptional() @IsInt() @Min(1) @Max(900) maxDurationSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3) attempt?: number;
}

export class StudioImagesDto {
  @IsInt() @Min(0) revision: number;
  @IsIn(['thumbnails', 'carousel', 'brand']) kind:
    | 'thumbnails'
    | 'carousel'
    | 'brand';
}

export class StudioAttachRenderDto {
  @IsInt() @Min(0) revision: number;
}

export class StudioResearchDto {
  @IsInt() @Min(0) revision: number;
  @IsString() @Length(3, 300) query: string;
}

export class StudioStyleDto {
  @IsInt() @Min(0) revision: number;
  @IsString() @Length(1, 100) mediaId: string;
}
