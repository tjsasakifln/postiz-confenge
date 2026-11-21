import { IsInt, Min } from 'class-validator';

export class StudioEditorialBatchStartDto {
  @IsInt()
  @Min(1)
  revision: number;
}
