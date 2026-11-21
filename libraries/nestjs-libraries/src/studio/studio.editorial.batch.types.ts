import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

export type StudioEditorialBatchState =
  | 'idle'
  | 'queued'
  | 'draft'
  | 'review'
  | 'ready'
  | 'failed';

export interface StudioEditorialBatchStatus {
  state: StudioEditorialBatchState;
  message?: string;
}

export interface StudioEditorialBatchInput {
  attemptId: string;
  organizationId: string;
  projectId: string;
  revision: number;
  actorId: string;
  document: StudioDocument;
}

export interface StudioEditorialBatchSubmission {
  batchId: string;
  customId: string;
}

export type StudioEditorialBatchPoll =
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'completed'; output: unknown };
