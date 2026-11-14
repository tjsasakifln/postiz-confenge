import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { StudioDistributionService } from '@gitroom/nestjs-libraries/studio/studio.distribution.service';

@Injectable()
@Activity()
export class StudioDistributionActivity {
  constructor(private readonly distribution: StudioDistributionService) {}
  @ActivityMethod()
  advanceStudioDistributionV1(organizationId: string, batchId: string) {
    return this.distribution.advance(organizationId, batchId);
  }
}
