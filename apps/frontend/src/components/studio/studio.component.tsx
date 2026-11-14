'use client';

import { FormEvent, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { StudioProject } from '@gitroom/helpers/studio/studio.types';
import {
  useStudioCapabilities,
  useStudioProject,
  useStudioProjects,
  useStudioRequest,
} from './studio.hooks';
import {
  StudioButton,
  StudioEmpty,
  StudioField,
  StudioMessage,
  StudioSection,
  StudioSelect,
  formatStudioDate,
} from './studio.ui';
import { StudioProjectEditor } from './studio.project';

export const Studio = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('project');
  const projects = useStudioProjects();
  const capabilities = useStudioCapabilities();
  const selected = useStudioProject(selectedId);
  const mutateProject = selected.mutate;
  const mutateProjects = projects.mutate;
  const request = useStudioRequest();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProject = (id: string) => {
    if (dirty) return;
    setCreating(false);
    setError(null);
    router.replace(
      id ? `/studio?project=${encodeURIComponent(id)}` : '/studio',
      {
        scroll: false,
      }
    );
  };

  const updated = useCallback(
    async (project: StudioProject) => {
      await mutateProject(project, { revalidate: false });
      await mutateProjects(
        (current) =>
          current
            ? [project, ...current.filter((item) => item.id !== project.id)]
            : [project],
        { revalidate: false }
      );
    },
    [mutateProject, mutateProjects]
  );

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !title.trim() || !brief.trim()) return;
    setPending(true);
    setError(null);
    try {
      const project = await request<StudioProject>('/studio/projects', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), brief: brief.trim() }),
      });
      await projects.mutate((current) => [project, ...(current || [])], {
        revalidate: false,
      });
      setTitle('');
      setBrief('');
      openProject(project.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível criar o conteúdo.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="w-full min-w-0 space-y-5 bg-newBgColor p-6 text-newTextColor mobile:p-3">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Estúdio de conteúdo</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-textItemBlur">
            Da pauta técnica ao contato comercial. Prepare o conteúdo, revise
            cada etapa e acompanhe o que chegou a contrato e recebimento.
          </p>
        </div>
        <StudioButton
          disabled={dirty || pending}
          onClick={() => setCreating((current) => !current)}
        >
          {creating ? 'Fechar novo conteúdo' : 'Novo conteúdo'}
        </StudioButton>
      </header>

      {capabilities.error && (
        <StudioMessage error>
          Não foi possível verificar os recursos disponíveis:{' '}
          {capabilities.error.message}
          <button
            className="ml-2 underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
            onClick={() => void capabilities.mutate()}
          >
            Tentar novamente
          </button>
        </StudioMessage>
      )}
      {capabilities.data && (
        <details className="rounded-xl border border-newTableBorder bg-newBgColorInner p-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
            Recursos e canais disponíveis
          </summary>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ['text', 'Redação'],
                ['research', 'Pesquisa'],
                ['media', 'Voz e vídeo'],
                ['publishing', 'Publicação'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <dt className="text-sm font-semibold">
                  {label}:{' '}
                  {capabilities.data![key].available
                    ? 'disponível'
                    : 'requer configuração'}
                </dt>
                <dd className="text-xs leading-relaxed text-textItemBlur">
                  {capabilities.data![key].reason}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-textItemBlur">
            {capabilities.data.integrations.length} conta(s) conectada(s) para
            YouTube, Instagram e LinkedIn. As gerações que usam um provedor
            consomem a conta configurada.
          </p>
        </details>
      )}

      {error && <StudioMessage error>{error}</StudioMessage>}
      {creating && (
        <StudioSection
          title="Novo conteúdo"
          description="Defina o problema do cliente, a oferta e o próximo avanço esperado. Você poderá revisar tudo antes de publicar."
        >
          <form onSubmit={create} className="space-y-4">
            <StudioField
              label="Nome do conteúdo"
              value={title}
              onChange={setTitle}
              required
              maxLength={200}
              disabled={pending}
            />
            <StudioField
              label="Objetivo e contexto"
              value={brief}
              onChange={setBrief}
              required
              multiline
              rows={4}
              maxLength={12000}
              disabled={pending}
              hint="Informe público, serviço, região atendida, dúvida de compra, evidências disponíveis e a ação comercial desejada."
            />
            <StudioButton
              type="submit"
              loading={pending}
              disabled={pending || !title.trim() || !brief.trim()}
            >
              Criar conteúdo
            </StudioButton>
          </form>
        </StudioSection>
      )}

      {projects.error ? (
        <StudioMessage error>
          {projects.error.message}
          <button
            className="ml-2 underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
            onClick={() => void projects.mutate()}
          >
            Tentar novamente
          </button>
        </StudioMessage>
      ) : !projects.data ? (
        <StudioMessage>Carregando seus conteúdos…</StudioMessage>
      ) : projects.data.length === 0 ? (
        <StudioEmpty>
          Você ainda não criou um conteúdo. Comece com um problema real do
          cliente e uma oferta que a equipe pode entregar.
        </StudioEmpty>
      ) : (
        <div className="max-w-3xl">
          <StudioSelect
            label="Conteúdo em trabalho"
            value={selectedId || ''}
            onChange={openProject}
            disabled={dirty || pending}
            hint={
              dirty
                ? 'Salve ou descarte as alterações antes de trocar de conteúdo.'
                : undefined
            }
          >
            <option value="">Selecione um conteúdo</option>
            {projects.data.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title} · atualizado em{' '}
                {formatStudioDate(project.updatedAt)}
              </option>
            ))}
          </StudioSelect>
        </div>
      )}

      {selectedId && selected.error && (
        <StudioMessage error>
          {selected.error.message}
          <button
            className="ml-2 underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
            onClick={() => void selected.mutate()}
          >
            Atualizar
          </button>
        </StudioMessage>
      )}
      {selectedId && !selected.data && !selected.error && (
        <StudioMessage>Carregando o conteúdo…</StudioMessage>
      )}
      {selectedId && selected.data && (
        <StudioProjectEditor
          key={selectedId}
          project={selected.data}
          capabilities={capabilities.data}
          onUpdated={updated}
          onDirtyChange={setDirty}
          onRefresh={() => selected.mutate()}
        />
      )}
    </main>
  );
};
