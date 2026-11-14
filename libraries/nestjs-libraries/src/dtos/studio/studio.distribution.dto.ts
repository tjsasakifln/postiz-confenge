import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StudioDistributionBudgetDto {
  @IsInt() @Min(1) @Max(100000) uploads: number;
  @IsInt() @Min(1) @Max(100000000) otherUnits: number;
}
export class StudioDistributionPlanItemDto {
  @IsString() @MinLength(1) @MaxLength(200) projectId: string;
  @IsInt() @Min(1) revision: number;
  @IsString() @MinLength(1) @MaxLength(200) integrationId: string;
  @IsISO8601({ strict: true }) publishAt: string;
  @IsBoolean() @IsDefined() madeForKids: boolean;
  @IsBoolean() @IsDefined() containsSyntheticMedia: boolean;
}
export class StudioDistributionMirrorDto {
  @Equals(true) enabled: true;
  @IsString() @MinLength(1) @MaxLength(200) instagramIntegrationId: string;
}
export class StudioDistributionPlanDto {
  @IsString() @MinLength(1) @MaxLength(100) timezone: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudioDistributionPlanItemDto)
  items: StudioDistributionPlanItemDto[];
  @IsDefined()
  @ValidateNested()
  @Type(() => StudioDistributionBudgetDto)
  quotaBudget: StudioDistributionBudgetDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => StudioDistributionMirrorDto)
  mirror?: StudioDistributionMirrorDto;
}
export class StudioDistributionConfirmDto {
  @IsInt() @Min(1) revision: number;
  @Equals(true) confirmed: true;
}
export class StudioDistributionRevisionDto {
  @IsInt() @Min(1) revision: number;
}
