'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type {
  StudioApprovalStage,
  StudioCapabilities,
  StudioDocument,
  StudioGenerationStage,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import { useStudioRequest } from './studio.hooks';
import {
  StudioButton,
  StudioCheck,
  StudioField,
  StudioMessage,
  StudioSection,
  formatStudioDate,
  studioFocusClass,
} from './studio.ui';
import {
  StudioIdentityEditor,
  StudioSourcesEditor,
  StudioScenesEditor,
  StudioPackagesEditor,
} from './studio.content';
import { StudioProduction } from './studio.production';
import { StudioPublicationEditor, StudioOutcomes } from './studio.delivery';
import { StudioAudience } from './studio.audience';

const steps = [
  { id: 'identity', label: 'Identidade' },
  { id: 'sources', label: 'Pauta e fontes' },
  { id: 'script', label: 'Roteiro' },
  { id: 'production', label: 'Produção' },
  { id: 'package', label: 'Pacotes' },
  { id: 'publication', label: 'Publicação' },
  { id: 'audience', label: 'Audiência' },
  { id: 'outcomes', label: 'Resultados' },
] as const;

export type StudioDocumentEditorProps = {
  document: StudioDocument;
  onChange: (document: StudioDocument) => void;
};

export const StudioApprovalPanel = ({
  project,
  stage,
  blocked,
  pending,
  onApprove,
}: {
  project: StudioProject;
  stage: StudioApprovalStage;
  blocked: boolean;
  pending: boolean;
  onApprove: (
    stage: StudioApprovalStage,
    acknowledgedSourceIds: string[]
  ) => void;
}) => {
  const reviewKey = `${project.revision}:${stage}`;
  const [confirmation, setConfirmation] = useState({
    key: reviewKey,
    content: false,
    sources: false,
  });
  const confirmed = confirmation.key === reviewKey && confirmation.content;
  const sourcesReviewed =
    confirmation.key === reviewKey && confirmation.sources;
  const setConfirmed = (content: boolean) =>
    setConfirmation({ key: reviewKey, content, sources: sourcesReviewed });
  const setSourcesReviewed = (sources: boolean) =>
    setConfirmation({ key: reviewKey, content: confirmed, sources });
  const approval = project.approvals[stage];
  const highRiskSources =
    stage === 'identity'
      ? []
      : project.document.sources.filter((source) => source.risk === 'high');
  const predecessor =
    stage === 'script'
      ? project.approvals.identity
      : stage === 'package'
      ? project.approvals.script
      : true;
  const label = {
    identity: 'identidade',
    script: 'roteiro',
    package: 'pacote',
  }[stage];
  return (
    <StudioSection
      title={`Revisão da ${
        stage === 'identity'
          ? 'identidade'
          : stage === 'script'
          ? 'etapa de roteiro'
          : 'etapa de pacotes'
      }`}
    >
      {approval ? (
        <StudioMessage>
          {stage === 'identity'
            ? 'Identidade aprovada'
            : stage === 'script'
            ? 'Roteiro aprovado'
            : 'Pacote aprovado'}{' '}
          em {formatStudioDate(approval.approvedAt)}, na versão{' '}
          {approval.revision}. Alterações no conteúdo exigem nova revisão das
          etapas afetadas.
        </StudioMessage>
      ) : (
        <div className="space-y-4">
          {!predecessor && (
            <p className="text-sm text-textItemBlur">
              Aprove {stage === 'script' ? 'a identidade' : 'o roteiro'} antes
              de concluir esta revisão.
            </p>
          )}
          <StudioCheck
            label={`Revisei ${
              stage === 'identity'
                ? 'a identidade, as evidências e as hipóteses'
                : stage === 'script'
                ? 'as afirmações, as fontes e cada cena do roteiro'
                : 'os textos, as mídias, a oferta e os links dos pacotes'
            } desta versão e aprovo seu uso.`}
            checked={confirmed}
            onChange={setConfirmed}
            disabled={blocked || pending || !predecessor}
          />
          {highRiskSources.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/50 p-3">
              <p className="text-sm font-semibold">
                Fontes que exigem revisão adicional
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {highRiskSources.map((source) => (
                  <li key={source.id}>{source.title}</li>
                ))}
              </ul>
              <StudioCheck
                label="Revisei as fontes de risco alto, verifiquei seu uso e assumo a aprovação deste conteúdo."
                checked={sourcesReviewed}
                onChange={setSourcesReviewed}
                disabled={blocked || pending || !predecessor}
              />
            </div>
          )}
          <StudioButton
            disabled={
              blocked ||
              pending ||
              !predecessor ||
              !confirmed ||
              (highRiskSources.length > 0 && !sourcesReviewed)
            }
            loading={pending}
            onClick={() =>
              onApprove(
                stage,
                highRiskSources.map((source) => source.id)
              )
            }
          >
            Aprovar {label}
          </StudioButton>
        </div>
      )}
    </StudioSection>
  );
};

export const StudioProjectEditor = ({
  project,
  capabilities,
  onUpdated,
  onDirtyChange,
  onRefresh,
}: {
  project: StudioProject;
  capabilities?: StudioCapabilities;
  onUpdated: (project: StudioProject) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onRefresh: () => Promise<StudioProject | undefined>;
}) => {
  const request = useStudioRequest();
  const [baseline, setBaseline] = useState(project);
  const [document, setDocument] = useState(project.document);
  const [title, setTitle] = useState(project.title);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState<(typeof steps)[number]['id']>('identity');
  const [pending, setPending] = useState<string | null>(null);
  const [childBusy, setChildBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const operation = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const baseUrl = `/studio/projects/${encodeURIComponent(project.id)}`;

  if (!dirty && !pending && baseline !== project) {
    setBaseline(project);
    setDocument(project.document);
    setTitle(project.title);
  }

  useEffect(() => {
    onDirtyChange(dirty || Boolean(pending) || childBusy);
    return () => onDirtyChange(false);
  }, [dirty, pending, childBusy, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (next: StudioDocument) => {
    setDocument(next);
    setDirty(true);
    setMessage(null);
  };

  const accept = useCallback(
    async (next: StudioProject) => {
      await onUpdated(next);
      setBaseline(next);
      setDocument(next.document);
      setTitle(next.title);
      setDirty(false);
    },
    [onUpdated]
  );

  const perform = async (
    action: string,
    body: Record<string, unknown>,
    success: string,
    method = 'POST'
  ) => {
    if (operation.current) return;
    operation.current = true;
    setPending(action || 'save');
    setError(null);
    setMessage(null);
    try {
      const next = await request<StudioProject>(
        `${baseUrl}${action ? `/${action}` : ''}`,
        {
          method,
          body: JSON.stringify({ revision: baseline.revision, ...body }),
        }
      );
      await accept(next);
      setMessage(success);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a ação.'
      );
    } finally {
      operation.current = false;
      setPending(null);
    }
  };

  const save = () => {
    if (!title.trim()) {
      setError('Informe um nome para o conteúdo.');
      return;
    }
    const fields = contentRef.current?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >('input, textarea');
    if (fields && Array.from(fields).some((field) => !field.reportValidity()))
      return;
    void perform(
      '',
      { title: title.trim(), document },
      'Alterações salvas. Confira as aprovações das etapas afetadas.',
      'PUT'
    );
  };

  const generate = (stage: StudioGenerationStage) => {
    if (dirty || pending || !capabilities?.text.available) return;
    void perform(
      'generate',
      { stage },
      'Sugestão gerada. Revise as afirmações e os detalhes antes de aprovar.'
    );
  };

  const approve = (
    stage: StudioApprovalStage,
    acknowledgedSourceIds: string[]
  ) => {
    if (dirty || pending) return;
    void perform(
      'approve',
      {
        stage,
        confirmed: true,
        ...(acknowledgedSourceIds.length ? { acknowledgedSourceIds } : {}),
      },
      'Aprovação registrada para esta versão.'
    );
  };

  const discard = async () => {
    if (operation.current) return;
    setError(null);
    try {
      const latest = await onRefresh();
      if (!latest)
        throw new Error('Não foi possível recuperar a versão salva.');
      await accept(latest);
      setMessage('A versão salva foi recuperada.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar.'
      );
    }
  };

  const locked = dirty || Boolean(pending) || childBusy;
  const generateDisabled = locked || !capabilities?.text.available;
  return (
    <div ref={contentRef} className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-newTableBorder bg-newBgColorInner p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {title || 'Conteúdo sem nome'}
          </p>
          <p className="text-xs text-textItemBlur">
            Versão {baseline.revision} ·{' '}
            {dirty
              ? 'Alterações ainda não salvas'
              : `Salvo em ${formatStudioDate(baseline.updatedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <StudioButton
              secondary
              disabled={Boolean(pending) || childBusy}
              onClick={() => void discard()}
            >
              Descartar alterações
            </StudioButton>
          )}
          <StudioButton
            disabled={!dirty || Boolean(pending) || childBusy}
            loading={pending === 'save'}
            onClick={save}
          >
            Salvar alterações
          </StudioButton>
        </div>
      </div>
      {error && <StudioMessage error>{error}</StudioMessage>}
      {message && <StudioMessage>{message}</StudioMessage>}
      {Boolean(document.editorialNotes?.length) && (
        <details className="rounded-lg border border-newTableBorder bg-newBgColorInner p-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
            Observações de revisão
          </summary>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-textItemBlur">
            {document.editorialNotes!.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      {dirty && project.revision !== baseline.revision && (
        <StudioMessage error>
          Outra sessão salvou uma nova versão. Seu texto continua aqui. Copie o
          que deseja preservar e use “Descartar alterações” para recuperar a
          versão atual antes de editar novamente.
        </StudioMessage>
      )}
      {dirty && (
        <p className="text-sm text-textItemBlur">
          Salve as alterações para gerar, aprovar, produzir ou criar rascunhos.
        </p>
      )}
      <nav aria-label="Etapas do conteúdo" className="flex flex-wrap gap-2">
        {steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={step === item.id ? 'step' : undefined}
            disabled={Boolean(pending) || childBusy}
            onClick={() => {
              setStep(item.id);
              setMessage(null);
            }}
            className={clsx(
              studioFocusClass,
              'border px-3 py-2 text-sm',
              step === item.id
                ? 'border-btnPrimary bg-btnPrimary text-white'
                : 'border-newTableBorder bg-newBgColorInner'
            )}
          >
            {index + 1}. {item.label}
          </button>
        ))}
      </nav>

      <fieldset
        disabled={Boolean(pending) || childBusy}
        className="min-w-0 space-y-5"
      >
        <legend className="sr-only">Edição do conteúdo</legend>
        {step === 'identity' && (
          <>
            <StudioSection title="Objetivo do conteúdo">
              <StudioField
                label="Nome do conteúdo"
                value={title}
                onChange={(value) => {
                  setTitle(value);
                  setDirty(true);
                }}
                maxLength={200}
                required
              />
              <StudioField
                label="Objetivo e contexto"
                value={document.brief}
                onChange={(brief) => edit({ ...document, brief })}
                maxLength={12000}
                multiline
                rows={4}
                required
              />
            </StudioSection>
            <StudioIdentityEditor
              document={document}
              onChange={edit}
              onGenerate={() => generate('identity')}
              generateDisabled={generateDisabled}
              generating={pending === 'generate'}
            />
            <StudioApprovalPanel
              project={baseline}
              stage="identity"
              blocked={locked}
              pending={pending === 'approve'}
              onApprove={approve}
            />
          </>
        )}
        {step === 'sources' && (
          <StudioSourcesEditor
            document={document}
            onChange={edit}
            identityApproved={Boolean(baseline.approvals.identity)}
            generateDisabled={generateDisabled}
            onGenerate={() => generate('outline')}
            researchAvailable={Boolean(capabilities?.research.available)}
            researchReason={capabilities?.research.reason}
            blocked={locked}
            pending={pending}
            onResearch={(query) =>
              void perform(
                'research',
                { query },
                'Fontes encontradas. Leia os trechos e confirme a relevância antes de usá-los.'
              )
            }
          />
        )}
        {step === 'script' && (
          <>
            <StudioScenesEditor
              document={document}
              onChange={edit}
              onGenerate={() => generate('script')}
              generateDisabled={
                generateDisabled || !baseline.approvals.identity
              }
              generating={pending === 'generate'}
            />
            <StudioApprovalPanel
              project={baseline}
              stage="script"
              blocked={locked}
              pending={pending === 'approve'}
              onApprove={approve}
            />
          </>
        )}
        {step === 'production' && (
          <StudioProduction
            project={baseline}
            document={document}
            onChange={edit}
            capabilities={capabilities}
            blocked={locked}
            pending={pending}
            onProjectAction={perform}
          />
        )}
        {step === 'package' && (
          <>
            <StudioPackagesEditor
              document={document}
              onChange={edit}
              onGenerate={() => generate('package')}
              generateDisabled={generateDisabled || !baseline.approvals.script}
              generating={pending === 'generate'}
            />
            <StudioApprovalPanel
              project={baseline}
              stage="package"
              blocked={locked}
              pending={pending === 'approve'}
              onApprove={approve}
            />
          </>
        )}
        {step === 'publication' && (
          <StudioPublicationEditor
            project={baseline}
            capabilities={capabilities}
            blocked={locked}
            pending={pending === 'drafts'}
            onCreate={(targets) =>
              void perform(
                'drafts',
                { targets },
                'Solicitação conferida. Veja o estado de cada rascunho abaixo e abra o calendário para revisar os que já foram criados.'
              )
            }
          />
        )}
      </fieldset>
      {step === 'audience' && (
        <StudioAudience
          projectId={project.id}
          document={document}
          onChange={edit}
        />
      )}
      {step === 'outcomes' && (
        <StudioOutcomes
          project={baseline}
          onUpdated={accept}
          blocked={locked}
          onBusyChange={setChildBusy}
        />
      )}
    </div>
  );
};
