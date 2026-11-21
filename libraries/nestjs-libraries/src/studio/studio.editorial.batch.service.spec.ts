import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  list: vi.fn(),
  createBatch: vi.fn(),
  retrieve: vi.fn(),
  createFile: vi.fn(),
  retrieveFile: vi.fn(),
  content: vi.fn(),
  deleteFile: vi.fn(),
  toFile: vi.fn(async (value) => value),
}));
vi.mock('openai', () => ({
  default: class {
    batches = {
      list: fake.list,
      create: fake.createBatch,
      retrieve: fake.retrieve,
    };
    files = {
      create: fake.createFile,
      retrieve: fake.retrieveFile,
      content: fake.content,
      delete: fake.deleteFile,
    };
  },
  toFile: fake.toFile,
}));
vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/studio/studio.service',
  () => ({ StudioService: class {} })
);
import {
  decodeEditorialBatchOutput,
  StudioEditorialBatchService,
} from './studio.editorial.batch.service';

const document = {
  brief: 'Decidir a revisão de um orçamento.',
  identity: { audience: 'Gestores', visualStyle: 'Estúdio CONFENGE · Post quadrado · T' },
  topic: 'Como conferir uma quantidade',
  sources: [], scenes: [], packages: [], renders: [], media: [],
};
const input = {
  attemptId: 'attempt-a',
  organizationId: 'org-a', projectId: 'project-a', revision: 3,
  actorId: 'actor-a', document,
} as any;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('Studio editorial Batch transport', () => {
  it('decodes only the expected response item', () => {
    const jsonl = [
      JSON.stringify({ custom_id: 'other', response: { status_code: 200, body: { output: [] } } }),
      JSON.stringify({ custom_id: 'wanted', response: { status_code: 200, body: { output: [
        { type: 'message', content: [{ type: 'output_text', text: '{"accepted":true}' }] },
      ] } } }),
    ].join('\n');
    expect(decodeEditorialBatchOutput(jsonl, 'wanted')).toEqual({ accepted: true });
    expect(() => decodeEditorialBatchOutput(jsonl, 'missing')).toThrow('custom id');
    const incomplete = JSON.stringify({
      custom_id: 'wanted', response: { status_code: 200, body: { status: 'incomplete', output: [] } },
    });
    expect(() => decodeEditorialBatchOutput(incomplete, 'wanted')).toThrow('incomplete');
  });

  it('submits a medium-reasoning Sol draft once with deterministic metadata', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fake.list.mockResolvedValue({ data: [] });
    fake.createFile.mockResolvedValue({ id: 'file-1' });
    fake.createBatch.mockResolvedValue({ id: 'batch-1' });
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: { public: true } })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    const result = await service.submitDraft(input);
    expect(result.batchId).toBe('batch-1');
    expect(result.customId.length).toBeLessThanOrEqual(64);
    const request = JSON.parse(fake.toFile.mock.calls[0][0].toString().trim());
    expect(request.url).toBe('/v1/responses');
    expect(request.body).toMatchObject({
      model: 'gpt-6.2-sol', reasoning: { effort: 'medium' }, store: false,
    });
    expect(fake.createBatch.mock.calls[0][0]).toMatchObject({
      endpoint: '/v1/responses', completion_window: '24h',
      metadata: { postiz_phase: 'draft' },
    });
  });

  it('reuses a provider batch found by correlation after an uncertain activity', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    fake.list.mockResolvedValueOnce({ data: [] });
    fake.createFile.mockResolvedValueOnce({ id: 'file-1' });
    fake.createBatch.mockImplementationOnce(async (body) => ({ id: 'batch-1', ...body }));
    await service.submitDraft(input);
    const metadata = fake.createBatch.mock.calls[0][0].metadata;
    fake.list.mockResolvedValueOnce({ data: [{ id: 'batch-1', endpoint: '/v1/responses', metadata }] });
    await service.submitDraft(input);
    expect(fake.createBatch).toHaveBeenCalledTimes(1);
    expect(fake.createFile).toHaveBeenCalledTimes(1);
  });

  it('starts a new provider batch after an earlier explicit attempt expired', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fake.list.mockResolvedValue({
      data: [{
        id: 'expired', endpoint: '/v1/responses', status: 'expired',
        created_at: 1, metadata: { postiz_scope: 'previous' },
      }],
    });
    fake.createFile.mockResolvedValue({ id: 'file-new' });
    fake.createBatch.mockResolvedValue({ id: 'batch-new' });
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    await expect(service.submitDraft(input)).resolves.toMatchObject({ batchId: 'batch-new' });
    expect(fake.createBatch).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a completed batch whose output was cleaned', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fake.list.mockResolvedValueOnce({ data: [] });
    fake.createFile.mockResolvedValue({ id: 'file' });
    fake.createBatch.mockResolvedValueOnce({ id: 'first' }).mockResolvedValueOnce({ id: 'second' });
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    await service.submitDraft(input);
    const metadata = fake.createBatch.mock.calls[0][0].metadata;
    fake.list.mockResolvedValueOnce({ data: [{
      id: 'first', endpoint: '/v1/responses', status: 'completed', created_at: 2,
      output_file_id: 'output-cleaned', metadata,
    }] });
    fake.retrieveFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    await expect(service.submitDraft({ ...input, attemptId: 'attempt-b' })).resolves.toMatchObject({ batchId: 'second' });
    expect(fake.createBatch).toHaveBeenCalledTimes(2);
  });

  it('reuses a completed batch from another attempt while its output is readable', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fake.list.mockResolvedValueOnce({ data: [] });
    fake.createFile.mockResolvedValue({ id: 'file' });
    fake.createBatch.mockResolvedValueOnce({ id: 'first' });
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    const first = await service.submitDraft(input);
    const metadata = fake.createBatch.mock.calls[0][0].metadata;
    fake.list.mockResolvedValueOnce({ data: [{
      id: 'first', endpoint: '/v1/responses', status: 'completed', created_at: 2,
      output_file_id: 'output-readable', metadata,
    }] });
    fake.retrieveFile.mockResolvedValueOnce({ id: 'output-readable', status: 'processed' });
    await expect(
      service.submitDraft({ ...input, attemptId: 'attempt-b' })
    ).resolves.toEqual(first);
    expect(fake.retrieveFile).toHaveBeenCalledWith('output-readable');
    expect(fake.createBatch).toHaveBeenCalledTimes(1);
  });

  it('uses the original custom id when a new attempt recovers an active batch', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fake.list.mockResolvedValueOnce({ data: [] });
    fake.createFile.mockResolvedValue({ id: 'file' });
    fake.createBatch.mockResolvedValueOnce({ id: 'first' });
    const studio = { get: vi.fn(async () => ({ revision: 3 })) };
    const writer = { quickDraftRequest: vi.fn(() => ({ instructions: 'write', payload: {} })) };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    const first = await service.submitDraft(input);
    const metadata = fake.createBatch.mock.calls[0][0].metadata;
    fake.list.mockResolvedValueOnce({ data: [{
      id: 'first', endpoint: '/v1/responses', status: 'in_progress', created_at: 2,
      metadata,
    }] });
    const recovered = await service.submitDraft({ ...input, attemptId: 'attempt-b' });
    expect(recovered).toEqual(first);
    const jsonl = JSON.stringify({
      custom_id: recovered.customId,
      response: { status_code: 200, body: { status: 'completed', output: [
        { type: 'message', content: [{ type: 'output_text', text: '{"cards":[]}' }] },
      ] } },
    });
    expect(decodeEditorialBatchOutput(jsonl, recovered.customId)).toEqual({ cards: [] });
    expect(fake.createBatch).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a later project revision when finalizing', async () => {
    const studio = {
      get: vi.fn(async () => ({ revision: 4, events: [{ revision: 4, action: 'updated' }] })),
      updateDocument: vi.fn(),
    };
    const writer = { applyQuickReview: vi.fn() };
    const service = new StudioEditorialBatchService(studio as any, writer as any);
    await expect(service.finalize(input, {}, {})).rejects.toThrow('mudou');
    expect(studio.updateDocument).not.toHaveBeenCalled();
  });
});
