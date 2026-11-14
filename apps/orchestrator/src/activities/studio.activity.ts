import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import {
  StudioProductionService,
  StudioRenderOptions,
} from '@gitroom/nestjs-libraries/studio/studio.production.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

@Injectable()
@Activity()
export class StudioActivity {
  constructor(private readonly production: StudioProductionService) {}

  @ActivityMethod()
  renderStudioVideo(
    orgId: string,
    document: StudioDocument,
    options: StudioRenderOptions
  ) {
    return this.production.render(orgId, document, options);
  }
}
