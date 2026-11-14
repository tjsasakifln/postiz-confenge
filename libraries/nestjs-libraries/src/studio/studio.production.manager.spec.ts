import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@gitroom/nestjs-libraries/database/prisma/studio/studio.service', () => ({ StudioService: class {} }));
vi.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
import { StudioProductionManager } from './studio.production.manager';

function setup() {
  const project = {
    id: 'project', revision: 1, approvals: { identity: { hash: 'identity' }, script: { hash: 'script' } },
    document: {
      identity: { visualStyle: '#abc123', positioning: 'Test' }, topic: 'Test', sources: [], media: [], renders: [],
      scenes: [{ id: 'scene', narration: 'Texto aprovado', visual: 'Cartela', kind: 'card', audioMediaId: 'audio-1' }],
    },
  };
  const studio = { get: vi.fn(async () => project), requireApproval: vi.fn(), updateDocument: vi.fn(async (...args) => args[3]) };
  const handle = { describe: vi.fn(async () => ({ status: { name: 'COMPLETED' } })), result: vi.fn() };
  const start = vi.fn();
  const temporal = { client: { getRawClient: () => ({ workflow: { start } }), getWorkflowHandle: vi.fn(async () => handle) } };
  const production = { capabilities: vi.fn(async () => ({ available: true })) };
  const research = { search: vi.fn(async () => ({ sources: [], warnings: ['YouTube indisponível'], note: 'Confirme fontes', observedAt: '2026-11-14T00:00:00Z' })) };
  const manager = new StudioProductionManager(studio as any, production as any, research as any, temporal as any);
  return { project, studio, handle, start, temporal, manager };
}

describe('Studio production workflow boundary', () => {
  it('rejects an old render when the recorded audio changed after the job started', async () => {
    const { manager, project, start, handle, studio } = setup();
    const { jobId } = await manager.start('org', 'project', { revision: 1, format: 'vertical' });
    const snapshot = start.mock.calls[0][1].args[0];
    handle.result.mockResolvedValue({ projectId: 'project', scriptHash: 'script', productionHash: snapshot.productionHash, render: { id: 'render' } });
    project.document.scenes[0].audioMediaId = 'audio-2';
    await expect(manager.attach('org', 'project', jobId, 1, 'actor')).rejects.toThrow('materiais');
    expect(studio.updateDocument).not.toHaveBeenCalled();
  });

  it('does not allow a job from a different organization to be read', async () => {
    const { manager, temporal } = setup();
    await expect(manager.status('org', 'project', 'studio_other_project_012345678901234567890123')).rejects.toThrow('encontrada');
    expect(temporal.client.getWorkflowHandle).not.toHaveBeenCalled();
  });

  it('preserves search coverage warnings in the project', async () => {
    const { manager, studio } = setup();
    await manager.search('org', 'project', { revision: 1, query: 'Revisão' }, 'actor');
    const saved = studio.updateDocument.mock.calls[0][3];
    expect(saved.editorialNotes.join(' ')).toContain('Consulta parcial: YouTube indisponível');
    expect(saved.editorialNotes.join(' ')).toContain('2026-11-14');
  });
});
