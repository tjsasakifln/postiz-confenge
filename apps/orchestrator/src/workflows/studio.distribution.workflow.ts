import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { StudioDistributionActivity } from '@gitroom/orchestrator/activities/studio.distribution.activity';

const { advanceStudioDistributionV1 } =
  proxyActivities<StudioDistributionActivity>({
    taskQueue: 'main',
    startToCloseTimeout: '15 minutes',
    retry: { maximumAttempts: 1 },
  });

/** New version and new activity name; no historical workflow is changed. */
export async function studioDistributionWorkflowV1(input: {
  organizationId: string;
  batchId: string;
}): Promise<void> {
  for (let step = 0; step < 300; step++) {
    try {
      const result = await advanceStudioDistributionV1(
        input.organizationId,
        input.batchId
      );
      if (result.complete) return;
      const next = result.nextAt
        ? Date.parse(result.nextAt) - Date.now()
        : 60000;
      await sleep(
        Math.max(
          1000,
          Math.min(Number.isFinite(next) ? next : 60000, 60 * 60000)
        )
      );
    } catch {
      // A worker crash may follow a remote write. Give its durable lease time
      // to expire; the next activity observes it as uncertain, never repeats it.
      await sleep('20 minutes');
    }
  }
  return continueAsNew<typeof studioDistributionWorkflowV1>(input);
}
