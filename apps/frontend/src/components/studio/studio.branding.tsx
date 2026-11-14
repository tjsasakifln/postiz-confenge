'use client';

import { useState } from 'react';
import type {
  StudioDocument,
  StudioProductionCapabilities,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import {
  StudioButton,
  StudioMessage,
  StudioSection,
  StudioSelect,
} from './studio.ui';

export const StudioBranding = ({
  project,
  document,
  capabilities,
  blocked,
  pending,
  onAction,
}: {
  project: StudioProject;
  document: StudioDocument;
  capabilities?: StudioProductionCapabilities;
  blocked: boolean;
  pending: string | null;
  onAction: (
    path: string,
    body: Record<string, unknown>,
    success: string
  ) => Promise<void>;
}) => {
  const [videoId, setVideoId] = useState('');
  const [format, setFormat] = useState('vertical');
  const [variant, setVariant] = useState('0');
  const brandName = document.identity.brandName?.trim();
  const videos = document.media.filter((item) => item.kind === 'video');
  const canUseImages = !blocked && Boolean(capabilities?.images);
  const run = (body: Record<string, unknown>, message: string): void => {
    void onAction('images', body, message);
  };
  return (
    <>
      <StudioSection
        title="Capas e carrossel"
        description="Crie as peças a partir do roteiro ou extraia três quadros de um vídeo já registrado no conteúdo. Revise legibilidade e enquadramento antes de escolher a capa."
      >
        <div className="flex flex-wrap gap-3">
          <StudioButton
            secondary
            disabled={!canUseImages || !project.approvals.script}
            loading={pending === 'images'}
            onClick={() =>
              run(
                { kind: 'thumbnails' },
                'Três capas de texto criadas. Confira os arquivos e selecione a capa em cada pacote.'
              )
            }
          >
            Criar três capas de texto
          </StudioButton>
          <StudioButton
            secondary
            disabled={!canUseImages || !project.approvals.script}
            onClick={() =>
              run(
                { kind: 'carousel' },
                'Carrossel criado. Confira a ordem e os textos antes de aprovar o pacote.'
              )
            }
          >
            Criar carrossel
          </StudioButton>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <StudioSelect
            label="Vídeo para extrair capas"
            value={videoId}
            onChange={setVideoId}
          >
            <option value="">Selecione um vídeo registrado</option>
            {videos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.id}
              </option>
            ))}
          </StudioSelect>
          <StudioSelect
            label="Formato das capas de quadros"
            value={format}
            onChange={setFormat}
          >
            <option value="vertical">Vertical 9:16</option>
            <option value="horizontal">Horizontal 16:9</option>
          </StudioSelect>
        </div>
        <StudioButton
          secondary
          disabled={
            !canUseImages ||
            !capabilities?.available ||
            !project.approvals.script ||
            !videos.some((item) => item.id === videoId)
          }
          onClick={() =>
            run(
              { kind: 'frame-covers', mediaId: videoId, format },
              'Três capas extraídas do vídeo. Confira enquadramento e texto antes de escolher.'
            )
          }
        >
          Criar capas de três quadros
        </StudioButton>
        <p className="text-xs text-textItemBlur">
          A extração usa quadros próximos de 20%, 50% e 80% do vídeo. Somente
          arquivos registrados com direito de uso neste conteúdo podem ser
          selecionados.
        </p>
      </StudioSection>
      <StudioSection
        title="Peças da marca"
        description="Compare direções visuais e produza arquivos de logo, avatar, banner e marca d’água. As composições usam formas simples e o nome informado; precisam de revisão visual e de autorização de uso."
      >
        <StudioButton
          secondary
          disabled={!canUseImages || !project.approvals.identity}
          onClick={() =>
            run(
              { kind: 'brand' },
              'Três propostas visuais criadas. Confira as cores, o nome e a tipografia.'
            )
          }
        >
          Criar três propostas visuais
        </StudioButton>
        <p className="text-sm">
          Nome aplicado:{' '}
          <strong>{brandName || 'Defina o nome da marca na Identidade'}</strong>
        </p>
        <div className="max-w-md">
          <StudioSelect
            label="Composição geométrica do conjunto"
            value={variant}
            onChange={setVariant}
          >
            <option value="0">Composição 1</option>
            <option value="1">Composição 2</option>
            <option value="2">Composição 3</option>
          </StudioSelect>
        </div>
        <StudioButton
          secondary
          disabled={!canUseImages || !project.approvals.identity || !brandName}
          onClick={() =>
            run(
              { kind: 'brand-kit', brandName, variant: Number(variant) },
              'Logo, avatar, banner e marca d’água criados. Revise os arquivos na biblioteca deste conteúdo.'
            )
          }
        >
          Criar conjunto de arquivos da marca
        </StudioButton>
        <p className="text-xs text-textItemBlur">
          O banner tem 2560 × 1440 pixels com área central segura. O conjunto
          entrega arquivos PNG; não altera a identidade dos canais conectados.
        </p>
        {!capabilities && (
          <StudioMessage>Verificando os recursos de produção…</StudioMessage>
        )}
      </StudioSection>
    </>
  );
};
