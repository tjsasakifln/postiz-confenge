'use client';

import { useRef, useState } from 'react';
import type { StudioDocumentEditorProps } from './studio.project';
import type {
  StudioAudienceCapabilities,
  StudioAudienceReplyState,
  StudioAudienceThread,
  StudioAudienceThreadsResponse,
} from '@gitroom/helpers/studio/studio.audience.types';
import {
  useStudioAudienceCapabilities,
  useStudioAudienceMetrics,
  useStudioAudienceThreads,
  useStudioRequest,
} from './studio.hooks';
import { studioPlatformLabels } from './studio.content';
import {
  StudioButton,
  StudioCheck,
  StudioEmpty,
  StudioField,
  StudioMessage,
  StudioSection,
  StudioSelect,
  formatStudioDate,
  studioHttpUrl,
} from './studio.ui';

const replyLabels: Record<StudioAudienceReplyState, string> = {
  none: 'Aguardando resposta',
  draft: 'Resposta em rascunho',
  approved: 'Resposta aprovada',
  sending: 'Enviando resposta',
  sent: 'Resposta enviada',
  uncertain: 'Envio precisa de conferência',
  answered: 'Respondido na plataforma',
};

export const StudioAudienceThreadCard = ({
  projectId,
  thread,
  capabilities,
  onUpdated,
}: {
  projectId: string;
  thread: StudioAudienceThread;
  capabilities?: StudioAudienceCapabilities;
  onUpdated: (thread: StudioAudienceThread) => Promise<void>;
}) => {
  const request = useStudioRequest();
  const [draft, setDraft] = useState(thread.replyDraft || '');
  const [baseline, setBaseline] = useState(thread);
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const integration = capabilities?.integrations.find(
    (item) => item.id === thread.integrationId
  );
  const terminal = ['sending', 'sent', 'answered', 'uncertain'].includes(
    thread.replyState
  );
  if (!dirty && !pending && baseline !== thread) {
    setDraft(thread.replyDraft || '');
    setBaseline(thread);
    setReviewed(false);
  }
  const act = async (
    action: 'draft' | 'suggest' | 'approve' | 'send' | 'reconcile'
  ) => {
    if (operation.current || pending) return;
    operation.current = true;
    setPending(action);
    setError(null);
    try {
      const body =
        action === 'draft'
          ? { reply: draft.trim(), revision: baseline.revision }
          : action === 'approve'
          ? {
              revision: thread.revision,
              draftHash: thread.draftHash,
              reviewed: true,
            }
          : action === 'send'
          ? {
              revision: thread.revision,
              draftHash: thread.draftHash,
              confirmed: true,
            }
          : { revision: thread.revision };
      const next = await request<StudioAudienceThread>(
        `/studio/projects/${encodeURIComponent(
          projectId
        )}/audience/threads/${encodeURIComponent(thread.id)}/${action}`,
        {
          method: action === 'draft' ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        }
      );
      await onUpdated(next);
      setBaseline(next);
      setDraft(next.replyDraft || '');
      setDirty(false);
      setReviewed(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar a resposta.'
      );
    } finally {
      operation.current = false;
      setPending(null);
    }
  };
  return (
    <article
      id={`audience-thread-${thread.id}`}
      className="space-y-4 rounded-lg border border-newTableBorder p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{thread.authorName}</h3>
          <p className="text-xs text-textItemBlur">
            {studioPlatformLabels[thread.platform]} ·{' '}
            {integration?.name || 'Conta do canal'} ·{' '}
            {formatStudioDate(thread.publishedAt)}
          </p>
        </div>
        <span className="rounded-lg bg-newBgColor px-3 py-1 text-xs">
          {replyLabels[thread.replyState]}
        </span>
      </div>
      <blockquote className="whitespace-pre-wrap rounded-lg bg-newBgColor p-4 text-sm leading-relaxed">
        {thread.text}
      </blockquote>
      {studioHttpUrl(thread.externalUrl) && (
        <a
          href={studioHttpUrl(thread.externalUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
        >
          Ver comentário na plataforma
        </a>
      )}
      {error && <StudioMessage error>{error}</StudioMessage>}
      {dirty && baseline.revision !== thread.revision && (
        <StudioMessage error>
          Este comentário foi atualizado em outra sessão. Seu texto foi
          preservado. Copie o que deseja manter e recupere a versão atual antes
          de salvar.
        </StudioMessage>
      )}
      {thread.replyState === 'uncertain' && (
        <StudioMessage error>
          O serviço não confirmou o resultado do envio. Confira a plataforma e
          consulte o estado antes de qualquer nova ação. O reenvio está
          bloqueado para evitar duplicidade.
        </StudioMessage>
      )}
      {thread.errorCode && (
        <p className="text-xs text-textItemBlur">
          Referência da ocorrência: {thread.errorCode}
        </p>
      )}
      {thread.replyState === 'answered' ? (
        <p className="text-sm text-textItemBlur">
          Este comentário já foi respondido na plataforma.
        </p>
      ) : (
        <>
          <StudioField
            label={`Resposta a ${thread.authorName}`}
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setDirty(true);
              setReviewed(false);
            }}
            multiline
            rows={4}
            maxLength={2000}
            disabled={Boolean(pending) || terminal}
            hint="O texto só é enviado após aprovação e o clique explícito em enviar."
          />
          {!terminal && (
            <>
              <div className="flex flex-wrap gap-2">
                <StudioButton
                  secondary
                  disabled={Boolean(pending) || !dirty || !draft.trim()}
                  loading={pending === 'draft'}
                  onClick={() => void act('draft')}
                >
                  Salvar resposta
                </StudioButton>
                <StudioButton
                  secondary
                  disabled={
                    Boolean(pending) ||
                    dirty ||
                    !capabilities?.textGeneration.available
                  }
                  loading={pending === 'suggest'}
                  onClick={() => void act('suggest')}
                >
                  Sugerir resposta
                </StudioButton>
                {dirty && (
                  <StudioButton
                    secondary
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setDraft(thread.replyDraft || '');
                      setBaseline(thread);
                      setDirty(false);
                      setReviewed(false);
                      setError(null);
                    }}
                  >
                    Recuperar versão salva
                  </StudioButton>
                )}
              </div>
              {!capabilities?.textGeneration.available &&
                capabilities?.textGeneration.reason && (
                  <p className="text-xs text-textItemBlur">
                    {capabilities.textGeneration.reason}
                  </p>
                )}
              {thread.replyDraft &&
                !dirty &&
                thread.replyState !== 'approved' && (
                  <StudioCheck
                    label="Revisei esta resposta, suas afirmações e o próximo passo proposto ao cliente."
                    checked={reviewed}
                    onChange={setReviewed}
                    disabled={Boolean(pending)}
                  />
                )}
              <div className="flex flex-wrap gap-2">
                <StudioButton
                  secondary
                  disabled={
                    Boolean(pending) ||
                    dirty ||
                    !reviewed ||
                    !thread.draftHash ||
                    thread.replyState === 'approved'
                  }
                  loading={pending === 'approve'}
                  onClick={() => void act('approve')}
                >
                  Aprovar resposta
                </StudioButton>
                <StudioButton
                  disabled={
                    Boolean(pending) ||
                    dirty ||
                    thread.replyState !== 'approved' ||
                    !thread.draftHash ||
                    thread.approvalHash !== thread.draftHash ||
                    !integration?.reply.available
                  }
                  loading={pending === 'send'}
                  onClick={() => void act('send')}
                >
                  Enviar resposta ao comentário
                </StudioButton>
              </div>
              {integration && !integration.reply.available && (
                <p className="text-xs text-textItemBlur">
                  {integration.reply.reason}
                </p>
              )}
            </>
          )}
          {(thread.replyState === 'uncertain' ||
            thread.replyState === 'sending') && (
            <StudioButton
              secondary
              disabled={Boolean(pending)}
              loading={pending === 'reconcile'}
              onClick={() => void act('reconcile')}
            >
              Conferir resultado do envio
            </StudioButton>
          )}
        </>
      )}
      <p className="text-xs text-textItemBlur">
        Consultado em {formatStudioDate(thread.observedAt)}
        {thread.respondedAt
          ? ` · resposta registrada em ${formatStudioDate(thread.respondedAt)}`
          : ''}
      </p>
    </article>
  );
};

const StudioAudienceMetricsPanel = ({
  projectId,
  document,
  onChange,
}: { projectId: string } & StudioDocumentEditorProps) => {
  const [days, setDays] = useState(28);
  const metrics = useStudioAudienceMetrics(projectId, days);
  return (
    <StudioSection
      title="Audiência observada e aprendizado"
      description="As métricas vêm das plataformas conectadas. Alcance e interação ajudam a revisar o conteúdo; resultados comerciais devem ser registrados na etapa Resultados."
      actions={
        <StudioButton
          secondary
          disabled={metrics.isValidating}
          loading={metrics.isValidating}
          onClick={() => void metrics.mutate()}
        >
          Consultar métricas
        </StudioButton>
      }
    >
      <div className="max-w-sm">
        <StudioSelect
          label="Selecionar publicações dos últimos"
          value={String(days)}
          onChange={(value) => setDays(Number(value))}
        >
          <option value="7">7 dias</option>
          <option value="28">28 dias</option>
          <option value="90">90 dias</option>
        </StudioSelect>
      </div>
      {metrics.error ? (
        <StudioMessage error>{metrics.error.message}</StudioMessage>
      ) : !metrics.data ? (
        <StudioMessage>
          Consultando os dados disponíveis nas plataformas…
        </StudioMessage>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-textItemBlur">
            Publicações dos últimos {metrics.data.periodDays} dias. Os números
            são totais acumulados dos posts na consulta, não o crescimento
            dentro desse intervalo. Fonte: APIs dos canais conectados.
            Consultado em {formatStudioDate(metrics.data.observedAt)}.
          </p>
          {metrics.data.note && (
            <StudioMessage>{metrics.data.note}</StudioMessage>
          )}
          {metrics.data.posts.length === 0 ? (
            <StudioEmpty>
              Nenhuma publicação do conteúdo foi encontrada nesse intervalo.
            </StudioEmpty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {metrics.data.posts.map((post) => (
                <article
                  key={post.postId}
                  className="space-y-3 rounded-lg border border-newTableBorder p-4"
                >
                  <h3 className="font-semibold">
                    {post.platform} · {formatStudioDate(post.publishDate)}
                  </h3>
                  {studioHttpUrl(post.releaseUrl) && (
                    <a
                      href={studioHttpUrl(post.releaseUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                    >
                      Ver publicação
                    </a>
                  )}
                  {post.status !== 'available' || post.metrics.length === 0 ? (
                    <p className="text-sm text-textItemBlur">
                      {post.reason ||
                        'A plataforma não retornou métricas para esta publicação.'}
                    </p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">
                        Métricas acumuladas reportadas pela plataforma
                      </caption>
                      <thead>
                        <tr className="border-b border-newTableBorder">
                          <th scope="col" className="py-2">
                            Métrica
                          </th>
                          <th scope="col" className="py-2 text-right">
                            Acumulado
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {post.metrics.map((metric, index) => {
                          const latest = [...metric.points]
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .at(-1);
                          return (
                            <tr
                              key={`${metric.label}-${index}`}
                              className="border-b border-newTableBorder"
                            >
                              <th scope="row" className="py-2 font-normal">
                                {metric.label}
                              </th>
                              <td className="py-2 text-right">
                                {latest
                                  ? new Intl.NumberFormat('pt-BR').format(
                                      latest.value
                                    )
                                  : 'Não informado'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </article>
              ))}
            </div>
          )}
          {metrics.data.recommendations.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">O que os dados sugerem revisar</h3>
              {metrics.data.recommendations.map((recommendation, index) => {
                const label =
                  recommendation.kind === 'observation'
                    ? 'Observação dos dados'
                    : 'Hipótese a testar';
                const note = `${label}. Consulta: ${
                  metrics.data!.observedAt
                }. Publicações de origem: ${
                  recommendation.postIds.join(', ') ||
                  'sem publicação específica'
                }. ${recommendation.statement} Próxima ação sugerida: ${
                  recommendation.nextAction
                }`;
                const added = Boolean(document.editorialNotes?.includes(note));
                const noteLimit =
                  (document.editorialNotes?.length || 0) >= 20 ||
                  note.length > 2000;
                return (
                  <article
                    key={index}
                    className="space-y-2 rounded-lg bg-newBgColor p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      {recommendation.kind === 'observation'
                        ? 'Observação dos dados'
                        : 'Hipótese a testar'}
                    </p>
                    <p className="text-sm">{recommendation.statement}</p>
                    <p className="text-sm">
                      Próxima ação: {recommendation.nextAction}
                    </p>
                    {recommendation.threadIds.length > 0 && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {recommendation.threadIds.map((id, position) => (
                          <a
                            key={id}
                            href={`#audience-thread-${id}`}
                            className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                          >
                            Comentário de referência {position + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    <StudioButton
                      secondary
                      disabled={added || noteLimit}
                      onClick={() =>
                        onChange({
                          ...document,
                          editorialNotes: [
                            ...(document.editorialNotes || []),
                            note,
                          ],
                        })
                      }
                    >
                      {added
                        ? 'Adicionada à revisão da pauta'
                        : 'Usar na próxima pauta'}
                    </StudioButton>
                    {added && (
                      <p className="text-xs text-textItemBlur">
                        Salve as alterações antes de gerar uma nova pauta. A
                        observação mantém a data e as publicações de origem.
                      </p>
                    )}
                    {noteLimit && !added && (
                      <p className="text-xs text-textItemBlur">
                        Revise as observações existentes antes de acrescentar
                        outra. O conteúdo comporta até vinte notas de dois mil
                        caracteres.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </StudioSection>
  );
};

export const StudioAudience = ({
  projectId,
  document,
  onChange,
}: { projectId: string } & StudioDocumentEditorProps) => {
  const capabilities = useStudioAudienceCapabilities(projectId);
  const threads = useStudioAudienceThreads(projectId);
  const request = useStudioRequest();
  const [integrationId, setIntegrationId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const selected = capabilities.data?.integrations.find(
    (item) => item.id === integrationId
  );
  const sync = async () => {
    if (
      !integrationId ||
      pending ||
      operation.current ||
      !selected?.comments.available
    )
      return;
    operation.current = true;
    setPending(true);
    setError(null);
    try {
      const next = await request<StudioAudienceThreadsResponse>(
        `/studio/projects/${encodeURIComponent(projectId)}/audience/sync`,
        { method: 'POST', body: JSON.stringify({ integrationId }) }
      );
      await threads.mutate(next, { revalidate: false });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível consultar os comentários.'
      );
    } finally {
      operation.current = false;
      setPending(false);
    }
  };
  const updateThread = async (thread: StudioAudienceThread) => {
    await threads.mutate(
      (current) =>
        current
          ? {
              ...current,
              threads: current.threads.map((item) =>
                item.id === thread.id ? thread : item
              ),
            }
          : current,
      { revalidate: false }
    );
  };
  return (
    <div className="space-y-5">
      <StudioSection
        title="Comentários e respostas"
        description="Consulte comentários das publicações ligadas a este conteúdo. Salve uma resposta, revise e aprove. O envio exige uma ação própria em cada comentário."
      >
        {capabilities.error && (
          <StudioMessage error>{capabilities.error.message}</StudioMessage>
        )}
        {!capabilities.data && !capabilities.error && (
          <StudioMessage>Verificando as permissões dos canais…</StudioMessage>
        )}
        {capabilities.data && (
          <>
            <div className="max-w-xl">
              <StudioSelect
                label="Conta para consultar comentários"
                value={integrationId}
                onChange={setIntegrationId}
                disabled={pending}
              >
                <option value="">Selecione uma conta conectada</option>
                {capabilities.data.integrations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.provider}
                  </option>
                ))}
              </StudioSelect>
            </div>
            {selected && (
              <p className="text-sm text-textItemBlur">
                {selected.comments.reason}
              </p>
            )}
            {capabilities.data.integrations.length === 0 && (
              <StudioEmpty>
                Nenhuma conta está disponível para consultar as publicações
                deste conteúdo.
              </StudioEmpty>
            )}
            <StudioButton
              disabled={pending || !selected?.comments.available}
              loading={pending}
              onClick={() => void sync()}
            >
              Consultar comentários pendentes
            </StudioButton>
          </>
        )}
        {error && <StudioMessage error>{error}</StudioMessage>}
        {threads.error ? (
          <StudioMessage error>
            {threads.error.message}{' '}
            <button className="underline" onClick={() => void threads.mutate()}>
              Tentar novamente
            </button>
          </StudioMessage>
        ) : !threads.data ? (
          <StudioMessage>Carregando comentários registrados…</StudioMessage>
        ) : (
          <>
            {threads.data.coverage.length > 0 && (
              <details className="rounded-lg bg-newBgColor p-3">
                <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
                  Cobertura da consulta
                </summary>
                <ul className="mt-3 space-y-2 text-xs text-textItemBlur">
                  {threads.data.coverage.map((item, index) => (
                    <li key={`${item.postId}-${index}`}>
                      {item.reason} · {item.checked} comentário(s)
                      verificado(s), {item.imported} importado(s).
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {threads.data.threads.length === 0 ? (
              <StudioEmpty>
                Nenhum comentário registrado. Consulte uma conta após publicar.
                A ausência de comentários aqui não comprova que todos foram
                respondidos na plataforma.
              </StudioEmpty>
            ) : (
              <div className="space-y-4">
                {threads.data.threads.map((thread) => (
                  <StudioAudienceThreadCard
                    key={thread.id}
                    projectId={projectId}
                    thread={thread}
                    capabilities={capabilities.data}
                    onUpdated={updateThread}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </StudioSection>
      <StudioAudienceMetricsPanel
        projectId={projectId}
        document={document}
        onChange={onChange}
      />
    </div>
  );
};
