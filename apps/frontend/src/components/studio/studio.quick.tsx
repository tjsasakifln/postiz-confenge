'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { strToU8, zipSync } from 'fflate';
import { getQuickFormat, quickFormats, quickStyle, type QuickFormat } from '@gitroom/helpers/studio/studio.quick';
import type { StudioDocument, StudioProject } from '@gitroom/helpers/studio/studio.types';
import { useStudioProject, useStudioProjects, useStudioRequest } from './studio.hooks';
import { renderQuickCard } from './studio.quick.cards';
import { Studio } from './studio.component';
import styles from './studio.quick.module.css';

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

function Review({ project, format }: { project: StudioProject; format: QuickFormat }) {
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
    setDraft({ ...draft, document: next });
    setDirty(true);
    setMessage('');
  }

  async function save() {
    const saved = await request<StudioProject>(`/studio/projects/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({ revision: draft.revision, title: draft.title, document }),
    });
    setDraft(saved);
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
          <p>{quickFormats[format].label} · {quickFormats[format].width} × {quickFormats[format].height} px</p>
        </div>
        <button className={styles.primary} onClick={() => void finish(true)} disabled={!valid || busy}>
          Baixar post (.zip)
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

function QuickStudio() {
  const request = useStudioRequest();
  const router = useRouter();
  const selected = useSearchParams().get('post');
  const projects = useStudioProjects();
  const selectedProject = useStudioProject(selected);
  const [created, setCreated] = useState<StudioProject>();
  const project = created?.id === selected ? created : selectedProject.data;
  const activeFormat = project && getQuickFormat(project.document.identity.visualStyle);
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<QuickFormat>('carousel');
  const [audience, setAudience] = useState('Gestores e responsáveis por obras');
  const [objective, setObjective] = useState('Orientar uma decisão prática de obra');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = topic.trim();
    if (!title || working) return;
    setWorking(true);
    setError('');
    try {
      const brief = `Tema: ${title}. Público: ${audience}. Objetivo: ${objective}.`;
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
              visualStyle: quickStyle(format), evidence: [], hypotheses: [],
              brandName: 'CONFENGE', language: 'pt-BR',
              primaryColor: '#061a33', secondaryColor: '#ced62a',
            },
          },
        }),
      });
      const generated = await request<StudioProject>(path + '/generate', {
        method: 'POST', body: JSON.stringify({ revision: prepared.revision, stage: 'quick' }),
      });
      setCreated(generated);
      router.replace(`/studio?post=${generated.id}`, { scroll: false });
      void projects.mutate();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setWorking(false);
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
        <form onSubmit={generate} className={styles.form}>
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
            {working ? 'Gerando post…' : 'Gerar post'}
          </button>
          <details>
            <summary>Público e objetivo</summary>
            <div className={styles.details}>
              <label>Público<input value={audience} maxLength={200} disabled={working} onChange={event => setAudience(event.target.value)} /></label>
              <label>Objetivo<input value={objective} maxLength={200} disabled={working} onChange={event => setObjective(event.target.value)} /></label>
            </div>
          </details>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
        {projects.data?.some(item => item.document?.scenes.length && getQuickFormat(item.document.identity.visualStyle)) && (
          <label className={styles.saved}>Posts salvos
            <select value={selected || ''} disabled={working} onChange={event => {
              router.replace(event.target.value ? `/studio?post=${event.target.value}` : '/studio', { scroll: false });
            }}>
              <option value="">Escolher um post</option>
              {projects.data.filter(item => item.document?.scenes.length && getQuickFormat(item.document.identity.visualStyle))
                .map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}
        {selectedProject.error && <p role="alert" className={styles.error}>{selectedProject.error.message}</p>}
        {project && activeFormat && <Review key={project.id} project={project} format={activeFormat} />}
      </div>
    </main>
  );
}

export function StudioEntry() {
  const params = useSearchParams();
  return params.has('project') || params.get('mode') === 'advanced' ? <Studio /> : <QuickStudio />;
}
