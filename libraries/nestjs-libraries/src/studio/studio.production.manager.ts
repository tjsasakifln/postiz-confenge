import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { createHash } from 'node:crypto';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import {
  StudioProductionService,
  resolveStudioRenderOptions,
} from './studio.production.service';
import { StudioResearchService } from './studio.research.service';
import {
  StudioImagesDto,
  StudioRenderDto,
  StudioResearchDto,
  StudioStyleDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.production.dto';
import type { StudioRender } from '@gitroom/helpers/studio/studio.types';

@Injectable()
export class StudioProductionManager {
  constructor(
    private readonly studio: StudioService,
    private readonly production: StudioProductionService,
    private readonly research: StudioResearchService,
    private readonly temporal: TemporalService
  ) {}

  private productionHash(
    document: import('@gitroom/helpers/studio/studio.types').StudioDocument
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          visualStyle: document.identity.visualStyle,
          positioning: document.identity.positioning,
          brand: document.identity,
          topic: document.topic,
          scenes: document.scenes.map((scene) => [
            scene.id,
            scene.narration,
            scene.pronunciation,
            scene.visual,
            scene.kind,
            scene.mediaId,
            scene.audioMediaId,
            scene.soundEffect,
          ]),
          music: document.backgroundMusicMediaId,
        })
      )
      .digest('hex');
  }

  private async project(orgId: string, projectId: string, revision?: number) {
    const project = await this.studio.get(orgId, projectId);
    if (revision !== undefined && project.revision !== revision)
      throw new ConflictException(
        'O projeto mudou. Recarregue antes de continuar.'
      );
    return project;
  }

  async start(orgId: string, projectId: string, body: StudioRenderDto) {
    const project = await this.project(orgId, projectId, body.revision);
    this.studio.requireApproval(project, 'script');
    const options = resolveStudioRenderOptions(project.document, body);
    const capability = await this.production.capabilities();
    if (!capability.available)
      throw new ServiceUnavailableException(capability.reason);
    const client = this.temporal.client.getRawClient();
    if (!client)
      throw new ServiceUnavailableException(
        'O serviço de produção está indisponível.'
      );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          revision: body.revision,
          format: body.format,
          sceneIds: body.sceneIds || [],
          voice: options.voice || 'nova',
          language: options.language,
          maxDurationSeconds: body.maxDurationSeconds,
          attempt: body.attempt || 0,
        })
      )
      .digest('hex')
      .slice(0, 24);
    const jobId = `studio_${orgId}_${projectId}_${fingerprint}`;
    try {
      await client.workflow.start('studioProductionWorkflowV1', {
        workflowId: jobId,
        taskQueue: 'main',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
        args: [
          {
            orgId,
            projectId,
            scriptHash: project.approvals.script!.hash,
            productionHash: this.productionHash(project.document),
            document: project.document,
            options,
          },
        ],
      });
    } catch (error) {
      if ((error as Error).name !== 'WorkflowExecutionAlreadyStartedError')
        throw new ServiceUnavailableException(
          'Não foi possível iniciar a produção. Confira o servidor de filas.'
        );
    }
    return { jobId };
  }

  private async handle(orgId: string, projectId: string, jobId: string) {
    await this.project(orgId, projectId);
    if (
      !jobId.startsWith(`studio_${orgId}_${projectId}_`) ||
      !/_[a-f0-9]{24}$/.test(jobId)
    )
      throw new NotFoundException('Produção não encontrada.');
    try {
      return await this.temporal.client.getWorkflowHandle(jobId);
    } catch {
      throw new NotFoundException('Produção não encontrada.');
    }
  }

  async status(orgId: string, projectId: string, jobId: string) {
    const handle = await this.handle(orgId, projectId, jobId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch {
      throw new NotFoundException('Produção não encontrada.');
    }
    if (status === 'RUNNING') return { status: 'pending' as const };
    try {
      const completed = (await handle.result()) as {
        render: StudioRender;
        scriptHash: string;
        projectId: string;
      };
      if (completed.projectId !== projectId) throw new NotFoundException();
      return { status: 'completed' as const, result: completed.render };
    } catch {
      return {
        status: 'failed' as const,
        error:
          'A produção falhou. Confira áudio, mídias licenciadas, configuração e saldo do provedor. Nenhuma nova tentativa foi cobrada automaticamente.',
      };
    }
  }

  async attach(
    orgId: string,
    projectId: string,
    jobId: string,
    revision: number,
    actorId: string
  ) {
    const project = await this.project(orgId, projectId, revision);
    this.studio.requireApproval(project, 'script');
    const handle = await this.handle(orgId, projectId, jobId);
    if ((await handle.describe()).status.name !== 'COMPLETED')
      throw new BadRequestException(
        'A produção ainda não terminou com sucesso.'
      );
    const completed = (await handle.result()) as {
      render: StudioRender;
      scriptHash: string;
      productionHash: string;
      projectId: string;
    };
    if (
      completed.scriptHash !== project.approvals.script!.hash ||
      completed.projectId !== projectId
    )
      throw new ConflictException(
        'O roteiro mudou desde a produção. Gere um vídeo com a versão aprovada atual.'
      );
    if (completed.productionHash !== this.productionHash(project.document))
      throw new ConflictException(
        'Os materiais de produção mudaram. Gere novamente antes de anexar o vídeo.'
      );
    if (
      project.document.renders.some(
        (render) => render.id === completed.render.id
      )
    )
      return project;
    const document = {
      ...project.document,
      renders: [...project.document.renders, completed.render],
      media: [
        ...project.document.media,
        {
          id: completed.render.id,
          path: completed.render.path,
          name: completed.render.name,
          kind: 'video' as const,
          license: 'owned' as const,
          attribution:
            'Composição própria. Direitos dos materiais de origem registrados no projeto.',
        },
      ],
    };
    return this.studio.updateDocument(
      orgId,
      projectId,
      revision,
      document,
      actorId,
      'render_attached'
    );
  }

  async images(
    orgId: string,
    projectId: string,
    body: StudioImagesDto,
    actorId: string
  ) {
    const project = await this.project(orgId, projectId, body.revision);
    if (!['brand', 'brand-kit'].includes(body.kind))
      this.studio.requireApproval(project, 'script');
    const images = await this.production.images(
      orgId,
      project.document,
      body.kind,
      body
    );
    return this.studio.updateDocument(
      orgId,
      projectId,
      body.revision,
      { ...project.document, media: [...project.document.media, ...images] },
      actorId,
      `${body.kind}_generated`
    );
  }

  async capabilities(orgId: string, projectId: string) {
    await this.project(orgId, projectId);
    return this.production.capabilities();
  }

  async search(
    orgId: string,
    projectId: string,
    body: StudioResearchDto,
    actorId: string
  ) {
    const project = await this.project(orgId, projectId, body.revision);
    this.studio.requireApproval(project, 'identity');
    const result = await this.research.search(body.query);
    const urls = new Set(project.document.sources.map((source) => source.url));
    const sources = [
      ...project.document.sources,
      ...result.sources.filter((source) => !urls.has(source.url)),
    ];
    if (sources.length > 100)
      throw new BadRequestException(
        'O projeto atingiu cem fontes. Selecione as mais relevantes antes de pesquisar novamente.'
      );
    return this.studio.updateDocument(
      orgId,
      projectId,
      body.revision,
      {
        ...project.document,
        sources,
        editorialNotes: [
          ...(project.document.editorialNotes || []),
          `Pesquisa em ${result.observedAt}: ${result.note}`,
          ...result.warnings.map((warning) => `Consulta parcial: ${warning}`),
        ].slice(-20),
      },
      actorId,
      'sources_researched'
    );
  }

  async style(
    orgId: string,
    projectId: string,
    body: StudioStyleDto,
    actorId: string
  ) {
    const project = await this.project(orgId, projectId, body.revision);
    const measurements = await this.production.measureStyle(
      orgId,
      project.document,
      body.mediaId
    );
    const evidence = `Medição da mídia ${body.mediaId}: ${JSON.stringify(
      measurements
    )}`;
    return this.studio.updateDocument(
      orgId,
      projectId,
      body.revision,
      {
        ...project.document,
        identity: {
          ...project.document.identity,
          evidence: [...project.document.identity.evidence, evidence],
        },
      },
      actorId,
      'style_measured'
    );
  }
}
