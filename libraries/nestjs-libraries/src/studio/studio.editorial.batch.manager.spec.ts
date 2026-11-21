import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/studio/studio.service',
  () => ({ StudioService: class {} })
);
vi.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
import { StudioEditorialBatchManager } from './studio.editorial.batch.manager';

function setup() {
  const project = { revision: 7, document: { topic: 'Tema', scenes: [] } };
  const studio = { get: vi.fn(async () => project) };
  const start = vi.fn();
  const handle = {
    describe: vi.fn(async () => ({ status: { name: 'RUNNING' } })),
    query: vi.fn(async () => ({ state: 'review' })), result: vi.fn(),
  };
  const temporal = {
    client: {
      getRawClient: () => ({ workflow: { start } }),
      getWorkflowHandle: vi.fn(async () => handle),
    },
  };
  const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
  const manager = new StudioEditorialBatchManager(studio as any, temporal as any, writer as any);
  return { manager, studio, start, handle };
}

describe('Studio editorial Batch workflow boundary', () => {
  it('starts one scoped workflow with the immutable project snapshot', async () => {
    const { manager, start } = setup();
    await manager.start('org-a', 'project-a', 7, 'actor-a');
    expect(start.mock.calls[0][1]).toMatchObject({
      workflowId: 'studio_editorial_org-a_project-a',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
    expect(start.mock.calls[0][1].args[0]).toMatchObject({
      organizationId: 'org-a', projectId: 'project-a', revision: 7,
      actorId: 'actor-a', document: { topic: 'Tema' },
    });
  });

  it('refuses to charge from a stale revision', async () => {
    const { manager, start } = setup();
    await expect(manager.start('org-a', 'project-a', 6, 'actor-a')).rejects.toThrow('mudou');
    expect(start).not.toHaveBeenCalled();
  });

  it('returns only the safe progress query after an organization-scoped read', async () => {
    const { manager, studio, handle } = setup();
    await expect(manager.status('org-a', 'project-a')).resolves.toEqual({ state: 'review' });
    expect(studio.get).toHaveBeenCalledWith('org-a', 'project-a');
    expect(handle.query).toHaveBeenCalledWith('studioEditorialBatchStatus');
  });
});
