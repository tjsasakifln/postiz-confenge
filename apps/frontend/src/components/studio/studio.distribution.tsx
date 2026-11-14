'use client';

import { FormEvent, useRef, useState } from 'react';
import type { StudioProject } from '@gitroom/helpers/studio/studio.types';
import type {
  StudioDistributionBatch,
  StudioDistributionPhase,
  StudioDistributionPlan,
} from '@gitroom/helpers/studio/studio.distribution.types';
import {
  useStudioDistributionBatch,
  useStudioDistributionCapabilities,
  useStudioDistributionInventory,
  useStudioRequest,
} from './studio.hooks';
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

const phaseLabels: Record<StudioDistributionPhase, string> = {
  planned: 'Planejado',
  reserved: 'Reservado para envio',
  upload_starting: 'Iniciando envio privado',
  uploading: 'Enviando vídeo privado',
  uploaded_private: 'Vídeo enviado como privado',
  thumbnail_setting: 'Aplicando a capa',
  schedule_setting: 'Solicitando agendamento',
  schedule_verifying: 'Conferindo agendamento no YouTube',
  youtube_scheduled: 'Agendado no YouTube',
  youtube_public: 'Publicação pública confirmada',
  mirror_waiting: 'Aguardando espelhamento',
  mirror_creating: 'Preparando Instagram',
  mirror_processing: 'Instagram processando vídeo',
  mirror_publishing: 'Confirmando publicação no Instagram',
  mirrored: 'Espelhamento concluído',
  blocked: 'Ação bloqueada',
  uncertain: 'Resultado precisa de conferência',
  failed: 'Falha reportada',
  cancelled: 'Cancelado',
};
const batchLabels: Record<StudioDistributionBatch['state'], string> = {
  planned: 'Em revisão',
  confirmed: 'Confirmada',
  running: 'Em execução',
  completed: 'Concluída',
  attention: 'Precisa de atenção',
  cancelled: 'Cancelada',
};
type DraftRow = {
  id: string;
  projectId: string;
  integrationId: string;
  localTime: string;
  madeForKids: '' | 'yes' | 'no';
  containsSyntheticMedia: '' | 'yes' | 'no';
};

/** Resolve wall-clock time without silently shifting nonexistent or ambiguous DST times. */
export const studioLocalTimeToIso = (value: string, timezone: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Informe uma data e um horário local completos.');
  const numbers = match.slice(1).map(Number);
  const wall = Date.UTC(
    numbers[0],
    numbers[1] - 1,
    numbers[2],
    numbers[3],
    numbers[4]
  );
  const date = new Date(wall);
  if (
    numbers[0] < 1970 ||
    date.getUTCFullYear() !== numbers[0] ||
    date.getUTCMonth() !== numbers[1] - 1 ||
    date.getUTCDate() !== numbers[2] ||
    date.getUTCHours() !== numbers[3] ||
    date.getUTCMinutes() !== numbers[4]
  )
    throw new Error('A data ou o horário informado não é válido.');
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new Error('Informe um fuso IANA válido antes de preparar a grade.');
  }
  const wallAt = (instant: number) => {
    const values = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    );
    return Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute
    );
  };
  const offsets = new Set(
    [-48, -24, 0, 24, 48].map((hours) => {
      const instant = wall + hours * 3600000;
      return wallAt(instant) - instant;
    })
  );
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => wallAt(instant) === wall);
  if (candidates.length === 0)
    throw new Error(
      'Esse horário local não existe por causa da mudança de fuso. Escolha outro horário.'
    );
  if (candidates.length > 1)
    throw new Error(
      'Esse horário local ocorre duas vezes por causa da mudança de fuso. Escolha outro horário para evitar ambiguidade.'
    );
  return new Date(candidates[0]).toISOString();
};

const inTimezone = (value: string, timezone: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return formatStudioDate(value);
  }
};

export const StudioDistributionBatchView = ({
  batch,
  blocked,
  onChanged,
  onBusyChange,
}: {
  batch: StudioDistributionBatch;
  blocked: boolean;
  onChanged: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
}) => {
  const request = useStudioRequest();
  const reviewKey = `${batch.id}:${batch.revision}`;
  const [reviewedRevision, setReviewedRevision] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const act = async (
    action: 'confirm' | 'cancel' | 'reconcile',
    itemId?: string,
    revision = batch.revision
  ) => {
    if (
      blocked ||
      operation.current ||
      (action === 'confirm' &&
        batch.state !== 'confirmed' &&
        (batch.state !== 'planned' || reviewedRevision !== reviewKey))
    )
      return;
    operation.current = true;
    setPending(itemId || action);
    onBusyChange(true);
    setError(null);
    try {
      const path =
        action === 'reconcile'
          ? `/studio/distribution/items/${encodeURIComponent(
              itemId!
            )}/reconcile`
          : `/studio/distribution/batches/${encodeURIComponent(
              batch.id
            )}/${action}`;
      await request(path, {
        method: 'POST',
        body: JSON.stringify({
          revision,
          ...(action === 'confirm' ? { confirmed: true } : {}),
        }),
      });
      await onChanged();
      setReviewedRevision(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a ação na grade.'
      );
      // A reservation may have committed before workflow startup failed. Read
      // its current revision and state without repeating the write.
      await onChanged().catch(() => undefined);
    } finally {
      operation.current = false;
      setPending(null);
      onBusyChange(false);
    }
  };
  return (
    <StudioSection
      title={`Grade ${batchLabels[batch.state]}`}
      description={`Criada em ${formatStudioDate(
        batch.createdAt
      )}. Os horários abaixo estão no fuso ${batch.timezone}.`}
    >
      {error && <StudioMessage error>{error}</StudioMessage>}
      {batch.error && <StudioMessage error>{batch.error}</StudioMessage>}
      {batch.warnings.map((warning, index) => (
        <StudioMessage key={index}>{warning}</StudioMessage>
      ))}
      <div className="space-y-4">
        {batch.items.map((item) => (
          <article
            key={item.id}
            className="space-y-3 rounded-lg border border-newTableBorder p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold">{item.title}</h3>
              <span className="rounded-lg bg-newBgColor px-3 py-1 text-xs">
                {phaseLabels[item.phase]}
              </span>
            </div>
            <dl className="grid gap-3 text-sm lg:grid-cols-2">
              <div>
                <dt className="text-textItemBlur">Canal YouTube</dt>
                <dd>{item.integrationName}</dd>
              </div>
              <div>
                <dt className="text-textItemBlur">Data planejada</dt>
                <dd>{inTimezone(item.publishAt, batch.timezone)}</dd>
              </div>
              <div>
                <dt className="text-textItemBlur">Declaração de público</dt>
                <dd>
                  {item.madeForKids
                    ? 'Feito para crianças'
                    : 'Não feito para crianças'}
                </dd>
              </div>
              <div>
                <dt className="text-textItemBlur">
                  Conteúdo sintético declarado
                </dt>
                <dd>{item.containsSyntheticMedia ? 'Sim' : 'Não'}</dd>
              </div>
            </dl>
            {item.youtubePrivacy && (
              <p className="text-sm">
                Privacidade observada:{' '}
                {
                  {
                    private: 'privado',
                    unlisted: 'não listado',
                    public: 'público',
                  }[item.youtubePrivacy]
                }
                {item.youtubeObservedAt
                  ? `, em ${formatStudioDate(item.youtubeObservedAt)}`
                  : ''}
                .
              </p>
            )}
            {item.youtubePublishAt && (
              <p className="text-sm">
                Agendamento informado pelo YouTube:{' '}
                {inTimezone(item.youtubePublishAt, batch.timezone)}.
              </p>
            )}
            {item.youtubePublicConfirmedAt && (
              <p className="text-sm font-semibold">
                Publicação pública confirmada em{' '}
                {formatStudioDate(item.youtubePublicConfirmedAt)}.
              </p>
            )}
            {item.instagramIntegrationName && (
              <p className="text-sm">
                Espelhamento solicitado para {item.instagramIntegrationName}
                {item.instagramPublishedAt
                  ? `, publicado em ${formatStudioDate(
                      item.instagramPublishedAt
                    )}`
                  : ', aguardando os requisitos do fluxo'}
                .
              </p>
            )}
            {item.error && <StudioMessage error>{item.error}</StudioMessage>}
            {item.nextActionAt && (
              <p className="text-xs text-textItemBlur">
                Próxima consulta prevista: {formatStudioDate(item.nextActionAt)}
                .
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              {studioHttpUrl(item.youtubeUrl) && (
                <a
                  href={studioHttpUrl(item.youtubeUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  Abrir vídeo no YouTube
                </a>
              )}
              {studioHttpUrl(item.instagramUrl) && (
                <a
                  href={studioHttpUrl(item.instagramUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  Abrir publicação no Instagram
                </a>
              )}
              {item.canReconcile && (
                <StudioButton
                  secondary
                  disabled={blocked || Boolean(pending)}
                  loading={pending === item.id}
                  onClick={() => void act('reconcile', item.id, item.revision)}
                >
                  Verificar situação deste item
                </StudioButton>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="rounded-lg bg-newBgColor p-4 text-sm">
        <h3 className="mb-3 font-semibold">Estimativa de uso da grade</h3>
        <ul className="space-y-2">
          {batch.quotaEstimate.map((item) => (
            <li key={item.day}>
              {item.day}, fuso da cota {item.timezone}: {item.uploads} upload(s)
              e {item.otherUnits} unidade(s) de outras operações.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-textItemBlur">
          {batch.quotaDisclaimer}
        </p>
      </div>
      {batch.state === 'planned' ? (
        <>
          <StudioCheck
            label="Revisei conteúdos, contas, horários, cotas e as declarações de cada item. Autorizo iniciar os envios privados e aplicar o agendamento indicado, incluindo o espelhamento quando selecionado."
            checked={reviewedRevision === reviewKey}
            onChange={(checked) =>
              setReviewedRevision(checked ? reviewKey : null)
            }
            disabled={blocked || Boolean(pending)}
          />
          <StudioButton
            disabled={
              blocked || Boolean(pending) || reviewedRevision !== reviewKey
            }
            loading={pending === 'confirm'}
            onClick={() => void act('confirm')}
          >
            Confirmar grade e iniciar envios privados
          </StudioButton>
        </>
      ) : (
        <StudioMessage>
          A grade confirmada usa a versão aprovada de cada conteúdo no momento
          da confirmação. Alterações posteriores no projeto não modificam esses
          envios.
        </StudioMessage>
      )}
      {batch.state === 'confirmed' && (
        <div className="space-y-3">
          <p className="text-sm text-textItemBlur">
            Este lote já foi confirmado. A retomada usa os mesmos itens e a
            autorização registrada para iniciar o processamento pendente.
          </p>
          <StudioButton
            disabled={blocked || Boolean(pending)}
            loading={pending === 'confirm'}
            onClick={() => void act('confirm')}
          >
            Retomar início do lote confirmado
          </StudioButton>
        </div>
      )}
      {batch.items.some((item) => item.canCancel) && (
        <StudioButton
          secondary
          disabled={blocked || Boolean(pending)}
          loading={pending === 'cancel'}
          onClick={() => void act('cancel')}
        >
          Cancelar itens ainda não iniciados
        </StudioButton>
      )}
    </StudioSection>
  );
};

export const StudioDistribution = ({
  project,
  projects,
  blocked,
  onBusyChange,
}: {
  project: StudioProject;
  projects?: StudioProject[];
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
}) => {
  const request = useStudioRequest();
  const capabilities = useStudioDistributionCapabilities();
  const inventory = useStudioDistributionInventory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useStudioDistributionBatch(selectedId);
  const [timezone, setTimezone] = useState(
    project.document.identity.schedule?.timezone || ''
  );
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [uploads, setUploads] = useState('');
  const [otherUnits, setOtherUnits] = useState('');
  const [mirror, setMirror] = useState(false);
  const [instagramId, setInstagramId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stockMinimum, setStockMinimum] = useState('');
  const operation = useRef(false);
  const allProjects = [
    project,
    ...(projects || []).filter((item) => item.id !== project.id),
  ];
  const eligible = allProjects.filter(
    (item) =>
      item.approvals.package &&
      item.document.packages.some((pack) => pack.platform === 'youtube')
  );
  const accounts =
    capabilities.data?.integrations.filter(
      (item) => item.platform === 'youtube'
    ) || [];
  const instagrams =
    capabilities.data?.integrations.filter(
      (item) => item.platform === 'instagram'
    ) || [];
  const inventoryItems =
    inventory.data?.batches
      .filter((batch) => batch.confirmedAt)
      .flatMap((batch) => batch.items)
      .filter(
        (item) => !item.youtubePublicConfirmedAt && item.phase !== 'cancelled'
      ) || [];
  const stockAccounts = [
    ...new Map([
      ...accounts.map((item) => [item.id, item.name] as const),
      ...inventoryItems.map(
        (item) => [item.integrationId, item.integrationName] as const
      ),
    ]).entries(),
  ];
  const patchRow = (id: string, change: Partial<DraftRow>) =>
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item))
    );
  const add = () => {
    const bound = project.document.identity.channel;
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        projectId: eligible.some((item) => item.id === project.id)
          ? project.id
          : '',
        integrationId:
          bound?.platform === 'youtube' &&
          accounts.some(
            (item) => item.id === bound.integrationId && item.available
          )
            ? bound.integrationId!
            : '',
        localTime: '',
        madeForKids: '',
        containsSyntheticMedia: '',
      },
    ]);
  };
  const suggestTimes = () => {
    const schedule = project.document.identity.schedule;
    if (!schedule?.slots.length || !capabilities.data || !rows.length) return;
    setError(null);
    setNotice(null);
    try {
      const zone = schedule.timezone;
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .formatToParts(new Date())
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, Number(part.value)])
      );
      const today = Date.UTC(parts.year, parts.month - 1, parts.day);
      const candidates: Array<{ local: string; instant: string }> = [];
      for (let day = 0; day <= capabilities.data.maxScheduleDays; day++) {
        const date = new Date(today + day * 86400000);
        for (const slot of schedule.slots.filter(
          (item) => item.dayOfWeek === date.getUTCDay()
        )) {
          const local = `${date.toISOString().slice(0, 10)}T${slot.time}`;
          try {
            const instant = studioLocalTimeToIso(local, zone);
            const time = new Date(instant).getTime();
            if (
              time >=
                Date.now() + capabilities.data.minAdvanceMinutes * 60000 &&
              time <= Date.now() + capabilities.data.maxScheduleDays * 86400000
            )
              candidates.push({ local, instant });
          } catch {
            /* Ambiguous and nonexistent local slots are never suggested. */
          }
        }
      }
      candidates.sort((a, b) => a.instant.localeCompare(b.instant));
      const weeklyCount = new Map<number, number>();
      const withinFrequency = candidates.filter((candidate) => {
        const day = new Date(`${candidate.local.slice(0, 10)}T00:00:00Z`);
        const week = day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000;
        const count = weeklyCount.get(week) || 0;
        if (schedule.weeklyFrequency && count >= schedule.weeklyFrequency)
          return false;
        weeklyCount.set(week, count + 1);
        return true;
      });
      if (withinFrequency.length < rows.length)
        throw new Error(
          'Os horários preferenciais e a meta semanal não cobrem todos os itens dentro do horizonte permitido. Ajuste o modelo ou preencha a grade manualmente.'
        );
      setTimezone(zone);
      setRows((current) =>
        current.map((row, index) => ({
          ...row,
          localTime: withinFrequency[index].local,
        }))
      );
      setNotice(
        'Horários sugeridos a partir do modelo. Revise as datas de cada item antes de preparar o plano.'
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível sugerir os horários.'
      );
    }
  };
  const plan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked || operation.current || !capabilities.data?.available) return;
    setError(null);
    setNotice(null);
    let body: StudioDistributionPlan;
    try {
      if (!timezone.trim() || !rows.length)
        throw new Error('Informe o fuso e adicione pelo menos um conteúdo.');
      const items = rows.map((row, index) => {
        const content = eligible.find((item) => item.id === row.projectId);
        if (
          !content ||
          !accounts.some(
            (item) => item.id === row.integrationId && item.available
          )
        )
          throw new Error(
            `Confira o conteúdo aprovado e a conta do item ${index + 1}.`
          );
        if (!row.madeForKids || !row.containsSyntheticMedia)
          throw new Error(
            `Preencha explicitamente as duas declarações do item ${index + 1}.`
          );
        const publishAt = studioLocalTimeToIso(row.localTime, timezone.trim());
        const time = new Date(publishAt).getTime();
        if (
          time < Date.now() + capabilities.data!.minAdvanceMinutes * 60000 ||
          time > Date.now() + capabilities.data!.maxScheduleDays * 86400000
        )
          throw new Error(
            `O item ${index + 1} precisa respeitar a antecedência de ${
              capabilities.data!.minAdvanceMinutes
            } minutos e o horizonte de ${
              capabilities.data!.maxScheduleDays
            } dias.`
          );
        return {
          projectId: content.id,
          revision: content.revision,
          integrationId: row.integrationId,
          publishAt,
          madeForKids: row.madeForKids === 'yes',
          containsSyntheticMedia: row.containsSyntheticMedia === 'yes',
        };
      });
      if (
        !/^\d+$/.test(uploads) ||
        !/^\d+$/.test(otherUnits) ||
        Number(uploads) < 1 ||
        Number(otherUnits) < 1
      )
        throw new Error('Informe os dois limites de cota reservados à grade.');
      if (
        mirror &&
        !instagrams.some((item) => item.id === instagramId && item.available)
      )
        throw new Error(
          'Selecione uma conta Instagram disponível para espelhar.'
        );
      body = {
        timezone: timezone.trim(),
        items,
        quotaBudget: {
          uploads: Number(uploads),
          otherUnits: Number(otherUnits),
        },
        ...(mirror
          ? {
              mirror: {
                enabled: true as const,
                instagramIntegrationId: instagramId,
              },
            }
          : {}),
      };
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Confira os dados da grade.'
      );
      return;
    }
    operation.current = true;
    setPending(true);
    onBusyChange(true);
    try {
      const batch = await request<StudioDistributionBatch>(
        '/studio/distribution/plan',
        { method: 'POST', body: JSON.stringify(body) }
      );
      setSelectedId(batch.id);
      await inventory.mutate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível preparar a grade.'
      );
    } finally {
      operation.current = false;
      setPending(false);
      onBusyChange(false);
    }
  };
  return (
    <div className="space-y-5">
      <StudioSection
        title="Grade YouTube e espelhamento"
        description="Prepare a grade, revise a estimativa e confirme o envio. Os vídeos começam privados; a disponibilidade pública é conferida depois. O espelhamento no Instagram é opcional."
      >
        {capabilities.error && (
          <StudioMessage error>{capabilities.error.message}</StudioMessage>
        )}
        {capabilities.data && (
          <p className="text-sm text-textItemBlur">
            {capabilities.data.reason}
          </p>
        )}
        {inventory.error && (
          <StudioMessage error>{inventory.error.message}</StudioMessage>
        )}
        <div className="grid items-end gap-3 lg:grid-cols-[1fr_auto]">
          <StudioSelect
            label="Grades registradas"
            value={selectedId || ''}
            onChange={(value) => setSelectedId(value || null)}
            disabled={pending}
          >
            <option value="">Preparar uma nova grade</option>
            {inventory.data?.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {formatStudioDate(batch.createdAt)} · {batch.items.length}{' '}
                item(ns) · {batchLabels[batch.state]}
              </option>
            ))}
          </StudioSelect>
          {selectedId && (
            <StudioButton
              secondary
              disabled={pending}
              onClick={() => setSelectedId(null)}
            >
              Nova grade
            </StudioButton>
          )}
        </div>
        <p className="text-xs text-textItemBlur">
          Use este fluxo para as peças que serão agendadas diretamente no
          YouTube. Confira rascunhos já existentes no calendário para evitar uma
          segunda publicação da mesma peça.
        </p>
      </StudioSection>
      {inventory.data && (
        <StudioSection
          title="Estoque observado por canal"
          description={`Contagem limitada às ${inventory.data.batches.length} grades retornadas, com limite de consulta de ${inventory.data.limit}. Grades mais antigas podem não aparecer nesta contagem.`}
        >
          <StudioField
            label="Mínimo desejado de itens por canal"
            value={stockMinimum}
            onChange={setStockMinimum}
            type="number"
            min={0}
            max={1000}
            step={1}
            hint="Use uma meta para conferir o estoque exibido nesta sessão. Este aviso não envia notificações."
          />
          {stockAccounts.length ? (
            <ul className="space-y-3 text-sm">
              {stockAccounts.map(([id, name]) => {
                const items = inventoryItems.filter(
                  (item) => item.integrationId === id
                );
                const attention = items.filter((item) =>
                  ['blocked', 'uncertain', 'failed'].includes(item.phase)
                ).length;
                const below =
                  /^\d+$/.test(stockMinimum) &&
                  items.length < Number(stockMinimum);
                return (
                  <li
                    key={id}
                    className="rounded-lg border border-newTableBorder p-3"
                  >
                    <p className="font-semibold">{name}</p>
                    <p>
                      {items.length} item(ns) confirmado(s) ainda sem publicação
                      pública confirmada.
                      {attention > 0
                        ? ` ${attention} precisam de atenção.`
                        : ''}
                    </p>
                    {below && (
                      <p className="mt-2 text-amber-500">
                        A parcela exibida está abaixo do mínimo de{' '}
                        {stockMinimum} itens. Revise a fila e as grades
                        anteriores antes de preparar novos envios.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <StudioEmpty>
              Nenhum canal YouTube disponível nesta consulta.
            </StudioEmpty>
          )}
        </StudioSection>
      )}
      {error && <StudioMessage error>{error}</StudioMessage>}
      {notice && <StudioMessage>{notice}</StudioMessage>}
      {selectedId ? (
        selected.error ? (
          <StudioMessage error>{selected.error.message}</StudioMessage>
        ) : selected.data ? (
          <StudioDistributionBatchView
            key={selected.data.id}
            batch={selected.data}
            blocked={blocked}
            onBusyChange={onBusyChange}
            onChanged={async () => {
              await selected.mutate();
              await inventory.mutate();
            }}
          />
        ) : (
          <StudioMessage>Carregando a grade registrada…</StudioMessage>
        )
      ) : (
        <StudioSection
          title="Preparar plano de publicação"
          description="Escolha conteúdos com pacote YouTube aprovado entre os até 50 conteúdos mais recentes da organização. As declarações pertencem a cada item e precisam ser preenchidas pelo responsável."
        >
          <form onSubmit={plan} className="space-y-5">
            <fieldset disabled={blocked || pending} className="space-y-5">
              <legend className="sr-only">Itens e condições da grade</legend>
              <StudioField
                label="Fuso horário da grade"
                value={timezone}
                onChange={setTimezone}
                placeholder="America/Sao_Paulo"
                required
                maxLength={100}
              />
              {eligible.length === 0 && (
                <StudioEmpty>
                  Aprove um pacote YouTube com vídeo para adicioná-lo à grade.
                </StudioEmpty>
              )}
              {rows.map((row, index) => (
                <section
                  key={row.id}
                  className="space-y-4 rounded-lg border border-newTableBorder p-4"
                  aria-label={`Item ${index + 1} da grade`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Item {index + 1}</h3>
                    <StudioButton
                      secondary
                      onClick={() =>
                        setRows((current) =>
                          current.filter((item) => item.id !== row.id)
                        )
                      }
                      aria-label={`Remover item ${index + 1}`}
                    >
                      Remover
                    </StudioButton>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <StudioSelect
                      label={`Conteúdo do item ${index + 1}`}
                      value={row.projectId}
                      onChange={(projectId) =>
                        patchRow(row.id, {
                          projectId,
                          madeForKids: '',
                          containsSyntheticMedia: '',
                        })
                      }
                    >
                      <option value="">Selecione um pacote aprovado</option>
                      {eligible.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} · versão {item.revision}
                        </option>
                      ))}
                    </StudioSelect>
                    <StudioSelect
                      label={`Canal YouTube do item ${index + 1}`}
                      value={row.integrationId}
                      onChange={(integrationId) =>
                        patchRow(row.id, { integrationId })
                      }
                    >
                      <option value="">Selecione uma conta</option>
                      {accounts.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={!item.available}
                        >
                          {item.name}
                          {item.available ? '' : ' (indisponível)'}
                        </option>
                      ))}
                    </StudioSelect>
                    <StudioField
                      label={`Data e horário local do item ${index + 1}`}
                      value={row.localTime}
                      onChange={(localTime) => patchRow(row.id, { localTime })}
                      type="datetime-local"
                      required
                    />
                    <StudioSelect
                      label={`O item ${index + 1} é feito para crianças?`}
                      value={row.madeForKids}
                      onChange={(value) =>
                        patchRow(row.id, {
                          madeForKids: value as DraftRow['madeForKids'],
                        })
                      }
                    >
                      <option value="">Responsável precisa declarar</option>
                      <option value="yes">Sim, feito para crianças</option>
                      <option value="no">Não, não é feito para crianças</option>
                    </StudioSelect>
                    <StudioSelect
                      label={`O item ${index + 1} contém conteúdo sintético?`}
                      value={row.containsSyntheticMedia}
                      onChange={(value) =>
                        patchRow(row.id, {
                          containsSyntheticMedia:
                            value as DraftRow['containsSyntheticMedia'],
                        })
                      }
                    >
                      <option value="">Responsável precisa declarar</option>
                      <option value="yes">Sim</option>
                      <option value="no">Não</option>
                    </StudioSelect>
                  </div>
                </section>
              ))}
              <div className="flex flex-wrap gap-3">
                <StudioButton
                  secondary
                  disabled={
                    !eligible.length ||
                    rows.length >= (capabilities.data?.maxBatchItems || 20)
                  }
                  onClick={add}
                >
                  Adicionar conteúdo à grade
                </StudioButton>
                <StudioButton
                  secondary
                  disabled={
                    !rows.length ||
                    !project.document.identity.schedule?.slots.length ||
                    !capabilities.data
                  }
                  onClick={suggestTimes}
                >
                  Sugerir horários do modelo
                </StudioButton>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <StudioField
                  label="Limite diário de uploads reservado à grade"
                  value={uploads}
                  onChange={setUploads}
                  type="number"
                  min={1}
                  max={capabilities.data?.quotaBudgetCeiling.uploads}
                  step={1}
                  required
                />
                <StudioField
                  label="Limite diário de outras operações"
                  value={otherUnits}
                  onChange={setOtherUnits}
                  type="number"
                  min={1}
                  max={capabilities.data?.quotaBudgetCeiling.otherUnits}
                  step={1}
                  required
                />
              </div>
              <p className="text-xs text-textItemBlur">
                {capabilities.data?.quotaDisclaimer ||
                  'Informe o orçamento local de cota que pode reservar para este plano. Este valor não é uma consulta ao saldo real da plataforma.'}
              </p>
              <StudioCheck
                label="Espelhar no Instagram depois que o YouTube confirmar que o vídeo está público"
                checked={mirror}
                onChange={setMirror}
              />
              {mirror && (
                <>
                  <StudioSelect
                    label="Conta Instagram para espelhamento"
                    value={instagramId}
                    onChange={setInstagramId}
                  >
                    <option value="">Selecione a conta autorizada</option>
                    {instagrams.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={!item.available}
                      >
                        {item.name}
                        {item.available ? '' : ' (indisponível)'}
                      </option>
                    ))}
                  </StudioSelect>
                  <p className="text-xs text-textItemBlur">
                    O espelhamento exige vídeo vertical ou quadrado de até três
                    minutos e respeita pelo menos uma hora entre publicações na
                    conta. As permissões e mídias serão conferidas antes da
                    confirmação.
                  </p>
                </>
              )}
              <StudioButton
                type="submit"
                disabled={
                  blocked ||
                  pending ||
                  !capabilities.data?.available ||
                  rows.length === 0
                }
                loading={pending}
              >
                Preparar grade para revisão
              </StudioButton>
            </fieldset>
          </form>
        </StudioSection>
      )}
    </div>
  );
};
