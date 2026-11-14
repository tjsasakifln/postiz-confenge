import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudioAudienceService } from './studio.audience.service';
import { AudienceProviderError } from './studio.audience.provider';

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({ IntegrationService: class {} }));
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({ IntegrationManager: class {} }));
vi.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({ RefreshIntegrationService: class {} }));
vi.mock('./studio.audience.manager', () => ({ StudioAudienceManager: class {} }));

function fixture() {
  const row = {
    id: 'thread-a', organizationId: 'org-a', projectId: 'project-a', integrationId: 'channel-a', postId: 'post-a',
    platform: 'youtube', externalThreadId: 'remote-thread-a', externalCommentId: 'comment-a',
    authorId: 'author-a', authorName: 'Pessoa', text: 'Como preparar um briefing?',
    externalUrl: 'https://www.youtube.com/watch?v=video-a&lc=comment-a',
    publishedAt: new Date(), observedAt: new Date(), respondedAt: null,
    replyDraft: null, draftHash: null, approvalHash: null, approvedBy: null, approvedAt: null,
    replyState: 'none', externalReplyId: null, sendAttemptId: null, attemptedAt: null, errorCode: null,
    revision: 1, createdAt: new Date(), updatedAt: new Date(),
  } as any;
  const post = {
    id: 'post-a', integrationId: 'channel-a', state: 'PUBLISHED', releaseId: 'video-a',
    releaseURL: 'https://www.youtube.com/watch?v=video-a', publishDate: new Date(),
    platform: 'youtube', integration: { providerIdentifier: 'youtube' },
  };
  const repo = {
    project: vi.fn(async (org: string, id: string) => {
      if (org !== row.organizationId || id !== row.projectId) throw new NotFoundException();
      return { id, revision: 1, document: { topic: 'Briefing', identity: {}, packages: [] } };
    }),
    thread: vi.fn(async (org: string, project: string, id: string) => {
      if (org !== row.organizationId || project !== row.projectId || id !== row.id) throw new NotFoundException();
      return structuredClone(row);
    }),
    threads: vi.fn(async () => [structuredClone(row)]),
    posts: vi.fn(async () => [structuredClone(post)]),
    integrations: vi.fn(async () => [{ id: 'channel-a', name: 'Canal', providerIdentifier: 'youtube', disabled: false, refreshNeeded: false, inBetweenSteps: false }]),
    importComment: vi.fn(async () => true), observedReply: vi.fn(),
    mutate: vi.fn(async (org, project, id, revision, states, data, _actor, _action, match = {}) => {
      if (org !== row.organizationId || project !== row.projectId || id !== row.id || revision !== row.revision ||
        !states.includes(row.replyState) || Object.entries(match).some(([key, value]) => row[key] !== value)) throw new ConflictException();
      Object.assign(row, data, { revision: row.revision + 1 });
      return structuredClone(row);
    }),
  };
  const provider = {
    identifier: 'youtube', platform: 'youtube', permissionHint: 'Official permission',
    inspectThread: vi.fn(async () => ({ text: row.text, complete: true, canReply: true, ownReply: undefined as any })),
    reply: vi.fn(async (_credentials, _id, text) => ({ id: 'reply-a', text, publishedAt: new Date().toISOString() })),
    listUnanswered: vi.fn(async () => ({ comments: [], answered: [], complete: true, checked: 0 })),
  };
  const manager = { get: vi.fn((identifier: string) => identifier === 'youtube' ? provider : undefined) };
  const integration = {
    id: 'channel-a', organizationId: 'org-a', token: 'SECRET_TOKEN', refreshToken: 'SECRET_REFRESH',
    internalId: 'owner-a', providerIdentifier: 'youtube', profile: '', disabled: false, deletedAt: null,
    refreshNeeded: false, inBetweenSteps: false, tokenExpiration: new Date(Date.now() + 3600000),
  };
  const integrations = { getIntegrationById: vi.fn(async () => structuredClone(integration)) };
  const analytics = { postAnalytics: vi.fn(async () => [] as any[]) };
  const social = { getSocialIntegration: vi.fn(() => analytics) };
  const refresh = { refresh: vi.fn(async () => ({ accessToken: 'REFRESHED_SECRET' })) };
  const writer = { capabilities: () => ({ available: false, reason: 'Sem chave.' }), suggest: vi.fn(async () => 'Quais são as necessidades da sua obra?') };
  const service = new StudioAudienceService(repo as any, manager as any, integrations as any, social as any, refresh as any, writer as any);
  const approve = async () => {
    const drafted = await service.draft('org-a', 'project-a', row.id, 'editor', { revision: row.revision, reply: 'Liste as necessidades da obra.' });
    return service.approve('org-a', 'project-a', row.id, 'reviewer', { revision: drafted.revision, draftHash: drafted.draftHash!, reviewed: true });
  };
  const send = () => service.send('org-a', 'project-a', row.id, 'sender', { revision: row.revision, draftHash: row.draftHash, confirmed: true });
  return { row, post, repo, provider, manager, integrations, integration, analytics, social, refresh, writer, service, approve, send };
}

describe('Studio audience review and official sending boundary', () => {
  it('rejects another tenant or project before reading credentials or using an API', async () => {
    const { service, provider, integrations } = fixture();
    await expect(service.send('org-b', 'project-a', 'thread-a', 'user', { revision: 1, draftHash: 'x', confirmed: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.draft('org-a', 'project-b', 'thread-a', 'user', { revision: 1, reply: 'Texto' })).rejects.toBeInstanceOf(NotFoundException);
    expect(integrations.getIntegrationById).not.toHaveBeenCalled();
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('invalidates approval whenever the reply is edited', async () => {
    const { approve, service, row, send, provider } = fixture();
    const approved = await approve();
    const edited = await service.draft('org-a', 'project-a', row.id, 'editor', { revision: approved.revision, reply: 'Uma resposta diferente.' });
    expect(edited.replyState).toBe('draft');
    expect(edited.approvalHash).toBeUndefined();
    expect(edited.draftHash).not.toBe(approved.draftHash);
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('requires current hash, explicit review and explicit send confirmation', async () => {
    const { approve, service, row, provider } = fixture();
    await approve();
    await expect(service.approve('org-a', 'project-a', row.id, 'user', { revision: row.revision, draftHash: row.draftHash, reviewed: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send('org-a', 'project-a', row.id, 'user', { revision: row.revision, draftHash: row.draftHash, confirmed: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send('org-a', 'project-a', row.id, 'user', { revision: row.revision, draftHash: 'wrong-hash', confirmed: true })).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('reserves one send under simultaneous requests and returns the saved result on later retry', async () => {
    const { approve, send, row, provider, service } = fixture();
    const approved = await approve();
    const results = await Promise.allSettled([send(), send()]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(provider.reply).toHaveBeenCalledTimes(1);
    expect(row.replyState).toBe('sent');
    const retry = await service.send('org-a', 'project-a', row.id, 'sender', { revision: approved.revision, draftHash: approved.draftHash!, confirmed: true });
    expect(retry.externalReplyId).toBe('reply-a');
    expect(provider.reply).toHaveBeenCalledTimes(1);
  });

  it('does not send if the approved draft changes during the remote preflight', async () => {
    const { approve, send, row, provider, service } = fixture();
    await approve();
    provider.inspectThread.mockImplementationOnce(async () => {
      await service.draft('org-a', 'project-a', row.id, 'editor', { revision: row.revision, reply: 'Alterada durante a leitura.' });
      return { text: row.text, complete: true, canReply: true, ownReply: undefined };
    });
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('keeps a timeout uncertain and never turns a missing remote response into permission to resend', async () => {
    const { approve, send, row, provider, service } = fixture();
    await approve();
    provider.reply.mockRejectedValueOnce(new AudienceProviderError('provider_unavailable', false));
    expect((await send()).replyState).toBe('uncertain');
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect((await service.reconcile('org-a', 'project-a', row.id, 'user', row.revision)).replyState).toBe('uncertain');
    await expect(service.draft('org-a', 'project-a', row.id, 'user', { revision: row.revision, reply: 'Tentativa nova' })).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).toHaveBeenCalledTimes(1);
  });

  it('requires a new human approval after a definitive provider rejection', async () => {
    const { approve, send, row, provider, service } = fixture();
    await approve();
    provider.reply.mockRejectedValueOnce(new AudienceProviderError('access_denied', true));
    const rejected = await send();
    expect(rejected.replyState).toBe('draft');
    expect(rejected.approvalHash).toBeUndefined();
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    await service.approve('org-a', 'project-a', row.id, 'reviewer', { revision: row.revision, draftHash: row.draftHash, reviewed: true });
    expect((await send()).replyState).toBe('sent');
    expect(provider.reply).toHaveBeenCalledTimes(2);
  });

  it('invalidates approval when the parent comment is edited on the platform', async () => {
    const { approve, send, row, provider } = fixture();
    await approve();
    provider.inspectThread.mockResolvedValueOnce({ text: 'Agora uma pergunta diferente.', canReply: true, complete: true, ownReply: undefined });
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect(row.replyState).toBe('none');
    expect(row.approvalHash).toBeNull();
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('avoids duplicates already answered by the brand outside the studio', async () => {
    const { approve, send, provider } = fixture();
    await approve();
    provider.inspectThread.mockResolvedValueOnce({ text: 'Como preparar um briefing?', complete: true, canReply: true, ownReply: { id: 'manual-reply', text: 'Já respondido.', publishedAt: new Date().toISOString() } });
    const result = await send();
    expect(result.replyState).toBe('answered');
    expect(result.externalReplyId).toBe('manual-reply');
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('does not send against an incomplete reply history', async () => {
    const { approve, send, row, provider } = fixture();
    await approve();
    provider.inspectThread.mockResolvedValueOnce({ text: row.text, complete: false, canReply: true, ownReply: undefined });
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('reconciles a timed-out successful response only by reading its matching text and time', async () => {
    const { approve, send, service, row, provider } = fixture();
    await approve();
    provider.reply.mockRejectedValueOnce(new AudienceProviderError('provider_unavailable', false));
    await send();
    provider.inspectThread.mockResolvedValueOnce({ text: row.text, complete: true, canReply: true, ownReply: { id: 'reply-found', text: row.replyDraft, publishedAt: new Date().toISOString() } });
    const result = await service.reconcile('org-a', 'project-a', row.id, 'user', row.revision);
    expect(result.replyState).toBe('sent');
    expect(result.externalReplyId).toBe('reply-found');
    expect(provider.reply).toHaveBeenCalledTimes(1);
  });

  it('preserves the send reservation when persistence fails after remote success', async () => {
    const { approve, send, row, repo, provider } = fixture();
    await approve();
    const actualMutation = repo.mutate.getMockImplementation()!;
    repo.mutate.mockImplementation(async (...args) => {
      if (args[7] === 'sent') throw new Error('database temporarily unavailable');
      return actualMutation(...args);
    });
    await expect(send()).rejects.toThrow('database temporarily unavailable');
    expect(row.replyState).toBe('sending');
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    expect(provider.reply).toHaveBeenCalledTimes(1);
  });

  it('saves an AI suggestion as a draft that still requires review', async () => {
    const { service, row, writer, provider } = fixture();
    const suggestion = await service.suggest('org-a', 'project-a', row.id, 'user', row.revision);
    expect(writer.suggest).toHaveBeenCalledOnce();
    expect(suggestion.replyState).toBe('draft');
    expect(suggestion.approvalHash).toBeUndefined();
    expect(provider.reply).not.toHaveBeenCalled();
  });

  it('reports missing metrics as unavailable, preserves real zero, and labels lifetime snapshots', async () => {
    const { service, analytics } = fixture();
    const missing = await service.metrics('org-a', 'project-a', 28);
    expect(missing.posts[0].status).toBe('unavailable');
    expect(missing.posts[0].metrics).toEqual([]);
    analytics.postAnalytics.mockResolvedValue([{ label: 'Views', data: [{ total: '0', date: '2026-11-14' }], percentageChange: 0 }]);
    const measured = await service.metrics('org-a', 'project-a', 28);
    expect(measured.posts[0].measurementScope).toBe('lifetime_snapshot');
    expect(measured.posts[0].metrics[0].points[0].value).toBe(0);
    expect(measured.note).toContain('não crescimento');
  });

  it('returns safe capabilities and sanitized provider failures without raw credentials', async () => {
    const { service, provider } = fixture();
    const capability = await service.capabilities('org-a', 'project-a');
    expect(JSON.stringify(capability)).not.toContain('SECRET');
    provider.listUnanswered.mockRejectedValueOnce(new Error('secret error: SECRET_TOKEN'));
    const synced = await service.sync('org-a', 'project-a', { integrationId: 'channel-a' });
    expect(synced.coverage[0].status).toBe('unavailable');
    expect(JSON.stringify(synced)).not.toContain('SECRET');
  });
});
