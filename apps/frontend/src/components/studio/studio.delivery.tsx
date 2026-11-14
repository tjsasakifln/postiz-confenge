'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  StudioCapabilities,
  StudioDraftTarget,
  StudioOutcomeStage,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import { studioPlatformLabels } from './studio.content';
import { useStudioRequest } from './studio.hooks';
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

const stateLabels: Record<string, string> = {
  draft: 'Rascunho',
  DRAFT: 'Rascunho',
  creating: 'Criando rascunho',
  QUEUE: 'Agendado',
  PUBLISHED: 'Publicado',
  ERROR: 'Falha na publicação',
  failed: 'Falha ao criar rascunho',
  DELETED: 'Excluído',
};

export const StudioPublicationEditor = ({
  project,
  capabilities,
  blocked,
  pending,
  onCreate,
}: {
  project: StudioProject;
  capabilities?: StudioCapabilities;
  blocked: boolean;
  pending: boolean;
  onCreate: (targets: StudioDraftTarget[]) => void;
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const reviewed = reviewedRevision === project.revision;
  const setReviewed = (checked: boolean) =>
    setReviewedRevision(checked ? project.revision : null);
  const integrations = (capabilities?.integrations || []).filter((item) =>
    project.document.packages.some((pack) => pack.platform === item.platform)
  );
  const targets = integrations
    .filter((item) => selected.includes(item.id))
    .map((item) => ({ platform: item.platform, integrationId: item.id }));
  return (
    <>
      <StudioSection
        title="Enviar os pacotes ao calendário"
        description="Esta etapa cria rascunhos no Postiz. No calendário você confere configurações específicas do canal, data e horário antes de agendar ou publicar."
      >
        {!project.approvals.package && (
          <StudioMessage>
            Aprove os pacotes antes de criar rascunhos para os canais.
          </StudioMessage>
        )}
        {integrations.length === 0 ? (
          <StudioEmpty>
            Nenhuma conta conectada corresponde aos pacotes deste conteúdo.
            Conecte o canal no Postiz e prepare seu pacote.
          </StudioEmpty>
        ) : (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              Contas que receberão rascunhos
            </legend>
            {integrations.map((item) => (
              <StudioCheck
                key={item.id}
                label={`${studioPlatformLabels[item.platform]} · ${item.name}`}
                checked={selected.includes(item.id)}
                onChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id)
                  )
                }
                disabled={blocked || pending}
              />
            ))}
          </fieldset>
        )}
        <StudioCheck
          label="Conferi as contas selecionadas e quero criar seus rascunhos a partir do pacote aprovado."
          checked={reviewed}
          onChange={setReviewed}
          disabled={blocked || pending || !project.approvals.package}
        />
        <div className="flex flex-wrap items-center gap-4">
          <StudioButton
            disabled={
              blocked ||
              pending ||
              !project.approvals.package ||
              !capabilities?.publishing.available ||
              !reviewed ||
              targets.length === 0
            }
            loading={pending}
            onClick={() => onCreate(targets)}
          >
            Criar rascunhos no Postiz
          </StudioButton>
          <Link
            href="/launches"
            className="text-sm underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
          >
            Abrir calendário e canais
          </Link>
        </div>
        {capabilities && !capabilities.publishing.available && (
          <p className="text-sm text-textItemBlur">
            {capabilities.publishing.reason}
          </p>
        )}
      </StudioSection>
      <StudioSection
        title="Publicações ligadas ao conteúdo"
        description="O estado abaixo vem do Postiz. Um rascunho ainda precisa ser conferido e agendado; somente uma publicação concluída possui resultado na plataforma."
      >
        {project.publications.length === 0 ? (
          <StudioEmpty>
            Nenhum rascunho foi criado para este conteúdo.
          </StudioEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Estado dos rascunhos e publicações por canal
              </caption>
              <thead>
                <tr className="border-b border-newTableBorder">
                  <th scope="col" className="p-3">
                    Canal
                  </th>
                  <th scope="col" className="p-3">
                    Estado
                  </th>
                  <th scope="col" className="p-3">
                    Versão
                  </th>
                  <th scope="col" className="p-3">
                    Data
                  </th>
                  <th scope="col" className="p-3">
                    Acesso
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.publications.map((item) => (
                  <tr key={item.id} className="border-b border-newTableBorder">
                    <th scope="row" className="p-3 font-medium">
                      {studioPlatformLabels[item.platform]}
                      <span className="block text-xs font-normal text-textItemBlur">
                        {capabilities?.integrations.find(
                          (account) => account.id === item.integrationId
                        )?.name || 'Conta do canal'}
                      </span>
                    </th>
                    <td className="p-3">
                      {stateLabels[item.state] || item.state}
                      {item.error && (
                        <p className="mt-1 max-w-xs text-xs text-red-400">
                          {item.error}
                        </p>
                      )}
                    </td>
                    <td className="p-3">{item.revision}</td>
                    <td className="p-3">
                      {formatStudioDate(item.publishDate || item.createdAt)}
                    </td>
                    <td className="p-3">
                      {studioHttpUrl(item.releaseUrl) ? (
                        <a
                          href={studioHttpUrl(item.releaseUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                        >
                          Abrir publicação
                        </a>
                      ) : (
                        <Link
                          href="/launches"
                          className="underline focus-visible:ring-2 focus-visible:ring-btnPrimary"
                        >
                          Ver no calendário
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StudioSection>
    </>
  );
};

export const studioOutcomeLabels: Record<StudioOutcomeStage, string> = {
  lead: 'Contato comercial',
  qualified_lead: 'Contato qualificado',
  opportunity: 'Oportunidade',
  proposal: 'Proposta',
  contract: 'Contrato',
  invoiced: 'Faturamento',
  received: 'Recebimento',
};
const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  );

export const StudioOutcomes = ({
  project,
  onUpdated,
  blocked,
  onBusyChange,
}: {
  project: StudioProject;
  onUpdated: (project: StudioProject) => Promise<void>;
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
}) => {
  const request = useStudioRequest();
  const [stage, setStage] = useState<StudioOutcomeStage>('lead');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const operation = useRef(false);
  const amountRequired = [
    'proposal',
    'contract',
    'invoiced',
    'received',
  ].includes(stage);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || blocked || operation.current) return;
    setError(null);
    setSuccess(false);
    const normalized = amount.replace(',', '.');
    if (amountRequired && !normalized) {
      setError('Informe o valor desta etapa comercial.');
      return;
    }
    if (normalized && !/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setError('Informe o valor com até duas casas decimais.');
      return;
    }
    const [units, cents = ''] = normalized.split('.');
    const valueCents = normalized
      ? Number(units) * 100 + Number(cents.padEnd(2, '0'))
      : undefined;
    if (
      valueCents !== undefined &&
      (!Number.isSafeInteger(valueCents) || valueCents > 2147483647)
    ) {
      setError('O valor informado supera o limite por registro.');
      return;
    }
    if (!reference.trim() || !date || Number.isNaN(new Date(date).getTime())) {
      setError('Informe a referência e a data do resultado.');
      return;
    }
    operation.current = true;
    setPending(true);
    onBusyChange(true);
    try {
      const next = await request<StudioProject>(
        `/studio/projects/${encodeURIComponent(project.id)}/outcomes`,
        {
          method: 'POST',
          body: JSON.stringify({
            stage,
            ...(valueCents === undefined ? {} : { valueCents }),
            currency: 'BRL',
            reference: reference.trim(),
            note: note.trim(),
            occurredAt: new Date(date).toISOString(),
          }),
        }
      );
      await onUpdated(next);
      setReference('');
      setNote('');
      setAmount('');
      setSuccess(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível registrar o resultado.'
      );
    } finally {
      setPending(false);
      onBusyChange(false);
      operation.current = false;
    }
  };
  return (
    <>
      <StudioSection
        title="Resultados comerciais registrados"
        description="Registre fatos com uma referência de origem. Visualização, contato, proposta, contrato, faturamento e recebimento são etapas diferentes. Os valores abaixo vêm dos registros feitos neste conteúdo."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(studioOutcomeLabels) as StudioOutcomeStage[]).map(
            (key) => {
              const records = project.outcomes.filter(
                (item) => item.stage === key
              );
              const valued = records.filter(
                (item) => item.valueCents !== undefined
              );
              return (
                <article
                  key={key}
                  className="space-y-2 rounded-lg border border-newTableBorder p-4"
                >
                  <h3 className="text-sm font-semibold">
                    {studioOutcomeLabels[key]}
                  </h3>
                  <p className="text-2xl font-semibold">{records.length}</p>
                  <p className="text-xs text-textItemBlur">
                    registro(s)
                    {key !== 'lead' && valued.length > 0
                      ? ` · ${money(
                          valued.reduce(
                            (sum, item) => sum + item.valueCents!,
                            0
                          )
                        )}`
                      : ''}
                  </p>
                </article>
              );
            }
          )}
        </div>
        <p className="text-xs leading-relaxed text-textItemBlur">
          Contagens representam registros, não clientes únicos. Referências de
          CRM, proposta, contrato, nota fiscal ou comprovante permitem conferir
          a origem. As marcações UTM ajudam a identificar acessos; elas não
          confirmam sozinhas uma venda.
        </p>
      </StudioSection>
      <StudioSection title="Registrar um avanço comercial">
        {error && <StudioMessage error>{error}</StudioMessage>}
        {success && (
          <StudioMessage>
            Resultado registrado com sua referência de origem.
          </StudioMessage>
        )}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={pending || blocked} className="space-y-4">
            <legend className="sr-only">Dados do resultado comercial</legend>
            <div className="grid gap-4 lg:grid-cols-3">
              <StudioSelect
                label="Etapa comprovada"
                value={stage}
                onChange={(value) => setStage(value as StudioOutcomeStage)}
              >
                {Object.entries(studioOutcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </StudioSelect>
              <StudioField
                label="Valor em reais"
                value={amount}
                onChange={setAmount}
                type="number"
                min={0}
                max={21474836.47}
                step="0.01"
                required={amountRequired}
                hint={`${
                  amountRequired
                    ? 'Obrigatório nesta etapa.'
                    : 'Opcional nesta etapa.'
                } Informe somente o valor deste registro.`}
              />
              <StudioField
                label="Data e hora do acontecimento"
                value={date}
                onChange={setDate}
                type="datetime-local"
                required
              />
            </div>
            <StudioField
              label="Referência do registro"
              value={reference}
              onChange={setReference}
              required
              maxLength={300}
              hint="Identificador ou link do contato, proposta, contrato, nota fiscal ou pagamento. Evite dados pessoais desnecessários."
            />
            <StudioField
              label="Contexto e próximo avanço"
              value={note}
              onChange={setNote}
              multiline
              maxLength={3000}
              hint="Registre o que foi comprovado, como o conteúdo participou e o que falta para avançar."
            />
            <StudioButton
              type="submit"
              disabled={pending || blocked || !reference.trim()}
              loading={pending}
            >
              Registrar resultado
            </StudioButton>
          </fieldset>
        </form>
      </StudioSection>
      <StudioSection title="Histórico de resultados">
        {project.outcomes.length === 0 ? (
          <StudioEmpty>
            Nenhum resultado comercial registrado. Quando houver um contato
            atribuível ao conteúdo, registre sua origem e acompanhe os avanços.
          </StudioEmpty>
        ) : (
          <div className="space-y-3">
            {project.outcomes.map((item) => (
              <article
                key={item.id}
                className="space-y-2 rounded-lg border border-newTableBorder p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">
                    {studioOutcomeLabels[item.stage]}
                  </h3>
                  <span className="text-sm">
                    {item.valueCents === undefined
                      ? 'Valor não informado'
                      : money(item.valueCents)}
                  </span>
                </div>
                <p className="break-words text-sm">
                  Referência: {item.reference}
                </p>
                {item.note && (
                  <p className="whitespace-pre-wrap text-sm">{item.note}</p>
                )}
                <p className="text-xs text-textItemBlur">
                  Aconteceu em {formatStudioDate(item.occurredAt)} · registrado
                  em {formatStudioDate(item.createdAt)}
                </p>
              </article>
            ))}
          </div>
        )}
      </StudioSection>
    </>
  );
};
