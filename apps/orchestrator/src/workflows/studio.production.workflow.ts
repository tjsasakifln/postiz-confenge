import { proxyActivities } from '@temporalio/workflow';
import type { StudioActivity } from '@gitroom/orchestrator/activities/studio.activity';
import type { StudioRenderOptions } from '@gitroom/nestjs-libraries/studio/studio.production.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

const { renderStudioVideo } = proxyActivities<StudioActivity>({
  startToCloseTimeout: '90 minutes',
  taskQueue: 'main',
  retry: { maximumAttempts: 1 },
});

// A new workflow, leaving every historical workflow and activity signature intact.
// TTS can incur a charge. No automatic retry of a failed generation.
export async function studioProductionWorkflowV1(input: {
  orgId: string;
  projectId: string;
  scriptHash: string;
  productionHash: string;
  document: StudioDocument;
  options: StudioRenderOptions;
}) {
  const render = await renderStudioVideo(
    input.orgId,
    input.document,
    input.options
  );
  return {
    render,
    projectId: input.projectId,
    scriptHash: input.scriptHash,
    productionHash: input.productionHash,
  };
}
