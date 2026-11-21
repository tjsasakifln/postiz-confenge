'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { strToU8, zipSync } from 'fflate';
import { getQuickFormat, getQuickTaco, quickFormats, quickStyle, quickNetworks, tacoLabels, tacoOrder, type TacoType, type QuickFormat, type QuickNetwork, type QuickSuggestions } from '@gitroom/helpers/studio/studio.quick';
import type { StudioDocument, StudioProject } from '@gitroom/helpers/studio/studio.types';
import { useStudioProject, useStudioProjects, useStudioRequest } from './studio.hooks';
import { renderQuickCard } from './studio.quick.cards';
import { Studio } from './studio.component';
import styles from './studio.quick.module.css';

type BatchState = 'idle' | 'queued' | 'draft' | 'review' | 'ready' | 'failed';

interface EditorialBatch {
  state: BatchState;
  message?: string;
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function Review({ project, format, onSaved }: {
  project: StudioProject;
  format: QuickFormat;
  onSaved: (project: StudioProject) => void;
}) {
  const request = useStudioRequest();
  const [draft, setDraft] = useState(project);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [dirty, setDirty] = useState(false);
  const { document } = draft;
  const scene = document.scenes[selected];
  const caption = document.packages[0]?.description ?? '';
  const taco = getQuickTaco(document.identity.visualStyle);
  const review = document.editorialNotes?.find(note => note.startsWith('Revisão crítica automatizada:'));
  const valid = caption.trim() && document.scenes.every(item => item.visual.trim() && item.narration.trim());

  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    let url = '';
    const timer = setTimeout(() => {
      renderQuickCard(scene, selected, format).then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
        setPreviewError('');
      }).catch(error => {
        if (!cancelled) setPreviewError(errorText(error));
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [scene, selected, format]);

  function edit(next: StudioDocument) {
    setDraft({ ...draft, document: {
      ...next,
      editorialNotes: next.editorialNotes?.filter(note => !note.startsWith('Revisão crítica automatizada:')),
    } });
    setDirty(true);
    setMessage('');
  }

  async function save() {
    const saved = await request<StudioProject>(`/studio/projects/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({ revision: draft.revision, title: draft.title, document }),
    });
    setDraft(saved);
    onSaved(saved);
    setDirty(false);
  }

  async function finish(exportFiles: boolean) {
    if (!valid || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (dirty) await save();
      if (exportFiles) {
        const images = await Promise.all(document.scenes.map((item, index) => renderQuickCard(item, index, format)));
        const files: Record<string, Uint8Array> = { 'legenda.txt': strToU8(caption.trim() + '\n') };
        if (document.sources.length) {
          files['fontes.txt'] = strToU8(document.sources.map(source =>
            `${source.title}\n${source.url}\n${source.excerpt}`).join('\n\n') + '\n');
        }
        for (const [index, blob] of images.entries()) {
          files[`${String(index + 1).padStart(2, '0')}-confenge.png`] = new Uint8Array(await blob.arrayBuffer());
        }
        download(new Blob([Uint8Array.from(zipSync(files, { level: 0 }))], { type: 'application/zip' }), 'post-confenge.zip');
      }
      setMessage(exportFiles ? 'Arquivo pronto para baixar.' : 'Revisão salva.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  if (!scene) return <p role="status">Este conteúdo ainda está sem peças.</p>;
  return (
    <section className={styles.review} aria-labelledby="quick-review">
      <div className={styles.reviewHeader}>
        <div>
          <h2 id="quick-review">Revisar post</h2>
          <p>{taco ? `${tacoLabels[taco]} · ` : ''}{document.packages[0]?.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {quickFormats[format].label} · {quickFormats[format].width} × {quickFormats[format].height} px</p>
        </div>
        <button className={styles.primary} onClick={() => void finish(true)} disabled={!valid || busy}>
          Baixar pacote (.zip)
        </button>
      </div>
      <div className={styles.reviewGrid}>
        <div className={styles.preview}>
          {previewError ? <p role="alert">{previewError}</p> : preview
            ? <img src={preview} alt={`Prévia da peça ${selected + 1}: ${scene.visual}`} />
            : <p role="status">Preparando a prévia…</p>}
        </div>
        <div className={styles.editor}>
          {document.scenes.length > 1 && (
            <div className={styles.cards} aria-label="Peças do carrossel">
              {document.scenes.map((item, index) => (
                <button key={item.id} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>
                  {index + 1}
                </button>
              ))}
            </div>
          )}
          <label>Título da peça<input maxLength={80} value={scene.visual} disabled={busy}
            onChange={event => edit({
              ...document,
              scenes: document.scenes.map((item, index) => index === selected ? { ...item, visual: event.target.value } : item),
              packages: selected === 0 ? document.packages.map(item => ({ ...item, title: event.target.value })) : document.packages,
            })} /></label>
          <label>Texto da peça<textarea maxLength={150} rows={3} value={scene.narration} disabled={busy}
            onChange={event => edit({
              ...document,
              scenes: document.scenes.map((item, index) => index === selected ? { ...item, narration: event.target.value } : item),
            })} /></label>
          <label>Legenda<textarea maxLength={1200} rows={6} value={caption} disabled={busy}
            onChange={event => edit({
              ...document,
              packages: document.packages.map((item, index) => index === 0 ? { ...item, description: event.target.value } : item),
            })} /></label>
          {document.sources.length > 0 && <details className={styles.sources}>
            <summary>Fundamentação e revisão</summary>
            <p>{review || 'Esta versão tem ajustes manuais. Confira as afirmações nas fontes antes de publicar.'}</p>
            <ul>
              {document.sources.map(source => <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
              </li>)}
            </ul>
          </details>}
          <div className={styles.actions}>
            <button type="button" onClick={() => void finish(false)} disabled={!dirty || !valid || busy}>Salvar revisão</button>
            <button type="button" disabled={!caption.trim()} onClick={async () => {
              try {
                await navigator.clipboard.writeText(caption);
                setMessage('Legenda copiada.');
              } catch {
                setMessage('Selecione a legenda para copiar.');
              }
            }}>Copiar legenda</button>
          </div>
          {message && <p role="status">{message}</p>}
        </div>
      </div>
    </section>
  );
}

function BatchProgress({ batch, retrying, onRetry }: {
  batch: EditorialBatch;
  retrying: boolean;
  onRetry: () => void;
}) {
  const phase: Record<Exclude<BatchState, 'idle' | 'ready' | 'failed'>, string> = {
    queued: 'Na fila de geração aprofundada',
    draft: 'Estruturando o conteúdo com as fontes',
    review: 'Revisão editorial e adversarial em andamento',
  };
  if (batch.state === 'ready') return null;
  if (batch.state === 'failed' || batch.state === 'idle') {
    const waiting = batch.state === 'idle';
    return (
      <section className={styles.batch} aria-live="polite">
        <div>
          <strong>{waiting ? 'Tema salvo para geração' : 'A geração em lote não foi concluída.'}</strong>
          <p>{batch.message || (waiting ? 'Envie este tema para o lote quando estiver pronto.' : 'O post ficou preservado para nova tentativa.')}</p>
        </div>
        <button type="button" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Enviando…' : waiting ? 'Iniciar lote' : 'Tentar novamente'}
        </button>
      </section>
    );
  }
  return (
    <section className={styles.batch} aria-live="polite">
      <div>
        <strong>{phase[batch.state]}</strong>
        <p>{batch.message || 'Você pode sair desta tela. O post ficará disponível aqui ao concluir.'}</p>
      </div>
      <span className={styles.batchState}>{batch.state === 'review' ? 'Revisão' : 'Em lote'}</span>
    </section>
  );
}

function QuickStudio() {
  const request = useStudioRequest();
  const router = useRouter();
  const selected = useSearchParams().get('post');
  const projects = useStudioProjects();
  const selectedProject = useStudioProject(selected);
  const mutateProjects = projects.mutate;
  const mutateSelectedProject = selectedProject.mutate;
  const project = selectedProject.data;
  const activeFormat = project && getQuickFormat(project.document.identity.visualStyle);
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<QuickFormat>('carousel');
  const [network, setNetwork] = useState<QuickNetwork>('instagram');
  const [taco, setTaco] = useState<TacoType>('T');
  const [audience, setAudience] = useState('Gestores e responsáveis por obras');
  const [objective, setObjective] = useState('Orientar uma decisão prática de obra');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [generationMode, setGenerationMode] = useState<'batch' | 'immediate'>('batch');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<QuickSuggestions>();
  const [batch, setBatch] = useState<EditorialBatch>();
  const [batchAttempt, setBatchAttempt] = useState(0);
  const [batchStatusError, setBatchStatusError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isQuickProject = Boolean(project && activeFormat);
  const needsBatchStatus = Boolean(isQuickProject && !project.document.scenes.length);

  useEffect(() => {
    if (!selected || !needsBatchStatus) {
      setBatch(undefined);
      setBatchStatusError(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const current = await request<EditorialBatch>(`/studio/projects/${selected}/editorial-batch`);
        if (cancelled) return;
        setBatchStatusError(false);
        setBatch(current);
        if (['queued', 'draft', 'review'].includes(current.state))
          timer = setTimeout(() => { void read(); }, 15000);
        if (current.state === 'ready') {
          void mutateSelectedProject();
          void mutateProjects();
        }
      } catch {
        if (cancelled) return;
        setBatchStatusError(true);
        timer = setTimeout(() => { void read(); }, 15000);
      }
    };
    void read();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [batchAttempt, mutateProjects, mutateSelectedProject, needsBatchStatus, request, selected]);

  async function suggest() {
    setSuggesting(true);
    setError('');
    try {
      setSuggestions(await request<QuickSuggestions>('/studio/suggestions', { method: 'POST' }));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSuggesting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generate(topic, format, network, taco, generationMode);
  }

  async function generate(
    chosenTopic: string,
    chosenFormat: QuickFormat,
    chosenNetwork: QuickNetwork,
    chosenTaco: TacoType,
    mode: 'batch' | 'immediate' = generationMode,
  ) {
    const title = chosenTopic.trim();
    if (!title || working) return;
    setWorking(true);
    setError('');
    try {
      const brief = `Tema: ${title}. Público: ${audience}. Objetivo: ${objective}. Rede: ${quickNetworks[chosenNetwork]}.`;
      const initial = await request<StudioProject>('/studio/projects', {
        method: 'POST', body: JSON.stringify({ title, brief }),
      });
      const path = `/studio/projects/${initial.id}`;
      const prepared = await request<StudioProject>(path, {
        method: 'PUT',
        body: JSON.stringify({
          revision: initial.revision, title,
          document: {
            ...initial.document, topic: title,
            identity: {
              audience, positioning: 'Engenharia CONFENGE', tone: 'Técnico e direto',
              visualStyle: quickStyle(chosenFormat, chosenTaco), evidence: [], hypotheses: [],
              brandName: 'CONFENGE', language: 'pt-BR',
              primaryColor: '#061a33', secondaryColor: '#ced62a',
              channel: { platform: chosenNetwork },
            },
          },
        }),
      });
      if (mode === 'batch') {
        router.replace(`/studio?post=${initial.id}`, { scroll: false });
        void projects.mutate();
        const started = await request<EditorialBatch>(path + '/editorial-batch', {
          method: 'POST', body: JSON.stringify({ revision: prepared.revision }),
        });
        setBatch(started);
        setBatchAttempt(attempt => attempt + 1);
      } else {
        await request<StudioProject>(path + '/generate', {
          method: 'POST', body: JSON.stringify({ revision: prepared.revision, stage: 'quick' }),
        });
        router.replace(`/studio?post=${initial.id}`, { scroll: false });
        void projects.mutate();
      }
      setSuggestions(current => current && ({
        ...current,
        suggestions: current.suggestions.filter(item => item.topic !== title),
      }));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setWorking(false);
    }
  }

  async function retryBatch() {
    if (!project || working || retrying || (batch?.state !== 'failed' && batch?.state !== 'idle')) return;
    setRetrying(true);
    setError('');
    try {
      const restarted = await request<EditorialBatch>(`/studio/projects/${project.id}/editorial-batch`, {
        method: 'POST', body: JSON.stringify({ revision: project.revision }),
      });
      setBatch(restarted);
      setBatchAttempt(attempt => attempt + 1);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <img src="/confenge-studio/logo.png" alt="CONFENGE" />
        <Link href="/studio?mode=advanced">Estúdio avançado</Link>
      </header>
      <div className={styles.content}>
        <h1>Criar post</h1>
        <form onSubmit={submit} className={styles.form}>
          <label className={styles.theme}>Tema
            <input value={topic} maxLength={200} required onChange={event => setTopic(event.target.value)}
              placeholder="Ex. O que conferir antes de comparar orçamentos de obra" disabled={working} />
          </label>
          <label>Formato
            <select value={format} disabled={working} onChange={event => setFormat(event.target.value as QuickFormat)}>
              {(Object.keys(quickFormats) as QuickFormat[]).map(key => <option value={key} key={key}>{quickFormats[key].label}</option>)}
            </select>
          </label>
          <button className={styles.primary} type="submit" disabled={!topic.trim() || working}>
            {working ? (generationMode === 'batch' ? 'Enviando para lote…' : 'Gerando post…') : generationMode === 'batch' ? 'Gerar em lote' : 'Gerar agora'}
          </button>
          <details>
            <summary>Rede, público, objetivo e TACO</summary>
            <div className={styles.details}>
              <label>Rede<select value={network} disabled={working} onChange={event => setNetwork(event.target.value as QuickNetwork)}>
                {(Object.keys(quickNetworks) as QuickNetwork[]).map(key => <option value={key} key={key}>{quickNetworks[key]}</option>)}
              </select></label>
              <label>Tipo de conteúdo<select value={taco} disabled={working} onChange={event => setTaco(event.target.value as TacoType)}>
                {tacoOrder.map(key => <option value={key} key={key}>{tacoLabels[key]}</option>)}
              </select></label>
              <label>Público<input value={audience} maxLength={200} disabled={working} onChange={event => setAudience(event.target.value)} /></label>
              <label>Objetivo<input value={objective} maxLength={200} disabled={working} onChange={event => setObjective(event.target.value)} /></label>
              <label>Geração<select value={generationMode} disabled={working} onChange={event => setGenerationMode(event.target.value as 'batch' | 'immediate')}>
                <option value="batch">Em lote · qualidade máxima</option>
                <option value="immediate">Agora · revisão acelerada</option>
              </select></label>
            </div>
            {generationMode === 'batch' && <p className={styles.batchHint}>Cada fase do lote pode levar até 24 horas. Você pode fechar a página e voltar depois.</p>}
          </details>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
        <section className={styles.suggestions} aria-labelledby="quick-suggestions">
          <div className={styles.reviewHeader}>
            <h2 id="quick-suggestions">Sequência de posts · TACO</h2>
            <button type="button" disabled={working || suggesting} onClick={() => void suggest()}>
              {suggesting ? 'Lendo histórico…' : 'Sugerir com base no histórico'}
            </button>
          </div>
          {suggestions && (
            <>
              <p className={styles.history}>{suggestions.projects} conteúdos do histórico · {suggestions.published} com publicação registrada. Recomendações editoriais.</p>
              <div className={styles.suggestionList}>
                {suggestions.suggestions.map(item => (
                  <article key={item.topic}>
                    <p>{tacoLabels[item.taco]} · {quickNetworks[item.network]} · {quickFormats[item.format].label}</p>
                    <h3>{item.topic}</h3>
                    <p>{item.reason}</p>
                    <button type="button" className={styles.primary} disabled={working} onClick={() => {
                      setTopic(item.topic);
                      setFormat(item.format);
                      setNetwork(item.network);
                      setTaco(item.taco);
                      void generate(item.topic, item.format, item.network, item.taco);
                    }}>Aprovar e gerar</button>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
        {projects.data?.some(item => getQuickFormat(item.document?.identity.visualStyle || '')) && (
          <label className={styles.saved}>Posts salvos
            <select value={selected || ''} disabled={working} onChange={event => {
              router.replace(event.target.value ? `/studio?post=${event.target.value}` : '/studio', { scroll: false });
            }}>
              <option value="">Escolher um post</option>
              {projects.data.filter(item => getQuickFormat(item.document?.identity.visualStyle || ''))
                .map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}
        {selectedProject.error && <p role="alert" className={styles.error}>{selectedProject.error.message}</p>}
        {selected && selectedProject.isLoading && <p role="status">Abrindo post…</p>}
        {batchStatusError && <p role="status">Não foi possível consultar o lote. Vamos tentar novamente.</p>}
        {project && activeFormat && batch && <BatchProgress batch={batch} retrying={retrying || working} onRetry={() => void retryBatch()} />}
        {project && activeFormat && <Review key={project.id} project={project} format={activeFormat}
          onSaved={saved => { void selectedProject.mutate(saved, { revalidate: false }); }} />}
      </div>
    </main>
  );
}

export function StudioEntry() {
  const params = useSearchParams();
  return params.has('project') || params.get('mode') === 'advanced' ? <Studio /> : <QuickStudio />;
}
