import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { randomUUID } from 'node:crypto';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import { StudioWriterService } from './studio.writer.service';
import type {
  StudioEditorialBatchInput,
  StudioEditorialBatchStatus,
} from './studio.editorial.batch.types';

@Injectable()
export class StudioEditorialBatchManager {
  constructor(
    private readonly studio: StudioService,
    private readonly temporal: TemporalService,
    private readonly writer: StudioWriterService
  ) {}

  private workflowId(organizationId: string, projectId: string) {
    return 'studio_editorial_' + organizationId + '_' + projectId;
  }

  async start(
    organizationId: string,
    projectId: string,
    revision: number,
    actorId: string
  ): Promise<StudioEditorialBatchStatus> {
    const project = await this.studio.get(organizationId, projectId);
    if (project.revision !== revision)
      throw new ConflictException(
        'O projeto mudou. Atualize a página antes de gerar.'
      );
    this.writer.quickDraftRequest(project.document, { previousTopics: [] });
    const client = this.temporal.client.getRawClient();
    if (!client)
      throw new ServiceUnavailableException(
        'A fila editorial está indisponível.'
      );
    const input: StudioEditorialBatchInput = {
      attemptId: randomUUID(),
      organizationId,
      projectId,
      revision,
      actorId,
      document: project.document,
    };
    try {
      await client.workflow.start('studioEditorialBatchWorkflowV1', {
        workflowId: this.workflowId(organizationId, projectId),
        taskQueue: 'main',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [input],
      });
    } catch (error) {
      if ((error as Error).name !== 'WorkflowExecutionAlreadyStartedError')
        throw new ServiceUnavailableException(
          'Não foi possível iniciar a fila editorial.'
        );
    }
    return {
      state: 'queued',
      message:
        'O texto seguirá para redação e revisão em dois lotes. Cada etapa pode levar até 24 horas.',
    };
  }

  async status(
    organizationId: string,
    projectId: string
  ): Promise<StudioEditorialBatchStatus> {
    await this.studio.get(organizationId, projectId);
    const id = this.workflowId(organizationId, projectId);
    let handle;
    try {
      handle = await this.temporal.client.getWorkflowHandle(id);
      const description = await handle.describe();
      if (description.status.name === 'RUNNING')
        return (await handle.query(
          'studioEditorialBatchStatus'
        )) as StudioEditorialBatchStatus;
    } catch (error) {
      if ((error as Error).name === 'WorkflowNotFoundError')
        return { state: 'idle' };
      throw new ServiceUnavailableException(
        'Não foi possível consultar a fila editorial agora.'
      );
    }
    try {
      return (await handle.result()) as StudioEditorialBatchStatus;
    } catch {
      return {
        state: 'failed',
        message: 'A produção editorial não terminou. Tente novamente.',
      };
    }
  }
}
