import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudioDistributionItem } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { countStudioDistributionReservations } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.distribution.count';
import type {
  StudioDistributionBudget,
  StudioDistributionQuotaEstimate,
  StudioDistributionSnapshot,
} from '@gitroom/helpers/studio/studio.distribution.types';

export type DistributionPlannedRow = Pick<
  StudioDistributionItem,
  | 'projectId'
  | 'projectRevision'
  | 'packageHash'
  | 'integrationId'
  | 'integrationName'
  | 'mediaId'
  | 'title'
  | 'publishAt'
  | 'madeForKids'
  | 'containsSyntheticMedia'
  | 'instagramIntegrationId'
  | 'instagramIntegrationName'
> & { snapshot: StudioDistributionSnapshot };

const includeBatch = {
  items: { orderBy: { publishAt: 'asc' as const } },
  quotaReservations: { include: { quotaDay: true } },
};
export type DistributionStoredBatch = Prisma.StudioDistributionBatchGetPayload<{
  include: typeof includeBatch;
}>;

@Injectable()
export class StudioDistributionRepository {
  constructor(
    private readonly db: PrismaRepository<
      | 'studioDistributionBatch'
      | 'studioDistributionItem'
      | 'studioDistributionQuotaDay'
      | 'studioProject'
      | 'integration'
      | 'media'
      | 'organization'
    >,
    private readonly transaction: PrismaTransaction
  ) {}

  connections(organizationId: string) {
    return this.db.model.integration.findMany({
      where: { organizationId, deletedAt: null, type: 'social' },
      select: {
        id: true,
        name: true,
        internalId: true,
        providerIdentifier: true,
        disabled: true,
        refreshNeeded: true,
        inBetweenSteps: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  media(organizationId: string, ids: string[]) {
    return this.db.model.media.findMany({
      where: {
        organizationId,
        id: { in: ids },
        deletedAt: null,
        status: 'ready',
      },
      select: { id: true, path: true, name: true },
    });
  }

  billing(organizationId: string) {
    return this.db.model.organization.findFirstOrThrow({
      where: { id: organizationId },
      select: {
        createdAt: true,
        subscription: { select: { createdAt: true, subscriptionTier: true } },
      },
    });
  }

  async batch(
    organizationId: string,
    id: string
  ): Promise<DistributionStoredBatch> {
    const batch = await this.db.model.studioDistributionBatch.findFirst({
      where: { id, organizationId },
      include: includeBatch,
    });
    if (!batch)
      throw new NotFoundException('Lote não encontrado nesta organização.');
    return batch;
  }

  batches(organizationId: string) {
    return this.db.model.studioDistributionBatch.findMany({
      where: { organizationId },
      include: includeBatch,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async item(organizationId: string, id: string) {
    const item = await this.db.model.studioDistributionItem.findFirst({
      where: { id, organizationId },
    });
    if (!item)
      throw new NotFoundException('Item não encontrado nesta organização.');
    return item;
  }

  async plan(
    organizationId: string,
    actorId: string,
    timezone: string,
    quotaScope: string,
    quotaBudget: StudioDistributionBudget,
    quotaEstimate: StudioDistributionQuotaEstimate[],
    items: DistributionPlannedRow[]
  ) {
    return this.transaction.model.$transaction(async (tx) => {
      const batch = await tx.studioDistributionBatch.create({
        data: {
          organizationId,
          timezone,
          quotaScope,
          quotaBudget: quotaBudget as unknown as Prisma.InputJsonObject,
          quotaEstimate: quotaEstimate as unknown as Prisma.InputJsonArray,
          mirrorEnabled: items.some((item) => !!item.instagramIntegrationId),
        },
      });
      for (const item of items) {
        const row = await tx.studioDistributionItem.create({
          data: {
            ...item,
            organizationId,
            batchId: batch.id,
            snapshot: item.snapshot as unknown as Prisma.InputJsonObject,
          },
        });
        await tx.studioEvent.create({
          data: {
            organizationId,
            projectId: item.projectId,
            revision: item.projectRevision,
            actorId,
            action: 'distribution:planned',
            detail: { batchId: batch.id, itemId: row.id },
          },
        });
      }
      return batch.id;
    });
  }

  private async reserveQuota(
    tx: Prisma.TransactionClient,
    batchId: string,
    scope: string,
    budget: StudioDistributionBudget,
    estimates: StudioDistributionQuotaEstimate[]
  ) {
    // A global project/day row prevents organizations sharing an OAuth project
    // from spending the same local allowance concurrently. No official balance is implied.
    for (const estimate of [...estimates].sort((a, b) =>
      a.day.localeCompare(b.day)
    )) {
      const day = await tx.studioDistributionQuotaDay.upsert({
        where: { scope_day: { scope, day: estimate.day } },
        create: { scope, day: estimate.day },
        update: {},
      });
      const prior = await tx.studioDistributionQuotaReservation.findUnique({
        where: { batchId_quotaDayId: { batchId, quotaDayId: day.id } },
      });
      const uploads = Math.max(0, estimate.uploads - (prior?.uploads || 0));
      const otherUnits = Math.max(
        0,
        estimate.otherUnits - (prior?.otherUnits || 0)
      );
      if (!uploads && !otherUnits) continue;
      const reserved = await tx.studioDistributionQuotaDay.updateMany({
        where: {
          id: day.id,
          uploadsReserved: { lte: budget.uploads - uploads },
          otherUnitsReserved: { lte: budget.otherUnits - otherUnits },
        },
        data: {
          uploadsReserved: { increment: uploads },
          otherUnitsReserved: { increment: otherUnits },
        },
      });
      if (reserved.count !== 1)
        throw new ConflictException(
          'O orçamento local de cota não comporta o lote inteiro. Nenhum upload foi iniciado. Reduza o lote ou confira os limites no Google Cloud.'
        );
      await tx.studioDistributionQuotaReservation.upsert({
        where: { batchId_quotaDayId: { batchId, quotaDayId: day.id } },
        create: { batchId, quotaDayId: day.id, uploads, otherUnits },
        update: {
          uploads: { increment: uploads },
          otherUnits: { increment: otherUnits },
        },
      });
    }
  }

  async confirm(
    organizationId: string,
    id: string,
    revision: number,
    actorId: string,
    estimates: StudioDistributionQuotaEstimate[],
    allowance?: { from: Date; maximum: number }
  ) {
    await this.transaction.model.$transaction(async (tx) => {
      const locked = await tx.studioDistributionBatch.updateMany({
        where: { id, organizationId, revision, state: 'planned' },
        data: {
          state: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy: actorId,
          revision: { increment: 1 },
          workflowId: `studio_distribution_${id}_r${revision + 1}`,
        },
      });
      if (locked.count !== 1)
        throw new ConflictException(
          'O lote mudou ou já foi confirmado. Atualize a grade.'
        );
      const batch = await tx.studioDistributionBatch.findFirstOrThrow({
        where: { id, organizationId },
        include: { items: true },
      });
      for (const item of [...batch.items].sort((a, b) =>
        a.projectId.localeCompare(b.projectId)
      )) {
        const project = await tx.studioProject.updateMany({
          where: {
            id: item.projectId,
            organizationId,
            revision: item.projectRevision,
            approvals: { path: ['package', 'hash'], equals: item.packageHash },
          },
          data: { updatedAt: new Date() },
        });
        if (project.count !== 1)
          throw new ConflictException(
            'Um projeto ou sua aprovação mudou. Prepare outro plano com a versão revisada.'
          );
      }
      if (allowance) {
        // Serialize native reservations within the organization before counting.
        await tx.organization.update({
          where: { id: organizationId },
          data: { updatedAt: new Date() },
        });
        const posts = await tx.post.findMany({
          where: {
            organizationId,
            publishDate: { gte: allowance.from },
            OR: [{ state: 'QUEUE', deletedAt: null }, { state: 'PUBLISHED' }],
          },
          select: { id: true },
        });
        const reserved = await countStudioDistributionReservations(
          tx,
          organizationId,
          allowance.from
        );
        const requested = batch.items
          .filter((item) => item.publishAt >= allowance.from)
          .reduce(
            (total, item) => total + 1 + (item.instagramIntegrationId ? 1 : 0),
            0
          );
        if (posts.length + reserved + requested > allowance.maximum)
          throw new ConflictException(
            'O limite de publicações do plano não comporta o lote inteiro e as reservas existentes.'
          );
      }
      await this.reserveQuota(
        tx,
        id,
        batch.quotaScope,
        batch.quotaBudget as unknown as StudioDistributionBudget,
        estimates
      );
      for (const item of batch.items) {
        const targets = [
          { integrationId: item.integrationId, platform: 'youtube' },
          ...(item.instagramIntegrationId
            ? [
                {
                  integrationId: item.instagramIntegrationId,
                  platform: 'instagram',
                },
              ]
            : []),
        ];
        const publications = [];
        for (const target of targets) {
          const existing = await tx.studioPublication.findFirst({
            where: {
              organizationId,
              projectId: item.projectId,
              packageHash: item.packageHash,
              integrationId: target.integrationId,
            },
          });
          const state =
            target.platform === 'youtube'
              ? 'native_reserved'
              : 'mirror_waiting';
          if (existing) {
            const post = await tx.post.findFirst({
              where: { id: existing.postId, organizationId },
              select: { id: true },
            });
            if (existing.state !== 'failed' || post)
              throw new ConflictException(
                'Este pacote já tem rascunho ou distribuição reservada para o canal. Use o registro existente; não crie outro envio.'
              );
            const retried = await tx.studioPublication.updateMany({
              where: { id: existing.id, organizationId, state: 'failed' },
              data: { state, error: null },
            });
            if (!retried.count)
              throw new ConflictException(
                'Outra execução já reservou este pacote.'
              );
            publications.push(existing);
          } else
            publications.push(
              await tx.studioPublication.create({
                data: {
                  organizationId,
                  projectId: item.projectId,
                  revision: item.projectRevision,
                  packageHash: item.packageHash,
                  ...target,
                  postId: randomUUID(),
                  state,
                },
              })
            );
        }
        await tx.studioDistributionItem.update({
          where: { id: item.id },
          data: {
            phase: 'reserved',
            revision: { increment: 1 },
            nextActionAt: new Date(),
            publicationId: publications[0].id,
            postId: publications[0].postId,
            instagramPublicationId: publications[1]?.id,
            instagramPostId: publications[1]?.postId,
          },
        });
        await tx.studioEvent.create({
          data: {
            organizationId,
            projectId: item.projectId,
            revision: item.projectRevision,
            actorId,
            action: 'distribution:confirmed',
            detail: {
              batchId: id,
              itemId: item.id,
              publishAt: item.publishAt.toISOString(),
              timezone: batch.timezone,
              integrationId: item.integrationId,
              instagramIntegrationId: item.instagramIntegrationId,
              madeForKids: item.madeForKids,
              containsSyntheticMedia: item.containsSyntheticMedia,
              packageHash: item.packageHash,
            },
          },
        });
      }
    });
    return this.batch(organizationId, id);
  }

  async ensureUploadDay(
    organizationId: string,
    id: string,
    estimate: StudioDistributionQuotaEstimate
  ) {
    await this.transaction.model.$transaction(async (tx) => {
      const lock = await tx.studioDistributionBatch.updateMany({
        where: {
          id,
          organizationId,
          confirmedAt: { not: null },
          state: { not: 'cancelled' },
        },
        data: { updatedAt: new Date() },
      });
      if (lock.count !== 1)
        throw new ConflictException('O lote não está ativo.');
      const batch = await tx.studioDistributionBatch.findFirstOrThrow({
        where: { id, organizationId },
      });
      await this.reserveQuota(
        tx,
        id,
        batch.quotaScope,
        batch.quotaBudget as unknown as StudioDistributionBudget,
        [estimate]
      );
    });
  }

  async batchState(
    organizationId: string,
    id: string,
    state: string,
    errorCode?: string,
    preflight = false
  ) {
    await this.db.model.studioDistributionBatch.updateMany({
      where: { id, organizationId },
      data: {
        state,
        errorCode: errorCode || null,
        ...(preflight ? { preflightAt: new Date() } : {}),
      },
    });
  }

  async resumeMonitoring(organizationId: string, id: string) {
    return this.transaction.model.$transaction(async (tx) => {
      const batch = await tx.studioDistributionBatch.findFirstOrThrow({
        where: { id, organizationId, confirmedAt: { not: null } },
      });
      const updated = await tx.studioDistributionBatch.updateMany({
        where: { id, organizationId, revision: batch.revision },
        data: {
          state: 'running',
          revision: { increment: 1 },
          workflowId: `studio_distribution_${id}_r${batch.revision + 1}`,
        },
      });
      if (!updated.count)
        throw new ConflictException('A monitoração já está sendo retomada.');
    });
  }

  async mutate(
    organizationId: string,
    item: StudioDistributionItem,
    data: Prisma.StudioDistributionItemUpdateManyMutationInput,
    action: string,
    actorId = 'system'
  ) {
    return this.transaction.model.$transaction(async (tx) => {
      const updated = await tx.studioDistributionItem.updateMany({
        where: {
          id: item.id,
          organizationId,
          revision: item.revision,
          phase: item.phase,
          attemptId: item.attemptId,
        },
        data: { ...data, revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'O item mudou ou outra execução reservou esta etapa.'
        );
      await tx.studioEvent.create({
        data: {
          organizationId,
          projectId: item.projectId,
          revision: item.projectRevision,
          actorId,
          action: `distribution:${action}`,
          detail: { batchId: item.batchId, itemId: item.id },
        },
      });
      return tx.studioDistributionItem.findFirstOrThrow({
        where: { id: item.id, organizationId },
      });
    });
  }

  async claim(
    organizationId: string,
    item: StudioDistributionItem,
    phase: string
  ) {
    return this.mutate(
      organizationId,
      item,
      {
        phase,
        attemptId: randomUUID(),
        attemptStage: phase,
        leaseUntil: new Date(Date.now() + 20 * 60 * 1000),
        nextActionAt: new Date(Date.now() + 20 * 60 * 1000),
        errorCode: null,
      },
      `reserved:${phase}`
    );
  }

  async reserveMirror(
    organizationId: string,
    item: StudioDistributionItem,
    targetKey: string,
    mirrorKey: string
  ) {
    return this.transaction.model.$transaction(async (tx) => {
      const gate = await tx.studioDistributionMirrorGate.upsert({
        where: { targetKey },
        create: { organizationId, targetKey },
        update: { updatedAt: new Date() },
      });
      const current = await tx.studioDistributionMirrorGate.findUniqueOrThrow({
        where: { id: gate.id },
      });
      if (current.activeItemId && current.activeItemId !== item.id)
        return { allowed: false, nextAt: new Date(Date.now() + 60000) };
      const recent = await tx.post.findFirst({
        where: {
          organizationId,
          integrationId: item.instagramIntegrationId!,
          state: 'PUBLISHED',
          deletedAt: null,
        },
        orderBy: { publishDate: 'desc' },
        select: { publishDate: true },
      });
      const last = Math.max(
        current.lastPublishedAt?.getTime() || 0,
        recent?.publishDate.getTime() || 0
      );
      const nextAt = new Date(last + 60 * 60 * 1000);
      if (nextAt.getTime() > Date.now()) return { allowed: false, nextAt };
      const duplicate = await tx.studioDistributionItem.findFirst({
        where: { mirrorKey, NOT: { id: item.id } },
        select: { id: true },
      });
      if (duplicate)
        return { allowed: false, duplicate: true, nextAt: new Date() };
      const changed = await tx.studioDistributionItem.updateMany({
        where: {
          id: item.id,
          organizationId,
          phase: 'mirror_waiting',
          revision: item.revision,
        },
        data: { mirrorKey, revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Outro processo reservou este espelhamento.'
        );
      await tx.studioDistributionMirrorGate.update({
        where: { id: gate.id },
        data: { activeItemId: item.id, organizationId },
      });
      return { allowed: true, nextAt: new Date() };
    });
  }

  async releaseMirror(
    organizationId: string,
    itemId: string,
    publishedAt?: Date
  ) {
    await this.transaction.model.$transaction(async (tx) => {
      await tx.studioDistributionMirrorGate.updateMany({
        where: { organizationId, activeItemId: itemId },
        data: {
          activeItemId: null,
          ...(publishedAt ? { lastPublishedAt: publishedAt } : {}),
        },
      });
    });
  }

  async releaseUnstartedPublications(
    organizationId: string,
    item: StudioDistributionItem
  ) {
    if (
      item.youtubeVideoId ||
      item.uploadSession ||
      item.instagramContainerId ||
      item.instagramMediaId
    )
      return;
    await this.transaction.model.$transaction(async (tx) => {
      await tx.studioPublication.updateMany({
        where: {
          organizationId,
          id: {
            in: [item.publicationId, item.instagramPublicationId].filter(
              Boolean
            ) as string[],
          },
          state: { in: ['native_reserved', 'mirror_waiting'] },
        },
        data: { state: 'failed' },
      });
    });
  }

  async published(
    organizationId: string,
    item: StudioDistributionItem,
    platform: 'youtube' | 'instagram',
    externalId?: string,
    url?: string
  ) {
    await this.transaction.model.$transaction(async (tx) => {
      const current = await tx.studioDistributionItem.findFirstOrThrow({
        where: { id: item.id, organizationId },
      });
      const snapshot =
        current.snapshot as unknown as StudioDistributionSnapshot;
      const publicationId =
        platform === 'youtube'
          ? current.publicationId
          : current.instagramPublicationId;
      const postId =
        platform === 'youtube' ? current.postId : current.instagramPostId;
      if (publicationId)
        await tx.studioPublication.updateMany({
          where: { id: publicationId, organizationId },
          data: {
            state: externalId ? 'published' : 'published_external_id_unknown',
            error: null,
          },
        });
      if (externalId && postId)
        await tx.post.upsert({
          where: { id: postId },
          update: {},
          create: {
            id: postId,
            organizationId,
            integrationId:
              platform === 'youtube'
                ? current.integrationId
                : current.instagramIntegrationId!,
            state: 'PUBLISHED',
            publishDate:
              platform === 'youtube'
                ? current.publishAt
                : current.instagramPublishedAt || new Date(),
            content:
              platform === 'youtube'
                ? snapshot.youtube.description
                : snapshot.instagram!.caption,
            title: current.title,
            group: current.batchId,
            releaseId: externalId,
            releaseURL: url,
            creationMethod: 'WEB',
            settings: JSON.stringify({ __type: platform }),
            image: JSON.stringify([
              { id: snapshot.media.id, path: snapshot.media.path },
            ]),
          },
        });
    });
  }

  async cancel(
    organizationId: string,
    id: string,
    revision: number,
    actorId: string
  ) {
    await this.transaction.model.$transaction(async (tx) => {
      const locked = await tx.studioDistributionBatch.updateMany({
        where: { id, organizationId, revision },
        data: { revision: { increment: 1 } },
      });
      if (!locked.count)
        throw new ConflictException('O lote mudou. Atualize a grade.');
      const items = await tx.studioDistributionItem.findMany({
        where: {
          batchId: id,
          organizationId,
          phase: { in: ['planned', 'reserved'] },
        },
      });
      for (const item of items) {
        const cancelled = await tx.studioDistributionItem.updateMany({
          where: {
            id: item.id,
            organizationId,
            revision: item.revision,
            phase: { in: ['planned', 'reserved'] },
          },
          data: {
            phase: 'cancelled',
            nextActionAt: null,
            revision: { increment: 1 },
          },
        });
        if (!cancelled.count) continue;
        await tx.studioPublication.updateMany({
          where: {
            organizationId,
            id: {
              in: [item.publicationId, item.instagramPublicationId].filter(
                Boolean
              ) as string[],
            },
          },
          data: { state: 'failed' },
        });
        await tx.studioEvent.create({
          data: {
            organizationId,
            projectId: item.projectId,
            revision: item.projectRevision,
            actorId,
            action: 'distribution:cancelled',
            detail: { batchId: id, itemId: item.id },
          },
        });
      }
      const active = await tx.studioDistributionItem.count({
        where: { batchId: id, organizationId, phase: { not: 'cancelled' } },
      });
      if (!active)
        await tx.studioDistributionBatch.update({
          where: { id },
          data: { state: 'cancelled' },
        });
    });
    return this.batch(organizationId, id);
  }
}
