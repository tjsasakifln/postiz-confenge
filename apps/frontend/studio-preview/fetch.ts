import type { StudioProject } from '@gitroom/helpers/studio/studio.types';
import type {
  StudioDistributionBatch,
  StudioDistributionPlan,
} from '@gitroom/helpers/studio/studio.distribution.types';
const date = '2026-11-14T12:00:00Z';
let project: StudioProject = {
  id: 'visual-test',
  title: 'Exemplo fictício: briefing para contratar um projeto',
  revision: 3,
  status: 'script_approved',
  createdAt: date,
  updatedAt: date,
  approvals: {
    identity: {
      stage: 'identity',
      hash: 'fixture',
      revision: 1,
      approvedBy: 'fixture',
      approvedAt: date,
    },
    script: {
      stage: 'script',
      hash: 'fixture',
      revision: 3,
      approvedBy: 'fixture',
      approvedAt: date,
    },
  },
  document: {
    brief:
      'EXEMPLO FICTÍCIO PARA TESTE VISUAL. Orientar um comprador a organizar escopo, prazos e documentos antes de solicitar uma proposta.',
    identity: {
      audience:
        'Responsáveis por contratar projetos, com necessidade de definir o escopo e comparar propostas.',
      positioning:
        'Serviços técnicos com escopo, entregas e responsabilidades explícitos. Exemplo fictício.',
      tone: 'Claro, técnico e acessível, sem prometer resultado não comprovado.',
      visualStyle:
        'Azul escuro, tipografia sem serifa, poucos elementos e cartelas legíveis.',
      evidence: [
        'Referência fictícia criada somente para revisão da interface.',
      ],
      hypotheses: [
        'Hipótese fictícia: esclarecer o briefing pode qualificar o primeiro contato.',
      ],
    },
    sources: [
      {
        id: 'source-test',
        url: 'https://example.com/reference',
        title: 'Referência de teste para revisão',
        excerpt:
          'Este texto não é orientação técnica. É um dado fictício para verificar o formulário.',
        observedAt: date,
        risk: 'high',
      },
    ],
    topic: 'Quais informações reunir antes de pedir uma proposta de projeto?',
    scenes: [
      {
        id: 'scene-1',
        narration: 'Seu briefing está completo?',
        pronunciation: '',
        visual: 'Antes da proposta',
        durationSeconds: 3,
        sourceIds: ['source-test'],
        kind: 'card',
      },
      {
        id: 'scene-2',
        narration:
          'Liste a necessidade, os documentos disponíveis e o prazo desejado. Exemplo fictício.',
        pronunciation: '',
        visual: 'Escopo, documentos e prazo',
        durationSeconds: 8,
        sourceIds: ['source-test'],
        kind: 'card',
      },
    ],
    packages: [
      {
        platform: 'linkedin',
        title: 'Um briefing claro ajuda a conversar sobre escopo',
        description:
          'EXEMPLO FICTÍCIO. Quais informações o responsável pela contratação deve reunir para uma conversa inicial?',
        hashtags: ['projetos', 'engenharia'],
        cta: 'Organize o briefing para conversar com a equipe.',
        landingUrl: 'https://example.com/contato',
        utmSource: 'linkedin',
        utmMedium: 'organic_social',
        utmCampaign: 'teste-visual',
        mediaIds: [],
        titleOptions: [
          'O que falta no seu briefing?',
          'Escopo, prazo e documentos antes da proposta',
        ],
        titleCandidates: [
          {
            text: 'O que falta no seu briefing?',
            score: 75,
            criteria: ['Exemplo de critério editorial fictício.'],
          },
        ],
        thumbnailOptions: ['Texto curto: Antes da proposta'],
        thumbnailCandidates: [
          {
            text: 'Texto curto: Antes da proposta',
            score: 50,
            criteria: ['Exemplo de critério editorial fictício.'],
          },
        ],
        heuristicNotes: [
          'Os critérios não preveem cliques nem receita. Dados fictícios.',
        ],
      },
    ],
    media: [],
    renders: [],
    editorialNotes: [
      'Dados fictícios. Revise clareza visual e acesso aos campos.',
    ],
  },
  publications: [
    {
      id: 'publication-test',
      revision: 3,
      platform: 'linkedin',
      integrationId: 'account-test',
      postId: 'post-test',
      state: 'DRAFT',
      createdAt: date,
    },
  ],
  outcomes: [
    'lead',
    'qualified_lead',
    'opportunity',
    'proposal',
    'contract',
    'invoiced',
    'received',
  ].map((stage, index) => ({
    id: `outcome-${index}`,
    stage: stage as StudioProject['outcomes'][number]['stage'],
    valueCents: index >= 3 ? 100000 : undefined,
    currency: 'BRL',
    reference: `REGISTRO FICTÍCIO ${index + 1}`,
    note: 'Dado criado somente para verificar o layout. Nenhum resultado comercial real.',
    recordedBy: 'fixture',
    occurredAt: date,
    createdAt: date,
  })),
  events: [],
};

project.status = 'approved';
project.approvals.package = {
  stage: 'package',
  hash: 'fixture-package',
  revision: project.revision,
  approvedBy: 'fixture',
  approvedAt: date,
};
project.document.identity = {
  ...project.document.identity,
  brandName: 'Marca fictícia',
  language: 'pt-BR',
  narration: { provider: 'local' },
  primaryColor: '#132128',
  secondaryColor: '#F9733D',
  fontFamily: 'sans',
  channel: { platform: 'youtube', integrationId: 'youtube-test' },
  schedule: {
    timezone: 'America/Sao_Paulo',
    weeklyFrequency: 2,
    slots: [
      { dayOfWeek: 1, time: '09:00' },
      { dayOfWeek: 4, time: '14:30' },
    ],
  },
};
project.document.media = [
  {
    id: 'fixture-video',
    name: 'Vídeo fictício para testar os controles',
    kind: 'video',
    license: 'owned',
  },
];
project.document.packages.unshift({
  platform: 'youtube',
  title: 'Exemplo fictício: organize seu briefing',
  description: 'DADO DE TESTE. Nenhum conselho técnico ou publicação real.',
  cta: 'Converse sobre o escopo.',
  hashtags: ['teste'],
  landingUrl: 'https://example.com/contato',
  utmSource: 'youtube',
  utmMedium: 'organic_social',
  utmCampaign: 'preview-test',
  mediaIds: ['fixture-video'],
});
const model = structuredClone(project);
model.id = 'fixture-model';
model.title = 'Modelo editorial fictício aprovado';
model.document.identity.audience =
  'Público fictício para conferir a reutilização de identidade.';
const batches: StudioDistributionBatch[] = [
  {
    id: 'fixture-private-batch',
    revision: 2,
    state: 'running',
    timezone: 'America/Sao_Paulo',
    quotaBudget: { uploads: 2, otherUnits: 400 },
    quotaEstimate: [
      {
        day: '2026-11-15',
        timezone: 'America/Los_Angeles',
        uploads: 1,
        otherUnits: 180,
      },
    ],
    quotaDisclaimer:
      'Estimativa fictícia de teste. Não é saldo de conta nem consumo real.',
    mirrorEnabled: true,
    mirrorIntervalMinutes: 60,
    warnings: ['DADOS DE TESTE. Nenhum vídeo foi enviado.'],
    createdAt: date,
    confirmedAt: date,
    confirmedBy: 'fixture',
    items: [
      {
        id: 'fixture-private-item',
        batchId: 'fixture-private-batch',
        projectId: project.id,
        projectRevision: project.revision,
        title: 'Vídeo privado fictício para conferir o estado',
        integrationId: 'youtube-test',
        integrationName: 'YouTube fictício',
        mediaId: 'fixture-video',
        publishAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        madeForKids: false,
        containsSyntheticMedia: true,
        phase: 'uploaded_private',
        revision: 2,
        youtubePrivacy: 'private',
        youtubeObservedAt: date,
        instagramIntegrationId: 'instagram-test',
        instagramIntegrationName: 'Instagram fictício',
        canCancel: false,
        canReconcile: true,
      },
    ],
  },
];
declare global {
  interface Window {
    __studioPreviewRequests: Array<{
      url: string;
      method: string;
      body: unknown;
    }>;
  }
}
window.__studioPreviewRequests = [];
const threads = [
  {
    id: 'thread-test',
    integrationId: 'account-test',
    postId: 'post-test',
    platform: 'youtube',
    authorName: 'Pessoa fictícia para teste',
    text: 'Comentário fictício: quais documentos são necessários para uma conversa inicial?',
    publishedAt: date,
    observedAt: date,
    replyDraft:
      'Resposta fictícia para revisão do fluxo. O envio não é real neste ambiente.',
    draftHash: 'b'.repeat(64),
    replyState: 'draft',
    revision: 1,
  },
];
const cap = {
  text: { available: false, reason: 'Geração desligada nesta revisão visual.' },
  research: {
    available: false,
    reason: 'Pesquisa desligada nesta revisão visual.',
  },
  media: {
    available: false,
    reason: 'Produção desligada nesta revisão visual.',
  },
  publishing: {
    available: false,
    reason: 'Nenhum envio real nesta revisão visual.',
  },
  platforms: ['youtube', 'instagram', 'linkedin'],
  integrations: [
    {
      id: 'account-test',
      name: 'LinkedIn fictício',
      platform: 'linkedin',
      provider: 'linkedin',
    },
    {
      id: 'youtube-test',
      name: 'YouTube fictício',
      platform: 'youtube',
      provider: 'youtube',
    },
    {
      id: 'instagram-test',
      name: 'Instagram fictício',
      platform: 'instagram',
      provider: 'instagram',
    },
  ],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const fetchFixture = async (url: string, options?: RequestInit) => {
  const body = options?.body ? JSON.parse(String(options.body)) : {};
  window.__studioPreviewRequests.push({
    url,
    method: options?.method || 'GET',
    body,
  });
  if (url === '/studio/capabilities') return json(cap);
  if (url === '/studio/projects') return json([project, model]);
  if (url === '/studio/projects/fixture-model') return json(model);
  if (url.endsWith('/production-capabilities'))
    return json({
      available: true,
      localVoice: true,
      openaiVoice: false,
      images: true,
      reason:
        'DADOS DE TESTE. Controles de produção disponíveis para revisão visual; nenhuma geração será executada.',
    });
  if (url === '/studio/distribution/capabilities')
    return json({
      available: true,
      reason:
        'DADOS DE TESTE. A grade usa contas fictícias e não faz envio real.',
      workerRequired: true,
      maxBatchItems: 20,
      maxScheduleDays: 30,
      minAdvanceMinutes: 30,
      quotaBudgetCeiling: { uploads: 100, otherUnits: 100000 },
      quotaDisclaimer:
        'DADOS DE TESTE. Orçamento local fictício, sem consulta a uma plataforma.',
      integrations: [
        {
          id: 'youtube-test',
          name: 'YouTube fictício',
          platform: 'youtube',
          provider: 'youtube',
          available: true,
          permissionHint: 'Conta fictícia.',
        },
        {
          id: 'instagram-test',
          name: 'Instagram fictício',
          platform: 'instagram',
          provider: 'instagram',
          available: true,
          permissionHint: 'Conta fictícia.',
        },
      ],
    });
  if (url === '/studio/distribution/inventory')
    return json({ batches, limit: 50 });
  if (url === '/studio/distribution/plan' && options?.method === 'POST') {
    const plan = body as StudioDistributionPlan;
    const batch: StudioDistributionBatch = {
      id: 'fixture-review-batch',
      revision: 1,
      state: 'planned',
      timezone: plan.timezone,
      quotaBudget: plan.quotaBudget,
      quotaEstimate: [
        {
          day: new Date().toISOString().slice(0, 10),
          timezone: 'America/Los_Angeles',
          uploads: plan.items.length,
          otherUnits: plan.items.length * 180,
        },
      ],
      quotaDisclaimer:
        'PLANO FICTÍCIO DE TESTE. Nenhuma cota consultada ou consumida.',
      mirrorEnabled: Boolean(plan.mirror),
      mirrorIntervalMinutes: 60,
      warnings: [
        'Este plano é uma simulação isolada. A confirmação de envio está desativada.',
      ],
      createdAt: new Date().toISOString(),
      items: plan.items.map((item, index) => ({
        id: `fixture-plan-item-${index}`,
        batchId: 'fixture-review-batch',
        projectId: item.projectId,
        projectRevision: item.revision,
        title: project.title,
        integrationId: item.integrationId,
        integrationName: 'YouTube fictício',
        mediaId: 'fixture-video',
        publishAt: item.publishAt,
        madeForKids: item.madeForKids,
        containsSyntheticMedia: item.containsSyntheticMedia,
        phase: 'planned',
        revision: 1,
        canCancel: true,
        canReconcile: false,
      })),
    };
    batches.unshift(batch);
    return json(batch);
  }
  if (
    url.startsWith('/studio/distribution/batches/') &&
    (!options?.method || options.method === 'GET')
  ) {
    const batch = batches.find((item) => url.endsWith(`/${item.id}`));
    return batch
      ? json(batch)
      : json({ message: 'Grade fictícia não encontrada.' }, 404);
  }
  if (url.endsWith('/audience/capabilities'))
    return json({
      textGeneration: cap.text,
      integrations: [
        {
          id: 'account-test',
          name: 'Conta fictícia para teste',
          provider: 'youtube',
          comments: {
            available: false,
            reason: 'Comentários fictícios para teste visual.',
          },
          reply: { available: false, reason: 'Envio real desativado.' },
          metrics: {
            available: false,
            reason: 'Métricas fictícias para teste visual.',
          },
        },
      ],
    });
  if (url.endsWith('/audience/threads'))
    return json({ threads, coverage: [], limit: 25 });
  if (url.includes('/audience/metrics'))
    return json({
      periodDays: 28,
      observedAt: date,
      source: 'connected-platform-api',
      posts: [],
      recommendations: [],
      note: 'DADOS FICTÍCIOS DE TESTE. Nenhuma plataforma consultada.',
    });
  if (url === '/studio/projects/visual-test') {
    if (options?.method === 'PUT')
      project = {
        ...project,
        ...body,
        revision: project.revision + 1,
        updatedAt: new Date().toISOString(),
        approvals: {},
      };
    return json(project);
  }
  if (url.endsWith('/approve')) {
    project.approvals[body.stage as keyof StudioProject['approvals']] = {
      stage: body.stage,
      revision: project.revision,
      approvedAt: new Date().toISOString(),
      approvedBy: 'fixture',
      hash: 'fixture',
    };
    return json(project);
  }
  return json(
    {
      message:
        'Ação desativada nesta revisão visual isolada. Use a aplicação conectada para executar.',
    },
    503
  );
};
export const useFetch = () => fetchFixture;
