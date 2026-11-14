import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StudioAudienceRepository } from './studio.audience.repository';

describe('Audience repository tenant-scoped compare-and-swap', () => {
  it('includes organization, project, review hash, revision and state in the atomic send reservation', async () => {
    const tx = {
      studioProject: { findFirst: vi.fn(async () => ({ revision: 7 })) },
      studioAudienceThread: { updateMany: vi.fn(async () => ({ count: 0 })), findFirstOrThrow: vi.fn() },
      studioEvent: { create: vi.fn() },
    };
    const repository = new StudioAudienceRepository({} as any, {} as any, {} as any, {} as any, {} as any, { model: { $transaction: (operation: any) => operation(tx) } } as any);
    await expect(repository.mutate('org-a', 'project-a', 'thread-a', 3, ['approved'], { replyState: 'sending' }, 'reviewer', 'send_reserved', { draftHash: 'h', approvalHash: 'h' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studioAudienceThread.updateMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-a', projectId: 'project-a', id: 'thread-a', revision: 3,
      replyState: { in: ['approved'] }, draftHash: 'h', approvalHash: 'h',
    });
    expect(tx.studioEvent.create).not.toHaveBeenCalled();
  });

  it('checks project ownership before an audience mutation', async () => {
    const tx = {
      studioProject: { findFirst: vi.fn(async () => null) },
      studioAudienceThread: { updateMany: vi.fn() },
    };
    const repository = new StudioAudienceRepository({} as any, {} as any, {} as any, {} as any, {} as any, { model: { $transaction: (operation: any) => operation(tx) } } as any);
    await expect(repository.mutate('org-b', 'project-a', 'thread-a', 3, ['approved'], { replyState: 'sending' }, 'user', 'send_reserved')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.studioAudienceThread.updateMany).not.toHaveBeenCalled();
  });

  it('does not move or overwrite a comment that already belongs to another project', async () => {
    const tx = {
      studioAudienceThread: {
        upsert: vi.fn(async () => ({ id: 'thread-a', projectId: 'original-project', postId: 'post-a' })),
        updateMany: vi.fn(),
      },
    };
    const repository = new StudioAudienceRepository({} as any, {} as any, {} as any, {} as any, {} as any, { model: { $transaction: (operation: any) => operation(tx) } } as any);
    expect(await repository.importComment('org-a', 'other-project', 'channel-a', 'post-a', 'youtube', {
      externalCommentId: 'comment-a', externalThreadId: 'thread-a', authorName: 'Pessoa', text: 'Pergunta?', publishedAt: new Date().toISOString(),
    })).toBe(false);
    expect(tx.studioAudienceThread.updateMany).not.toHaveBeenCalled();
    expect(tx.studioAudienceThread.upsert.mock.calls[0][0].update).toEqual({});
  });
});
