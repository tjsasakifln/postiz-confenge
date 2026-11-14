'use client';

import { useRef, useState } from 'react';
import type {
  StudioCapabilities,
  StudioEditorialSchedule,
  StudioIdentity,
  StudioLanguage,
  StudioPlatform,
  StudioProject,
  StudioVoice,
} from '@gitroom/helpers/studio/studio.types';
import type { StudioDocumentEditorProps } from './studio.project';
import { useStudioRequest } from './studio.hooks';
import { studioPlatformLabels } from './studio.content';
import {
  StudioButton,
  StudioEmpty,
  StudioField,
  StudioMessage,
  StudioSection,
  StudioSelect,
  formatStudioDate,
} from './studio.ui';

export const studioWeekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const StudioIdentitySettings = ({
  projectId,
  document,
  onChange,
  templates,
  capabilities,
  onBusyChange,
}: StudioDocumentEditorProps & {
  projectId: string;
  templates?: StudioProject[];
  capabilities?: StudioCapabilities;
  onBusyChange: (busy: boolean) => void;
}) => {
  const request = useStudioRequest();
  const [templateId, setTemplateId] = useState('');
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const identity = document.identity;
  const patch = (change: Partial<StudioIdentity>) =>
    onChange({ ...document, identity: { ...identity, ...change } });
  const patchSchedule = (change: Partial<StudioEditorialSchedule>) =>
    patch({
      schedule: { timezone: '', slots: [], ...identity.schedule, ...change },
    });
  const candidates = templates?.filter(
    (item) =>
      item.id !== projectId &&
      item.approvals.identity &&
      (!identity.channel ||
        !item.document.identity.channel ||
        item.document.identity.channel.platform === identity.channel.platform)
  );
  const selectedTemplate = candidates?.find((item) => item.id === templateId);
  const selectedChannel = identity.channel?.integrationId
    ? `account:${identity.channel.integrationId}`
    : identity.channel?.platform || '';
  const staleAccount =
    identity.channel?.integrationId &&
    !capabilities?.integrations.some(
      (item) => item.id === identity.channel!.integrationId
    );
  let timezoneError: string | undefined;
  if (identity.schedule) {
    try {
      if (!identity.schedule.timezone) throw new Error('Missing timezone');
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: identity.schedule.timezone,
      }).format(new Date());
    } catch {
      timezoneError = 'Informe um fuso IANA válido, como America/Sao_Paulo.';
    }
  }
  const copy = async () => {
    if (!templateId || operation.current) return;
    operation.current = true;
    setCopying(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const source = await request<StudioProject>(
        `/studio/projects/${encodeURIComponent(templateId)}`
      );
      if (!source.approvals.identity)
        throw new Error(
          'O modelo foi alterado e precisa de nova aprovação no conteúdo de origem.'
        );
      onChange({
        ...document,
        identity: {
          ...structuredClone(source.document.identity),
          channel: identity.channel,
          copiedFrom: {
            projectId: source.id,
            revision: source.revision,
            copiedAt: new Date().toISOString(),
          },
        },
      });
      setMessage(
        `Modelo de “${source.title}” copiado para revisão. Confira se a oferta e as evidências se aplicam a este conteúdo. Salve e aprove a identidade desta versão.`
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível recuperar o modelo editorial.'
      );
    } finally {
      operation.current = false;
      setCopying(false);
      onBusyChange(false);
    }
  };
  return (
    <>
      <StudioSection
        title="Modelo editorial do canal"
        description="Reutilize uma identidade já aprovada como ponto de partida. Cada conteúdo mantém sua própria cópia e sua revisão."
      >
        <StudioSelect
          label="Canal deste modelo"
          value={selectedChannel}
          onChange={(value) => {
            if (!value) {
              patch({ channel: undefined });
              return;
            }
            const account = capabilities?.integrations.find(
              (item) => `account:${item.id}` === value
            );
            patch({
              channel: account
                ? { platform: account.platform, integrationId: account.id }
                : { platform: value as StudioPlatform },
            });
            setTemplateId('');
          }}
        >
          <option value="">Ainda não definido</option>
          {(['youtube', 'instagram', 'linkedin'] as StudioPlatform[]).map(
            (platform) => (
              <option key={platform} value={platform}>
                {studioPlatformLabels[platform]} · modelo sem conta específica
              </option>
            )
          )}
          {capabilities?.integrations.map((account) => (
            <option key={account.id} value={`account:${account.id}`}>
              {studioPlatformLabels[account.platform]} · {account.name}
            </option>
          ))}
          {staleAccount && (
            <option value={selectedChannel}>
              {studioPlatformLabels[identity.channel!.platform]} · conta
              anteriormente vinculada
            </option>
          )}
        </StudioSelect>
        <div className="grid items-end gap-3 lg:grid-cols-[1fr_auto]">
          <StudioSelect
            label="Identidade aprovada para reutilizar"
            value={templateId}
            onChange={(value) => {
              setTemplateId(value);
              setMessage(null);
              setError(null);
            }}
            disabled={copying || !candidates?.length}
            hint="Entre os até 50 conteúdos mais recentes, a lista mostra identidades aprovadas da mesma plataforma e modelos antigos sem canal definido."
          >
            <option value="">Selecione um conteúdo de origem</option>
            {candidates?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · versão {item.revision}
              </option>
            ))}
          </StudioSelect>
          <StudioButton
            secondary
            disabled={!selectedTemplate || copying}
            loading={copying}
            onClick={() => void copy()}
          >
            Copiar modelo para este conteúdo
          </StudioButton>
        </div>
        {templates && !candidates?.length && (
          <StudioEmpty>
            Não há outro modelo aprovado disponível para esta plataforma.
            Preencha e aprove a identidade deste conteúdo para poder
            reutilizá-la depois.
          </StudioEmpty>
        )}
        {selectedTemplate && (
          <div className="space-y-2 rounded-lg bg-newBgColor p-4 text-sm">
            <p>
              <strong>Público:</strong>{' '}
              {selectedTemplate.document.identity.audience}
            </p>
            <p>
              <strong>Oferta:</strong>{' '}
              {selectedTemplate.document.identity.positioning}
            </p>
            <p className="text-xs text-textItemBlur">
              Aprovada em{' '}
              {formatStudioDate(
                selectedTemplate.approvals.identity!.approvedAt
              )}
              . Copiar o modelo não transfere a aprovação para o novo conteúdo.
            </p>
          </div>
        )}
        {identity.copiedFrom && (
          <p className="text-xs text-textItemBlur">
            Modelo copiado de{' '}
            {templates?.find(
              (item) => item.id === identity.copiedFrom!.projectId
            )?.title || 'outro conteúdo da organização'}
            , versão {identity.copiedFrom.revision}, em{' '}
            {formatStudioDate(identity.copiedFrom.copiedAt)}.
          </p>
        )}
        {error && <StudioMessage error>{error}</StudioMessage>}
        {message && <StudioMessage>{message}</StudioMessage>}
      </StudioSection>
      <StudioSection
        title="Idioma, voz e apresentação"
        description="Esses parâmetros orientam os próximos textos e arquivos. Alterar a identidade exige uma nova revisão das etapas afetadas."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <StudioField
            label="Nome da marca"
            value={identity.brandName || ''}
            onChange={(brandName) =>
              patch({ brandName: brandName || undefined })
            }
            maxLength={80}
            hint="Use o nome autorizado para aparecer nas peças."
          />
          <StudioSelect
            label="Idioma do conteúdo"
            value={identity.language || ''}
            onChange={(value) =>
              patch({ language: value ? (value as StudioLanguage) : undefined })
            }
          >
            <option value="">
              Português brasileiro, padrão dos conteúdos antigos
            </option>
            <option value="pt-BR">Português brasileiro</option>
            <option value="en">Inglês</option>
            <option value="es">Espanhol</option>
          </StudioSelect>
          <StudioSelect
            label="Origem da narração"
            value={identity.narration?.provider || ''}
            onChange={(provider) =>
              patch({
                narration: !provider
                  ? undefined
                  : provider === 'openai'
                  ? { provider, voice: identity.narration?.voice || 'nova' }
                  : { provider: provider as 'recorded' | 'local' },
              })
            }
            hint="A gravação própria exige um arquivo de áudio em cada cena. As vozes disponíveis serão conferidas antes da produção."
          >
            <option value="">Escolher ao produzir</option>
            <option value="recorded">Gravação própria por cena</option>
            <option value="openai">Voz pelo provedor OpenAI</option>
            <option value="local">Voz local do servidor</option>
          </StudioSelect>
          {identity.narration?.provider === 'openai' && (
            <StudioSelect
              label="Voz preferida"
              value={identity.narration.voice || 'nova'}
              onChange={(voice) =>
                patch({
                  narration: {
                    provider: 'openai',
                    voice: voice as StudioVoice,
                  },
                })
              }
            >
              <option value="nova">Nova</option>
              <option value="alloy">Alloy</option>
              <option value="onyx">Onyx</option>
              <option value="shimmer">Shimmer</option>
            </StudioSelect>
          )}
          <StudioField
            label="Cor principal"
            value={identity.primaryColor || ''}
            onChange={(primaryColor) =>
              patch({ primaryColor: primaryColor || undefined })
            }
            placeholder="#132128"
            pattern="#[0-9a-fA-F]{6}"
            maxLength={7}
            hint="Código hexadecimal com seis caracteres após #."
          />
          <StudioField
            label="Cor secundária"
            value={identity.secondaryColor || ''}
            onChange={(secondaryColor) =>
              patch({ secondaryColor: secondaryColor || undefined })
            }
            placeholder="#F9733D"
            pattern="#[0-9a-fA-F]{6}"
            maxLength={7}
            hint="Código hexadecimal para detalhes e destaques."
          />
          <StudioSelect
            label="Família tipográfica"
            value={identity.fontFamily || ''}
            onChange={(fontFamily) =>
              patch({
                fontFamily: fontFamily
                  ? (fontFamily as 'sans' | 'serif' | 'mono')
                  : undefined,
              })
            }
          >
            <option value="">Padrão do produtor de mídia</option>
            <option value="sans">Sem serifa</option>
            <option value="serif">Com serifa</option>
            <option value="mono">Monoespaçada</option>
          </StudioSelect>
        </div>
      </StudioSection>
      <StudioSection
        title="Frequência e horários preferenciais"
        description="Registre a cadência desejada no fuso do canal. Esses horários ajudam a preparar a grade; o envio depende da revisão e confirmação do plano."
        actions={
          identity.schedule && (
            <StudioButton
              secondary
              onClick={() => patch({ schedule: undefined })}
            >
              Limpar programação editorial
            </StudioButton>
          )
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <StudioField
            label="Fuso horário IANA"
            value={identity.schedule?.timezone || ''}
            onChange={(timezone) => patchSchedule({ timezone })}
            maxLength={100}
            placeholder="America/Sao_Paulo"
            validationMessage={timezoneError}
            hint="O fuso é necessário para transformar o horário local em uma data de publicação."
          />
          <StudioField
            label="Meta de publicações por semana"
            value={identity.schedule?.weeklyFrequency ?? ''}
            onChange={(value) =>
              patchSchedule({
                weeklyFrequency: value ? Number(value) : undefined,
              })
            }
            type="number"
            min={1}
            max={70}
            step={1}
          />
        </div>
        <StudioButton
          secondary
          onClick={() => patchSchedule({ timezone: 'America/Sao_Paulo' })}
        >
          Usar o fuso de Brasília
        </StudioButton>
        <div className="space-y-3">
          {identity.schedule?.slots.map((slot, index) => (
            <div
              key={index}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <StudioSelect
                label={`Dia do horário ${index + 1}`}
                value={String(slot.dayOfWeek)}
                onChange={(value) =>
                  patchSchedule({
                    slots: identity.schedule!.slots.map((item, position) =>
                      position === index
                        ? { ...item, dayOfWeek: Number(value) }
                        : item
                    ),
                  })
                }
              >
                {studioWeekdays.map((day, value) => (
                  <option key={value} value={value}>
                    {day}
                  </option>
                ))}
              </StudioSelect>
              <StudioField
                label={`Horário local ${index + 1}`}
                value={slot.time}
                onChange={(time) =>
                  patchSchedule({
                    slots: identity.schedule!.slots.map((item, position) =>
                      position === index ? { ...item, time } : item
                    ),
                  })
                }
                type="time"
                required
              />
              <StudioButton
                secondary
                onClick={() =>
                  patchSchedule({
                    slots: identity.schedule!.slots.filter(
                      (_, position) => position !== index
                    ),
                  })
                }
                aria-label={`Remover horário ${index + 1}`}
              >
                Remover
              </StudioButton>
            </div>
          ))}
        </div>
        <StudioButton
          secondary
          disabled={(identity.schedule?.slots.length || 0) >= 70}
          onClick={() =>
            patchSchedule({
              slots: [
                ...(identity.schedule?.slots || []),
                { dayOfWeek: 1, time: '09:00' },
              ],
            })
          }
        >
          Adicionar horário preferencial
        </StudioButton>
        <p className="text-xs text-textItemBlur">
          As declarações sobre público infantil e conteúdo sintético serão
          preenchidas para cada item da grade. Elas não são inferidas da
          identidade nem copiadas de outro conteúdo.
        </p>
      </StudioSection>
    </>
  );
};
