import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaRepository, PrismaTransaction } from '../prisma.service';
import type {
  StudioApprovals,
  StudioDocument,
  StudioPlatform,
} from '@gitroom/helpers/studio/studio.types';
import { StudioOutcomeDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';

const relations = {
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 100,
    select: {
      id: true,
      revision: true,
      action: true,
      actorId: true,
      createdAt: true,
    },
  },
  publications: { orderBy: { createdAt: 'desc' as const } },
  outcomes: { orderBy: { occurredAt: 'desc' as const } },
};

@Injectable()
export class StudioRepository {
  constructor(
    private _project: PrismaRepository<'studioProject'>,
    private _publication: PrismaRepository<'studioPublication'>,
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _media: PrismaRepository<'media'>,
    private _transaction: PrismaTransaction
  ) {}

  list(org: string) {
    return this._project.model.studioProject.findMany({
      where: { organizationId: org },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: relations,
    });
  }

  get(org: string, id: string) {
    return this._project.model.studioProject.findFirst({
      where: { id, organizationId: org },
      include: relations,
    });
  }

  async event(org: string, projectId: string, eventId: string) {
    const project = await this._project.model.studioProject.findFirst({
      where: { id: projectId, organizationId: org },
      select: {
        events: { where: { id: eventId, organizationId: org }, take: 1 },
      },
    });
    return project?.events[0];
  }

  create(
    org: string,
    actorId: string,
    title: string,
    document: StudioDocument
  ) {
    return this._project.model.studioProject.create({
      data: {
        organizationId: org,
        title,
        document: document as unknown as Prisma.InputJsonValue,
        events: {
          create: {
            revision: 1,
            action: 'created',
            actorId,
            detail: {},
          },
        },
      },
      include: relations,
    });
  }

  async updateDocument(
    org: string,
    id: string,
    revision: number,
    title: string,
    document: StudioDocument,
    approvals: StudioApprovals,
    actorId: string,
    action: string
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      const changed = await tx.studioProject.updateMany({
        where: { id, organizationId: org, revision },
        data: {
          title,
          document: document as unknown as Prisma.InputJsonValue,
          approvals: approvals as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'O projeto mudou. Atualize a página antes de salvar.'
        );
      }
      await tx.studioEvent.create({
        data: {
          organizationId: org,
          projectId: id,
          revision: revision + 1,
          action,
          actorId,
          detail: {},
        },
      });
      return tx.studioProject.findFirst({
        where: { id, organizationId: org },
        include: relations,
      });
    });
  }

  async approve(
    org: string,
    id: string,
    revision: number,
    approvals: StudioApprovals,
    actorId: string,
    stage: string
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      const changed = await tx.studioProject.updateMany({
        where: { id, organizationId: org, revision },
        data: { approvals: approvals as unknown as Prisma.InputJsonValue },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'O conteúdo mudou durante a aprovação. Revise a versão atual.'
        );
      }
      const snapshot = await tx.studioProject.findFirstOrThrow({
        where: { id, organizationId: org },
        select: { document: true },
      });
      await tx.studioEvent.create({
        data: {
          organizationId: org,
          projectId: id,
          revision,
          action: `approved:${stage}`,
          actorId,
          detail: {
            approval: approvals[stage as keyof StudioApprovals],
            documentSnapshot: snapshot.document,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return tx.studioProject.findFirst({
        where: { id, organizationId: org },
        include: relations,
      });
    });
  }

  integrations(org: string) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        disabled: false,
        refreshNeeded: false,
        inBetweenSteps: false,
      },
      select: { id: true, name: true, providerIdentifier: true },
      orderBy: { name: 'asc' },
    });
  }

  media(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        id: { in: ids },
        deletedAt: null,
        status: 'ready',
      },
      select: {
        id: true,
        name: true,
        path: true,
        thumbnail: true,
        alt: true,
        type: true,
      },
    });
  }

  posts(org: string, ids: string[]) {
    return this._post.model.post.findMany({
      where: { organizationId: org, id: { in: ids } },
      select: {
        id: true,
        state: true,
        releaseURL: true,
        publishDate: true,
        error: true,
        deletedAt: true,
      },
    });
  }

  // Reserve before calling PostsService. The stable post id survives an interrupted
  // request, and a unique package/account key prevents duplicate drafts on retries.
  async claimDraft(
    org: string,
    projectId: string,
    revision: number,
    packageHash: string,
    platform: StudioPlatform,
    integrationId: string,
    actorId: string
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      const locked = await tx.studioProject.updateMany({
        where: {
          id: projectId,
          organizationId: org,
          revision,
          approvals: { path: ['package', 'hash'], equals: packageHash },
        },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1) {
        throw new ConflictException(
          'A aprovação do pacote mudou. Revise a versão atual.'
        );
      }
      const existing = await tx.studioPublication.findFirst({
        where: { organizationId: org, projectId, packageHash, integrationId },
      });
      if (existing) {
        const post = await tx.post.findFirst({
          where: { id: existing.postId, organizationId: org },
          select: { id: true },
        });
        if (!post && existing.state === 'failed') {
          const claim = await tx.studioPublication.updateMany({
            where: { id: existing.id, organizationId: org, state: 'failed' },
            data: { state: 'creating', error: null },
          });
          return { publication: existing, claimed: claim.count === 1 };
        }
        return { publication: existing, claimed: false };
      }
      const publication = await tx.studioPublication.create({
        data: {
          organizationId: org,
          projectId,
          revision,
          packageHash,
          platform,
          integrationId,
          postId: randomUUID(),
        },
      });
      await tx.studioEvent.create({
        data: {
          organizationId: org,
          projectId,
          revision,
          action: 'draft:reserved',
          actorId,
          detail: { publicationId: publication.id, integrationId },
        },
      });
      return { publication, claimed: true };
    });
  }

  async finishDraft(org: string, id: string, error?: string) {
    await this._publication.model.studioPublication.updateMany({
      where: { id, organizationId: org },
      data: { state: error ? 'failed' : 'draft', error: error || null },
    });
  }

  async outcome(
    org: string,
    projectId: string,
    actorId: string,
    dto: StudioOutcomeDto
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      const locked = await tx.studioProject.updateMany({
        where: { id: projectId, organizationId: org },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1)
        throw new NotFoundException('Projeto não encontrado.');
      const project = await tx.studioProject.findFirstOrThrow({
        where: { id: projectId, organizationId: org },
        select: { id: true, revision: true },
      });
      const previous = await tx.studioOutcome.findFirst({
        where: {
          organizationId: org,
          projectId,
          stage: dto.stage,
          reference: dto.reference,
        },
      });
      if (previous) {
        if (
          previous.valueCents !== (dto.valueCents ?? null) ||
          previous.currency !== dto.currency
        ) {
          throw new ConflictException(
            'Esta referência já foi registrada nesta etapa com outro valor.'
          );
        }
        return;
      }
      const outcome = await tx.studioOutcome.create({
        data: {
          ...dto,
          occurredAt: new Date(dto.occurredAt),
          organizationId: org,
          projectId,
          recordedBy: actorId,
        },
      });
      await tx.studioEvent.create({
        data: {
          organizationId: org,
          projectId,
          revision: project.revision,
          action: `outcome:${dto.stage}`,
          actorId,
          detail: { outcomeId: outcome.id, reference: outcome.reference },
        },
      });
    });
  }
}
