'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type {
  StudioAsset,
  StudioCapabilities,
  StudioFormat,
  StudioProject,
  StudioRender,
} from '@gitroom/helpers/studio/studio.types';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import { useUppyUploader } from '@gitroom/frontend/components/media/new.uploader';
import {
  useStudioProductionCapabilities,
  useStudioRenderJob,
  useStudioRequest,
} from './studio.hooks';
import { StudioBranding } from './studio.branding';
import type { StudioDocumentEditorProps } from './studio.project';
import {
  StudioButton,
  StudioCheck,
  StudioDownload,
  StudioEmpty,
  StudioField,
  StudioMessage,
  StudioSection,
  StudioSelect,
  studioHttpUrl,
  studioInputClass,
} from './studio.ui';

const formatLabels: Record<StudioFormat, string> = {
  vertical: 'Vertical 9:16',
  horizontal: 'Horizontal 16:9',
  square: 'Quadrado 1:1',
};

const StudioRenderPreview = ({ render }: { render: StudioRender }) => {
  const downloadCaptions = () => {
    const url = URL.createObjectURL(
      new Blob([render.subtitles], {
        type: 'application/x-subrip;charset=utf-8',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${render.name.replace(/\.[^.]+$/, '')}.srt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const path = studioHttpUrl(render.path);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        {formatLabels[render.format]} · {Math.round(render.durationSeconds)}{' '}
        segundos
      </p>
      {path ? (
        <>
          <video
            src={path}
            controls
            preload="metadata"
            className="max-h-[420px] w-full rounded-lg bg-black"
            aria-label={`Prévia ${render.name}`}
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
              href={path}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir vídeo
            </a>
            <StudioDownload path={path} name={render.name}>
              Baixar vídeo
            </StudioDownload>
            <button
              type="button"
              className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
              onClick={downloadCaptions}
            >
              Baixar legendas SRT
            </button>
          </div>
        </>
      ) : (
        <StudioMessage error>
          O vídeo não possui uma URL válida para prévia.
        </StudioMessage>
      )}
    </div>
  );
};

const StudioRenderJob = ({
  project,
  jobId,
  blocked,
  onAttach,
}: {
  project: StudioProject;
  jobId: string;
  blocked: boolean;
  onAttach: () => void;
}) => {
  const job = useStudioRenderJob(project.id, jobId);
  const attached = Boolean(
    job.data?.result &&
      project.document.renders.some(
        (render) => render.id === job.data!.result!.id
      )
  );
  return (
    <article
      className="space-y-4 rounded-lg border border-newTableBorder p-4"
      aria-label="Produção de vídeo"
    >
      {job.error ? (
        <StudioMessage error>
          {job.error.message}{' '}
          <button className="underline" onClick={() => void job.mutate()}>
            Consultar novamente
          </button>
        </StudioMessage>
      ) : !job.data || job.data.status === 'pending' ? (
        <StudioMessage>
          Vídeo em produção. Você pode manter esta página aberta ou voltar
          depois neste navegador.
        </StudioMessage>
      ) : job.data.status === 'failed' ? (
        <StudioMessage error>
          {job.data.error ||
            'A produção falhou. Confira os arquivos e a configuração antes de iniciar outra tentativa.'}
        </StudioMessage>
      ) : job.data.result ? (
        <>
          <StudioRenderPreview render={job.data.result} />
          {attached ? (
            <p className="text-sm text-textItemBlur">
              Este vídeo já está anexado ao conteúdo.
            </p>
          ) : (
            <StudioButton disabled={blocked} onClick={onAttach}>
              Anexar vídeo ao conteúdo
            </StudioButton>
          )}
        </>
      ) : (
        <StudioMessage error>
          A produção terminou sem um arquivo disponível. Consulte o serviço
          antes de tentar novamente.
        </StudioMessage>
      )}
    </article>
  );
};

const StudioAudioUpload = ({
  onUploaded,
  disabled,
}: {
  onUploaded: (asset: { id: string; path: string; name?: string }) => void;
  disabled: boolean;
}) => {
  const latest = useRef(onUploaded);
  useEffect(() => {
    latest.current = onUploaded;
  }, [onUploaded]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uppy = useUppyUploader({
    allowedFileTypes: 'audio/mpeg,audio/mp4,audio/wav,audio/ogg',
    onStart: () => setPending(true),
    onEnd: () => setPending(false),
    onUploadSuccess: (result) => {
      const assets = result as unknown as Array<{
        id?: string;
        path?: string;
        name?: string;
      }>;
      if (!Array.isArray(assets) || !assets[0]?.id || !assets[0]?.path) {
        setError(
          'O envio não retornou um arquivo registrado. Consulte a biblioteca de mídia.'
        );
        return;
      }
      latest.current({
        id: assets[0].id,
        path: assets[0].path,
        name: assets[0].name,
      });
    },
  });
  useEffect(() => {
    const fail = () => {
      setError(
        'Não foi possível enviar o áudio. Confira o formato e tente novamente.'
      );
      setPending(false);
    };
    uppy.on('upload-error', fail);
    return () => {
      uppy.off('upload-error', fail);
      uppy.destroy();
    };
  }, [uppy]);
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > 256 * 1024 * 1024) {
      setError('O áudio deve ter até 256 MB.');
      return;
    }
    try {
      uppy.addFile({ name: file.name, type: file.type, data: file });
    } catch {
      setError('Não foi possível adicionar esse arquivo. Confira seu formato.');
    }
  };
  return (
    <div className="space-y-2">
      <label className="block space-y-2 text-sm font-semibold">
        <span>Enviar gravação ou música</span>
        <input
          className={studioInputClass}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg"
          onChange={upload}
          disabled={disabled || pending}
        />
      </label>
      <p className="text-xs text-textItemBlur">
        MP3, M4A, WAV ou OGG, até 256 MB. Depois do envio, registre o direito de
        uso.
      </p>
      {pending && (
        <StudioMessage>Enviando áudio para a biblioteca…</StudioMessage>
      )}
      {error && <StudioMessage error>{error}</StudioMessage>}
    </div>
  );
};

export const StudioProduction = ({
  project,
  document,
  onChange,
  capabilities,
  blocked,
  pending,
  onProjectAction,
}: StudioDocumentEditorProps & {
  project: StudioProject;
  capabilities?: StudioCapabilities;
  blocked: boolean;
  pending: string | null;
  onProjectAction: (
    path: string,
    body: Record<string, unknown>,
    success: string
  ) => Promise<void>;
}) => {
  const request = useStudioRequest();
  const production = useStudioProductionCapabilities(project.id);
  const [asset, setAsset] = useState<{
    id: string;
    path: string;
    name?: string;
    kind: StudioAsset['kind'];
  } | null>(null);
  const [license, setLicense] = useState<StudioAsset['license'] | ''>('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [attribution, setAttribution] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<StudioFormat>('vertical');
  const [voice, setVoice] = useState('nova');
  const [story, setStory] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const storageKey = `postiz:studio:${project.id}:render-jobs`;
  const [jobs, setJobs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) || '[]'
      );
      return Array.isArray(value)
        ? value
            .filter(
              (id): id is string => typeof id === 'string' && id.length < 500
            )
            .slice(0, 12)
        : [];
    } catch {
      return [];
    }
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState('0');
  const addingRef = useRef<HTMLDivElement>(null);
  const operation = useRef(false);
  const narration = document.identity.narration;
  const effectiveVoice =
    narration?.provider === 'local'
      ? 'local'
      : narration?.provider === 'openai'
      ? narration.voice || 'nova'
      : voice;
  const selectedForRender = selectedScenes.length
    ? document.scenes.filter((scene) => selectedScenes.includes(scene.id))
    : document.scenes;
  const missingAudio = selectedForRender.some(
    (scene) =>
      !scene.audioMediaId ||
      !document.media.some(
        (item) => item.id === scene.audioMediaId && item.kind === 'audio'
      )
  );
  const speechError = !production.data
    ? undefined
    : missingAudio && narration?.provider === 'recorded'
    ? 'A identidade usa gravação própria. Adicione um áudio a cada cena selecionada antes de produzir.'
    : missingAudio && effectiveVoice === 'local' && !production.data?.localVoice
    ? 'A voz local não está disponível neste servidor. Configure-a ou revise a origem da narração na Identidade.'
    : missingAudio &&
      effectiveVoice !== 'local' &&
      !production.data?.openaiVoice
    ? 'A voz do provedor não está configurada. Adicione gravações ou selecione uma voz local disponível.'
    : undefined;

  const selectAsset = (
    value: { id: string; path: string; name?: string },
    kind?: StudioAsset['kind']
  ) => {
    const detected =
      kind ||
      (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(value.path) ? 'video' : 'image');
    setAsset({ ...value, kind: detected });
    setName(value.name || value.path.split('/').pop()?.split('?')[0] || '');
    setLicense('');
    setSourceUrl('');
    setAttribution('');
    setError(null);
  };

  const registerAsset = () => {
    if (!asset || !license) return;
    const fields =
      addingRef.current?.querySelectorAll<HTMLInputElement>('input');
    if (fields && Array.from(fields).some((field) => !field.reportValidity()))
      return;
    if (license === 'licensed' && !studioHttpUrl(sourceUrl)) {
      setError('Informe a URL que comprova a licença de uso.');
      return;
    }
    if (sourceUrl && !studioHttpUrl(sourceUrl)) {
      setError('Informe uma referência com http:// ou https://.');
      return;
    }
    const item: StudioAsset = {
      ...asset,
      name: name.trim() || undefined,
      license,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(attribution ? { attribution } : {}),
    };
    onChange({
      ...document,
      media: [...document.media.filter((media) => media.id !== item.id), item],
    });
    setAsset(null);
    setError(null);
  };

  const render = async () => {
    if (
      blocked ||
      starting ||
      operation.current ||
      !project.approvals.script ||
      !production.data?.available ||
      speechError
    )
      return;
    operation.current = true;
    setStarting(true);
    setError(null);
    try {
      const result = await request<{ jobId: string }>(
        `/studio/projects/${encodeURIComponent(project.id)}/render`,
        {
          method: 'POST',
          body: JSON.stringify({
            revision: project.revision,
            format,
            ...(narration?.provider === 'recorded'
              ? {}
              : { voice: effectiveVoice }),
            language: document.identity.language || 'pt-BR',
            ...(selectedScenes.length ? { sceneIds: selectedScenes } : {}),
            ...(story ? { maxDurationSeconds: 30 } : {}),
            attempt: Number(retry),
          }),
        }
      );
      if (!result.jobId)
        throw new Error('O serviço não retornou o identificador da produção.');
      setJobs((current) => {
        const next = [
          result.jobId,
          ...current.filter((id) => id !== result.jobId),
        ].slice(0, 12);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          setError(
            'A produção começou. Este navegador não permite guardar seu acompanhamento após recarregar. Mantenha a página aberta até anexar o vídeo.'
          );
        }
        return next;
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível iniciar a produção.'
      );
    } finally {
      setStarting(false);
      operation.current = false;
    }
  };

  const removeMedia = (id: string) =>
    onChange({
      ...document,
      media: document.media.filter((item) => item.id !== id),
      renders: document.renders.filter((item) => item.id !== id),
      backgroundMusicMediaId:
        document.backgroundMusicMediaId === id
          ? undefined
          : document.backgroundMusicMediaId,
      scenes: document.scenes.map((scene) => ({
        ...scene,
        mediaId: scene.mediaId === id ? undefined : scene.mediaId,
        audioMediaId:
          scene.audioMediaId === id ? undefined : scene.audioMediaId,
      })),
      packages: document.packages.map((item) => ({
        ...item,
        mediaIds: item.mediaIds.filter((value) => value !== id),
        thumbnailMediaId:
          item.thumbnailMediaId === id ? undefined : item.thumbnailMediaId,
      })),
    });

  return (
    <>
      {error && <StudioMessage error>{error}</StudioMessage>}
      {production.error && (
        <StudioMessage error>{production.error.message}</StudioMessage>
      )}
      <StudioSection
        title="Mídias e direitos de uso"
        description="Use arquivos próprios, licenciados ou em domínio público. Registre a origem antes de incorporá-los às cenas e aos pacotes."
        actions={
          <StudioButton
            secondary
            disabled={Boolean(pending) || starting}
            onClick={() => showMediaBox((value) => selectAsset(value))}
          >
            Escolher imagem ou vídeo
          </StudioButton>
        }
      >
        <StudioAudioUpload
          onUploaded={(value) => selectAsset(value, 'audio')}
          disabled={Boolean(pending) || starting}
        />
        {asset && (
          <div
            ref={addingRef}
            className="space-y-4 rounded-lg border border-newTableBorder p-4"
          >
            <h3 className="font-semibold">Registrar arquivo selecionado</h3>
            <p className="break-words text-sm">Arquivo: {name}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <StudioSelect
                label="Tipo do arquivo"
                value={asset.kind}
                onChange={(kind) =>
                  setAsset({ ...asset, kind: kind as StudioAsset['kind'] })
                }
              >
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="audio">Áudio</option>
              </StudioSelect>
              <StudioSelect
                label="Direito de uso confirmado"
                value={license}
                onChange={(value) =>
                  setLicense(value as StudioAsset['license'])
                }
              >
                <option value="">Selecione após conferir</option>
                <option value="owned">
                  Produção própria com uso autorizado
                </option>
                <option value="licensed">Licença obtida para este uso</option>
                <option value="public-domain">
                  Domínio público verificado
                </option>
              </StudioSelect>
            </div>
            <StudioField
              label="Referência da origem ou licença"
              value={sourceUrl}
              onChange={setSourceUrl}
              type="url"
              required={license === 'licensed'}
              maxLength={2048}
            />
            <StudioField
              label="Crédito ou condições de atribuição"
              value={attribution}
              onChange={setAttribution}
              multiline
              maxLength={2000}
            />
            <div className="flex gap-2">
              <StudioButton disabled={!license} onClick={registerAsset}>
                Anexar arquivo e direitos
              </StudioButton>
              <StudioButton secondary onClick={() => setAsset(null)}>
                Cancelar seleção
              </StudioButton>
            </div>
          </div>
        )}
        {document.media.length === 0 ? (
          <StudioEmpty>Nenhum arquivo registrado neste conteúdo.</StudioEmpty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {document.media.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-lg border border-newTableBorder p-4"
              >
                <h3 className="break-words font-semibold">
                  {item.name || item.id}
                </h3>
                <p className="text-xs text-textItemBlur">
                  {item.kind === 'image'
                    ? 'Imagem'
                    : item.kind === 'video'
                    ? 'Vídeo'
                    : 'Áudio'}{' '}
                  ·{' '}
                  {item.license === 'owned'
                    ? 'Produção própria'
                    : item.license === 'licensed'
                    ? 'Licenciado'
                    : 'Domínio público'}
                </p>
                {studioHttpUrl(item.path) &&
                  (item.kind === 'image' ? (
                    <img
                      src={studioHttpUrl(item.path)}
                      alt={item.name || 'Mídia do conteúdo'}
                      loading="lazy"
                      className="max-h-48 w-full rounded-lg object-contain"
                    />
                  ) : item.kind === 'audio' ? (
                    <audio
                      src={studioHttpUrl(item.path)}
                      controls
                      preload="metadata"
                      className="w-full"
                      aria-label={item.name || 'Áudio do conteúdo'}
                    />
                  ) : (
                    <video
                      src={studioHttpUrl(item.path)}
                      controls
                      preload="metadata"
                      className="max-h-48 w-full rounded-lg"
                      aria-label={item.name || 'Vídeo do conteúdo'}
                    />
                  ))}
                {studioHttpUrl(item.sourceUrl) && (
                  <a
                    href={studioHttpUrl(item.sourceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                  >
                    Consultar origem ou licença
                  </a>
                )}
                {item.attribution && (
                  <p className="text-xs">Crédito: {item.attribution}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <StudioDownload path={item.path} name={item.name}>
                    Baixar arquivo
                  </StudioDownload>
                  <StudioButton
                    secondary
                    onClick={() => {
                      selectAsset(
                        { id: item.id, path: item.path || '', name: item.name },
                        item.kind
                      );
                      setLicense(item.license);
                      setSourceUrl(item.sourceUrl || '');
                      setAttribution(item.attribution || '');
                    }}
                  >
                    Editar registro
                  </StudioButton>
                  <StudioButton secondary onClick={() => removeMedia(item.id)}>
                    Remover do conteúdo
                  </StudioButton>
                  {item.kind === 'video' && (
                    <StudioButton
                      secondary
                      disabled={blocked || !production.data?.available}
                      onClick={() =>
                        void onProjectAction(
                          'style',
                          { mediaId: item.id },
                          'Referência medida. Confira as observações na identidade e revise sua aprovação.'
                        )
                      }
                    >
                      Medir referência visual
                    </StudioButton>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed text-textItemBlur">
          A análise de referência mede resolução, duração, quadros por segundo e
          cortes estimados. Os resultados entram nas evidências da identidade e
          informam seus limites.
        </p>
      </StudioSection>

      <StudioSection
        title="Produção de vídeo"
        description="Monte as cenas aprovadas com imagens, vídeos, cartelas, voz e legendas. O vídeo final deve ser conferido antes de entrar no pacote."
      >
        {!project.approvals.script && (
          <StudioMessage>
            Aprove o roteiro para liberar a produção.
          </StudioMessage>
        )}
        <p className="text-sm text-textItemBlur">
          {production.data?.reason ||
            capabilities?.media.reason ||
            'Verificando disponibilidade da produção.'}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <StudioSelect
            label="Formato do vídeo"
            value={format}
            onChange={(value) => setFormat(value as StudioFormat)}
            disabled={starting}
          >
            {Object.entries(formatLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </StudioSelect>
          {narration?.provider === 'recorded' ? (
            <p className="text-sm">
              Narração: gravação própria por cena, conforme a identidade
              aprovada.
            </p>
          ) : (
            <StudioSelect
              label="Voz para cenas sem gravação"
              value={effectiveVoice}
              onChange={setVoice}
              disabled={starting || Boolean(narration)}
              hint={
                narration
                  ? 'A escolha vem da identidade salva. Revise a identidade para alterá-la.'
                  : 'A voz local usa o servidor. As demais vozes usam a conta OpenAI configurada.'
              }
            >
              <option value="nova">Nova</option>
              <option value="alloy">Alloy</option>
              <option value="onyx">Onyx</option>
              <option value="shimmer">Shimmer</option>
              <option value="local" disabled={!production.data?.localVoice}>
                Voz local{production.data?.localVoice ? '' : ' (indisponível)'}
              </option>
            </StudioSelect>
          )}
          <StudioSelect
            label="Música de fundo"
            value={document.backgroundMusicMediaId || ''}
            onChange={(backgroundMusicMediaId) =>
              onChange({
                ...document,
                backgroundMusicMediaId: backgroundMusicMediaId || undefined,
              })
            }
          >
            <option value="">Sem música</option>
            {document.media
              .filter((item) => item.kind === 'audio')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
          </StudioSelect>
        </div>
        <StudioCheck
          label="Criar recorte de até 30 segundos para Story"
          checked={story}
          onChange={setStory}
          disabled={starting}
        />
        <details className="rounded-lg bg-newBgColor p-3">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
            Escolher cenas do recorte
          </summary>
          <p className="my-3 text-xs text-textItemBlur">
            Sem seleção, entram todas as cenas. A ordem segue o roteiro.
          </p>
          <div className="space-y-2">
            {document.scenes.map((scene, index) => (
              <StudioCheck
                key={scene.id}
                label={`Cena ${index + 1}: ${scene.narration.slice(0, 100)}`}
                checked={selectedScenes.includes(scene.id)}
                onChange={(checked) =>
                  setSelectedScenes((current) =>
                    checked
                      ? document.scenes
                          .filter(
                            (value) =>
                              value.id === scene.id ||
                              current.includes(value.id)
                          )
                          .map((value) => value.id)
                      : current.filter((id) => id !== scene.id)
                  )
                }
                disabled={starting}
              />
            ))}
          </div>
        </details>
        <details className="rounded-lg bg-newBgColor p-3">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
            Nova tentativa de uma produção que falhou
          </summary>
          <div className="mt-3">
            <StudioSelect
              label="Tentativa"
              value={retry}
              onChange={setRetry}
              hint="Na mesma versão e com as mesmas opções, a tentativa original recupera o mesmo trabalho. Alterar versão, opções ou tentativa pode iniciar outra geração e consumir novamente o provedor."
            >
              <option value="0">Original</option>
              <option value="1">Nova tentativa 1</option>
              <option value="2">Nova tentativa 2</option>
              <option value="3">Nova tentativa 3</option>
            </StudioSelect>
          </div>
        </details>
        <p className="text-xs leading-relaxed text-textItemBlur">
          Ao iniciar, cenas sem áudio gravado usam o serviço de voz configurado.
          A geração pode ter custo. Falhas não iniciam outra geração
          automaticamente.
        </p>
        {speechError && <StudioMessage error>{speechError}</StudioMessage>}
        <StudioButton
          onClick={() => void render()}
          disabled={
            blocked ||
            starting ||
            !project.approvals.script ||
            !production.data?.available ||
            Boolean(speechError) ||
            document.scenes.length === 0
          }
          loading={starting}
        >
          Produzir vídeo
        </StudioButton>
        <div className="space-y-4">
          {jobs.map((jobId) => (
            <StudioRenderJob
              key={jobId}
              project={project}
              jobId={jobId}
              blocked={blocked || starting}
              onAttach={() =>
                void onProjectAction(
                  `render/${encodeURIComponent(jobId)}/attach`,
                  {},
                  'Vídeo anexado ao conteúdo. Selecione o arquivo nos pacotes que deseja publicar.'
                )
              }
            />
          ))}
        </div>
      </StudioSection>

      <StudioBranding
        project={project}
        document={document}
        capabilities={production.data}
        blocked={blocked || starting}
        pending={pending}
        onAction={onProjectAction}
      />
      {document.renders.length > 0 && (
        <StudioSection title="Vídeos anexados ao conteúdo">
          <div className="grid gap-5 lg:grid-cols-2">
            {document.renders.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-newTableBorder p-4"
              >
                <StudioRenderPreview render={item} />
              </article>
            ))}
          </div>
        </StudioSection>
      )}
    </>
  );
};
