import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { StudioEditorialBatchService } from '@gitroom/nestjs-libraries/studio/studio.editorial.batch.service';
import type {
  StudioEditorialBatchInput,
  StudioEditorialBatchSubmission,
} from '@gitroom/nestjs-libraries/studio/studio.editorial.batch.types';

@Injectable()
@Activity()
export class StudioEditorialBatchActivity {
  constructor(private readonly batches: StudioEditorialBatchService) {}

  @ActivityMethod()
  submitStudioEditorialDraftV1(input: StudioEditorialBatchInput) {
    return this.batches.submitDraft(input);
  }

  @ActivityMethod()
  submitStudioEditorialReviewV1(
    input: StudioEditorialBatchInput,
    draft: unknown
  ) {
    return this.batches.submitReview(input, draft);
  }

  @ActivityMethod()
  pollStudioEditorialBatchV1(submission: StudioEditorialBatchSubmission) {
    return this.batches.poll(submission);
  }

  @ActivityMethod()
  cleanupStudioEditorialBatchV1(submission: StudioEditorialBatchSubmission) {
    return this.batches.cleanup(submission);
  }

  @ActivityMethod()
  finalizeStudioEditorialBatchV1(
    input: StudioEditorialBatchInput,
    draft: unknown,
    review: unknown
  ) {
    return this.batches.finalize(input, draft, review);
  }
}
