import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { StudioAudienceRepository } from './studio.audience.repository';

// Opt in only against a disposable database, as in the Studio persistence suite.
describe.skipIf(process.env.STUDIO_DATABASE_TESTS !== 'true')('Audience PostgreSQL reservation and tenant isolation', () => {
  const prisma = new PrismaClient();
  const model = { model: prisma } as any;
  const repository = new StudioAudienceRepository(model, model, model, model, model, model);
  const orgIds: string[] = [];
  let projectId: string;
  let threadId: string;
  beforeAll(async () => {
    for (let index = 0; index < 2; index++) orgIds.push((await prisma.organization.create({ data: { name: `Audience isolated test ${index}` } })).id);
    projectId = (await prisma.studioProject.create({ data: { organizationId: orgIds[0], title: 'Audience test', document: {}, approvals: {} } })).id;
    threadId = (await prisma.studioAudienceThread.create({ data: {
      organizationId: orgIds[0], projectId, integrationId: 'isolated-integration', postId: 'isolated-post',
      platform: 'youtube', externalThreadId: 'isolated-remote-thread', externalCommentId: 'isolated-comment',
      authorName: 'Synthetic author', text: 'Synthetic question?', publishedAt: new Date(), observedAt: new Date(),
      replyDraft: 'Reviewed synthetic response.', draftHash: 'reviewed-hash', approvalHash: 'reviewed-hash',
      approvedBy: 'test-reviewer', approvedAt: new Date(), replyState: 'approved',
    } })).id;
  });
  afterAll(async () => {
    await prisma.studioProject.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });

  it('permits exactly one simultaneous reservation, persists it across repository instances and blocks retry', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => repository.mutate(
      orgIds[0], projectId, threadId, 1, ['approved'],
      { replyState: 'sending', sendAttemptId: `attempt-${index}`, attemptedAt: new Date() },
      'test-user', 'send_reserved', { approvalHash: 'reviewed-hash', draftHash: 'reviewed-hash' }
    )));
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    const reloaded = new StudioAudienceRepository(model, model, model, model, model, model);
    const persisted = await reloaded.thread(orgIds[0], projectId, threadId);
    expect(persisted.replyState).toBe('sending');
    expect(persisted.revision).toBe(2);
    await expect(reloaded.mutate(orgIds[0], projectId, threadId, 2, ['approved'], { replyState: 'sending' }, 'test-user', 'send_reserved')).rejects.toThrow();
    expect(await prisma.studioEvent.count({ where: { projectId, action: 'audience:send_reserved' } })).toBe(1);
  });

  it('never resolves a thread through a different organization', async () => {
    await expect(repository.thread(orgIds[1], projectId, threadId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.mutate(orgIds[1], projectId, threadId, 2, ['sending'], { replyState: 'sent' }, 'test-user', 'sent')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces project tenancy with a composite database foreign key', async () => {
    await expect(prisma.studioAudienceThread.create({ data: {
      organizationId: orgIds[1], projectId, integrationId: 'other', postId: 'other', platform: 'youtube',
      externalThreadId: 'other-thread', externalCommentId: 'other-comment', authorName: 'Synthetic', text: 'Synthetic',
      publishedAt: new Date(), observedAt: new Date(),
    } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
