import type { StudioSource } from '@gitroom/helpers/studio/studio.types';

const observedAt = '2026-11-21T00:00:00.000Z';

// Summaries checked against institutional pages, kept apart from model output.
const previousSources: StudioSource[] = [
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

export const editorialSources: (StudioSource & { details: string[][] })[] = [
  {
    id: 'escopo-parcial',
    title: 'O que medir quando o projeto ainda está incompleto',
    url: 'https://confenge.com.br/conteudos/documentos-para-levantamento-quantitativos/',
    excerpt: 'No exemplo didático, o arquitetônico de uma casa permite levantar alvenaria e cobertura para comparar propostas. Hidráulica e estrutura sem projeto definido ficam como lacunas. Para pedir o levantamento, descreva a decisão, disciplinas e revisões disponíveis; combine o canal para os arquivos. No recorte contratado, saem planilha rastreável, memória e lacunas. O levantamento sozinho não inclui preços.',
    details: [['alvenaria', 'cobertura'], ['hidráulica', 'estrutura'], ['planilha', 'memória', 'lacuna']],
    observedAt,
  },
  {
    id: 'equalizacao',
    title: 'Quadro de equalização de propostas de obra',
    url: 'https://confenge.com.br/quantitativos-orcamento-obras/',
    excerpt: 'Equalização põe as propostas sobre uma base comum de escopo, unidade, quantidade, inclusões, exclusões e responsabilidades. O quadro registra as diferenças encontradas. A memória de medição dá elemento, revisão, critério, unidade e fórmula; a planilha orçamentária tem composições, insumos, BDI e data-base conforme o serviço contratado. Concreto é medido em m³, fôrmas em m² e armaduras em kg; serviços de naturezas distintas não devem ser confrontados como um único preço unitário.',
    details: [['inclus', 'exclus'], ['revisão', 'fórmula'], ['data-base', 'bdi'], ['m³', 'm²']],
    observedAt,
  },
  {
    id: 'banheiro-r01',
    title: 'Banheiro R01: quantitativos e compatibilização demonstrativos',
    url: 'https://confenge.com.br/casos/demonstrativo-projeto-privado/',
    excerpt: 'Exemplo sintético. Na elevação R00, a verga da janela WN-01 em 2,30 m encontra o fundo da viga em 2,20 m. Na R01, a verga passa a 2,10 m e fica com folga de 0,10 m. Na memória da R01, piso: 2,40 × 1,80 = 4,32 m². Revestimento de paredes: 21,84 m² brutos, menos 1,68 m² da porta e 0,56 m² da janela, resulta em 19,60 m². Descontar aberturas a partir de 0,50 m² é premissa deste demonstrativo, não norma universal.',
    details: [['2,40', '4,32'], ['21,84', '19,60'], ['0,50', 'abertura'], ['r00', 'r01', 'verga'], ['2,30', '2,10']],
    observedAt,
  },
  {
    id: 'proposta-entregaveis',
    title: 'O que conferir na proposta e como registrar revisões',
    url: 'https://confenge.com.br/como-trabalhamos/',
    excerpt: 'Antes de contratar, confira quais documentos chegam, em que formatos e com quais etapas de revisão, prazos e responsabilidades. Cobrar indicação de quem fornece os insumos é aplicável quando o escopo depende de informações do contratante. Quando o escopo muda, a CONFENGE registra impactos sobre disciplinas, entregas e prazo e identifica a revisão que passa a valer. Para medição contestada, o dossiê liga o item questionado ao boletim, ao registro de campo e ao cálculo.',
    details: [['formato', 'revisão', 'entrega'], ['revisão', 'prazo', 'disciplina'], ['boletim', 'campo', 'cálculo']],
    observedAt,
  },
  {
    id: 'base-mercado',
    title: 'Demonstração de uma base de mercado rastreável',
    url: 'https://confenge.com.br/casos/modelo-base-quantitativa-canonica/',
    excerpt: 'Exemplo integralmente sintético. O dicionário diferencia fato, cálculo, inferência e incerteza. Uma matriz leva cada afirmação à célula que a sustenta; a memória mostra a fórmula. O exemplo triou 240 registros, reteve 118 e excluiu 122 com motivo declarado. Campo ausente fica N/D, não zero. Empresas e valores são fictícios; usar apenas como exemplo do método.',
    details: [['afirmação', 'célula'], ['240', '118', '122'], ['n/d', 'zero'], ['inferência', 'incerteza']],
    observedAt,
  },
  {
    id: 'folga-cronograma',
    title: 'Caminho crítico e folgas no cronograma de obra',
    url: 'https://confenge.com.br/ferramentas/caminho-critico-obra/',
    excerpt: 'No exemplo da calculadora, mobilização leva 2 dias; fundações duram 5 dias e compra 3, ambas após mobilização; estrutura leva 4 dias e depende das duas. A obra termina no dia 11. A compra tem 2 dias de folga. Um dia a mais nas fundações leva a entrega ao dia 12. O cálculo usa dependências término-início sem defasagem e parte de um calendário comum.',
    details: [['fundaç', 'compra', 'estrutur'], ['compra', '2 dias', '11'], ['fundaç', '11', '12']],
    observedAt,
  },
  {
    id: 'aditivo-dossie',
    title: 'Checklist documental de aditivo em obra pública',
    url: 'https://confenge.com.br/guias-contratos-obras/checklist-pedido-aditivo/',
    excerpt: 'Checklist de 36 itens para organizar o dossiê de obra pública. Para um post documental, use o desenho antes/depois, diário ou ordem de serviço para ligar a alteração ao campo; memória de saldo, planilha e impacto no cronograma para sustentar o pedido. Prontidão documental não demonstra aprovação do aditivo. Não converter em orientação jurídica ou prometer deferimento.',
    details: [['antes', 'depois', 'diário'], ['saldo', 'planilha', 'cronograma']],
    observedAt,
  },
];

export const quickSources: StudioSource[] = [
  ...previousSources,
  ...editorialSources.map(({ details, ...source }) => source),
];
