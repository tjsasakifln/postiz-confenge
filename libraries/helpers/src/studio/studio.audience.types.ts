import type { StudioPlatform } from './studio.types';

export type StudioAudienceReplyState =
  | 'none'
  | 'draft'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'uncertain'
  | 'answered';

export interface StudioAudienceCapability {
  available: boolean;
  reason: string;
}

export interface StudioAudienceCapabilities {
  integrations: Array<{
    id: string;
    name: string;
    provider: string;
    comments: StudioAudienceCapability;
    reply: StudioAudienceCapability;
    metrics: StudioAudienceCapability;
  }>;
  textGeneration: StudioAudienceCapability;
}

export interface StudioAudienceThread {
  id: string;
  integrationId: string;
  postId: string;
  platform: StudioPlatform;
  authorName: string;
  text: string;
  externalUrl?: string;
  publishedAt: string;
  observedAt: string;
  respondedAt?: string;
  replyDraft?: string;
  draftHash?: string;
  approvalHash?: string;
  replyState: StudioAudienceReplyState;
  externalReplyId?: string;
  errorCode?: string;
  revision: number;
}

export interface StudioAudienceCoverage {
  postId: string;
  status: 'available' | 'partial' | 'unavailable' | 'unsupported';
  checked: number;
  imported: number;
  reason: string;
}

export interface StudioAudienceThreadsResponse {
  threads: StudioAudienceThread[];
  coverage: StudioAudienceCoverage[];
  limit: number;
}

export interface StudioAudienceMetric {
  label: string;
  points: Array<{ date: string; value: number }>;
}

export interface StudioAudienceRecommendation {
  kind: 'observation' | 'hypothesis';
  statement: string;
  nextAction: string;
  threadIds: string[];
  postIds: string[];
}

export interface StudioAudienceMetrics {
  periodDays: number;
  observedAt: string;
  source: 'connected-platform-api';
  posts: Array<{
    postId: string;
    integrationId: string;
    platform: string;
    releaseUrl?: string;
    publishDate: string;
    measurementScope: 'lifetime_snapshot';
    status: 'available' | 'unavailable' | 'unsupported' | 'unpublished';
    reason: string;
    metrics: StudioAudienceMetric[];
  }>;
  recommendations: StudioAudienceRecommendation[];
  note: string;
}
