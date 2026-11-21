import type { StudioSource } from '@gitroom/helpers/studio/studio.types';

const observedAt = '2026-11-21T00:00:00.000Z';

// Summaries checked against institutional pages, kept apart from model output.
export const quickSources: StudioSource[] = [
  {
    id: 'quantitativos',
    title: 'Quantitativos e orçamento de obras',
    url: 'https://confenge.com.br/quantitativos-orcamento-obras/',
    excerpt: 'O serviço documenta a origem e a revisão do documento, a unidade, o critério de medição e o vínculo de cada quantidade com o orçamento.',
    observedAt,
  },
  {
    id: 'entregas',
    title: 'Entregas e exemplos demonstrativos',
    url: 'https://confenge.com.br/entregas/',
    excerpt: 'A CONFENGE disponibiliza exemplos identificados como demonstrativos e ferramentas públicas. A composição de uma entrega depende do escopo. Exemplos sintéticos ilustram o formato e o método e não comprovam resultados de clientes.',
    observedAt,
  },
  {
    id: 'contratacao',
    title: 'Como contratar um serviço de engenharia',
    url: 'https://confenge.com.br/como-trabalhamos/',
    excerpt: 'O atendimento começa pelo contexto e pelo recorte da necessidade. A proposta identifica trabalho, disciplinas, entregas, prazos e responsabilidades. Mudanças de escopo são registradas e alinhadas com o contratante.',
    observedAt,
  },
  {
    id: 'documentos',
    title: 'Documentos para levantar quantitativos',
    url: 'https://confenge.com.br/conteudos/documentos-para-levantamento-quantitativos/',
    excerpt: 'Plantas, memoriais e referências já existentes orientam o levantamento. A finalidade e o estágio do projeto definem quais critérios e premissas precisam ser explicitados. Documentos sensíveis seguem pelo canal seguro indicado pela equipe.',
    observedAt,
  },
];
