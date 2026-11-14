import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { StudioRepository } from './studio.repository';

describe('StudioRepository atomic organization-scoped writes', () => {
  it('puts the organization and expected revision in the atomic update and creates no event on conflict', async () => {
    const tx = {
      studioProject: { updateMany: vi.fn(async () => ({ count: 0 })) },
      studioEvent: { create: vi.fn() },
    };
    const transaction = {
      model: { $transaction: vi.fn((operation) => operation(tx)) },
    };
    const repository = new StudioRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      transaction as any
    );
    await expect(
      repository.updateDocument(
        'org-a',
        'project-a',
        7,
        'Título',
        {} as any,
        {},
        'user',
        'updated'
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studioProject.updateMany.mock.calls[0][0].where).toEqual({
      id: 'project-a',
      organizationId: 'org-a',
      revision: 7,
    });
    expect(tx.studioEvent.create).not.toHaveBeenCalled();
  });

  it('requires the approved package hash when reserving a draft', async () => {
    const tx = {
      studioProject: { updateMany: vi.fn(async () => ({ count: 0 })) },
      studioPublication: { create: vi.fn() },
    };
    const repository = new StudioRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { model: { $transaction: (operation: any) => operation(tx) } } as any
    );
    await expect(
      repository.claimDraft(
        'org-a',
        'project-a',
        7,
        'approved-hash',
        'linkedin',
        'channel-a',
        'user'
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studioProject.updateMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-a',
      revision: 7,
      approvals: { path: ['package', 'hash'], equals: 'approved-hash' },
    });
    expect(tx.studioPublication.create).not.toHaveBeenCalled();
  });
});
