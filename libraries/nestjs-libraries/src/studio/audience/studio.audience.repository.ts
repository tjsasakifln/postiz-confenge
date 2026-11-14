import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository, PrismaTransaction } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AudienceRemoteComment } from './studio.audience.provider';

@Injectable()
export class StudioAudienceRepository {
  constructor(
    private readonly _project: PrismaRepository<'studioProject'>,
    private readonly _thread: PrismaRepository<'studioAudienceThread'>,
    private readonly _publication: PrismaRepository<'studioPublication'>,
    private readonly _post: PrismaRepository<'post'>,
    private readonly _integration: PrismaRepository<'integration'>,
    private readonly _transaction: PrismaTransaction
  ) {}

  async project(organizationId: string, id: string) {
    const project = await this._project.model.studioProject.findFirst({
      where: { id, organizationId },
      select: { id: true, revision: true, document: true },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return project;
  }

  integrations(organizationId: string) {
    return this._integration.model.integration.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, providerIdentifier: true, disabled: true, refreshNeeded: true, inBetweenSteps: true },
      orderBy: { name: 'asc' },
    });
  }

  async posts(organizationId: string, projectId: string) {
    const publications = await this._publication.model.studioPublication.findMany({
      where: { organizationId, projectId },
      select: { postId: true, integrationId: true, platform: true },
    });
    const posts = await this._post.model.post.findMany({
      where: { organizationId, id: { in: publications.map(item => item.postId) }, deletedAt: null },
      select: {
        id: true, integrationId: true, state: true, releaseId: true, releaseURL: true, publishDate: true,
        integration: { select: { providerIdentifier: true } },
      },
      orderBy: { publishDate: 'desc' },
    });
    return posts.filter(post => publications.some(item => item.postId === post.id && item.integrationId === post.integrationId))
      .map(post => ({ ...post, platform: publications.find(item => item.postId === post.id)!.platform }));
  }

  threads(organizationId: string, projectId: string) {
    return this._thread.model.studioAudienceThread.findMany({
      where: { organizationId, projectId }, orderBy: { observedAt: 'desc' }, take: 200,
    });
  }

  async thread(organizationId: string, projectId: string, id: string) {
    const thread = await this._thread.model.studioAudienceThread.findFirst({ where: { id, organizationId, projectId } });
    if (!thread) throw new NotFoundException('Comentário não encontrado neste projeto.');
    return thread;
  }

  async importComment(
    organizationId: string, projectId: string, integrationId: string, postId: string,
    platform: string, comment: AudienceRemoteComment
  ) {
    return this._transaction.model.$transaction(async tx => {
      // The unique key spans projects: the same remote comment cannot be sent twice
      // by copying it into another project in this organization.
      const row = await tx.studioAudienceThread.upsert({
        where: { organizationId_integrationId_externalCommentId: { organizationId, integrationId, externalCommentId: comment.externalCommentId } },
        create: {
          organizationId, projectId, integrationId, postId, platform,
          ...comment, publishedAt: new Date(comment.publishedAt), observedAt: new Date(),
        },
        update: {},
      });
      if (row.projectId !== projectId || row.postId !== postId) return false;
      const protectedState = ['sending', 'uncertain', 'sent', 'answered'].includes(row.replyState);
      const changed = row.text !== comment.text && !protectedState;
      await tx.studioAudienceThread.updateMany({
        where: { id: row.id, organizationId, projectId, revision: row.revision, replyState: row.replyState },
        data: {
          observedAt: new Date(),
          ...(protectedState ? {} : { authorName: comment.authorName, externalUrl: comment.externalUrl }),
          ...(changed ? {
            text: comment.text, replyDraft: null, draftHash: null, approvalHash: null,
            approvedBy: null, approvedAt: null, replyState: 'none', errorCode: 'comment_changed',
            revision: { increment: 1 },
          } : {}),
        },
      });
      return true;
    });
  }

  async observedReply(organizationId: string, projectId: string, integrationId: string, commentId: string, replyId: string, publishedAt: Date) {
    await this._thread.model.studioAudienceThread.updateMany({
      where: {
        organizationId, projectId, integrationId, externalCommentId: commentId,
        replyState: { in: ['none', 'draft', 'approved'] },
      },
      data: {
        replyState: 'answered', externalReplyId: replyId, respondedAt: publishedAt,
        approvalHash: null, approvedBy: null, approvedAt: null, revision: { increment: 1 },
      },
    });
  }

  async mutate(
    organizationId: string, projectId: string, id: string, revision: number,
    states: string[], data: Prisma.StudioAudienceThreadUpdateManyMutationInput,
    actorId: string, action: string,
    match: Pick<Prisma.StudioAudienceThreadWhereInput, 'draftHash' | 'approvalHash' | 'sendAttemptId'> = {},
    detail: Prisma.InputJsonObject = {}
  ) {
    return this._transaction.model.$transaction(async tx => {
      const project = await tx.studioProject.findFirst({ where: { id: projectId, organizationId }, select: { revision: true } });
      if (!project) throw new NotFoundException('Projeto não encontrado.');
      const changed = await tx.studioAudienceThread.updateMany({
        where: { id, organizationId, projectId, revision, replyState: { in: states }, ...match },
        data: { ...data, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('O comentário mudou ou já tem um envio reservado. Atualize a página e revise a versão atual.');
      await tx.studioEvent.create({
        data: { organizationId, projectId, revision: project.revision, action: `audience:${action}`, actorId, detail: { threadId: id, ...detail } },
      });
      return tx.studioAudienceThread.findFirstOrThrow({ where: { id, organizationId, projectId } });
    });
  }
}
