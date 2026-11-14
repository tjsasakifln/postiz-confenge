import { Module } from '@nestjs/common';
import { StudioAudienceManager } from './studio.audience.manager';
import { StudioAudienceRepository } from './studio.audience.repository';
import { StudioAudienceService } from './studio.audience.service';
import { StudioAudienceWriterService } from './studio.audience.writer.service';

@Module({
  providers: [StudioAudienceManager, StudioAudienceRepository, StudioAudienceService, StudioAudienceWriterService],
  exports: [StudioAudienceService],
})
export class StudioAudienceModule {}
