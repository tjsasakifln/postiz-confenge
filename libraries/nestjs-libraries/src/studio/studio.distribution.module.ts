import { Module } from '@nestjs/common';
import { StudioDistributionRepository } from './studio.distribution.repository';
import { StudioDistributionService } from './studio.distribution.service';
import {
  StudioDistributionConnections,
  StudioDistributionInstagramAdapter,
  StudioDistributionYoutubeAdapter,
} from './studio.distribution.providers';

@Module({
  providers: [
    StudioDistributionRepository,
    StudioDistributionService,
    StudioDistributionConnections,
    StudioDistributionYoutubeAdapter,
    StudioDistributionInstagramAdapter,
  ],
  exports: [StudioDistributionService],
})
export class StudioDistributionModule {}
