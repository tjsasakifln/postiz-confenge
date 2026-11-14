'use client';

import { useState } from 'react';
import type {
  StudioPackage,
  StudioPlatform,
  StudioScene,
  StudioSource,
} from '@gitroom/helpers/studio/studio.types';
import type { StudioDocumentEditorProps } from './studio.project';
import {
  StudioButton,
  StudioCheck,
  StudioEmpty,
  StudioField,
  StudioMessage,
  StudioSection,
  StudioSelect,
  studioHttpUrl,
} from './studio.ui';

export const studioPlatformLabels: Record<StudioPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

type GenerationProps = {
  onGenerate: () => void;
  generateDisabled: boolean;
  generating?: boolean;
};

const StudioHashtagsField = ({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) => {
  const [raw, setRaw] = useState(tags.join(' '));
  const value =
    raw.split(/\s+/).filter(Boolean).join(' ') === tags.join(' ')
      ? raw
      : tags.join(' ');
  return (
    <StudioField
      label="Hashtags"
      value={value}
      onChange={(next) => {
        setRaw(next);
        onChange(next.split(/\s+/).filter(Boolean));
      }}
      hint="Separe por espaço. Confira relevância e limites no editor do canal."
    />
  );
};

export const StudioIdentityEditor = ({
  document,
  onChange,
  onGenerate,
  generateDisabled,
  generating,
}: StudioDocumentEditorProps & GenerationProps) => {
  const change = (
    key: keyof typeof document.identity,
    value: string | string[]
  ) =>
    onChange({ ...document, identity: { ...document.identity, [key]: value } });
  return (
    <StudioSection
      title="Identidade editorial"
      description="Defina para quem a empresa fala, o que pode comprovar e o que ainda precisa testar."
      actions={
        <StudioButton
          secondary
          onClick={onGenerate}
          disabled={generateDisabled}
          loading={generating}
        >
          Sugerir identidade
        </StudioButton>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <StudioField
          label="Público e situação de compra"
          value={document.identity.audience}
          onChange={(value) => change('audience', value)}
          multiline
          maxLength={4000}
          hint="Quem decide, qual problema precisa resolver e o que impede a contratação."
        />
        <StudioField
          label="Posicionamento e oferta"
          value={document.identity.positioning}
          onChange={(value) => change('positioning', value)}
          multiline
          maxLength={4000}
          hint="Serviço, escopo, região, diferenciais comprováveis e capacidade de entrega."
        />
        <StudioField
          label="Tom de voz"
          value={document.identity.tone}
          onChange={(value) => change('tone', value)}
          multiline
          maxLength={2000}
        />
        <StudioField
          label="Direção visual"
          value={document.identity.visualStyle}
          onChange={(value) => change('visualStyle', value)}
          multiline
          maxLength={4000}
          hint="Descreva cores, tipografia, ritmo e referências. A reprodução depende das opções do produtor de mídia."
        />
        <StudioField
          label="Evidências verificadas"
          value={document.identity.evidence.join('\n')}
          onChange={(value) => change('evidence', value.split('\n'))}
          multiline
          rows={5}
          hint="Uma evidência por linha. Inclua origem, data e limitações de qualquer medida."
        />
        <StudioField
          label="Hipóteses a testar"
          value={document.identity.hypotheses.join('\n')}
          onChange={(value) => change('hypotheses', value.split('\n'))}
          multiline
          rows={5}
          hint="Uma hipótese por linha. Hipóteses não comprovam resultado nem desempenho comercial."
        />
      </div>
    </StudioSection>
  );
};

export const StudioSourcesEditor = ({
  document,
  onChange,
  onGenerate,
  generateDisabled,
  identityApproved,
  researchAvailable,
  researchReason,
  blocked,
  pending,
  onResearch,
}: StudioDocumentEditorProps &
  GenerationProps & {
    identityApproved: boolean;
    researchAvailable: boolean;
    researchReason?: string;
    blocked: boolean;
    pending: string | null;
    onResearch: (query: string) => void;
  }) => {
  const [query, setQuery] = useState('');
  const patch = (id: string, change: Partial<StudioSource>) =>
    onChange({
      ...document,
      sources: document.sources.map((source) =>
        source.id === id ? { ...source, ...change } : source
      ),
    });
  const add = () =>
    onChange({
      ...document,
      sources: [
        ...document.sources,
        {
          id: crypto.randomUUID(),
          url: '',
          title: '',
          excerpt: '',
          observedAt: new Date().toISOString(),
          risk: 'normal',
        },
      ],
    });
  return (
    <>
      <StudioSection
        title="Pauta e intenção comercial"
        description="Escolha uma dúvida que ajude o comprador a avançar. Use fontes próprias e referências que possam ser conferidas."
        actions={
          <StudioButton
            secondary
            onClick={onGenerate}
            disabled={generateDisabled || !identityApproved}
            loading={pending === 'generate'}
          >
            Sugerir pauta
          </StudioButton>
        }
      >
        {!identityApproved && (
          <StudioMessage>
            Aprove a identidade antes de pedir sugestões de pauta.
          </StudioMessage>
        )}
        <StudioField
          label="Pauta escolhida"
          value={document.topic}
          onChange={(topic) => onChange({ ...document, topic })}
          multiline
          rows={3}
          maxLength={3000}
          hint="Qual decisão o conteúdo deve ajudar a tomar? Qual é o próximo passo para o potencial cliente?"
        />
        <StudioField
          label="Observações e hipóteses para a próxima pauta"
          value={(document.editorialNotes || []).join('\n')}
          onChange={(value) =>
            onChange({
              ...document,
              editorialNotes: value ? value.split('\n') : [],
            })
          }
          multiline
          rows={4}
          maxLength={40000}
          hint="Uma nota por linha, até vinte notas de dois mil caracteres. Mantenha a data e as publicações de origem. Notas de audiência continuam sendo observações ou hipóteses e precisam de revisão."
        />
      </StudioSection>
      <StudioSection
        title="Pesquisa de referências"
        description="A pesquisa adiciona links e trechos ao conteúdo. Abra as fontes e confira contexto, autoria e atualidade antes de aprovar."
      >
        <StudioField
          label="O que pesquisar"
          value={query}
          onChange={setQuery}
          maxLength={300}
          placeholder="Tema, dúvida do cliente ou referência técnica"
        />
        <div className="flex flex-wrap items-center gap-3">
          <StudioButton
            onClick={() => onResearch(query.trim())}
            disabled={
              blocked ||
              !researchAvailable ||
              !identityApproved ||
              query.trim().length < 3
            }
            loading={pending === 'research'}
          >
            Pesquisar fontes
          </StudioButton>
          <p className="max-w-2xl text-xs leading-relaxed text-textItemBlur">
            {researchReason || 'Verificando disponibilidade da pesquisa.'}
          </p>
        </div>
      </StudioSection>
      <StudioSection
        title="Fontes do conteúdo"
        description="Associe cada afirmação técnica a uma referência. Marque riscos de direitos, contexto ou confiabilidade para exigir revisão adicional."
        actions={
          <StudioButton
            secondary
            onClick={add}
            disabled={document.sources.length >= 100}
          >
            Adicionar fonte manual
          </StudioButton>
        }
      >
        {document.sources.length === 0 ? (
          <StudioEmpty>
            Nenhuma fonte adicionada. Inclua uma referência própria ou faça uma
            pesquisa.
          </StudioEmpty>
        ) : (
          <div className="space-y-5">
            {document.sources.map((source, index) => (
              <section
                key={source.id}
                className="space-y-4 rounded-lg border border-newTableBorder p-4"
                aria-label={`Fonte ${index + 1}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Fonte {index + 1}</h3>
                  <div className="flex items-center gap-3">
                    {studioHttpUrl(source.url) && (
                      <a
                        className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                        href={studioHttpUrl(source.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir referência
                      </a>
                    )}
                    <StudioButton
                      secondary
                      aria-label={`Remover fonte ${index + 1}`}
                      onClick={() =>
                        onChange({
                          ...document,
                          sources: document.sources.filter(
                            (item) => item.id !== source.id
                          ),
                          scenes: document.scenes.map((scene) => ({
                            ...scene,
                            sourceIds: scene.sourceIds.filter(
                              (id) => id !== source.id
                            ),
                          })),
                        })
                      }
                    >
                      Remover
                    </StudioButton>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <StudioField
                    label={`Título da fonte ${index + 1}`}
                    value={source.title}
                    onChange={(title) => patch(source.id, { title })}
                    required
                    maxLength={1000}
                  />
                  <StudioField
                    label={`URL da fonte ${index + 1}`}
                    value={source.url}
                    onChange={(url) => patch(source.id, { url })}
                    type="url"
                    required
                    maxLength={2048}
                  />
                  <StudioField
                    label="Data de consulta"
                    value={source.observedAt.slice(0, 10)}
                    onChange={(value) =>
                      patch(source.id, {
                        observedAt: value
                          ? new Date(`${value}T12:00:00Z`).toISOString()
                          : '',
                      })
                    }
                    type="date"
                    required
                  />
                  <StudioSelect
                    label="Revisão de risco"
                    value={source.risk || 'normal'}
                    onChange={(risk) =>
                      patch(source.id, { risk: risk as 'normal' | 'high' })
                    }
                  >
                    <option value="normal">Revisão habitual</option>
                    <option value="high">
                      Risco alto, requer análise adicional
                    </option>
                  </StudioSelect>
                </div>
                <StudioField
                  label="Trecho relevante e limites de uso"
                  value={source.excerpt}
                  onChange={(excerpt) => patch(source.id, { excerpt })}
                  multiline
                  rows={4}
                  maxLength={6000}
                />
              </section>
            ))}
          </div>
        )}
      </StudioSection>
    </>
  );
};

export const StudioScenesEditor = ({
  document,
  onChange,
  onGenerate,
  generateDisabled,
  generating,
}: StudioDocumentEditorProps & GenerationProps) => {
  const patch = (id: string, change: Partial<StudioScene>) =>
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...change } : scene
      ),
    });
  const move = (index: number, direction: number) => {
    const scenes = [...document.scenes];
    [scenes[index], scenes[index + direction]] = [
      scenes[index + direction],
      scenes[index],
    ];
    onChange({ ...document, scenes });
  };
  return (
    <StudioSection
      title="Roteiro por cenas"
      description="Comece com um gancho de até três segundos. A legenda mantém a escrita correta; a pronúncia orienta somente a voz."
      actions={
        <>
          <StudioButton
            secondary
            disabled={generateDisabled}
            onClick={onGenerate}
            loading={generating}
          >
            Sugerir roteiro
          </StudioButton>
          <StudioButton
            secondary
            disabled={document.scenes.length >= 80}
            onClick={() =>
              onChange({
                ...document,
                scenes: [
                  ...document.scenes,
                  {
                    id: crypto.randomUUID(),
                    narration: '',
                    pronunciation: '',
                    visual: '',
                    durationSeconds: document.scenes.length ? 8 : 3,
                    sourceIds: [],
                    kind: 'card',
                  },
                ],
              })
            }
          >
            Adicionar cena
          </StudioButton>
        </>
      }
    >
      {document.scenes.length === 0 ? (
        <StudioEmpty>
          O roteiro ainda não tem cenas. Crie uma cena ou solicite uma sugestão
          após aprovar a identidade.
        </StudioEmpty>
      ) : (
        <>
          <p className="text-sm text-textItemBlur">
            {document.scenes.length} cena(s) · duração planejada de{' '}
            {document.scenes.reduce(
              (sum, scene) => sum + scene.durationSeconds,
              0
            )}{' '}
            segundos. A duração final será medida no áudio produzido.
          </p>
          {document.scenes[0].durationSeconds > 3 && (
            <StudioMessage error>
              O gancho da primeira cena ultrapassa três segundos. Reduza o texto
              e a duração antes de aprovar.
            </StudioMessage>
          )}
          {document.scenes.map((scene, index) => (
            <section
              key={scene.id}
              className="space-y-4 rounded-lg border border-newTableBorder p-4"
              aria-label={`Cena ${index + 1}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  Cena {index + 1}
                  {index === 0 ? ': gancho' : ''}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <StudioButton
                    secondary
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Mover cena ${index + 1} para cima`}
                  >
                    Subir
                  </StudioButton>
                  <StudioButton
                    secondary
                    disabled={index === document.scenes.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Mover cena ${index + 1} para baixo`}
                  >
                    Descer
                  </StudioButton>
                  <StudioButton
                    secondary
                    onClick={() =>
                      onChange({
                        ...document,
                        scenes: document.scenes.filter(
                          (item) => item.id !== scene.id
                        ),
                      })
                    }
                    aria-label={`Remover cena ${index + 1}`}
                  >
                    Remover
                  </StudioButton>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <StudioField
                  label={`Narração e legenda da cena ${index + 1}`}
                  value={scene.narration}
                  onChange={(narration) => patch(scene.id, { narration })}
                  multiline
                  rows={4}
                  maxLength={8000}
                  required
                  hint="Texto com acentos, siglas e termos técnicos escritos corretamente."
                />
                <StudioField
                  label={`Pronúncia da cena ${index + 1}`}
                  value={scene.pronunciation || ''}
                  onChange={(pronunciation) =>
                    patch(scene.id, { pronunciation })
                  }
                  multiline
                  rows={4}
                  maxLength={8000}
                  hint="Opcional. Use a forma falada de siglas e números apenas aqui. Este campo não vai para a legenda."
                />
                <StudioField
                  label="Duração planejada, em segundos"
                  value={scene.durationSeconds}
                  onChange={(value) =>
                    patch(scene.id, { durationSeconds: Number(value) })
                  }
                  type="number"
                  min={1}
                  max={index === 0 ? 3 : 600}
                  step={1}
                  required
                />
                <StudioSelect
                  label="Visual da cena"
                  value={scene.kind}
                  onChange={(kind) =>
                    patch(scene.id, {
                      kind: kind as StudioScene['kind'],
                      mediaId: undefined,
                    })
                  }
                >
                  <option value="card">Cartela com texto</option>
                  <option value="image">Imagem da biblioteca</option>
                  <option value="video">Vídeo da biblioteca</option>
                </StudioSelect>
              </div>
              <StudioField
                label="Texto da cartela ou orientação visual"
                value={scene.visual}
                onChange={(visual) => patch(scene.id, { visual })}
                multiline
                maxLength={4000}
                hint="As cartelas usam este texto. Para imagem ou vídeo, anexe o arquivo em Produção e selecione abaixo."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {scene.kind !== 'card' && (
                  <StudioSelect
                    label="Arquivo visual"
                    value={scene.mediaId || ''}
                    onChange={(mediaId) =>
                      patch(scene.id, { mediaId: mediaId || undefined })
                    }
                  >
                    <option value="">Selecione um arquivo registrado</option>
                    {document.media
                      .filter((item) => item.kind === scene.kind)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                  </StudioSelect>
                )}
                <StudioSelect
                  label="Áudio gravado desta cena"
                  value={scene.audioMediaId || ''}
                  onChange={(audioMediaId) =>
                    patch(scene.id, { audioMediaId: audioMediaId || undefined })
                  }
                  hint="Sem gravação, a produção usará a voz configurada e poderá gerar cobrança no provedor."
                >
                  <option value="">Gerar voz a partir do texto</option>
                  {document.media
                    .filter((item) => item.kind === 'audio')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.id}
                      </option>
                    ))}
                </StudioSelect>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">
                  Fontes desta cena
                </legend>
                {document.sources.length === 0 ? (
                  <p className="text-xs text-textItemBlur">
                    Adicione referências em Pauta e fontes.
                  </p>
                ) : (
                  document.sources.map((source) => (
                    <StudioCheck
                      key={source.id}
                      label={`${source.title || 'Fonte sem título'}${
                        source.risk === 'high' ? ' (risco alto)' : ''
                      }`}
                      checked={scene.sourceIds.includes(source.id)}
                      onChange={(checked) =>
                        patch(scene.id, {
                          sourceIds: checked
                            ? [...scene.sourceIds, source.id]
                            : scene.sourceIds.filter((id) => id !== source.id),
                        })
                      }
                    />
                  ))
                )}
              </fieldset>
            </section>
          ))}
        </>
      )}
    </StudioSection>
  );
};

export const StudioPackagesEditor = ({
  document,
  onChange,
  onGenerate,
  generateDisabled,
  generating,
}: StudioDocumentEditorProps & GenerationProps) => {
  const patch = (platform: StudioPlatform, change: Partial<StudioPackage>) =>
    onChange({
      ...document,
      packages: document.packages.map((item) =>
        item.platform === platform ? { ...item, ...change } : item
      ),
    });
  const media = [
    ...document.media.filter((item) => item.kind !== 'audio'),
    ...document.renders
      .filter((render) => !document.media.some((item) => item.id === render.id))
      .map((render) => ({ ...render, kind: 'video' as const })),
  ];
  const platforms: StudioPlatform[] = ['youtube', 'instagram', 'linkedin'];
  return (
    <StudioSection
      title="Pacotes por canal"
      description="Revise a peça, a oferta e o destino do contato em cada canal. As opções sugeridas são hipóteses editoriais; o desempenho depende da publicação real."
      actions={
        <StudioButton
          secondary
          disabled={generateDisabled}
          onClick={onGenerate}
          loading={generating}
        >
          Sugerir pacotes
        </StudioButton>
      }
    >
      <div className="flex flex-wrap gap-2">
        {platforms
          .filter(
            (platform) =>
              !document.packages.some((item) => item.platform === platform)
          )
          .map((platform) => (
            <StudioButton
              key={platform}
              secondary
              onClick={() =>
                onChange({
                  ...document,
                  packages: [
                    ...document.packages,
                    {
                      platform,
                      title: '',
                      description: '',
                      hashtags: [],
                      cta: '',
                      landingUrl: '',
                      utmSource: platform,
                      utmMedium: 'organic_social',
                      utmCampaign: '',
                      mediaIds: [],
                    },
                  ],
                })
              }
            >
              Adicionar {studioPlatformLabels[platform]}
            </StudioButton>
          ))}
      </div>
      {document.packages.length === 0 && (
        <StudioEmpty>
          Nenhum pacote criado. Adicione um canal para preparar seus textos e
          arquivos.
        </StudioEmpty>
      )}
      {document.packages.map((item) => {
        let trackedUrl = studioHttpUrl(item.landingUrl);
        if (trackedUrl) {
          const url = new URL(trackedUrl);
          if (item.utmSource)
            url.searchParams.set('utm_source', item.utmSource);
          if (item.utmMedium)
            url.searchParams.set('utm_medium', item.utmMedium);
          if (item.utmCampaign)
            url.searchParams.set('utm_campaign', item.utmCampaign);
          trackedUrl = url.href;
        }
        return (
          <section
            key={item.platform}
            className="space-y-4 rounded-lg border border-newTableBorder p-4"
            aria-label={`Pacote ${studioPlatformLabels[item.platform]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {studioPlatformLabels[item.platform]}
              </h3>
              <StudioButton
                secondary
                aria-label={`Remover pacote ${
                  studioPlatformLabels[item.platform]
                }`}
                onClick={() =>
                  onChange({
                    ...document,
                    packages: document.packages.filter(
                      (pack) => pack.platform !== item.platform
                    ),
                  })
                }
              >
                Remover canal
              </StudioButton>
            </div>
            <StudioField
              label="Título escolhido"
              value={item.title}
              onChange={(title) => patch(item.platform, { title })}
              maxLength={100}
              required
            />
            {Boolean(item.titleOptions?.length) && (
              <details className="rounded-lg bg-newBgColor p-3">
                <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-btnPrimary">
                  Opções de título
                </summary>
                <ul className="mt-3 space-y-2">
                  {item.titleOptions!.map((option, index) => {
                    const candidate = item.titleCandidates?.find(
                      (value) => value.text === option
                    );
                    return (
                      <li
                        key={`${index}-${option}`}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="space-y-1">
                          <p>
                            {index + 1}. {option}
                          </p>
                          {candidate && (
                            <>
                              <p className="text-xs font-semibold">
                                Critérios editoriais: {candidate.score}/100
                              </p>
                              <p className="text-xs text-textItemBlur">
                                {candidate.criteria.join(' ')}
                              </p>
                            </>
                          )}
                        </div>
                        <StudioButton
                          secondary
                          onClick={() =>
                            patch(item.platform, { title: option })
                          }
                          aria-label={`Usar opção de título ${index + 1} para ${
                            studioPlatformLabels[item.platform]
                          }`}
                        >
                          Usar
                        </StudioButton>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            <StudioField
              label="Descrição ou legenda do post"
              value={item.description}
              onChange={(description) => patch(item.platform, { description })}
              multiline
              rows={6}
              maxLength={10000}
              required
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <StudioHashtagsField
                tags={item.hashtags}
                onChange={(hashtags) => patch(item.platform, { hashtags })}
              />
              <StudioField
                label="Próximo passo do cliente"
                value={item.cta}
                onChange={(cta) => patch(item.platform, { cta })}
                maxLength={2000}
                hint="Uma ação clara e compatível com a oferta e a etapa da compra."
              />
            </div>
            <StudioField
              label="Página de destino ou contato"
              value={item.landingUrl}
              onChange={(landingUrl) => patch(item.platform, { landingUrl })}
              type="url"
              maxLength={2048}
              hint="Use uma página que explique o serviço e permita registrar o contato. Inclua https://."
            />
            <div className="grid gap-4 md:grid-cols-3">
              <StudioField
                label="Origem do acesso (UTM)"
                value={item.utmSource}
                onChange={(utmSource) => patch(item.platform, { utmSource })}
                maxLength={150}
              />
              <StudioField
                label="Meio do acesso (UTM)"
                value={item.utmMedium}
                onChange={(utmMedium) => patch(item.platform, { utmMedium })}
                maxLength={150}
              />
              <StudioField
                label="Campanha (UTM)"
                value={item.utmCampaign}
                onChange={(utmCampaign) =>
                  patch(item.platform, { utmCampaign })
                }
                maxLength={150}
              />
            </div>
            {trackedUrl && (
              <p className="break-all text-xs text-textItemBlur">
                Link rastreável:{' '}
                <a
                  href={trackedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  {trackedUrl}
                </a>
              </p>
            )}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">
                Arquivos do pacote
              </legend>
              {media.length === 0 ? (
                <p className="text-sm text-textItemBlur">
                  Adicione ou produza arquivos na etapa Produção.
                </p>
              ) : (
                media.map((asset) => (
                  <StudioCheck
                    key={asset.id}
                    label={`${asset.kind === 'video' ? 'Vídeo' : 'Imagem'}: ${
                      asset.name || asset.id
                    }`}
                    checked={item.mediaIds.includes(asset.id)}
                    onChange={(checked) =>
                      patch(item.platform, {
                        mediaIds: checked
                          ? [...item.mediaIds, asset.id]
                          : item.mediaIds.filter((id) => id !== asset.id),
                      })
                    }
                  />
                ))
              )}
            </fieldset>
            {item.platform !== 'linkedin' ? (
              <StudioSelect
                label="Capa ou miniatura do vídeo"
                value={item.thumbnailMediaId || ''}
                onChange={(thumbnailMediaId) =>
                  patch(item.platform, {
                    thumbnailMediaId: thumbnailMediaId || undefined,
                  })
                }
                hint="A capa é aplicada aos vídeos. Confira o resultado e os requisitos do canal no editor do Postiz."
              >
                <option value="">Sem capa selecionada</option>
                {document.media
                  .filter((asset) => asset.kind === 'image')
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name || asset.id}
                    </option>
                  ))}
              </StudioSelect>
            ) : (
              <p className="text-xs text-textItemBlur">
                A integração atual do LinkedIn não aplica uma capa separada ao
                vídeo. Confira a prévia no editor do canal.
              </p>
            )}
            {Boolean(item.thumbnailOptions?.length) && (
              <div className="space-y-2 rounded-lg bg-newBgColor p-3">
                <h4 className="text-sm font-semibold">
                  Direções de capa para revisar
                </h4>
                <ul className="space-y-3 text-sm">
                  {item.thumbnailOptions!.map((option, index) => {
                    const candidate = item.thumbnailCandidates?.find(
                      (value) => value.text === option
                    );
                    return (
                      <li key={index}>
                        <p>
                          {index + 1}. {option}
                        </p>
                        {candidate && (
                          <>
                            <p className="mt-1 text-xs font-semibold">
                              Critérios editoriais: {candidate.score}/100
                            </p>
                            <p className="text-xs text-textItemBlur">
                              {candidate.criteria.join(' ')}
                            </p>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {Boolean(item.heuristicNotes?.length) && (
              <div className="space-y-2 rounded-lg bg-newBgColor p-3">
                <h4 className="text-sm font-semibold">
                  Critérios editoriais usados nas sugestões
                </h4>
                <ul className="list-inside list-disc space-y-1 text-xs text-textItemBlur">
                  {item.heuristicNotes!.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
                <p className="text-xs text-textItemBlur">
                  Esses critérios não são métricas de audiência nem previsão de
                  leads.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </StudioSection>
  );
};
