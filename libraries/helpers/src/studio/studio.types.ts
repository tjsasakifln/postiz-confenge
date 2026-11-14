export type StudioPlatform = 'youtube' | 'instagram' | 'linkedin';
export type StudioApprovalStage = 'identity' | 'script' | 'package';
export type StudioGenerationStage =
  | 'identity'
  | 'outline'
  | 'script'
  | 'package';
export type StudioFormat = 'vertical' | 'horizontal' | 'square';
export type StudioOutcomeStage =
  | 'lead'
  | 'qualified_lead'
  | 'opportunity'
  | 'proposal'
  | 'contract'
  | 'invoiced'
  | 'received';

export interface StudioIdentity {
  audience: string;
  positioning: string;
  tone: string;
  visualStyle: string;
  evidence: string[];
  hypotheses: string[];
}

export interface StudioSource {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  observedAt: string;
  risk?: 'normal' | 'high';
}

export interface StudioScene {
  id: string;
  narration: string;
  pronunciation?: string;
  durationSeconds: number;
  visual: string;
  sourceIds: string[];
  kind: 'card' | 'image' | 'video';
  mediaId?: string;
  audioMediaId?: string;
}

export interface StudioAsset {
  id: string;
  name?: string;
  path?: string;
  kind: 'image' | 'video' | 'audio';
  license: 'owned' | 'licensed' | 'public-domain';
  sourceUrl?: string;
  attribution?: string;
}

export interface StudioRender {
  id: string;
  path: string;
  name: string;
  durationSeconds: number;
  format: StudioFormat;
  subtitles: string;
  sourcesSceneIds: string[];
}

export interface StudioPackage {
  platform: StudioPlatform;
  title: string;
  description: string;
  hashtags: string[];
  cta: string;
  landingUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  mediaIds: string[];
  thumbnailMediaId?: string;
  titleOptions?: string[];
  thumbnailOptions?: string[];
  heuristicNotes?: string[];
  titleCandidates?: StudioCandidate[];
  thumbnailCandidates?: StudioCandidate[];
}

export interface StudioCandidate {
  text: string;
  score: number;
  criteria: string[];
}

export interface StudioDocument {
  brief: string;
  identity: StudioIdentity;
  sources: StudioSource[];
  topic: string;
  scenes: StudioScene[];
  packages: StudioPackage[];
  media: StudioAsset[];
  renders: StudioRender[];
  backgroundMusicMediaId?: string;
  editorialNotes?: string[];
}

export interface StudioApproval {
  stage: StudioApprovalStage;
  hash: string;
  revision: number;
  approvedBy: string;
  approvedAt: string;
  acknowledgedSourceIds?: string[];
}

export type StudioApprovals = Partial<
  Record<StudioApprovalStage, StudioApproval>
>;

export interface StudioPublication {
  id: string;
  revision: number;
  platform: StudioPlatform;
  integrationId: string;
  postId: string;
  state: string;
  releaseUrl?: string;
  publishDate?: string;
  error?: string;
  createdAt: string;
}

export interface StudioOutcome {
  id: string;
  stage: StudioOutcomeStage;
  valueCents?: number;
  currency: string;
  reference: string;
  note: string;
  recordedBy: string;
  occurredAt: string;
  createdAt: string;
}

export interface StudioEvent {
  id: string;
  revision: number;
  action: string;
  actorId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface StudioProject {
  id: string;
  title: string;
  status:
    | 'draft'
    | 'identity_approved'
    | 'script_approved'
    | 'approved'
    | 'drafted';
  revision: number;
  approvals: StudioApprovals;
  document: StudioDocument;
  createdAt: string;
  updatedAt: string;
  publications: StudioPublication[];
  outcomes: StudioOutcome[];
  events: StudioEvent[];
}

export interface StudioCapability {
  available: boolean;
  reason: string;
}

export interface StudioCapabilities {
  text: StudioCapability;
  research: StudioCapability;
  media: StudioCapability;
  publishing: StudioCapability;
  platforms: StudioPlatform[];
  integrations: Array<{
    id: string;
    name: string;
    platform: StudioPlatform;
    provider: string;
  }>;
}

export interface StudioDraftTarget {
  platform: StudioPlatform;
  integrationId: string;
}

export type StudioMedia = StudioAsset;
export type StudioGenerateStage = StudioGenerationStage;
