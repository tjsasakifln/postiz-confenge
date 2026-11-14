import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { StudioAudienceThread as StoredThread } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import type {
  StudioAudienceCapabilities, StudioAudienceCoverage, StudioAudienceMetric,
  StudioAudienceMetrics, StudioAudienceRecommendation, StudioAudienceThread,
  StudioAudienceThreadsResponse,
} from '@gitroom/helpers/studio/studio.audience.types';
import type { StudioDocument, StudioPlatform } from '@gitroom/helpers/studio/studio.types';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { StudioAudienceRepository } from './studio.audience.repository';
import { StudioAudienceManager } from './studio.audience.manager';
import { StudioAudienceWriterService } from './studio.audience.writer.service';
import {
  AudienceConnection, AudienceProviderError, AudienceRemotePost,
  AudienceRemoteReply, audienceErrorMessage,
} from './studio.audience.provider';
import {
  StudioAudienceApproveDto, StudioAudienceDraftDto, StudioAudienceSendDto,
  StudioAudienceSyncDto,
} from './studio.audience.dto';

const editable = ['none', 'draft', 'approved'];
const cleanText = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
const safeUrl = (value?: string | null) => {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
};

@Injectable()
export class StudioAudienceService {
  constructor(
    private readonly repository: StudioAudienceRepository,
    private readonly manager: StudioAudienceManager,
    private readonly integrations: IntegrationService,
    private readonly social: IntegrationManager,
    private readonly refresh: RefreshIntegrationService,
    private readonly writer: StudioAudienceWriterService
  ) {}

  private dto(thread: StoredThread): StudioAudienceThread {
    return {
      id: thread.id, integrationId: thread.integrationId, postId: thread.postId,
      platform: thread.platform as StudioPlatform, authorName: thread.authorName, text: thread.text,
      externalUrl: safeUrl(thread.externalUrl), publishedAt: thread.publishedAt.toISOString(),
      observedAt: thread.observedAt.toISOString(), respondedAt: thread.respondedAt?.toISOString(),
      replyDraft: thread.replyDraft || undefined, draftHash: thread.draftHash || undefined,
      approvalHash: thread.approvalHash || undefined,
      replyState: thread.replyState as StudioAudienceThread['replyState'],
      externalReplyId: thread.externalReplyId || undefined, errorCode: thread.errorCode || undefined,
      revision: thread.revision,
    };
  }

  private hash(thread: StoredThread, reply: string): string {
    return createHash('sha256').update(JSON.stringify({
      organizationId: thread.organizationId, projectId: thread.projectId, integrationId: thread.integrationId,
      threadId: thread.id, externalCommentId: thread.externalCommentId, comment: thread.text, reply,
    })).digest('hex');
  }

  private assertRevision(thread: StoredThread, revision: number) {
    if (!Number.isInteger(revision) || thread.revision !== revision) throw new ConflictException('O comentário mudou. Atualize a página antes de continuar.');
  }

  private async connection(organizationId: string, integrationId: string) {
    const integration = await this.integrations.getIntegrationById(organizationId, integrationId);
    if (!integration || integration.deletedAt || integration.disabled || integration.refreshNeeded || integration.inBetweenSteps) {
      throw new AudienceProviderError('access_denied', true);
    }
    let token = integration.token;
    if (integration.tokenExpiration && integration.tokenExpiration.getTime() <= Date.now()) {
      try {
        const refreshed = await this.refresh.refresh(integration);
        if (!refreshed || !refreshed.accessToken) throw new Error('missing_access_token');
        token = refreshed.accessToken;
      } catch { throw new AudienceProviderError('access_denied', true); }
    }
    if (!token || !integration.internalId) throw new AudienceProviderError('access_denied', true);
    // Never return an Integration row beyond this private boundary.
    return {
      provider: integration.providerIdentifier,
      credentials: { internalId: integration.internalId, token, username: integration.profile || undefined } as AudienceConnection,
    };
  }

  private async context(organizationId: string, projectId: string, integrationId: string, postId: string) {
    const posts = await this.repository.posts(organizationId, projectId);
    const post = posts.find(item => item.id === postId && item.integrationId === integrationId);
    if (!post || post.state !== 'PUBLISHED' || !post.releaseId || post.releaseId === 'missing') {
      throw new NotFoundException('Esta publicação ainda não está disponível na plataforma ou não pertence ao projeto.');
    }
    const connection = await this.connection(organizationId, integrationId);
    if (connection.provider !== post.integration.providerIdentifier) throw new AudienceProviderError('access_denied', true);
    const provider = this.manager.get(connection.provider);
    if (!provider) throw new BadRequestException('Comentários indisponíveis para este provedor.');
    return {
      provider, credentials: connection.credentials,
      post: { releaseId: post.releaseId, releaseUrl: safeUrl(post.releaseURL) } as AudienceRemotePost,
    };
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException(audienceErrorMessage(error instanceof AudienceProviderError ? error.code : 'provider_unavailable'));
  }

  async capabilities(organizationId: string, projectId: string): Promise<StudioAudienceCapabilities> {
    await this.repository.project(organizationId, projectId);
    const integrations = await this.repository.integrations(organizationId);
    return {
      integrations: integrations.map(integration => {
        const adapter = this.manager.get(integration.providerIdentifier);
        const available = !integration.disabled && !integration.refreshNeeded && !integration.inBetweenSteps;
        const supported = !!this.social.getSocialIntegration(integration.providerIdentifier)?.postAnalytics;
        const comments = {
          available: available && !!adapter,
          reason: !available ? 'Reconecte ou habilite a conta no Postiz.' : adapter
            ? `${adapter.permissionHint} A permissão efetiva será verificada na sincronização.`
            : 'Este provedor ainda não oferece leitura e resposta a comentários no Estúdio.',
        };
        return {
          id: integration.id, name: integration.name, provider: integration.providerIdentifier,
          comments, reply: { ...comments, reason: `${comments.reason} Cada resposta exige revisão e envio explícito.` },
          metrics: {
            available: available && supported,
            reason: !available ? 'Reconecte ou habilite a conta no Postiz.' : supported
              ? 'O provedor Postiz consulta as métricas oficiais disponíveis para esta conta e publicação.'
              : 'O provedor Postiz não oferece métricas por publicação para esta conta.',
          },
        };
      }),
      textGeneration: this.writer.capabilities(),
    };
  }

  async threads(organizationId: string, projectId: string, coverage: StudioAudienceCoverage[] = []): Promise<StudioAudienceThreadsResponse> {
    await this.repository.project(organizationId, projectId);
    return { threads: (await this.repository.threads(organizationId, projectId)).map(thread => this.dto(thread)), coverage, limit: 200 };
  }

  async sync(organizationId: string, projectId: string, body: StudioAudienceSyncDto): Promise<StudioAudienceThreadsResponse> {
    await this.repository.project(organizationId, projectId);
    const all = await this.repository.posts(organizationId, projectId);
    const posts = all.filter(post => post.integrationId === body.integrationId && (!body.postId || post.id === body.postId)).slice(0, 3);
    if (!posts.length) throw new NotFoundException('Nenhuma publicação deste projeto está associada à conta selecionada.');
    const coverage: StudioAudienceCoverage[] = [];
    for (const post of posts) {
      const item: StudioAudienceCoverage = { postId: post.id, status: 'unavailable', checked: 0, imported: 0, reason: '' };
      if (!this.manager.get(post.integration.providerIdentifier)) {
        item.status = 'unsupported'; item.reason = 'Comentários ainda não estão disponíveis para este provedor no Estúdio.';
      } else if (post.state !== 'PUBLISHED' || !post.releaseId || post.releaseId === 'missing') {
        item.reason = 'A publicação precisa estar publicada e identificada na plataforma para consultar comentários.';
      } else {
        try {
          const { provider, credentials, post: remote } = await this.context(organizationId, projectId, body.integrationId, post.id);
          const result = await provider.listUnanswered(credentials, remote);
          item.checked = result.checked;
          item.status = result.complete ? 'available' : 'partial';
          item.reason = result.complete ? 'Comentários consultados pela API oficial; respostas da própria conta verificadas.'
            : 'Consulta parcial: até 25 comentários retornados por publicação e 300 respostas por comentário. Históricos incompletos não são tratados como sem resposta.';
          for (const comment of result.comments) {
            if (!comment.externalCommentId || !comment.externalThreadId || typeof comment.text !== 'string' || comment.text.length > 20000 || !Number.isFinite(Date.parse(comment.publishedAt))) {
              item.status = 'partial'; continue;
            }
            const imported = await this.repository.importComment(organizationId, projectId, body.integrationId, post.id, provider.platform, {
              ...comment, text: cleanText(comment.text), authorName: cleanText(comment.authorName).slice(0, 200),
              externalUrl: safeUrl(comment.externalUrl),
            });
            if (imported) item.imported++;
          }
          for (const answered of result.answered) {
            if (answered.reply.id && Number.isFinite(Date.parse(answered.reply.publishedAt))) {
              await this.repository.observedReply(organizationId, projectId, body.integrationId, answered.externalCommentId, answered.reply.id, new Date(answered.reply.publishedAt));
            }
          }
        } catch (error) {
          item.status = item.imported ? 'partial' : 'unavailable';
          item.reason = audienceErrorMessage(error instanceof AudienceProviderError ? error.code : 'provider_unavailable');
        }
      }
      coverage.push(item);
    }
    return this.threads(organizationId, projectId, coverage);
  }

  async draft(organizationId: string, projectId: string, id: string, actorId: string, body: StudioAudienceDraftDto) {
    const thread = await this.repository.thread(organizationId, projectId, id);
    this.assertRevision(thread, body.revision);
    if (typeof body.reply !== 'string') throw new BadRequestException('Informe uma resposta em texto.');
    const reply = cleanText(body.reply);
    if (!reply || reply.length > 2000) throw new BadRequestException('A resposta deve ter entre 1 e 2000 caracteres.');
    const changed = await this.repository.mutate(organizationId, projectId, id, body.revision, editable, {
      replyDraft: reply, draftHash: this.hash(thread, reply), approvalHash: null,
      approvedBy: null, approvedAt: null, replyState: 'draft', errorCode: null,
    }, actorId, 'drafted');
    return this.dto(changed);
  }

  async suggest(organizationId: string, projectId: string, id: string, actorId: string, revision: number) {
    const thread = await this.repository.thread(organizationId, projectId, id);
    this.assertRevision(thread, revision);
    if (!editable.includes(thread.replyState)) throw new ConflictException('Este comentário já tem um envio reservado ou uma resposta.');
    const project = await this.repository.project(organizationId, projectId);
    const reply = await this.writer.suggest(project.document as unknown as StudioDocument, thread.text);
    // Concurrent edits are detected by draft's revision check. AI never approves.
    return this.draft(organizationId, projectId, id, actorId, { revision, reply });
  }

  async approve(organizationId: string, projectId: string, id: string, actorId: string, body: StudioAudienceApproveDto) {
    const thread = await this.repository.thread(organizationId, projectId, id);
    this.assertRevision(thread, body.revision);
    if (body.reviewed !== true) throw new BadRequestException('Confirme que revisou a resposta antes de aprovar.');
    if (!thread.replyDraft || body.draftHash !== thread.draftHash || this.hash(thread, thread.replyDraft) !== body.draftHash) {
      throw new ConflictException('A resposta mudou. Revise o texto atual antes de aprovar.');
    }
    return this.dto(await this.repository.mutate(organizationId, projectId, id, body.revision, ['draft', 'approved'], {
      approvalHash: body.draftHash, approvedBy: actorId, approvedAt: new Date(), replyState: 'approved', errorCode: null,
    }, actorId, 'approved', { draftHash: body.draftHash }, { draftHash: body.draftHash }));
  }

  private replyDate(reply: AudienceRemoteReply): Date {
    const date = new Date(reply.publishedAt);
    return Number.isFinite(date.getTime()) ? date : new Date();
  }

  async send(organizationId: string, projectId: string, id: string, actorId: string, body: StudioAudienceSendDto) {
    if (body.confirmed !== true) throw new BadRequestException('Confirme explicitamente o envio desta resposta.');
    const thread = await this.repository.thread(organizationId, projectId, id);
    if (thread.replyState === 'sent' && thread.draftHash === body.draftHash) return this.dto(thread);
    this.assertRevision(thread, body.revision);
    if (thread.replyState !== 'approved' || !thread.approvedBy || !thread.approvedAt || !thread.replyDraft ||
      thread.approvalHash !== body.draftHash || thread.draftHash !== body.draftHash || this.hash(thread, thread.replyDraft) !== body.draftHash) {
      throw new ConflictException('A resposta precisa de aprovação vigente. Envios em andamento ou incertos não podem ser repetidos.');
    }
    let context: Awaited<ReturnType<StudioAudienceService['context']>>;
    try { context = await this.context(organizationId, projectId, thread.integrationId, thread.postId); }
    catch (error) { if (error instanceof NotFoundException || error instanceof BadRequestException) throw error; throw this.unavailable(error); }
    let current;
    try { current = await context.provider.inspectThread(context.credentials, context.post, thread.externalCommentId); }
    catch (error) { throw this.unavailable(error); }
    if (current.ownReply) {
      return this.dto(await this.repository.mutate(organizationId, projectId, id, body.revision, ['approved'], {
        replyState: 'answered', externalReplyId: current.ownReply.id, respondedAt: this.replyDate(current.ownReply),
        approvalHash: null, approvedBy: null, approvedAt: null, errorCode: 'already_answered',
      }, actorId, 'already_answered'));
    }
    if (cleanText(current.text) !== thread.text) {
      await this.repository.mutate(organizationId, projectId, id, body.revision, ['approved'], {
        text: cleanText(current.text), replyDraft: null, draftHash: null, approvalHash: null,
        approvedBy: null, approvedAt: null, replyState: 'none', errorCode: 'comment_changed',
      }, actorId, 'comment_changed');
      throw new ConflictException('O comentário original foi editado. A aprovação foi invalidada; revise novamente.');
    }
    if (!current.complete || !current.canReply) throw new ConflictException('Não foi possível confirmar o histórico completo ou a permissão para responder. Nenhum envio foi realizado.');
    const attemptId = randomUUID();
    const claimed = await this.repository.mutate(organizationId, projectId, id, body.revision, ['approved'], {
      replyState: 'sending', sendAttemptId: attemptId, attemptedAt: new Date(), errorCode: null,
    }, actorId, 'send_reserved', { draftHash: body.draftHash, approvalHash: body.draftHash }, { draftHash: body.draftHash, attemptId });
    let result: AudienceRemoteReply;
    try {
      // Exactly one request after the durable compare-and-swap. No SDK retries.
      result = await context.provider.reply(context.credentials, thread.externalCommentId, claimed.replyDraft!);
    } catch (error) {
      const definitive = error instanceof AudienceProviderError && error.definitive;
      const code = error instanceof AudienceProviderError ? error.code : 'provider_unavailable';
      return this.dto(await this.repository.mutate(organizationId, projectId, id, claimed.revision, ['sending'], {
        replyState: definitive ? 'draft' : 'uncertain', errorCode: code,
        ...(definitive ? { approvalHash: null, approvedBy: null, approvedAt: null } : {}),
      }, actorId, definitive ? 'send_rejected' : 'send_uncertain', { sendAttemptId: attemptId }, { code, attemptId }));
    }
    // If persistence fails after remote success, the durable reservation remains.
    // A later read-only reconciliation may confirm it, but never resends it.
    return this.dto(await this.repository.mutate(organizationId, projectId, id, claimed.revision, ['sending'], {
      replyState: 'sent', externalReplyId: result.id, respondedAt: this.replyDate(result), errorCode: null,
    }, actorId, 'sent', { sendAttemptId: attemptId }, { attemptId, replyId: result.id }));
  }

  async reconcile(organizationId: string, projectId: string, id: string, actorId: string, revision: number) {
    const thread = await this.repository.thread(organizationId, projectId, id);
    this.assertRevision(thread, revision);
    if (!['sending', 'uncertain'].includes(thread.replyState)) return this.dto(thread);
    if (thread.replyState === 'sending' && thread.attemptedAt && Date.now() - thread.attemptedAt.getTime() < 30000) {
      throw new ConflictException('O envio ainda está em andamento. Aguarde 30 segundos antes de consultar o resultado.');
    }
    let current;
    try {
      const context = await this.context(organizationId, projectId, thread.integrationId, thread.postId);
      current = await context.provider.inspectThread(context.credentials, context.post, thread.externalCommentId);
    } catch (error) { throw this.unavailable(error); }
    if (!current.ownReply) {
      if (thread.replyState === 'uncertain') return this.dto(thread);
      return this.dto(await this.repository.mutate(organizationId, projectId, id, revision, ['sending'], {
        replyState: 'uncertain', errorCode: 'provider_unavailable',
      }, actorId, 'reconciliation_pending', { sendAttemptId: thread.sendAttemptId }));
    }
    const matches = cleanText(current.ownReply.text) === thread.replyDraft && thread.attemptedAt &&
      new Date(current.ownReply.publishedAt).getTime() >= thread.attemptedAt.getTime() - 5000;
    return this.dto(await this.repository.mutate(organizationId, projectId, id, revision, ['sending', 'uncertain'], {
      replyState: matches ? 'sent' : 'answered', externalReplyId: current.ownReply.id,
      respondedAt: this.replyDate(current.ownReply), errorCode: null,
      ...(matches ? {} : { approvalHash: null, approvedBy: null, approvedAt: null }),
    }, actorId, matches ? 'send_reconciled' : 'external_reply_observed', { sendAttemptId: thread.sendAttemptId }, { replyId: current.ownReply.id }));
  }

  private recommendations(threads: StoredThread[], posts: StudioAudienceMetrics['posts']): StudioAudienceRecommendation[] {
    const questions = threads.filter(thread => editable.includes(thread.replyState) && /\?|\b(como|quanto|qual|quando|onde|por que)\b/i.test(thread.text)).slice(0, 5);
    const result: StudioAudienceRecommendation[] = [];
    if (questions.length) {
      result.push({
        kind: 'observation', statement: `${questions.length} comentário(s) importado(s) com pergunta seguem sem resposta registrada. A amostra é limitada aos comentários consultados.`,
        nextAction: 'Leia o contexto e responda somente às perguntas pertinentes ao serviço oferecido.',
        threadIds: questions.map(thread => thread.id), postIds: [...new Set(questions.map(thread => thread.postId))],
      });
      result.push({
        kind: 'hypothesis', statement: 'Uma explicação pública sobre uma dessas dúvidas pode ajudar compradores com a mesma objeção. Isso ainda não demonstra intenção de compra nem geração de leads.',
        nextAction: 'Escolha uma pergunta recorrente, confirme a resposta técnica e teste uma pauta com um próximo passo mensurável.',
        threadIds: questions.map(thread => thread.id), postIds: [...new Set(questions.map(thread => thread.postId))],
      });
    }
    const measured = posts.filter(post => post.status === 'available');
    if (measured.length) result.push({
      kind: 'observation', statement: `${measured.length} publicação(ões) têm métricas oficiais disponíveis nesta consulta. Os valores são acumulados e não provam conversão comercial.`,
      nextAction: 'Compare publicações do mesmo canal e registre os avanços comerciais separadamente antes de decidir a próxima pauta.',
      threadIds: [], postIds: measured.map(post => post.postId),
    });
    if (!result.length) result.push({
      kind: 'hypothesis', statement: 'Ainda não há comentários ou métricas suficientes neste projeto para orientar uma pauta por evidência observada.',
      nextAction: 'Publique um conteúdo com uma pergunta ligada à oferta e sincronize os comentários quando a API permitir.',
      threadIds: [], postIds: [],
    });
    return result;
  }

  async metrics(organizationId: string, projectId: string, days = 28): Promise<StudioAudienceMetrics> {
    await this.repository.project(organizationId, projectId);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new BadRequestException('Informe um período entre 1 e 90 dias.');
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const selected = (await this.repository.posts(organizationId, projectId)).filter(post => post.publishDate.getTime() >= cutoff && post.publishDate.getTime() <= now).slice(0, 20);
    const posts: StudioAudienceMetrics['posts'] = [];
    for (const post of selected) {
      const item: StudioAudienceMetrics['posts'][number] = {
        postId: post.id, integrationId: post.integrationId, platform: post.platform,
        releaseUrl: safeUrl(post.releaseURL), publishDate: post.publishDate.toISOString(),
        measurementScope: 'lifetime_snapshot', status: 'unavailable', reason: '', metrics: [],
      };
      const provider = this.social.getSocialIntegration(post.integration.providerIdentifier);
      if (post.state !== 'PUBLISHED' || !post.releaseId || post.releaseId === 'missing') {
        item.status = 'unpublished'; item.reason = 'A publicação ainda não possui um identificador final na plataforma.';
      } else if (!provider?.postAnalytics) {
        item.status = 'unsupported'; item.reason = 'Este provedor Postiz não oferece métricas por publicação.';
      } else {
        try {
          const { credentials } = await this.connection(organizationId, post.integrationId);
          const raw = await provider.postAnalytics(credentials.internalId, credentials.token, post.releaseId, days);
          const metrics: StudioAudienceMetric[] = Array.isArray(raw) ? raw.flatMap(metric => {
            if (typeof metric?.label !== 'string' || !Array.isArray(metric.data)) return [];
            const points = metric.data.flatMap(point => {
              const total = typeof point.total === 'string' ? point.total.trim() : point.total;
              const value = Number(total);
              return total !== '' && total !== null && total !== undefined && Number.isFinite(value) && value >= 0 && typeof point.date === 'string' && Number.isFinite(Date.parse(point.date))
                ? [{ date: point.date.slice(0, 40), value }] : [];
            });
            return points.length ? [{ label: cleanText(metric.label).slice(0, 100), points }] : [];
          }) : [];
          item.metrics = metrics;
          item.status = metrics.length ? 'available' : 'unavailable';
          item.reason = metrics.length ? 'Totais acumulados retornados pela API oficial através do provedor Postiz.'
            : 'A API não retornou métricas utilizáveis; isso não significa desempenho zero. Confira permissões e disponibilidade.';
        } catch (error) { item.reason = audienceErrorMessage(error instanceof AudienceProviderError ? error.code : 'provider_unavailable'); }
      }
      posts.push(item);
    }
    return {
      periodDays: days, observedAt: new Date().toISOString(), source: 'connected-platform-api', posts,
      recommendations: this.recommendations(await this.repository.threads(organizationId, projectId), posts),
      note: `Seleção de até 20 publicações do projeto feitas nos últimos ${days} dias. As métricas são totais acumulados consultados agora, não crescimento dentro do período. Ausência de dado não equivale a zero. Comentários não demonstram leads, contratos nem recebimentos.`,
    };
  }
}
