import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { StudioDistributionItem as StoredItem } from '@prisma/client';
import { createHash } from 'node:crypto';
import { TemporalService } from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/services/encryption.service';
import { StudioProductionService } from './studio.production.service';
import type { StudioPackage } from '@gitroom/helpers/studio/studio.types';
import type {
  StudioDistributionBatch,
  StudioDistributionBudget,
  StudioDistributionCapabilities,
  StudioDistributionInventory,
  StudioDistributionItem,
  StudioDistributionQuotaEstimate,
  StudioDistributionSnapshot,
} from '@gitroom/helpers/studio/studio.distribution.types';
import {
  StudioDistributionConfirmDto,
  StudioDistributionPlanDto,
  StudioDistributionRevisionDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.distribution.dto';
import {
  DistributionPlannedRow,
  DistributionStoredBatch,
  StudioDistributionRepository,
} from './studio.distribution.repository';
import {
  StudioDistributionConnections,
  StudioDistributionInstagramAdapter,
  StudioDistributionProviderError,
  StudioDistributionYoutubeAdapter,
  StudioYoutubeObservation,
  StudioYoutubeSession,
} from './studio.distribution.providers';

const minute = 60000;
const hour = 60 * minute;
const day = 24 * hour;
const quotaDisclaimer =
  'Estimativa e reserva local por projeto OAuth, em dias do Pacífico. Não é o saldo oficial do Google: outros aplicativos e operações fora desta grade podem consumir cota. Confira os limites no Google Cloud.';
const inFlight = [
  'upload_starting',
  'thumbnail_setting',
  'schedule_setting',
  'mirror_creating',
  'mirror_publishing',
];
const paused = ['blocked', 'uncertain', 'failed', 'cancelled'];
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const errorMessages: Record<string, string> = {
  access_denied:
    'A conta ou a permissão não está disponível. Reconecte o canal e confira as permissões antes de continuar.',
  ownership_unverified:
    'A plataforma não confirmou que a conta ou o vídeo pertence ao canal escolhido.',
  remote_uncertain:
    'A plataforma não confirmou o resultado. Verifique a situação; a escrita não será repetida automaticamente.',
  invalid_response:
    'A plataforma retornou dados insuficientes para confirmar a operação.',
  upload_start_unconfirmed:
    'A sessão de upload não foi confirmada. Não será aberto outro upload automaticamente.',
  upload_status_unavailable:
    'Não foi possível consultar ou continuar a sessão de upload existente.',
  thumbnail_unconfirmed:
    'A aplicação da capa não foi confirmada. O vídeo continua sem novo agendamento automático.',
  schedule_expired:
    'A antecedência terminou antes de concluir o upload. O vídeo permanece privado; revise a data no YouTube Studio.',
  private_without_schedule:
    'O upload privado foi confirmado, mas não há agendamento confirmado. Revise o vídeo no YouTube Studio; a consulta não repetiu escritas.',
  remote_schedule_changed:
    'O agendamento ou a visibilidade remota difere do plano. Confira o YouTube Studio.',
  remote_not_found:
    'O recurso não foi encontrado na conta. Nenhum novo upload será criado para substituí-lo.',
  remote_rejected:
    'A plataforma recusou a operação. Confira conteúdo, formato e permissões.',
  remote_quota:
    'A plataforma informou limite insuficiente. Nenhuma escrita será repetida automaticamente.',
  quota_unknown:
    'Não foi possível confirmar o limite atual de publicação no Instagram.',
  local_quota:
    'A reserva local não comporta o lote inteiro neste dia. Nenhum novo upload foi iniciado.',
  media_changed:
    'O arquivo mudou depois da preparação do plano. Refaça a revisão antes de outro envio.',
  short_unverified:
    'O arquivo não foi confirmado como vídeo vertical ou quadrado de três segundos a três minutos.',
  instagram_image_invalid:
    'Não foi possível validar a capa do Instagram. Use uma imagem JPEG de até 8 MB, com direitos e acesso confirmados.',
  processing_failed:
    'A plataforma recusou ou não concluiu o processamento do vídeo.',
  public_not_confirmed:
    'O YouTube ainda não confirmou este vídeo como público. O Instagram não será publicado.',
  monitoring_limit:
    'A janela automática de monitoração terminou. Verifique a situação na plataforma.',
  container_failed:
    'O contêiner do Instagram falhou ou expirou. Nenhuma nova publicação foi tentada.',
  container_pending:
    'O Instagram não terminou o processamento na janela de cinco consultas. Verifique a situação.',
  workflow_unavailable:
    'O lote foi reservado, mas o worker ainda não confirmou início. Repetir a confirmação usa o mesmo lote e não duplica uploads.',
  invalid_session: 'A sessão de upload armazenada não pôde ser validada.',
  duplicate_mirror:
    'Este vídeo já tem um espelhamento reservado para a conta. Use o registro existente.',
};

export function studioQuotaDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

@Injectable()
export class StudioDistributionService {
  constructor(
    private readonly repository: StudioDistributionRepository,
    private readonly studio: StudioService,
    private readonly production: StudioProductionService,
    private readonly connections: StudioDistributionConnections,
    private readonly youtube: StudioDistributionYoutubeAdapter,
    private readonly instagram: StudioDistributionInstagramAdapter,
    private readonly encryption: EncryptionService,
    private readonly temporal: TemporalService
  ) {}

  private ceiling(): StudioDistributionBudget {
    const configured = (key: string, fallback: number) => {
      const value = Number(process.env[key] || fallback);
      return Number.isSafeInteger(value) && value > 0 ? value : fallback;
    };
    return {
      uploads: configured('STUDIO_YOUTUBE_DAILY_UPLOAD_BUDGET', 100),
      otherUnits: configured('STUDIO_YOUTUBE_DAILY_OTHER_UNITS', 10000),
    };
  }
  private scope() {
    return hash(
      `youtube:${
        process.env.STUDIO_YOUTUBE_QUOTA_PROJECT ||
        process.env.YOUTUBE_CLIENT_ID ||
        'unconfigured'
      }`
    );
  }
  private client() {
    return this.temporal.client.getRawClient();
  }
  private error(code?: string | null) {
    return code
      ? errorMessages[code] ||
          'Esta etapa exige conferência antes de continuar.'
      : undefined;
  }
  private snapshot(item: StoredItem) {
    return item.snapshot as unknown as StudioDistributionSnapshot;
  }
  private terminal(item: StoredItem) {
    return (
      paused.includes(item.phase) ||
      item.phase === 'mirrored' ||
      (item.phase === 'youtube_public' && !item.instagramIntegrationId)
    );
  }

  async capabilities(
    organizationId: string
  ): Promise<StudioDistributionCapabilities> {
    const connected = await this.repository.connections(organizationId);
    const media = await this.production.capabilities();
    const available = !!(
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      this.client() &&
      media.available
    );
    return {
      available,
      reason: available
        ? 'Preparação configurada. A confirmação explícita reserva o lote e inicia o envio privado; o worker precisa estar ativo. Permissões efetivas são verificadas pela API.'
        : 'Configure o OAuth do YouTube, FFprobe/FFmpeg e Temporal antes de confirmar a distribuição.',
      workerRequired: true,
      maxBatchItems: 20,
      maxScheduleDays: 30,
      minAdvanceMinutes: 30,
      quotaBudgetCeiling: this.ceiling(),
      quotaDisclaimer,
      integrations: connected
        .filter(
          (item) =>
            this.youtube.providers.includes(item.providerIdentifier) ||
            this.instagram.providers.includes(item.providerIdentifier)
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          provider: item.providerIdentifier,
          platform: this.youtube.providers.includes(item.providerIdentifier)
            ? 'youtube'
            : 'instagram',
          available:
            !item.disabled && !item.refreshNeeded && !item.inBetweenSteps,
          permissionHint: this.youtube.providers.includes(
            item.providerIdentifier
          )
            ? this.youtube.permissionHint
            : this.instagram.permissionHint,
        })),
    };
  }

  private presentItem(item: StoredItem): StudioDistributionItem {
    return {
      id: item.id,
      batchId: item.batchId,
      projectId: item.projectId,
      projectRevision: item.projectRevision,
      title: item.title,
      integrationId: item.integrationId,
      integrationName: item.integrationName,
      mediaId: item.mediaId,
      publishAt: item.publishAt.toISOString(),
      madeForKids: item.madeForKids,
      containsSyntheticMedia: item.containsSyntheticMedia,
      phase: item.phase as StudioDistributionItem['phase'],
      revision: item.revision,
      youtubeVideoId: item.youtubeVideoId || undefined,
      youtubePrivacy:
        (item.youtubePrivacy as StudioDistributionItem['youtubePrivacy']) ||
        undefined,
      youtubePublishAt: item.youtubePublishAt?.toISOString(),
      youtubeObservedAt: item.youtubeObservedAt?.toISOString(),
      youtubePublicConfirmedAt: item.youtubePublicConfirmedAt?.toISOString(),
      youtubeUrl: item.youtubeVideoId
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(
            item.youtubeVideoId
          )}`
        : undefined,
      instagramIntegrationId: item.instagramIntegrationId || undefined,
      instagramIntegrationName: item.instagramIntegrationName || undefined,
      instagramMediaId: item.instagramMediaId || undefined,
      instagramPublishedAt: item.instagramPublishedAt?.toISOString(),
      instagramUrl: item.instagramUrl || undefined,
      nextActionAt: item.nextActionAt?.toISOString(),
      errorCode: item.errorCode || undefined,
      error: this.error(item.errorCode),
      canCancel: ['planned', 'reserved'].includes(item.phase),
      canReconcile:
        !['mirrored', 'cancelled'].includes(item.phase) &&
        !!(
          item.youtubeVideoId ||
          item.uploadSession ||
          item.instagramContainerId ||
          item.instagramMediaId
        ),
    };
  }
  private present(batch: DistributionStoredBatch): StudioDistributionBatch {
    return {
      id: batch.id,
      revision: batch.revision,
      state: batch.state as StudioDistributionBatch['state'],
      timezone: batch.timezone,
      quotaBudget: batch.quotaBudget as unknown as StudioDistributionBudget,
      quotaEstimate: batch.quotaReservations.length
        ? batch.quotaReservations
            .map((item) => ({
              day: item.quotaDay.day,
              uploads: item.uploads,
              otherUnits: item.otherUnits,
              timezone: 'America/Los_Angeles' as const,
            }))
            .sort((a, b) => a.day.localeCompare(b.day))
        : (batch.quotaEstimate as unknown as StudioDistributionQuotaEstimate[]),
      quotaDisclaimer,
      mirrorEnabled: batch.mirrorEnabled,
      mirrorIntervalMinutes: 60,
      items: batch.items.map((item) => this.presentItem(item)),
      createdAt: batch.createdAt.toISOString(),
      confirmedAt: batch.confirmedAt?.toISOString(),
      confirmedBy: batch.confirmedBy || undefined,
      workflowId: batch.workflowId || undefined,
      error: this.error(batch.errorCode),
      warnings: [
        'A confirmação autoriza somente o conteúdo imutável deste plano. Editar o projeto depois não altera o agendamento confirmado.',
        'Cancelar aqui interrompe apenas itens cujo upload não começou. Vídeos já enviados ou agendados devem ser revistos no YouTube Studio.',
        'A grade mostra somente esta distribuição. Publicações feitas por outros aplicativos podem afetar cota e espaçamento.',
        ...(batch.mirrorEnabled
          ? [
              'O espelhamento usa o mesmo arquivo aprovado, conferido por FFprobe e hash. Só começa após leitura confirmar YouTube público. Uma operação incerta bloqueia outro espelhamento nessa conta até conferência.',
            ]
          : []),
      ],
    };
  }
  async get(organizationId: string, id: string) {
    return this.present(await this.repository.batch(organizationId, id));
  }
  async inventory(
    organizationId: string
  ): Promise<StudioDistributionInventory> {
    return {
      batches: (await this.repository.batches(organizationId)).map((batch) =>
        this.present(batch)
      ),
      limit: 50,
    };
  }

  private validateTime(value: string | Date, strict = true) {
    const date = new Date(value);
    if (
      !Number.isFinite(date.getTime()) ||
      (typeof value === 'string' && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) ||
      date.getTime() < Date.now() + (strict ? 30 : 1) * minute ||
      date.getTime() > Date.now() + 30 * day
    ) {
      throw new BadRequestException(
        'Informe data e hora com fuso explícito, entre trinta minutos e trinta dias no futuro.'
      );
    }
    return date;
  }
  private validateBudget(budget: StudioDistributionBudget) {
    const max = this.ceiling();
    if (
      !Number.isSafeInteger(budget.uploads) ||
      budget.uploads <= 0 ||
      budget.uploads > max.uploads ||
      !Number.isSafeInteger(budget.otherUnits) ||
      budget.otherUnits <= 0 ||
      budget.otherUnits > max.otherUnits
    ) {
      throw new BadRequestException(
        'O orçamento deve ser positivo e respeitar os tetos diários configurados no servidor.'
      );
    }
  }
  private packageText(item: StudioPackage) {
    let landing = item.landingUrl;
    if (landing) {
      const url = new URL(landing);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new BadRequestException('Revise a URL do pacote.');
      url.searchParams.set('utm_source', item.utmSource);
      url.searchParams.set('utm_medium', item.utmMedium);
      url.searchParams.set('utm_campaign', item.utmCampaign);
      landing = url.toString();
    }
    return [
      item.description,
      item.cta,
      landing,
      item.hashtags
        .map((tag) => `#${tag.replace(/^#+/, '').replace(/\s+/g, '')}`)
        .join(' '),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  private publicUrl(path: string) {
    try {
      const url = new URL(path);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  estimate(
    items: Array<{
      publishAt: Date;
      snapshot: unknown;
      instagramIntegrationId?: string | null;
    }>,
    now = new Date()
  ): StudioDistributionQuotaEstimate[] {
    const totals = new Map<string, StudioDistributionQuotaEstimate>();
    const add = (date: Date, uploads: number, otherUnits: number) => {
      const key = studioQuotaDay(date);
      const current = totals.get(key) || {
        day: key,
        timezone: 'America/Los_Angeles',
        uploads: 0,
        otherUnits: 0,
      };
      current.uploads += uploads;
      current.otherUnits += otherUnits;
      totals.set(key, current);
    };
    for (const item of items) {
      const snapshot = item.snapshot as StudioDistributionSnapshot;
      // One insert bucket, one native status update, optional thumbnail, and a
      // conservative allowance for ownership/setup reads. Invalid calls also cost quota.
      add(now, 1, 50 + (snapshot.youtube.thumbnail ? 50 : 0) + 10);
      for (let i = 0; i <= 96; i++)
        add(new Date(item.publishAt.getTime() + i * 15 * minute), 0, 1);
      if (item.instagramIntegrationId) {
        add(item.publishAt, 0, 8);
        add(new Date(item.publishAt.getTime() + day), 0, 8);
      }
    }
    return [...totals.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async plan(
    organizationId: string,
    actorId: string,
    body: StudioDistributionPlanDto
  ) {
    this.validateBudget(body.quotaBudget);
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: body.timezone }).format();
    } catch {
      throw new BadRequestException(
        'Informe um fuso IANA válido, como America/Sao_Paulo.'
      );
    }
    if (!body.items.length || body.items.length > 20)
      throw new BadRequestException('Planeje de um a vinte itens por lote.');
    const connections = await this.repository.connections(organizationId);
    const account = (id: string, providers: string[]) => {
      const value = connections.find(
        (item) => item.id === id && providers.includes(item.providerIdentifier)
      );
      if (
        !value ||
        value.disabled ||
        value.refreshNeeded ||
        value.inBetweenSteps
      )
        throw new BadRequestException(
          'Um canal não está conectado e disponível nesta organização.'
        );
      return value;
    };
    const mirror = body.mirror?.enabled
      ? account(body.mirror.instagramIntegrationId, this.instagram.providers)
      : undefined;
    const items: DistributionPlannedRow[] = [];
    const keys = new Set<string>();
    for (const item of body.items) {
      const publishAt = this.validateTime(item.publishAt);
      if (
        typeof item.madeForKids !== 'boolean' ||
        typeof item.containsSyntheticMedia !== 'boolean'
      )
        throw new BadRequestException(
          'Responda explicitamente às duas declarações do YouTube.'
        );
      const connection = account(item.integrationId, this.youtube.providers);
      const project = await this.studio.get(organizationId, item.projectId);
      if (project.revision !== item.revision)
        throw new ConflictException(
          'Um projeto mudou. Atualize antes de preparar o plano.'
        );
      this.studio.requireApproval(project, 'package');
      const youtubePackage = project.document.packages.find(
        (pack) => pack.platform === 'youtube'
      );
      const instagramPackage = project.document.packages.find(
        (pack) => pack.platform === 'instagram'
      );
      if (!youtubePackage || youtubePackage.mediaIds.length !== 1)
        throw new BadRequestException(
          'O pacote do YouTube precisa de exatamente um vídeo aprovado.'
        );
      const mediaId = youtubePackage.mediaIds[0];
      if (
        project.document.media.find((media) => media.id === mediaId)?.kind !==
        'video'
      )
        throw new BadRequestException('Escolha um vídeo no pacote do YouTube.');
      if (
        mirror &&
        (!instagramPackage ||
          instagramPackage.mediaIds.length !== 1 ||
          instagramPackage.mediaIds[0] !== mediaId)
      )
        throw new BadRequestException(
          'O espelhamento exige o mesmo vídeo no pacote aprovado do Instagram.'
        );
      const ids = [
        ...new Set(
          [
            mediaId,
            youtubePackage.thumbnailMediaId,
            mirror ? instagramPackage?.thumbnailMediaId : undefined,
          ].filter(Boolean)
        ),
      ] as string[];
      const media = await this.repository.media(organizationId, ids);
      if (
        media.length !== ids.length ||
        media.some(
          (asset) =>
            !this.publicUrl(asset.path) ||
            project.document.media.find((old) => old.id === asset.id)?.path !==
              asset.path
        )
      )
        throw new BadRequestException(
          'Os arquivos precisam estar prontos nesta organização, com as mesmas URLs HTTPS da versão aprovada.'
        );
      const video = media.find((asset) => asset.id === mediaId)!;
      const inspection = await this.production.inspectForDistribution(
        organizationId,
        project.document,
        mediaId
      );
      if (
        mirror &&
        (inspection.durationSeconds > 180 ||
          inspection.durationSeconds < 3 ||
          inspection.width > inspection.height)
      )
        throw new BadRequestException(
          'O espelhamento exige vídeo medido de três segundos a três minutos, vertical ou quadrado.'
        );
      const description = this.packageText(youtubePackage);
      const caption = mirror ? this.packageText(instagramPackage!) : '';
      const tagCost = youtubePackage.hashtags.reduce(
        (sum, tag) => sum + tag.length + (/\s/.test(tag) ? 2 : 0),
        0
      );
      if (
        !youtubePackage.title.trim() ||
        youtubePackage.title.length > 100 ||
        description.length > 5000 ||
        tagCost > 500 ||
        (mirror && caption.length > 2200)
      )
        throw new BadRequestException(
          'Revise os limites do título, descrição, tags ou legenda do pacote.'
        );
      const key = `${project.id}:${project.approvals.package!.hash}:${
        connection.id
      }`;
      if (keys.has(key))
        throw new BadRequestException(
          'O mesmo pacote e canal só podem aparecer uma vez no lote.'
        );
      keys.add(key);
      const cover = (id?: string) => {
        if (!id) return undefined;
        if (
          project.document.media.find((asset) => asset.id === id)?.kind !==
          'image'
        )
          throw new BadRequestException(
            'A capa precisa ser uma imagem aprovada.'
          );
        const asset = media.find((asset) => asset.id === id)!;
        return { id: asset.id, path: asset.path };
      };
      const instagramThumbnail = mirror
        ? cover(instagramPackage!.thumbnailMediaId)
        : undefined;
      if (instagramThumbnail)
        await this.production.assertInstagramImage(
          organizationId,
          project.document,
          instagramThumbnail.id,
          'cover'
        );
      items.push({
        projectId: project.id,
        projectRevision: project.revision,
        packageHash: project.approvals.package!.hash,
        integrationId: connection.id,
        integrationName: connection.name,
        mediaId,
        title: youtubePackage.title,
        publishAt,
        madeForKids: item.madeForKids,
        containsSyntheticMedia: item.containsSyntheticMedia,
        instagramIntegrationId: mirror?.id || null,
        instagramIntegrationName: mirror?.name || null,
        snapshot: {
          packageHash: project.approvals.package!.hash,
          approvals: project.approvals,
          document: project.document,
          media: {
            id: video.id,
            path: video.path,
            name: video.name,
            ...inspection,
          },
          youtube: {
            title: youtubePackage.title,
            description,
            tags: youtubePackage.hashtags.map((tag) => tag.replace(/^#+/, '')),
            thumbnail: cover(youtubePackage.thumbnailMediaId),
            internalId: connection.internalId,
          },
          ...(mirror
            ? {
                instagram: {
                  internalId: mirror.internalId,
                  provider: mirror.providerIdentifier,
                  caption,
                  thumbnail: instagramThumbnail,
                },
              }
            : {}),
        },
      });
    }
    const estimate = this.estimate(items);
    if (
      estimate.some(
        (item) =>
          item.uploads > body.quotaBudget.uploads ||
          item.otherUnits > body.quotaBudget.otherUnits
      )
    )
      throw new BadRequestException(
        'O orçamento informado não comporta a estimativa do lote inteiro.'
      );
    const id = await this.repository.plan(
      organizationId,
      actorId,
      body.timezone,
      this.scope(),
      body.quotaBudget,
      estimate,
      items
    );
    return this.get(organizationId, id);
  }

  private async startWorkflow(batch: DistributionStoredBatch) {
    const client = this.client();
    if (!client || !batch.workflowId)
      throw new ServiceUnavailableException(this.error('workflow_unavailable'));
    try {
      await client.workflow.start('studioDistributionWorkflowV1', {
        workflowId: batch.workflowId,
        taskQueue: 'main',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
        args: [{ organizationId: batch.organizationId, batchId: batch.id }],
      });
    } catch (error) {
      if ((error as Error)?.name !== 'WorkflowExecutionAlreadyStartedError') {
        await this.repository.batchState(
          batch.organizationId,
          batch.id,
          batch.state,
          'workflow_unavailable'
        );
        throw new ServiceUnavailableException(
          this.error('workflow_unavailable')
        );
      }
    }
  }

  private async allowance(organizationId: string) {
    if (!process.env.STRIPE_PUBLISHABLE_KEY) return undefined;
    const organization = await this.repository.billing(organizationId);
    const createdAt =
      organization.subscription?.createdAt || organization.createdAt;
    const months = Math.abs(dayjs(createdAt).diff(dayjs(), 'month'));
    return {
      from: dayjs(createdAt).add(months, 'month').toDate(),
      maximum:
        pricing[organization.subscription?.subscriptionTier || 'FREE']
          .posts_per_month,
    };
  }
  async confirm(
    organizationId: string,
    id: string,
    body: StudioDistributionConfirmDto,
    actorId: string
  ) {
    if (body.confirmed !== true)
      throw new BadRequestException(
        'Confirme explicitamente o envio do lote e as datas.'
      );
    let batch = await this.repository.batch(organizationId, id);
    if (batch.confirmedAt && ['confirmed', 'running'].includes(batch.state)) {
      await this.startWorkflow(batch);
      return this.get(organizationId, id);
    }
    if (batch.revision !== body.revision || batch.state !== 'planned')
      throw new ConflictException('O lote mudou ou já foi confirmado.');
    const capabilities = await this.capabilities(organizationId);
    if (!capabilities.available)
      throw new ServiceUnavailableException(capabilities.reason);
    if (batch.quotaScope !== this.scope())
      throw new ConflictException(
        'O projeto OAuth mudou. Prepare outro plano.'
      );
    this.validateBudget(
      batch.quotaBudget as unknown as StudioDistributionBudget
    );
    for (const item of batch.items) {
      this.validateTime(item.publishAt);
      const project = await this.studio.get(organizationId, item.projectId);
      if (project.revision !== item.projectRevision)
        throw new ConflictException('Um projeto mudou. Prepare outro plano.');
      this.studio.requireApproval(project, 'package');
      if (project.approvals.package!.hash !== item.packageHash)
        throw new ConflictException('A aprovação mudou. Prepare outro plano.');
      const snapshot = this.snapshot(item);
      if (
        snapshot.instagram &&
        (snapshot.media.durationSeconds < 3 ||
          snapshot.media.durationSeconds > 180 ||
          snapshot.media.width > snapshot.media.height)
      )
        throw new BadRequestException(
          'O espelhamento exige vídeo medido de três segundos a três minutos, vertical ou quadrado.'
        );
      await this.assertInstagramCover(organizationId, snapshot);
    }
    batch = await this.repository.confirm(
      organizationId,
      id,
      body.revision,
      actorId,
      this.estimate(batch.items),
      await this.allowance(organizationId)
    );
    await this.startWorkflow(batch);
    return this.get(organizationId, id);
  }
  async cancel(
    organizationId: string,
    id: string,
    body: StudioDistributionRevisionDto,
    actorId: string
  ) {
    return this.present(
      await this.repository.cancel(organizationId, id, body.revision, actorId)
    );
  }

  private async unchanged(organizationId: string, item: StoredItem) {
    const snapshot = this.snapshot(item);
    const media = await this.repository.media(organizationId, [item.mediaId]);
    if (media[0]?.path !== snapshot.media.path)
      throw new StudioDistributionProviderError('media_changed', true);
    const measured = await this.production.inspectForDistribution(
      organizationId,
      snapshot.document,
      item.mediaId
    );
    if (
      measured.sha256 !== snapshot.media.sha256 ||
      measured.width !== snapshot.media.width ||
      measured.height !== snapshot.media.height ||
      Math.abs(measured.durationSeconds - snapshot.media.durationSeconds) > 0.05
    )
      throw new StudioDistributionProviderError('media_changed', true);
    if (
      snapshot.instagram &&
      (measured.durationSeconds < 3 ||
        measured.durationSeconds > 180 ||
        measured.width > measured.height)
    )
      throw new StudioDistributionProviderError('short_unverified', true);
    return measured;
  }
  private async assertInstagramCover(
    organizationId: string,
    snapshot: StudioDistributionSnapshot
  ) {
    if (snapshot.instagram?.thumbnail)
      await this.production.assertInstagramImage(
        organizationId,
        snapshot.document,
        snapshot.instagram.thumbnail.id,
        'cover'
      );
  }
  private async session(item: StoredItem): Promise<StudioYoutubeSession> {
    if (!item.uploadSession)
      throw new StudioDistributionProviderError('invalid_session', true);
    try {
      return JSON.parse(await this.encryption.decrypt(item.uploadSession));
    } catch {
      throw new StudioDistributionProviderError('invalid_session', true);
    }
  }
  private async reserveToday(
    organizationId: string,
    batch: DistributionStoredBatch,
    includeUploads: boolean
  ) {
    const today = this.estimate(batch.items).find(
      (estimate) => estimate.day === studioQuotaDay(new Date())
    )!;
    try {
      await this.repository.ensureUploadDay(organizationId, batch.id, {
        ...today,
        ...(includeUploads ? {} : { uploads: 0 }),
      });
    } catch (error) {
      if (error instanceof ConflictException)
        throw new StudioDistributionProviderError('local_quota', true);
      throw error;
    }
  }
  private async observe(organizationId: string, item: StoredItem) {
    if (!item.youtubeVideoId || item.readAttempts >= 120)
      throw new StudioDistributionProviderError('monitoring_limit', true);
    const claimed = await this.repository.mutate(
      organizationId,
      item,
      { readAttempts: { increment: 1 } },
      'observe'
    );
    const snapshot = this.snapshot(claimed);
    const connection = await this.connections.get(
      organizationId,
      item.integrationId,
      this.youtube.providers,
      snapshot.youtube.internalId
    );
    const video = await this.youtube.observe(connection, item.youtubeVideoId);
    const updated = await this.repository.mutate(
      organizationId,
      claimed,
      {
        youtubePrivacy: video.privacy,
        youtubePublishAt: video.publishAt ? new Date(video.publishAt) : null,
        youtubeObservedAt: new Date(),
      },
      'observed'
    );
    return { item: updated, connection, video };
  }
  private async publicConfirmed(
    organizationId: string,
    item: StoredItem,
    video: StudioYoutubeObservation
  ) {
    if (video.privacy !== 'public' || video.uploadStatus !== 'processed')
      throw new StudioDistributionProviderError('public_not_confirmed', true);
    await this.repository.published(
      organizationId,
      item,
      'youtube',
      video.id,
      `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
    );
    return this.repository.mutate(
      organizationId,
      item,
      {
        phase: 'youtube_public',
        youtubePublicConfirmedAt: new Date(),
        nextActionAt: item.instagramIntegrationId
          ? new Date(Math.max(Date.now(), item.publishAt.getTime()))
          : null,
        attemptId: null,
        leaseUntil: null,
        errorCode: null,
      },
      'youtube_public_confirmed'
    );
  }
  private async fail(
    organizationId: string,
    item: StoredItem,
    error: unknown,
    mutationMayHaveRun = false
  ) {
    const code =
      error instanceof StudioDistributionProviderError
        ? error.code
        : 'remote_uncertain';
    const definitive =
      error instanceof StudioDistributionProviderError && error.definitive;
    const mirrorFailure =
      definitive &&
      [
        'mirror_creating',
        'mirror_processing',
        'mirror_waiting',
        'mirror_publishing',
      ].includes(item.phase);
    const unstartedFailure =
      definitive &&
      ['planned', 'reserved', 'upload_starting'].includes(item.phase) &&
      !item.uploadSession &&
      !item.youtubeVideoId;
    const privateFailure =
      definitive &&
      ['uploaded_private', 'thumbnail_setting', 'schedule_setting'].includes(
        item.phase
      ) &&
      !['remote_schedule_changed', 'public_not_confirmed'].includes(code);
    const phase =
      mutationMayHaveRun && !definitive
        ? 'uncertain'
        : mirrorFailure || unstartedFailure || privateFailure
        ? 'failed'
        : 'blocked';
    const updated = await this.repository.mutate(
      organizationId,
      item,
      {
        phase,
        errorCode: code,
        nextActionAt: null,
        leaseUntil: null,
        ...(unstartedFailure || privateFailure
          ? {
              youtubeReservationReleased: true,
              instagramReservationReleased: true,
            }
          : {}),
        ...(mirrorFailure ? { instagramReservationReleased: true } : {}),
      },
      phase
    );
    if (unstartedFailure)
      await this.repository.releaseUnstartedPublications(
        organizationId,
        updated
      );
    if (
      (definitive || !mutationMayHaveRun) &&
      [
        'mirror_creating',
        'mirror_processing',
        'mirror_waiting',
        'mirror_publishing',
      ].includes(item.phase)
    )
      await this.repository.releaseMirror(organizationId, item.id);
    return updated;
  }

  async advance(
    organizationId: string,
    batchId: string
  ): Promise<{ complete: boolean; nextAt?: string }> {
    let batch = await this.repository.batch(organizationId, batchId);
    if (!batch.confirmedAt || batch.state === 'cancelled')
      return { complete: true };
    if (!batch.preflightAt) {
      try {
        const today = this.estimate(batch.items).find(
          (item) => item.day === studioQuotaDay(new Date())
        )!;
        await this.repository.ensureUploadDay(organizationId, batchId, today);
        const seen = new Set<string>();
        for (const item of batch.items.filter((item) => !this.terminal(item))) {
          const snapshot = this.snapshot(item);
          if (!seen.has(item.integrationId)) {
            await this.youtube.preflight(
              await this.connections.get(
                organizationId,
                item.integrationId,
                this.youtube.providers,
                snapshot.youtube.internalId
              )
            );
            seen.add(item.integrationId);
          }
          if (
            item.instagramIntegrationId &&
            !seen.has(item.instagramIntegrationId)
          ) {
            await this.instagram.preflight(
              await this.connections.get(
                organizationId,
                item.instagramIntegrationId,
                this.instagram.providers,
                snapshot.instagram!.internalId
              )
            );
            seen.add(item.instagramIntegrationId);
          }
        }
        await this.repository.batchState(
          organizationId,
          batchId,
          'running',
          undefined,
          true
        );
      } catch (error) {
        const code =
          error instanceof ConflictException
            ? 'local_quota'
            : error instanceof StudioDistributionProviderError
            ? error.code
            : 'remote_uncertain';
        for (const item of batch.items.filter(
          (item) => item.phase === 'reserved'
        )) {
          const failed = await this.repository.mutate(
            organizationId,
            item,
            {
              phase: 'failed',
              errorCode: code,
              nextActionAt: null,
              youtubeReservationReleased: true,
              instagramReservationReleased: true,
            },
            'preflight_failed'
          );
          await this.repository.releaseUnstartedPublications(
            organizationId,
            failed
          );
        }
        await this.repository.batchState(
          organizationId,
          batchId,
          'attention',
          code
        );
        return { complete: true };
      }
      batch = await this.repository.batch(organizationId, batchId);
    }
    const active = batch.items.filter((item) => !this.terminal(item));
    if (!active.length) {
      await this.repository.batchState(
        organizationId,
        batchId,
        batch.items.some((item) =>
          ['blocked', 'uncertain', 'failed'].includes(item.phase)
        )
          ? 'attention'
          : 'completed'
      );
      return { complete: true };
    }
    const item = active
      .filter(
        (item) =>
          !item.nextActionAt || item.nextActionAt.getTime() <= Date.now()
      )
      .sort(
        (a, b) =>
          (a.nextActionAt?.getTime() || 0) - (b.nextActionAt?.getTime() || 0)
      )[0];
    if (!item)
      return {
        complete: false,
        nextAt: new Date(
          Math.min(...active.map((item) => item.nextActionAt!.getTime()))
        ).toISOString(),
      };
    try {
      await this.step(organizationId, batch, item);
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        const current = await this.repository.item(organizationId, item.id);
        await this.fail(
          organizationId,
          current,
          error,
          inFlight.includes(current.phase)
        );
      }
    }
    return {
      complete: false,
      nextAt: new Date(Date.now() + 1000).toISOString(),
    };
  }

  private async step(
    organizationId: string,
    batch: DistributionStoredBatch,
    item: StoredItem
  ) {
    const snapshot = this.snapshot(item);
    if (item.leaseUntil && item.leaseUntil.getTime() > Date.now()) return;
    if (inFlight.includes(item.phase)) {
      await this.fail(
        organizationId,
        item,
        new StudioDistributionProviderError('remote_uncertain'),
        true
      );
      return;
    }
    if (item.phase === 'reserved') {
      this.validateTime(item.publishAt, false);
      await this.reserveToday(organizationId, batch, true);
      await this.unchanged(organizationId, item);
      const connection = await this.connections.get(
        organizationId,
        item.integrationId,
        this.youtube.providers,
        snapshot.youtube.internalId
      );
      item = await this.repository.claim(
        organizationId,
        item,
        'upload_starting'
      );
      try {
        const session = await this.youtube.start(
          connection,
          snapshot,
          item.postId!,
          item.madeForKids,
          item.containsSyntheticMedia
        );
        await this.repository.mutate(
          organizationId,
          item,
          {
            phase: 'uploading',
            uploadSession: await this.encryption.encrypt(
              JSON.stringify(session)
            ),
            attemptId: null,
            leaseUntil: null,
            nextActionAt: new Date(),
          },
          'upload_session_saved'
        );
      } catch (error) {
        await this.fail(organizationId, item, error, true);
      }
      return;
    }
    if (item.phase === 'uploading') {
      if (
        item.uploadAttempts >= 60 ||
        Date.now() > item.createdAt.getTime() + day
      )
        throw new StudioDistributionProviderError('monitoring_limit', true);
      await this.unchanged(organizationId, item);
      const session = await this.session(item);
      const connection = await this.connections.get(
        organizationId,
        item.integrationId,
        this.youtube.providers,
        snapshot.youtube.internalId
      );
      item = await this.repository.claim(organizationId, item, 'uploading');
      try {
        const result = await this.youtube.resume(connection, session);
        if (result.status === 'completed') {
          if (!result.postId)
            throw new StudioDistributionProviderError('invalid_response');
          await this.repository.mutate(
            organizationId,
            item,
            {
              phase: 'uploaded_private',
              youtubeVideoId: result.postId,
              attemptId: null,
              leaseUntil: null,
              nextActionAt: new Date(),
            },
            'upload_completed'
          );
        } else {
          await this.repository.mutate(
            organizationId,
            item,
            {
              uploadSession: await this.encryption.encrypt(
                JSON.stringify(result.pendingData || session)
              ),
              uploadAttempts: { increment: 1 },
              attemptId: null,
              leaseUntil: null,
              nextActionAt: new Date(Date.now() + minute),
            },
            'upload_resumable'
          );
        }
      } catch {
        await this.repository.mutate(
          organizationId,
          item,
          {
            uploadAttempts: { increment: 1 },
            errorCode: 'upload_status_unavailable',
            attemptId: null,
            leaseUntil: null,
            nextActionAt: new Date(
              Date.now() + Math.min(15, item.uploadAttempts + 1) * minute
            ),
          },
          'upload_probe_pending'
        );
      }
      return;
    }
    if (item.phase === 'uploaded_private') {
      // A resumable transfer can cross Pacific midnight. Reserve the actual day
      // before the thumbnail or native status mutation, without releasing earlier reservations.
      await this.reserveToday(organizationId, batch, false);
      const observed = await this.observe(organizationId, item);
      item = observed.item;
      if (observed.video.privacy === 'public') {
        await this.publicConfirmed(organizationId, item, observed.video);
        return;
      }
      if (observed.video.privacy !== 'private' || observed.video.publishAt)
        throw new StudioDistributionProviderError(
          'remote_schedule_changed',
          true
        );
      if (
        ['failed', 'rejected', 'deleted'].includes(observed.video.uploadStatus)
      )
        throw new StudioDistributionProviderError('processing_failed', true);
      if (snapshot.youtube.thumbnail && !item.thumbnailApplied) {
        item = await this.repository.claim(
          organizationId,
          item,
          'thumbnail_setting'
        );
        try {
          await this.youtube.thumbnail(
            observed.connection,
            await this.session(item),
            item.youtubeVideoId!,
            snapshot.youtube.thumbnail.path
          );
          await this.repository.mutate(
            organizationId,
            item,
            {
              phase: 'uploaded_private',
              thumbnailApplied: true,
              attemptId: null,
              leaseUntil: null,
              nextActionAt: new Date(),
            },
            'thumbnail_applied'
          );
        } catch (error) {
          await this.fail(organizationId, item, error, true);
        }
        return;
      }
      if (item.publishAt.getTime() <= Date.now() + minute)
        throw new StudioDistributionProviderError('schedule_expired', true);
      item = await this.repository.claim(
        organizationId,
        item,
        'schedule_setting'
      );
      try {
        await this.youtube.schedule(
          observed.connection,
          item.youtubeVideoId!,
          item.publishAt.toISOString(),
          item.madeForKids,
          item.containsSyntheticMedia
        );
        await this.repository.mutate(
          organizationId,
          item,
          {
            phase: 'schedule_verifying',
            attemptId: null,
            leaseUntil: null,
            nextActionAt: new Date(),
          },
          'schedule_requested'
        );
      } catch (error) {
        await this.fail(organizationId, item, error, true);
      }
      return;
    }
    if (['schedule_verifying', 'youtube_scheduled'].includes(item.phase)) {
      const observed = await this.observe(organizationId, item);
      item = observed.item;
      if (observed.video.privacy === 'public') {
        await this.publicConfirmed(organizationId, item, observed.video);
        return;
      }
      if (
        ['failed', 'rejected', 'deleted'].includes(observed.video.uploadStatus)
      )
        throw new StudioDistributionProviderError('processing_failed', true);
      if (
        observed.video.privacy !== 'private' ||
        Date.parse(observed.video.publishAt || '') !== item.publishAt.getTime()
      )
        throw new StudioDistributionProviderError(
          'remote_schedule_changed',
          true
        );
      if (Date.now() > item.publishAt.getTime() + day)
        throw new StudioDistributionProviderError('public_not_confirmed', true);
      await this.repository.mutate(
        organizationId,
        item,
        {
          phase: 'youtube_scheduled',
          errorCode: null,
          nextActionAt: new Date(
            Math.max(item.publishAt.getTime(), Date.now() + 15 * minute)
          ),
        },
        'schedule_confirmed'
      );
      return;
    }
    if (item.phase === 'youtube_public' && item.instagramIntegrationId) {
      await this.repository.mutate(
        organizationId,
        item,
        {
          phase: 'mirror_waiting',
          nextActionAt: new Date(
            Math.max(Date.now(), item.publishAt.getTime())
          ),
        },
        'mirror_waiting'
      );
      return;
    }
    if (item.phase === 'mirror_waiting') {
      await this.reserveToday(organizationId, batch, false);
      const targetKey = hash(snapshot.instagram!.internalId);
      const slot = await this.repository.reserveMirror(
        organizationId,
        item,
        targetKey,
        hash(
          `youtube:${item.youtubeVideoId}:instagram:${
            snapshot.instagram!.internalId
          }`
        )
      );
      if (slot.duplicate)
        throw new StudioDistributionProviderError('duplicate_mirror', true);
      if (!slot.allowed) {
        await this.repository.mutate(
          organizationId,
          item,
          { nextActionAt: slot.nextAt },
          'mirror_spacing'
        );
        return;
      }
      item = await this.repository.item(organizationId, item.id);
      const observed = await this.observe(organizationId, item);
      item = observed.item;
      if (
        observed.video.privacy !== 'public' ||
        observed.video.uploadStatus !== 'processed'
      )
        throw new StudioDistributionProviderError('public_not_confirmed', true);
      const measured = await this.unchanged(organizationId, item);
      if (
        measured.width > measured.height ||
        measured.durationSeconds < 3 ||
        measured.durationSeconds > 180 ||
        observed.video.durationSeconds < 3 ||
        observed.video.durationSeconds > 180
      )
        throw new StudioDistributionProviderError('short_unverified', true);
      try {
        await this.assertInstagramCover(organizationId, snapshot);
      } catch {
        throw new StudioDistributionProviderError(
          'instagram_image_invalid',
          true
        );
      }
      const connection = await this.connections.get(
        organizationId,
        item.instagramIntegrationId!,
        this.instagram.providers,
        snapshot.instagram!.internalId
      );
      await this.instagram.checkQuota(connection);
      item = await this.repository.claim(
        organizationId,
        item,
        'mirror_creating'
      );
      try {
        const containerId = await this.instagram.create(connection, snapshot);
        await this.repository.mutate(
          organizationId,
          item,
          {
            phase: 'mirror_processing',
            instagramContainerId: containerId,
            attemptId: null,
            leaseUntil: null,
            nextActionAt: new Date(Date.now() + minute),
          },
          'mirror_container_saved'
        );
      } catch (error) {
        await this.fail(organizationId, item, error, true);
      }
      return;
    }
    if (item.phase === 'mirror_processing') {
      if (item.containerChecks >= 5)
        throw new StudioDistributionProviderError('container_pending', true);
      item = await this.repository.mutate(
        organizationId,
        item,
        { containerChecks: { increment: 1 } },
        'mirror_container_observe'
      );
      const connection = await this.connections.get(
        organizationId,
        item.instagramIntegrationId!,
        this.instagram.providers,
        snapshot.instagram!.internalId
      );
      const status = await this.instagram.container(
        connection,
        item.instagramContainerId!
      );
      if (status === 'PUBLISHED') {
        await this.mirrorPublished(organizationId, item);
        return;
      }
      if (['ERROR', 'EXPIRED'].includes(status))
        throw new StudioDistributionProviderError('container_failed', true);
      if (status !== 'FINISHED') {
        await this.repository.mutate(
          organizationId,
          item,
          { nextActionAt: new Date(Date.now() + minute) },
          'mirror_processing'
        );
        return;
      }
      const observed = await this.observe(organizationId, item);
      item = observed.item;
      if (
        observed.video.privacy !== 'public' ||
        observed.video.uploadStatus !== 'processed'
      )
        throw new StudioDistributionProviderError('public_not_confirmed', true);
      await this.instagram.checkQuota(connection);
      item = await this.repository.claim(
        organizationId,
        item,
        'mirror_publishing'
      );
      try {
        const mediaId = await this.instagram.publish(
          connection,
          item.instagramContainerId!
        );
        await this.mirrorPublished(organizationId, item, mediaId);
      } catch (error) {
        await this.fail(organizationId, item, error, true);
      }
    }
  }

  private async mirrorPublished(
    organizationId: string,
    item: StoredItem,
    mediaId?: string
  ) {
    let url: string | undefined;
    if (mediaId) {
      try {
        const connection = await this.connections.get(
          organizationId,
          item.instagramIntegrationId!,
          this.instagram.providers,
          this.snapshot(item).instagram!.internalId
        );
        url = (await this.instagram.media(connection, mediaId)).url;
      } catch {
        /* The publish response confirms the id, even if permalink lookup fails. */
      }
    }
    await this.repository.published(
      organizationId,
      item,
      'instagram',
      mediaId,
      url
    );
    const publishedAt = new Date();
    await this.repository.mutate(
      organizationId,
      item,
      {
        phase: 'mirrored',
        instagramMediaId: mediaId || item.instagramMediaId,
        instagramPublishedAt: publishedAt,
        instagramUrl: url || item.instagramUrl,
        attemptId: null,
        leaseUntil: null,
        nextActionAt: null,
        errorCode: null,
      },
      'mirror_published_confirmed'
    );
    await this.repository.releaseMirror(organizationId, item.id, publishedAt);
  }

  async reconcile(
    organizationId: string,
    id: string,
    body: StudioDistributionRevisionDto
  ) {
    let item = await this.repository.item(organizationId, id);
    if (item.revision !== body.revision)
      throw new ConflictException('O item mudou. Atualize a grade.');
    // A successful mirror is terminal. Never reset it to youtube_public and
    // accidentally authorize another container for the same item.
    if (
      item.instagramPublishedAt ||
      ['mirrored', 'cancelled'].includes(item.phase)
    )
      return this.get(organizationId, item.batchId);
    if (item.leaseUntil && item.leaseUntil.getTime() > Date.now())
      throw new ConflictException(
        'Há uma etapa em execução. Aguarde a consulta da grade.'
      );
    const batch = await this.repository.batch(organizationId, item.batchId);
    if (!batch.confirmedAt)
      throw new BadRequestException(
        'Confirme o lote antes de consultar operações remotas.'
      );
    const readAllowance = batch.items.reduce(
      (units, current) =>
        units +
        50 +
        (this.snapshot(current).youtube.thumbnail ? 50 : 0) +
        10 +
        120,
      0
    );
    await this.repository.ensureUploadDay(organizationId, batch.id, {
      day: studioQuotaDay(new Date()),
      uploads: 0,
      otherUnits: readAllowance,
      timezone: 'America/Los_Angeles',
    });
    const snapshot = this.snapshot(item);
    let monitor = false;
    try {
      if (item.phase === 'failed') {
        // A definitive failure released publication allowance. Reading may
        // refresh facts but must not reactivate an unreserved automatic action.
        if (item.youtubeVideoId) await this.observe(organizationId, item);
        return this.get(organizationId, item.batchId);
      }
      const mirrorAttempt =
        item.attemptStage?.startsWith('mirror_') || !!item.instagramContainerId;
      if (mirrorAttempt && !item.instagramContainerId) {
        return this.get(organizationId, item.batchId);
      }
      if (
        item.instagramContainerId &&
        [
          'uncertain',
          'blocked',
          'mirror_publishing',
          'mirror_processing',
        ].includes(item.phase)
      ) {
        const connection = await this.connections.get(
          organizationId,
          item.instagramIntegrationId!,
          this.instagram.providers,
          snapshot.instagram!.internalId
        );
        const status = await this.instagram.container(
          connection,
          item.instagramContainerId
        );
        if (status === 'PUBLISHED')
          await this.mirrorPublished(
            organizationId,
            item,
            item.instagramMediaId || undefined
          );
        else if (['ERROR', 'EXPIRED'].includes(status))
          await this.fail(
            organizationId,
            item,
            new StudioDistributionProviderError('container_failed', true)
          );
        // FINISHED is not proof that a timed-out media_publish did not run.
      } else if (item.youtubeVideoId) {
        const observed = await this.observe(organizationId, item);
        item = observed.item;
        if (
          observed.video.privacy === 'public' &&
          observed.video.uploadStatus === 'processed'
        ) {
          await this.publicConfirmed(organizationId, item, observed.video);
          monitor = !!item.instagramIntegrationId;
        } else if (
          observed.video.privacy === 'private' &&
          Date.parse(observed.video.publishAt || '') ===
            item.publishAt.getTime()
        ) {
          await this.repository.mutate(
            organizationId,
            item,
            {
              phase: 'youtube_scheduled',
              nextActionAt: new Date(
                Math.max(Date.now(), item.publishAt.getTime())
              ),
              attemptId: null,
              leaseUntil: null,
              errorCode: null,
            },
            'schedule_reconciled'
          );
          monitor = true;
        }
      } else if (item.uploadSession) {
        const connection = await this.connections.get(
          organizationId,
          item.integrationId,
          this.youtube.providers,
          snapshot.youtube.internalId
        );
        const result = await this.youtube.resume(
          connection,
          await this.session(item),
          true
        );
        if (result.status === 'completed' && result.postId) {
          item = await this.repository.mutate(
            organizationId,
            item,
            {
              youtubeVideoId: result.postId,
              attemptId: null,
              leaseUntil: null,
            },
            'upload_id_reconciled'
          );
          const observed = await this.observe(organizationId, item);
          item = observed.item;
          if (
            observed.video.privacy === 'public' &&
            observed.video.uploadStatus === 'processed'
          ) {
            await this.publicConfirmed(organizationId, item, observed.video);
            monitor = !!item.instagramIntegrationId;
          } else {
            await this.repository.mutate(
              organizationId,
              item,
              {
                phase: 'blocked',
                errorCode: 'private_without_schedule',
                nextActionAt: null,
              },
              'private_upload_reconciled'
            );
          }
        }
        // No new insert, chunk, thumbnail, schedule update or media_publish is made here.
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        this.error(
          error instanceof StudioDistributionProviderError
            ? error.code
            : 'remote_uncertain'
        )
      );
    }
    if (monitor && !['confirmed', 'running'].includes(batch.state)) {
      await this.repository.resumeMonitoring(organizationId, batch.id);
      await this.startWorkflow(
        await this.repository.batch(organizationId, batch.id)
      );
    }
    return this.get(organizationId, batch.id);
  }
}
