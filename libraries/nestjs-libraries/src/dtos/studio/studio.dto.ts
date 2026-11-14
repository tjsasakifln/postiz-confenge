import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  StudioApprovalStage,
  StudioFormat,
  StudioGenerationStage,
  StudioOutcomeStage,
  StudioPlatform,
} from '@gitroom/helpers/studio/studio.types';

export class StudioIdentityDto {
  @IsString() @MaxLength(4000) audience: string;
  @IsString() @MaxLength(4000) positioning: string;
  @IsString() @MaxLength(2000) tone: string;
  @IsString() @MaxLength(4000) visualStyle: string;
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  evidence: string[];
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  hypotheses: string[];
}

export class StudioSourceDto {
  @IsString() @MinLength(1) @MaxLength(100) id: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
  @IsString() @MinLength(1) @MaxLength(1000) title: string;
  @IsString() @MaxLength(6000) excerpt: string;
  @IsDateString() observedAt: string;
  @IsOptional() @IsIn(['normal', 'high']) risk?: 'normal' | 'high';
}

export class StudioSceneDto {
  @IsString() @MinLength(1) @MaxLength(100) id: string;
  @IsString() @MaxLength(8000) narration: string;
  @IsOptional() @IsString() @MaxLength(8000) pronunciation?: string;
  @IsInt() @Min(1) @Max(600) durationSeconds: number;
  @IsString() @MaxLength(4000) visual: string;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  sourceIds: string[];
  @IsIn(['card', 'image', 'video']) kind: 'card' | 'image' | 'video';
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) mediaId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) audioMediaId?: string;
}

export class StudioAssetDto {
  @IsString() @MinLength(1) @MaxLength(100) id: string;
  @IsOptional() @IsString() @MaxLength(500) name?: string;
  @IsOptional() @IsString() @MaxLength(2048) path?: string;
  @IsIn(['image', 'video', 'audio']) kind: 'image' | 'video' | 'audio';
  @IsIn(['owned', 'licensed', 'public-domain']) license:
    | 'owned'
    | 'licensed'
    | 'public-domain';
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) attribution?: string;
}

export class StudioRenderDto {
  @IsString() @MinLength(1) @MaxLength(100) id: string;
  @IsString() @MaxLength(2048) path: string;
  @IsString() @MaxLength(500) name: string;
  @IsNumber() @Min(0.01) @Max(900) durationSeconds: number;
  @IsIn(['vertical', 'horizontal', 'square']) format: StudioFormat;
  @IsString() @MaxLength(100000) subtitles: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  sourcesSceneIds: string[];
}

export class StudioCandidateDto {
  @IsString() @MaxLength(2000) text: string;
  @IsInt() @Min(0) @Max(100) score: number;
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  criteria: string[];
}

export class StudioPackageDto {
  @IsIn(['youtube', 'instagram', 'linkedin']) platform: StudioPlatform;
  @IsString() @MaxLength(100) title: string;
  @IsString() @MaxLength(10000) description: string;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hashtags: string[];
  @IsString() @MaxLength(2000) cta: string;
  @IsString() @MaxLength(2048) landingUrl: string;
  @IsString() @MaxLength(150) utmSource: string;
  @IsString() @MaxLength(150) utmMedium: string;
  @IsString() @MaxLength(150) utmCampaign: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  mediaIds: string[];
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  thumbnailMediaId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  titleOptions?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  thumbnailOptions?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  heuristicNotes?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => StudioCandidateDto)
  @ValidateNested({ each: true })
  titleCandidates?: StudioCandidateDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @Type(() => StudioCandidateDto)
  @ValidateNested({ each: true })
  thumbnailCandidates?: StudioCandidateDto[];
}

export class StudioDocumentDto {
  @IsString() @MaxLength(12000) brief: string;
  @IsDefined()
  @Type(() => StudioIdentityDto)
  @ValidateNested()
  identity: StudioIdentityDto;
  @IsArray()
  @ArrayMaxSize(100)
  @Type(() => StudioSourceDto)
  @ValidateNested({ each: true })
  sources: StudioSourceDto[];
  @IsString() @MaxLength(3000) topic: string;
  @IsArray()
  @ArrayMaxSize(80)
  @Type(() => StudioSceneDto)
  @ValidateNested({ each: true })
  scenes: StudioSceneDto[];
  @IsArray()
  @ArrayMaxSize(3)
  @Type(() => StudioPackageDto)
  @ValidateNested({ each: true })
  packages: StudioPackageDto[];
  @IsArray()
  @ArrayMaxSize(200)
  @Type(() => StudioAssetDto)
  @ValidateNested({ each: true })
  media: StudioAssetDto[];
  @IsArray()
  @ArrayMaxSize(30)
  @Type(() => StudioRenderDto)
  @ValidateNested({ each: true })
  renders: StudioRenderDto[];
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  backgroundMusicMediaId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  editorialNotes?: string[];
}

export class StudioCreateDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsString() @MinLength(1) @MaxLength(12000) brief: string;
}

export class StudioRevisionDto {
  @IsInt() @Min(1) revision: number;
}

export class StudioUpdateDto extends StudioRevisionDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsDefined()
  @Type(() => StudioDocumentDto)
  @ValidateNested()
  document: StudioDocumentDto;
}

export class StudioGenerateDto extends StudioRevisionDto {
  @IsIn(['identity', 'outline', 'script', 'package'])
  stage: StudioGenerationStage;
}

export class StudioApproveDto extends StudioRevisionDto {
  @IsIn(['identity', 'script', 'package']) stage: StudioApprovalStage;
  @Equals(true) confirmed: true;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  acknowledgedSourceIds?: string[];
}

export class StudioDraftTargetDto {
  @IsIn(['youtube', 'instagram', 'linkedin']) platform: StudioPlatform;
  @IsString() @MinLength(1) @MaxLength(100) integrationId: string;
}

export class StudioDraftDto extends StudioRevisionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => StudioDraftTargetDto)
  @ValidateNested({ each: true })
  targets: StudioDraftTargetDto[];
}

export class StudioOutcomeDto {
  @IsIn([
    'lead',
    'qualified_lead',
    'opportunity',
    'proposal',
    'contract',
    'invoiced',
    'received',
  ])
  stage: StudioOutcomeStage;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) valueCents?: number;
  @IsIn(['BRL']) currency: string;
  @IsString() @MinLength(1) @MaxLength(300) reference: string;
  @IsString() @MaxLength(3000) note: string;
  @IsDateString() occurredAt: string;
}
