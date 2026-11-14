import type { StudioDocument } from './studio.types';

/** Distribution has its own explicit confirmation, separate from content approval. */
export type StudioDistributionPhase =
  | 'planned'
  | 'reserved'
  | 'upload_starting'
  | 'uploading'
  | 'uploaded_private'
  | 'thumbnail_setting'
  | 'schedule_setting'
  | 'schedule_verifying'
  | 'youtube_scheduled'
  | 'youtube_public'
  | 'mirror_waiting'
  | 'mirror_creating'
  | 'mirror_processing'
  | 'mirror_publishing'
  | 'mirrored'
  | 'blocked'
  | 'uncertain'
  | 'failed'
  | 'cancelled';

export interface StudioDistributionBudget {
  uploads: number;
  otherUnits: number;
}
export interface StudioDistributionPlanItem {
  projectId: string;
  revision: number;
  integrationId: string;
  publishAt: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
}
export interface StudioDistributionPlan {
  timezone: string;
  items: StudioDistributionPlanItem[];
  quotaBudget: StudioDistributionBudget;
  mirror?: { enabled: true; instagramIntegrationId: string };
}
export interface StudioDistributionQuotaEstimate
  extends StudioDistributionBudget {
  day: string;
  timezone: 'America/Los_Angeles';
}
export interface StudioDistributionItem {
  id: string;
  batchId: string;
  projectId: string;
  projectRevision: number;
  title: string;
  integrationId: string;
  integrationName: string;
  mediaId: string;
  publishAt: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  phase: StudioDistributionPhase;
  revision: number;
  youtubeVideoId?: string;
  youtubePrivacy?: 'private' | 'unlisted' | 'public';
  youtubePublishAt?: string;
  youtubeObservedAt?: string;
  youtubePublicConfirmedAt?: string;
  youtubeUrl?: string;
  instagramIntegrationId?: string;
  instagramIntegrationName?: string;
  instagramMediaId?: string;
  instagramPublishedAt?: string;
  instagramUrl?: string;
  nextActionAt?: string;
  errorCode?: string;
  error?: string;
  canCancel: boolean;
  canReconcile: boolean;
}
export interface StudioDistributionBatch {
  id: string;
  revision: number;
  state:
    | 'planned'
    | 'confirmed'
    | 'running'
    | 'completed'
    | 'attention'
    | 'cancelled';
  timezone: string;
  quotaBudget: StudioDistributionBudget;
  quotaEstimate: StudioDistributionQuotaEstimate[];
  quotaDisclaimer: string;
  mirrorEnabled: boolean;
  mirrorIntervalMinutes: 60;
  items: StudioDistributionItem[];
  warnings: string[];
  createdAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
  workflowId?: string;
  error?: string;
}
export interface StudioDistributionCapabilities {
  available: boolean;
  reason: string;
  workerRequired: true;
  maxBatchItems: number;
  maxScheduleDays: number;
  minAdvanceMinutes: number;
  quotaBudgetCeiling: StudioDistributionBudget;
  quotaDisclaimer: string;
  integrations: Array<{
    id: string;
    name: string;
    platform: 'youtube' | 'instagram';
    provider: string;
    available: boolean;
    permissionHint: string;
  }>;
}
export interface StudioDistributionInventory {
  batches: StudioDistributionBatch[];
  limit: number;
}

/** Private persisted payload. Never returned by a controller or sent to a model. */
export interface StudioDistributionSnapshot {
  packageHash: string;
  approvals: unknown;
  document: StudioDocument;
  media: {
    id: string;
    path: string;
    name: string;
    durationSeconds: number;
    width: number;
    height: number;
    sha256: string;
  };
  youtube: {
    title: string;
    description: string;
    tags: string[];
    thumbnail?: { id: string; path: string };
    internalId: string;
  };
  instagram?: {
    internalId: string;
    provider: string;
    caption: string;
    thumbnail?: { id: string; path: string };
  };
}
