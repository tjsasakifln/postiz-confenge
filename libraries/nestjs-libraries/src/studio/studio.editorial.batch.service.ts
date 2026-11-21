import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import OpenAI, { toFile } from 'openai';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import { StudioWriterService } from './studio.writer.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';
import type {
  StudioEditorialBatchInput,
  StudioEditorialBatchPoll,
  StudioEditorialBatchSubmission,
} from './studio.editorial.batch.types';

interface BatchPrompt {
  instructions: string;
  payload: unknown;
}

type QuickBatchWriter = StudioWriterService & {
  quickDraftRequest(
    document: StudioDocument,
    context?: { previousTopics: string[] }
  ): BatchPrompt;
  quickReviewRequest(document: StudioDocument, draft: unknown): BatchPrompt;
  applyQuickReview(
    document: StudioDocument,
    draft: unknown,
    review: unknown
  ): StudioDocument;
};

export function decodeEditorialBatchOutput(
  jsonl: string,
  customId: string
): unknown {
  for (const raw of jsonl.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = JSON.parse(raw);
    if (item?.custom_id !== customId) continue;
    if (item.error || item.response?.status_code !== 200)
      throw new Error('Batch request failed');
    const body = item.response?.body;
    if (body?.status && body.status !== 'completed')
      throw new Error('Batch response incomplete');
    const output = body?.output;
    if (!Array.isArray(output)) throw new Error('Batch output missing');
    for (const entry of output) {
      if (entry?.type !== 'message' || !Array.isArray(entry.content)) continue;
      for (const content of entry.content) {
        if (
          content?.type === 'output_text' &&
          typeof content.text === 'string'
        )
          return JSON.parse(content.text);
      }
    }
    throw new Error('Batch text missing');
  }
  throw new Error('Batch custom id missing');
}

@Injectable()
export class StudioEditorialBatchService {
  constructor(
    private readonly studio: StudioService,
    private readonly writer: StudioWriterService
  ) {}

  private client() {
    if (!process.env.OPENAI_API_KEY)
      throw new ServiceUnavailableException(
        'A geração editorial em lote ainda não foi configurada.'
      );
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  }

  private correlation(
    input: StudioEditorialBatchInput,
    phase: string,
    includeAttempt = true
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          ...(includeAttempt ? { attemptId: input.attemptId } : {}),
          organizationId: input.organizationId,
          projectId: input.projectId,
          revision: input.revision,
          document: input.document,
          phase,
        })
      )
      .digest('hex')
      .slice(0, 48);
  }

  private async ensureCurrent(input: StudioEditorialBatchInput) {
    const project = await this.studio.get(
      input.organizationId,
      input.projectId
    );
    if (project.revision !== input.revision)
      throw new ConflictException(
        'O conteúdo mudou enquanto a produção editorial aguardava.'
      );
  }

  private async findBatch(
    client: OpenAI,
    correlation: string,
    stableScope: string
  ) {
    let page = await client.batches.list({ limit: 100 });
    const matches = [];
    for (let pages = 0; pages < 10; pages++) {
      matches.push(
        ...page.data.filter(
          (batch) => {
            const job = batch.metadata?.postiz_job;
            if (
              batch.endpoint !== '/v1/responses' ||
              ['failed', 'expired', 'cancelled'].includes(batch.status) ||
              typeof job !== 'string' ||
              !/^[a-f0-9]{48}$/.test(job)
            )
              return false;
            if (job === correlation) return true;
            return (
              batch.metadata?.postiz_scope === stableScope &&
              ['validating', 'in_progress', 'finalizing', 'completed'].includes(
                batch.status
              )
            );
          }
        )
      );
      if (!page.hasNextPage?.()) break;
      page = await page.getNextPage();
    }
    for (const batch of matches.sort(
      (a, b) => b.created_at - a.created_at
    )) {
      if (batch.metadata?.postiz_job === correlation) return batch;
      if (
        ['validating', 'in_progress', 'finalizing'].includes(batch.status)
      )
        return batch;
      if (batch.status !== 'completed' || !batch.output_file_id) continue;
      try {
        // A completed batch from another workflow attempt is reusable only
        // while its output still exists. Cleanup deliberately removes it.
        await client.files.retrieve(batch.output_file_id);
        return batch;
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : undefined;
        if (status === 404) continue;
        // An uncertain provider read must not trigger another charged write.
        throw error;
      }
    }
    return undefined;
  }

  private async submit(
    input: StudioEditorialBatchInput,
    phase: 'draft' | 'review',
    prompt: BatchPrompt,
    model: string
  ): Promise<StudioEditorialBatchSubmission> {
    await this.ensureCurrent(input);
    const correlation = this.correlation(input, phase);
    const stableScope = this.correlation(input, phase, false);
    const client = this.client();
    const existing = await this.findBatch(client, correlation, stableScope);
    const customId = phase + '-' + correlation;
    if (existing)
      return {
        batchId: existing.id,
        customId: phase + '-' + existing.metadata!.postiz_job,
      };

    const request = {
      custom_id: customId,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model,
        input: [
          { role: 'system', content: prompt.instructions },
          { role: 'user', content: JSON.stringify(prompt.payload) },
        ],
        text: { format: { type: 'json_object' } },
        reasoning: { effort: phase === 'draft' ? 'medium' : 'high' },
        store: false,
        max_output_tokens: phase === 'draft' ? 5500 : 5000,
      },
    };
    const file = await client.files.create({
      file: await toFile(
        Buffer.from(JSON.stringify(request) + '\n', 'utf8'),
        customId + '.jsonl',
        { type: 'application/jsonl' }
      ),
      purpose: 'batch',
      expires_after: { anchor: 'created_at', seconds: 259200 },
    } as Parameters<typeof client.files.create>[0]);
    // A repeated activity first searches deterministic metadata. This protects
    // against another charged submission after a worker interruption.
    let batch;
    try {
      batch = await client.batches.create({
        input_file_id: file.id,
        endpoint: '/v1/responses',
        completion_window: '24h',
        metadata: {
          postiz_job: correlation,
          postiz_scope: stableScope,
          postiz_phase: phase,
        },
      });
    } catch (error) {
      // A provider may accept the write before the connection reports failure.
      // Search the stable scope for thirty seconds; never submit a second write.
      for (let check = 0; check < 6; check++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        batch = await this.findBatch(client, correlation, stableScope);
        if (batch) break;
      }
      if (!batch) throw error;
    }
    return {
      batchId: batch.id,
      customId: batch.metadata?.postiz_job ? phase + '-' + batch.metadata.postiz_job : customId,
    };
  }

  async submitDraft(
    input: StudioEditorialBatchInput
  ): Promise<StudioEditorialBatchSubmission> {
    const writer = this.writer as QuickBatchWriter;
    return this.submit(
      input,
      'draft',
      writer.quickDraftRequest(input.document, { previousTopics: [] }),
      process.env.STUDIO_BATCH_DRAFT_MODEL || 'gpt-6.2-sol'
    );
  }

  async submitReview(
    input: StudioEditorialBatchInput,
    draft: unknown
  ): Promise<StudioEditorialBatchSubmission> {
    const writer = this.writer as QuickBatchWriter;
    const reviewInput = {
      ...input,
      document: {
        ...input.document,
        editorialNotes: [
          ...(input.document.editorialNotes || []),
          'Rascunho em lote: ' +
            createHash('sha256')
              .update(JSON.stringify(draft))
              .digest('hex'),
        ],
      },
    };
    return this.submit(
      reviewInput,
      'review',
      writer.quickReviewRequest(input.document, draft),
      process.env.STUDIO_BATCH_REVIEW_MODEL || 'gpt-6.2-astra'
    );
  }

  async poll(
    submission: StudioEditorialBatchSubmission
  ): Promise<StudioEditorialBatchPoll> {
    const client = this.client();
    const batch = await client.batches.retrieve(submission.batchId);
    if (
      ['validating', 'in_progress', 'finalizing', 'cancelling'].includes(
        batch.status
      )
    )
      return { state: 'pending' };
    if (batch.status !== 'completed' || !batch.output_file_id)
      return { state: 'failed' };
    let output: string;
    try {
      const response = await client.files.content(batch.output_file_id);
      output = await response.text();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404)
        return { state: 'failed' };
      // Let Temporal retry a transient read. The file may be the only copy of a paid result.
      throw error;
    }
    try {
      return {
        state: 'completed',
        output: decodeEditorialBatchOutput(output, submission.customId),
      };
    } catch {
      return { state: 'failed' };
    }
  }

  async cleanup(submission: StudioEditorialBatchSubmission) {
    const client = this.client();
    try {
      const batch = await client.batches.retrieve(submission.batchId);
      const ids = [batch.input_file_id, batch.output_file_id].filter(
        (id): id is string => Boolean(id)
      );
      await Promise.allSettled(ids.map((id) => client.files.delete(id)));
    } catch {
      // Cleanup is best effort after the durable workflow has retained output.
    }
  }

  async finalize(
    input: StudioEditorialBatchInput,
    draft: unknown,
    review: unknown
  ) {
    const current = await this.studio.get(
      input.organizationId,
      input.projectId
    );
    if (
      current.revision === input.revision + 1 &&
      current.events.some(
        (event) =>
          event.revision === input.revision + 1 &&
          event.action === 'generated:editorial_batch'
      )
    )
      return;
    if (current.revision !== input.revision)
      throw new ConflictException(
        'O conteúdo mudou enquanto a produção editorial aguardava.'
      );
    const writer = this.writer as QuickBatchWriter;
    const document = writer.applyQuickReview(
      input.document,
      draft,
      review
    );
    await this.studio.updateDocument(
      input.organizationId,
      input.projectId,
      input.revision,
      document,
      input.actorId,
      'generated:editorial_batch'
    );
  }
}
