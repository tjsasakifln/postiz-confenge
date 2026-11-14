import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  StudioDistributionService,
  studioQuotaDay,
} from './studio.distribution.service';
import { StudioDistributionProviderError } from './studio.distribution.providers';

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/studio/studio.service',
  () => ({ StudioService: class {} })
);
vi.mock('./studio.production.service', () => ({
  StudioProductionService: class {},
}));
vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
vi.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/youtube.provider',
  () => ({ YoutubeProvider: class {} })
);
vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/facebook.provider',
  () => ({ META_GRAPH_API_VERSION: 'v25.0' })
);
vi.mock('@gitroom/nestjs-libraries/services/encryption.service', () => ({
  EncryptionService: class {},
}));

const now = new Date('2026-11-14T18:00:00.000Z');
const inspection = {
  durationSeconds: 45,
  width: 1080,
  height: 1920,
  sha256: 'bytes-hash',
};
function fixture(phase = 'planned', mirror = false) {
  const pack = (platform: string) => ({
    platform,
    title: 'Briefing de projeto',
    description: 'Prepare um briefing.',
    hashtags: ['engenharia'],
    cta: 'Envie seu briefing.',
    landingUrl: 'https://confenge.com.br/projetos',
    utmSource: platform,
    utmMedium: 'organic_social',
    utmCampaign: 'briefing',
    mediaIds: ['media-a'],
  });
  const document: any = {
    brief: 'Projetos para construtoras.',
    identity: { audience: 'Construtoras', evidence: [], hypotheses: [] },
    topic: 'Briefing',
    sources: [],
    scenes: [],
    packages: [pack('youtube'), pack('instagram')],
    media: [
      {
        id: 'media-a',
        name: 'video.mp4',
        path: 'https://assets.example.org/video.mp4',
        kind: 'video',
        license: 'owned',
      },
    ],
    renders: [],
  };
  const project: any = {
    id: 'project-a',
    revision: 1,
    document,
    approvals: { package: { hash: 'approved-hash' } },
  };
  const snapshot: any = {
    packageHash: 'approved-hash',
    approvals: project.approvals,
    document,
    media: {
      id: 'media-a',
      name: 'video.mp4',
      path: 'https://assets.example.org/video.mp4',
      ...inspection,
    },
    youtube: {
      title: 'Briefing de projeto',
      description: 'Prepare um briefing.',
      tags: ['engenharia'],
      internalId: 'youtube-real-a',
    },
    ...(mirror
      ? {
          instagram: {
            internalId: 'instagram-real-a',
            provider: 'instagram',
            caption: 'Prepare um briefing.',
          },
        }
      : {}),
  };
  const item: any = {
    id: 'item-a',
    organizationId: 'org-a',
    batchId: 'batch-a',
    projectId: 'project-a',
    projectRevision: 1,
    packageHash: 'approved-hash',
    integrationId: 'youtube-a',
    integrationName: 'Canal A',
    mediaId: 'media-a',
    title: 'Briefing de projeto',
    publishAt: new Date(now.getTime() + 2 * 3600000),
    madeForKids: false,
    containsSyntheticMedia: true,
    snapshot,
    phase,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    publicationId: 'publication-a',
    postId: 'post-a',
    instagramIntegrationId: mirror ? 'instagram-a' : null,
    instagramIntegrationName: mirror ? 'Instagram A' : null,
    instagramPublicationId: mirror ? 'publication-ig' : null,
    instagramPostId: mirror ? 'post-ig' : null,
    youtubeVideoId: null,
    youtubePrivacy: null,
    youtubePublishAt: null,
    youtubeObservedAt: null,
    youtubePublicConfirmedAt: null,
    youtubeReservationReleased: false,
    instagramReservationReleased: false,
    instagramContainerId: null,
    instagramMediaId: null,
    instagramPublishedAt: null,
    instagramUrl: null,
    uploadSession: null,
    thumbnailApplied: false,
    nextActionAt: now,
    attemptId: null,
    attemptStage: null,
    leaseUntil: null,
    readAttempts: 0,
    uploadAttempts: 0,
    containerChecks: 0,
    errorCode: null,
  };
  const batch: any = {
    id: 'batch-a',
    organizationId: 'org-a',
    revision: 1,
    state: phase === 'planned' ? 'planned' : 'running',
    timezone: 'America/Sao_Paulo',
    quotaBudget: { uploads: 100, otherUnits: 10000 },
    quotaEstimate: [],
    quotaReservations: [],
    quotaScope: 'scope',
    mirrorEnabled: mirror,
    confirmedAt: phase === 'planned' ? null : now,
    confirmedBy: 'user-a',
    preflightAt: phase === 'planned' ? null : now,
    workflowId: 'workflow-a',
    createdAt: now,
    updatedAt: now,
    errorCode: null,
    items: [item],
  };
  const connectionRows: any[] = [
    {
      id: 'youtube-a',
      name: 'Canal A',
      internalId: 'youtube-real-a',
      providerIdentifier: 'youtube',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
    },
    {
      id: 'instagram-a',
      name: 'Instagram A',
      internalId: 'instagram-real-a',
      providerIdentifier: 'instagram',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
    },
  ];
  const repo: any = {
    connections: vi.fn(async (org: string) =>
      org === 'org-a' ? structuredClone(connectionRows) : []
    ),
    media: vi.fn(async (org: string, ids: string[]) =>
      org === 'org-a'
        ? document.media.filter((asset: any) => ids.includes(asset.id))
        : []
    ),
    batch: vi.fn(async (org: string, id: string) => {
      if (org !== 'org-a' || id !== batch.id) throw new NotFoundException();
      return structuredClone(batch);
    }),
    batches: vi.fn(async () => [structuredClone(batch)]),
    item: vi.fn(async (org: string, id: string) => {
      if (org !== 'org-a' || id !== item.id) throw new NotFoundException();
      return structuredClone(item);
    }),
    plan: vi.fn(async (_org, _actor, _timezone, scope, _budget, estimate) => {
      batch.quotaScope = scope;
      batch.quotaEstimate = estimate;
      return batch.id;
    }),
    confirm: vi.fn(async () => {
      batch.state = 'confirmed';
      batch.revision++;
      batch.confirmedAt = now;
      item.phase = 'reserved';
      return structuredClone(batch);
    }),
    ensureUploadDay: vi.fn(async () => {}),
    mutate: vi.fn(async (org: string, current: any, changes: any) => {
      if (
        org !== item.organizationId ||
        current.revision !== item.revision ||
        current.phase !== item.phase
      )
        throw new ConflictException();
      for (const [key, value] of Object.entries(changes))
        item[key] =
          value && typeof value === 'object' && 'increment' in value
            ? (item[key] || 0) + (value as any).increment
            : value;
      item.revision++;
      return structuredClone(item);
    }),
    claim: vi.fn(async (org, current, phase) =>
      repo.mutate(org, current, {
        phase,
        attemptId: 'attempt-a',
        attemptStage: phase,
        leaseUntil: new Date(Date.now() + 20 * 60000),
        nextActionAt: new Date(Date.now() + 20 * 60000),
      })
    ),
    reserveMirror: vi.fn(async () => ({ allowed: true, nextAt: now })),
    releaseMirror: vi.fn(async () => {}),
    releaseUnstartedPublications: vi.fn(async () => {}),
    published: vi.fn(async () => {}),
    batchState: vi.fn(async (_org, _id, state, errorCode, preflight) => {
      batch.state = state;
      batch.errorCode = errorCode || null;
      if (preflight) batch.preflightAt = now;
    }),
    resumeMonitoring: vi.fn(async () => {
      batch.state = 'running';
      batch.revision++;
    }),
  };
  const studio: any = {
    get: vi.fn(async (org, id) => {
      if (org !== 'org-a' || id !== project.id) throw new NotFoundException();
      return structuredClone(project);
    }),
    requireApproval: vi.fn((project) => {
      if (!project.approvals.package) throw new Error('approval missing');
    }),
  };
  const production = {
    capabilities: vi.fn(async () => ({ available: true })),
    inspectForDistribution: vi.fn(async () => ({ ...inspection })),
  };
  const connections = {
    get: vi.fn(async (_org, id) => ({
      internalId: id,
      token: 'private-token',
    })),
  };
  const youtube = {
    providers: ['youtube'],
    permissionHint: 'youtube.upload + youtube.force-ssl',
    preflight: vi.fn(async () => {}),
    start: vi.fn(async () => ({
      uploadUri:
        'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=secret-session',
      videoSize: 10,
      path: snapshot.media.path,
      uploadedBytes: 0,
      thumbnail: '',
    })),
    resume: vi.fn(async () => ({ status: 'completed', postId: 'yt-video-a' })),
    thumbnail: vi.fn(async () => {}),
    schedule: vi.fn(async () => {}),
    observe: vi.fn(async () => ({
      id: 'yt-video-a',
      privacy: 'private',
      uploadStatus: 'processed',
      durationSeconds: 45,
    })),
  };
  const instagram = {
    providers: ['instagram', 'instagram-standalone'],
    permissionHint: 'instagram_content_publish',
    preflight: vi.fn(async () => {}),
    checkQuota: vi.fn(async () => {}),
    create: vi.fn(async () => 'container-a'),
    container: vi.fn(async () => 'FINISHED'),
    publish: vi.fn(async () => 'ig-media-a'),
    media: vi.fn(async () => ({
      id: 'ig-media-a',
      url: 'https://www.instagram.com/reel/a/',
    })),
  };
  const encryption = {
    encrypt: vi.fn(async (value) => `encrypted:${value}`),
    decrypt: vi.fn(async (value) => value.replace(/^encrypted:/, '')),
  };
  const workflow = { start: vi.fn(async () => {}) };
  const temporal = { client: { getRawClient: vi.fn(() => ({ workflow })) } };
  const service = new StudioDistributionService(
    repo,
    studio,
    production as any,
    connections as any,
    youtube as any,
    instagram as any,
    encryption as any,
    temporal as any
  );
  const body: any = {
    timezone: 'America/Sao_Paulo',
    quotaBudget: { uploads: 100, otherUnits: 10000 },
    items: [
      {
        projectId: 'project-a',
        revision: 1,
        integrationId: 'youtube-a',
        publishAt: item.publishAt.toISOString(),
        madeForKids: false,
        containsSyntheticMedia: true,
      },
    ],
    ...(mirror
      ? { mirror: { enabled: true, instagramIntegrationId: 'instagram-a' } }
      : {}),
  };
  return {
    service,
    repo,
    studio,
    project,
    production,
    connections,
    youtube,
    instagram,
    encryption,
    workflow,
    temporal,
    batch,
    item,
    body,
    snapshot,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('YOUTUBE_CLIENT_ID', 'client-a');
  vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'secret-a');
  vi.stubEnv('STRIPE_PUBLISHABLE_KEY', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Studio distribution explicit scheduling and durable uncertainty', () => {
  it('plans without remote mutations, checks measured geometry and keeps credentials/session out of the response', async () => {
    const { service, body, repo, production, youtube, instagram } = fixture(
      'planned',
      true
    );
    const result = await service.plan('org-a', 'user-a', body);
    expect(production.inspectForDistribution).toHaveBeenCalledTimes(1);
    expect(repo.plan.mock.calls[0][3]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toMatch(
      /private-token|secret-session|snapshot|uploadSession|secret-a/
    );
    expect(youtube.start).not.toHaveBeenCalled();
    expect(youtube.schedule).not.toHaveBeenCalled();
    expect(instagram.create).not.toHaveBeenCalled();
  });
  it('refuses a claimed short whose actual bytes are horizontal or too long', async () => {
    const { service, body, production, repo } = fixture('planned', true);
    production.inspectForDistribution.mockResolvedValue({
      ...inspection,
      width: 1920,
      height: 1080,
    });
    await expect(service.plan('org-a', 'user-a', body)).rejects.toThrow(
      'vertical ou quadrado'
    );
    production.inspectForDistribution.mockResolvedValue({
      ...inspection,
      durationSeconds: 181,
    });
    await expect(service.plan('org-a', 'user-a', body)).rejects.toThrow(
      'três minutos'
    );
    expect(repo.plan).not.toHaveBeenCalled();
  });
  it('rejects other-organization accounts, missing approval, ambiguous dates and a raised budget', async () => {
    const { service, body, project, repo } = fixture();
    await expect(
      service.plan('org-a', 'user-a', {
        ...body,
        items: [{ ...body.items[0], integrationId: 'foreign' }],
      })
    ).rejects.toThrow();
    await expect(
      service.plan('org-a', 'user-a', {
        ...body,
        items: [{ ...body.items[0], publishAt: '2026-11-15T10:00:00' }],
      })
    ).rejects.toThrow('fuso explícito');
    await expect(
      service.plan('org-a', 'user-a', {
        ...body,
        quotaBudget: { uploads: 101, otherUnits: 10000 },
      })
    ).rejects.toThrow('tetos');
    project.approvals = {};
    await expect(service.plan('org-a', 'user-a', body)).rejects.toThrow(
      'approval'
    );
    expect(repo.plan).not.toHaveBeenCalled();
  });
  it('never reserves or starts a workflow without explicit confirmation', async () => {
    const { service, repo, workflow } = fixture();
    await expect(
      service.confirm(
        'org-a',
        'batch-a',
        { revision: 1, confirmed: false } as any,
        'user-a'
      )
    ).rejects.toThrow('explicitamente');
    expect(repo.confirm).not.toHaveBeenCalled();
    expect(workflow.start).not.toHaveBeenCalled();
  });
  it('a quota failure aborts the entire confirmed batch before the first upload', async () => {
    const { service, repo, batch, youtube } = fixture('reserved');
    batch.preflightAt = null;
    repo.ensureUploadDay.mockRejectedValue(new ConflictException());
    await service.advance('org-a', 'batch-a');
    expect(youtube.preflight).not.toHaveBeenCalled();
    expect(youtube.start).not.toHaveBeenCalled();
    expect(batch.state).toBe('attention');
  });
  it('starts one private upload, persists its session, and resumes that session without a second insert', async () => {
    const { service, item, youtube, encryption } = fixture('reserved');
    await Promise.all([
      service.advance('org-a', 'batch-a'),
      service.advance('org-a', 'batch-a'),
    ]);
    expect(youtube.start).toHaveBeenCalledTimes(1);
    expect(item.phase).toBe('uploading');
    expect(item.uploadSession).toContain('encrypted:');
    expect(encryption.encrypt).toHaveBeenCalled();
    await service.advance('org-a', 'batch-a');
    expect(youtube.start).toHaveBeenCalledTimes(1);
    expect(youtube.resume).toHaveBeenCalledTimes(1);
    expect(item.phase).toBe('uploaded_private');
    expect(item.youtubeVideoId).toBe('yt-video-a');
    expect(youtube.schedule).not.toHaveBeenCalled();
  });
  it('does not set a past native date after a slow upload and keeps its private video', async () => {
    const { service, item, youtube } = fixture('uploaded_private');
    item.youtubeVideoId = 'yt-video-a';
    item.publishAt = new Date(now.getTime() - 60000);
    await service.advance('org-a', 'batch-a');
    expect(youtube.schedule).not.toHaveBeenCalled();
    expect(item.youtubePrivacy).toBe('private');
    expect(item.errorCode).toBe('schedule_expired');
  });
  it('reserves the actual Pacific day before thumbnail or native scheduling when upload crosses midnight', async () => {
    vi.setSystemTime(new Date('2026-11-15T08:01:00Z'));
    const { service, item, youtube, repo } = fixture('uploaded_private');
    item.youtubeVideoId = 'yt-video-a';
    item.publishAt = new Date('2026-11-15T12:00:00Z');
    repo.ensureUploadDay.mockRejectedValue(new ConflictException());
    await service.advance('org-a', 'batch-a');
    expect(repo.ensureUploadDay.mock.calls[0][2]).toMatchObject({
      day: '2026-11-15',
      uploads: 0,
    });
    expect(youtube.schedule).not.toHaveBeenCalled();
    expect(youtube.thumbnail).not.toHaveBeenCalled();
    expect(item.errorCode).toBe('local_quota');
  });
  it('confirms native scheduling by a separate read and never labels private scheduled as public', async () => {
    const { service, item, youtube, repo } = fixture('uploaded_private');
    item.youtubeVideoId = 'yt-video-a';
    await service.advance('org-a', 'batch-a');
    expect(item.phase).toBe('schedule_verifying');
    expect(youtube.schedule).toHaveBeenCalledTimes(1);
    youtube.observe.mockResolvedValue({
      id: 'yt-video-a',
      privacy: 'private',
      uploadStatus: 'processed',
      durationSeconds: 45,
      publishAt: item.publishAt.toISOString(),
    } as any);
    await service.advance('org-a', 'batch-a');
    expect(item.phase).toBe('youtube_scheduled');
    expect(item.youtubePublicConfirmedAt).toBeNull();
    expect(repo.published).not.toHaveBeenCalled();
  });
  it('does not repeat an uncertain native scheduling request', async () => {
    const { service, item, youtube } = fixture('uploaded_private');
    item.youtubeVideoId = 'yt-video-a';
    youtube.schedule.mockRejectedValue(
      new StudioDistributionProviderError('remote_uncertain')
    );
    await service.advance('org-a', 'batch-a');
    await service.advance('org-a', 'batch-a');
    expect(item.phase).toBe('uncertain');
    expect(youtube.schedule).toHaveBeenCalledTimes(1);
  });
  it('blocks an Instagram container while YouTube is private and preserves one-hour pacing', async () => {
    const { service, item, repo, instagram, youtube } = fixture(
      'mirror_waiting',
      true
    );
    item.youtubeVideoId = 'yt-video-a';
    item.youtubePublicConfirmedAt = now;
    repo.reserveMirror.mockResolvedValue({
      allowed: false,
      nextAt: new Date(now.getTime() + 3600000),
    });
    await service.advance('org-a', 'batch-a');
    expect(item.nextActionAt.getTime() - now.getTime()).toBe(3600000);
    expect(instagram.create).not.toHaveBeenCalled();
    item.nextActionAt = now;
    repo.reserveMirror.mockResolvedValue({ allowed: true, nextAt: now });
    await service.advance('org-a', 'batch-a');
    expect(youtube.observe).toHaveBeenCalledTimes(1);
    expect(instagram.create).not.toHaveBeenCalled();
    expect(item.errorCode).toBe('public_not_confirmed');
  });
  it('publishes a mirror once and never reopens a mirrored item through reconciliation', async () => {
    const { service, item, youtube, instagram, repo } = fixture(
      'mirror_processing',
      true
    );
    item.youtubeVideoId = 'yt-video-a';
    item.youtubePublicConfirmedAt = now;
    item.instagramContainerId = 'container-a';
    youtube.observe.mockResolvedValue({
      id: 'yt-video-a',
      privacy: 'public',
      uploadStatus: 'processed',
      durationSeconds: 45,
    });
    await service.advance('org-a', 'batch-a');
    expect(item.phase).toBe('mirrored');
    expect(instagram.publish).toHaveBeenCalledTimes(1);
    const mutations = repo.mutate.mock.calls.length;
    await service.reconcile('org-a', item.id, { revision: item.revision });
    await service.advance('org-a', 'batch-a');
    expect(repo.mutate.mock.calls.length).toBe(mutations);
    expect(repo.resumeMonitoring).not.toHaveBeenCalled();
    expect(instagram.publish).toHaveBeenCalledTimes(1);
    expect(instagram.create).not.toHaveBeenCalled();
  });
  it('does not re-create a container when its response was lost and no container id is known', async () => {
    const { service, item, youtube, instagram, repo } = fixture(
      'uncertain',
      true
    );
    item.youtubeVideoId = 'yt-video-a';
    item.youtubePublicConfirmedAt = now;
    item.attemptStage = 'mirror_creating';
    item.attemptId = 'attempt-a';
    await service.reconcile('org-a', item.id, { revision: item.revision });
    expect(item.phase).toBe('uncertain');
    expect(youtube.observe).not.toHaveBeenCalled();
    expect(instagram.create).not.toHaveBeenCalled();
    expect(repo.resumeMonitoring).not.toHaveBeenCalled();
  });
  it('reads an uncertain publish result without retrying it and releases pacing only when PUBLISHED is confirmed', async () => {
    const { service, item, instagram, repo } = fixture('uncertain', true);
    item.youtubeVideoId = 'yt-video-a';
    item.instagramContainerId = 'container-a';
    item.attemptStage = 'mirror_publishing';
    await service.reconcile('org-a', item.id, { revision: item.revision });
    expect(item.phase).toBe('uncertain');
    expect(instagram.publish).not.toHaveBeenCalled();
    expect(repo.releaseMirror).not.toHaveBeenCalled();
    instagram.container.mockResolvedValue('PUBLISHED');
    await service.reconcile('org-a', item.id, { revision: item.revision });
    expect(item.phase).toBe('mirrored');
    expect(instagram.publish).not.toHaveBeenCalled();
    expect(repo.releaseMirror).toHaveBeenCalledTimes(1);
  });
  it('keeps reservations for uncertainty but releases only the Instagram allowance on definitive rejection', async () => {
    const { service, item, youtube, instagram } = fixture(
      'mirror_processing',
      true
    );
    item.youtubeVideoId = 'yt-video-a';
    item.instagramContainerId = 'container-a';
    item.youtubePublicConfirmedAt = now;
    youtube.observe.mockResolvedValue({
      id: 'yt-video-a',
      privacy: 'public',
      uploadStatus: 'processed',
      durationSeconds: 45,
    });
    instagram.publish.mockRejectedValue(
      new StudioDistributionProviderError('remote_rejected', true)
    );
    await service.advance('org-a', 'batch-a');
    expect(item.phase).toBe('failed');
    expect(item.instagramReservationReleased).toBe(true);
    expect(item.youtubeReservationReleased).toBe(false);
    await service.reconcile('org-a', item.id, { revision: item.revision });
    expect(item.phase).toBe('failed');
    expect(instagram.publish).toHaveBeenCalledTimes(1);
  });
  it('computes the Pacific quota day across DST and separates upload calls from ordinary units', () => {
    expect(studioQuotaDay(new Date('2026-07-01T06:59:00Z'))).toBe('2026-06-30');
    expect(studioQuotaDay(new Date('2026-11-15T07:59:00Z'))).toBe('2026-11-14');
    const { service, item } = fixture();
    const estimate = service.estimate([item]);
    expect(estimate.reduce((total, item) => total + item.uploads, 0)).toBe(1);
    expect(estimate.reduce((total, item) => total + item.otherUnits, 0)).toBe(
      157
    );
  });
});
