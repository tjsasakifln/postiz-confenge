import {
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type { StudioEditorialBatchActivity } from '@gitroom/orchestrator/activities/studio.editorial.batch.activity';
import type {
  StudioEditorialBatchInput,
  StudioEditorialBatchStatus,
  StudioEditorialBatchSubmission,
} from '@gitroom/nestjs-libraries/studio/studio.editorial.batch.types';

const submissions = proxyActivities<StudioEditorialBatchActivity>({
  taskQueue: 'main',
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 1 },
});

const activities = proxyActivities<StudioEditorialBatchActivity>({
  taskQueue: 'main',
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const statusQuery = defineQuery<StudioEditorialBatchStatus>(
  'studioEditorialBatchStatus'
);

async function awaitBatch(submission: StudioEditorialBatchSubmission) {
  let elapsed = 0;
  const deadline = 24 * 60 * 60 * 1000;
  while (elapsed <= deadline) {
    const result = await activities.pollStudioEditorialBatchV1(submission);
    if (result.state !== 'pending') return result;
    const delay = elapsed < 5 * 60 * 1000
      ? 30 * 1000
      : elapsed < 60 * 60 * 1000
        ? 5 * 60 * 1000
        : 10 * 60 * 1000;
    await sleep(delay);
    elapsed += delay;
  }
  return { state: 'failed' as const };
}

export async function studioEditorialBatchWorkflowV1(
  input: StudioEditorialBatchInput
): Promise<StudioEditorialBatchStatus> {
  let status: StudioEditorialBatchStatus = {
    state: 'queued',
    message: 'Aguardando a redação editorial em lote.',
  };
  setHandler(statusQuery, () => status);
  let draftBatch: StudioEditorialBatchSubmission | undefined;
  let reviewBatch: StudioEditorialBatchSubmission | undefined;
  try {
    draftBatch = await submissions.submitStudioEditorialDraftV1(input);
    status = {
      state: 'draft',
      message: 'O modelo de redação está preparando o material.',
    };
    const draftResult = await awaitBatch(draftBatch);
    if (draftResult.state !== 'completed') {
      await activities.cleanupStudioEditorialBatchV1(draftBatch);
      return {
        state: 'failed',
        message: 'A redação em lote não terminou. Tente novamente.',
      };
    }
    await activities.cleanupStudioEditorialBatchV1(draftBatch);

    reviewBatch = await submissions.submitStudioEditorialReviewV1(
      input,
      draftResult.output
    );
    status = {
      state: 'review',
      message: 'A revisão crítica está conferindo utilidade e fontes.',
    };
    const reviewResult = await awaitBatch(reviewBatch);
    if (reviewResult.state !== 'completed') {
      await activities.cleanupStudioEditorialBatchV1(reviewBatch);
      return {
        state: 'failed',
        message: 'A revisão em lote não terminou. Tente novamente.',
      };
    }
    await activities.finalizeStudioEditorialBatchV1(
      input,
      draftResult.output,
      reviewResult.output
    );
    await activities.cleanupStudioEditorialBatchV1(reviewBatch);
    return {
      state: 'ready',
      message: 'O material revisado está pronto para sua avaliação.',
    };
  } catch {
    if (draftBatch)
      await activities.cleanupStudioEditorialBatchV1(draftBatch);
    if (reviewBatch)
      await activities.cleanupStudioEditorialBatchV1(reviewBatch);
    return {
      state: 'failed',
      message:
        'A produção editorial não foi concluída. O projeto original foi preservado.',
    };
  }
}
