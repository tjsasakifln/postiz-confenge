import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StudioService } from './studio.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StudioOutcomeDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';
import type {
  StudioApprovalStage,
  StudioDocument,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';

vi.mock('../posts/posts.service', () => ({ PostsService: class {} }));
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
vi.mock('@gitroom/nestjs-libraries/studio/studio.production.service', () => ({
  StudioProductionService: class {},
}));

const document = (): StudioDocument => ({
  brief: 'Projetos de engenharia para construtoras.',
  identity: {
    audience: 'Construtoras',
    positioning: 'Projetos documentados',
    tone: 'Profissional',
    visualStyle: 'Sóbrio',
    evidence: ['Projetos de engenharia para construtoras.'],
    hypotheses: [],
  },
  topic: 'Como preparar o briefing de um projeto',
  sources: [],
  scenes: [
    {
      id: 'scene-1',
      narration: 'Liste as necessidades da obra.',
      visual: 'Lista de necessidades',
      durationSeconds: 10,
      sourceIds: [],
      kind: 'card',
    },
  ],
  packages: [
    {
      platform: 'linkedin',
      title: 'Briefing de projeto',
      description: 'Liste as necessidades antes de iniciar.',
      hashtags: ['engenharia'],
      cta: 'Envie seu briefing.',
      landingUrl: 'https://confenge.com.br/projetos',
      utmSource: 'linkedin',
      utmMedium: 'organic_social',
      utmCampaign: 'briefing',
      mediaIds: [],
    },
  ],
  media: [],
  renders: [],
});

function fixture() {
  const row = {
    id: 'project-a',
    organizationId: 'org-a',
    title: 'Projeto A',
    revision: 1,
    document: document(),
    approvals: {},
    events: [],
    publications: [],
    outcomes: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as any;
  const repo = {
    get: vi.fn(async (org: string, id: string) =>
      org === row.organizationId && id === row.id ? structuredClone(row) : null
    ),
    list: vi.fn(async () => [structuredClone(row)]),
    posts: vi.fn(async () => []),
    media: vi.fn(async () => []),
    integrations: vi.fn(async () => [
      { id: 'channel-a', name: 'Canal A', providerIdentifier: 'linkedin' },
    ]),
    updateDocument: vi.fn(async (org, id, revision, title, next, approvals) => {
      if (
        org !== row.organizationId ||
        id !== row.id ||
        revision !== row.revision
      )
        throw new ConflictException();
      Object.assign(row, {
        title,
        document: structuredClone(next),
        approvals,
        revision: revision + 1,
      });
      return structuredClone(row);
    }),
    approve: vi.fn(async (org, id, revision, approvals) => {
      if (revision !== row.revision) throw new ConflictException();
      row.approvals = approvals;
      return structuredClone(row);
    }),
    claimDraft: vi.fn(),
    finishDraft: vi.fn(),
    outcome: vi.fn(),
  };
  const posts = {
    validatePosts: vi.fn(async () => [
      { emptyContent: false, valid: true, errors: true, tooLong: false },
    ]),
    mapTypeToPost: vi.fn(async (input) => input),
    createPost: vi.fn(async (_org, input) => [
      { postId: input.posts[0].value[0].id },
    ]),
  };
  const writer = {
    capabilities: vi.fn(() => ({ available: false, reason: 'Sem chave' })),
    generate: vi.fn(),
  };
  const research = {
    capabilities: vi.fn(() => ({ available: false, reason: 'Sem pesquisa' })),
  };
  const production = {
    capabilities: vi.fn(async () => ({
      available: false,
      reason: 'Sem FFmpeg',
    })),
    assertInstagramImage: vi.fn(async () => undefined),
  };
  const manager = {
    getSocialIntegration: vi.fn(() => ({
      studioDraftSettings: () => ({
        __type: 'linkedin',
        post_as_images_carousel: false,
      }),
    })),
  };
  const service = new StudioService(
    repo as any,
    posts as any,
    writer as any,
    research as any,
    production as any,
    manager as any
  );
  function approve(
    stages: StudioApprovalStage[] = ['identity', 'script', 'package']
  ) {
    for (const stage of stages)
      row.approvals[stage] = {
        stage,
        revision: row.revision,
        hash: service.stageHash(row.document, stage),
        approvedBy: 'reviewer',
        approvedAt: new Date().toISOString(),
      };
  }
  return { row, repo, posts, writer, service, manager, production, approve };
}

describe('Studio: ownership, approvals and publication boundaries', () => {
  it('does not reveal a project from another organization', async () => {
    const { service, repo } = fixture();
    await expect(service.get('org-b', 'project-a')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(repo.posts).not.toHaveBeenCalled();
  });

  it('requires every earlier stage and the current content hash', async () => {
    const { service, approve, row } = fixture();
    approve(['package']);
    let project = await service.get('org-a', row.id);
    expect(() => service.requireApproval(project, 'package')).toThrow(
      BadRequestException
    );
    approve();
    project = await service.get('org-a', row.id);
    expect(() => service.requireApproval(project, 'package')).not.toThrow();
    project.document.scenes[0].narration =
      'Conteúdo alterado depois da revisão';
    expect(() => service.requireApproval(project, 'script')).toThrow(
      BadRequestException
    );
  });

  it('rejects generation that skips identity review, before contacting a paid provider', async () => {
    const { service, writer } = fixture();
    await expect(
      service.generate(
        'org-a',
        'project-a',
        { revision: 1, stage: 'script' },
        'user'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writer.generate).not.toHaveBeenCalled();
  });

  it('preserves identity and script approvals when an owned visual is attached, invalidates package', async () => {
    const { service, repo, row, approve } = fixture();
    approve();
    repo.media.mockResolvedValue([
      { id: 'asset-a', path: '/owned.png', name: 'owned.png' },
    ] as any);
    const next = document();
    next.media.push({
      id: 'asset-a',
      path: 'https://attacker.invalid/path',
      kind: 'image',
      license: 'owned',
    });
    next.scenes[0].mediaId = 'asset-a';
    const saved = await service.updateDocument(
      'org-a',
      row.id,
      1,
      next,
      'user'
    );
    expect(saved.approvals.identity).toBeDefined();
    expect(saved.approvals.script).toBeDefined();
    expect(saved.approvals.package).toBeUndefined();
    expect(saved.document.media[0].path).toBe('/owned.png');
  });

  it('invalidates downstream approvals and removes finished videos when a script changes', async () => {
    const { service, row, approve, repo } = fixture();
    row.document.media.push({
      id: 'video-a',
      kind: 'video',
      license: 'owned',
      path: '/video.mp4',
      name: 'video.mp4',
    });
    row.document.renders.push({
      id: 'video-a',
      name: 'video.mp4',
      path: '/video.mp4',
      durationSeconds: 10,
      format: 'vertical',
      subtitles: '',
      sourcesSceneIds: ['scene-1'],
    });
    row.document.packages[0].mediaIds.push('video-a');
    repo.media.mockResolvedValue([
      { id: 'video-a', path: '/video.mp4', name: 'video.mp4' },
    ] as any);
    approve();
    const next = structuredClone(row.document);
    next.scenes[0].narration = 'Uma nova orientação para a obra.';
    const saved = await service.updateDocument(
      'org-a',
      row.id,
      1,
      next,
      'user'
    );
    expect(saved.approvals.identity).toBeDefined();
    expect(saved.approvals.script).toBeUndefined();
    expect(saved.approvals.package).toBeUndefined();
    expect(saved.document.renders).toEqual([]);
    expect(saved.document.packages[0].mediaIds).toEqual([]);
  });

  it('does not save a cross-organization asset or an unregistered source reference', async () => {
    const { service, repo } = fixture();
    const next = document();
    next.media.push({ id: 'foreign-asset', kind: 'video', license: 'owned' });
    await expect(
      service.updateDocument('org-a', 'project-a', 1, next)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updateDocument).not.toHaveBeenCalled();
    next.media = [];
    next.scenes[0].sourceIds = ['made-up-source'];
    await expect(
      service.updateDocument('org-a', 'project-a', 1, next)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows one writer for a revision and rejects the concurrent stale save', async () => {
    const { service, row } = fixture();
    const first = document();
    first.topic = 'Primeira alteração';
    const second = document();
    second.topic = 'Segunda alteração';
    const results = await Promise.allSettled([
      service.updateDocument('org-a', row.id, 1, first, 'editor-1'),
      service.updateDocument('org-a', row.id, 1, second, 'editor-2'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected'
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(row.revision).toBe(2);
  });

  it('requires explicit acknowledgment of high-risk sources and records the reviewer', async () => {
    const { service, row, approve, repo } = fixture();
    row.document.sources = [
      {
        id: 'norma',
        title: 'Norma aplicável',
        url: 'https://example.org/norma',
        excerpt: 'Trecho a conferir',
        observedAt: '2026-01-01T00:00:00Z',
        risk: 'high',
      },
    ];
    approve(['identity']);
    await expect(
      service.approve(
        'org-a',
        row.id,
        { revision: 1, stage: 'script', confirmed: true },
        'reviewer'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.approve).not.toHaveBeenCalled();
    const saved = await service.approve(
      'org-a',
      row.id,
      {
        revision: 1,
        stage: 'script',
        confirmed: true,
        acknowledgedSourceIds: ['norma'],
      },
      'reviewer'
    );
    expect(saved.approvals.script?.approvedBy).toBe('reviewer');
    expect(saved.approvals.script?.acknowledgedSourceIds).toEqual(['norma']);
  });

  it('validates all destination accounts before creating the first draft', async () => {
    const { service, approve, repo, posts } = fixture();
    approve();
    await expect(
      service.createDrafts(
        'org-a',
        'project-a',
        {
          revision: 1,
          targets: [
            { platform: 'linkedin', integrationId: 'channel-a' },
            { platform: 'linkedin', integrationId: 'foreign-channel' },
          ],
        },
        'user'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.claimDraft).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('reserves one draft under concurrent retries and always invokes PostsService as draft', async () => {
    const { service, approve, repo, posts } = fixture();
    approve();
    let claimed = false;
    repo.claimDraft.mockImplementation(async () => {
      const mine = !claimed;
      claimed = true;
      return {
        claimed: mine,
        publication: { id: 'publication-a', postId: 'reserved-post-a' },
      };
    });
    const body = {
      revision: 1,
      targets: [{ platform: 'linkedin' as const, integrationId: 'channel-a' }],
    };
    await Promise.all([
      service.createDrafts('org-a', 'project-a', body, 'user'),
      service.createDrafts('org-a', 'project-a', body, 'user'),
    ]);
    expect(posts.createPost).toHaveBeenCalledTimes(1);
    const input = posts.createPost.mock.calls[0][1];
    expect(input.type).toBe('draft');
    expect(input.posts[0].value[0].id).toBe('reserved-post-a');
    expect(input.posts[0].value[0].content).toContain('utm_campaign=briefing');
  });

  it.each([
    ['instagram', true],
    ['linkedin', true],
    ['instagram', false],
    ['linkedin', false],
  ] as const)(
    'passes the selected video cover to the %s draft media payload (selected=%s) and preserves image thumbnails',
    async (platform, selected) => {
      const { service, row, repo, posts, manager, production, approve } =
        fixture();
      const media = [
        {
          id: 'video-a',
          name: 'video.mp4',
          path: 'https://assets.example.org/video.mp4',
          thumbnail: 'https://assets.example.org/existing-video-cover.jpg',
          type: 'video',
        },
        {
          id: 'image-a',
          name: 'image.jpg',
          path: 'https://assets.example.org/image.jpg',
          thumbnail: 'https://assets.example.org/existing-image-thumbnail.jpg',
          type: 'image',
        },
        {
          id: 'cover-a',
          name: 'cover.jpg',
          path: 'https://assets.example.org/selected-cover.jpg',
          type: 'image',
        },
      ];
      row.document.media = media.map((asset) => ({
        id: asset.id,
        name: asset.name,
        path: asset.path,
        kind: asset.type,
        license: 'owned',
      }));
      row.document.packages[0].platform = platform;
      row.document.packages[0].mediaIds = ['video-a', 'image-a'];
      if (selected) row.document.packages[0].thumbnailMediaId = 'cover-a';
      repo.media.mockResolvedValue(media as any);
      repo.integrations.mockResolvedValue([
        { id: 'channel-a', name: 'Canal A', providerIdentifier: platform },
      ]);
      manager.getSocialIntegration.mockReturnValue({
        studioDraftSettings: () => ({
          __type: platform,
          post_as_images_carousel: false,
        }),
      });
      repo.claimDraft.mockResolvedValue({
        claimed: true,
        publication: { id: 'publication-a', postId: 'reserved-post-a' },
      });
      approve();
      await service.createDrafts(
        'org-a',
        row.id,
        { revision: 1, targets: [{ platform, integrationId: 'channel-a' }] },
        'user'
      );
      const payload = posts.createPost.mock.calls[0][1];
      expect(payload.posts[0].value[0].image).toEqual([
        {
          id: 'video-a',
          path: 'https://assets.example.org/video.mp4',
          ...(selected
            ? { thumbnail: 'https://assets.example.org/selected-cover.jpg' }
            : platform === 'instagram'
            ? {}
            : {
                thumbnail:
                  'https://assets.example.org/existing-video-cover.jpg',
              }),
        },
        {
          id: 'image-a',
          path: 'https://assets.example.org/image.jpg',
          thumbnail: 'https://assets.example.org/existing-image-thumbnail.jpg',
        },
      ]);
      if (platform === 'instagram') {
        expect(production.assertInstagramImage).toHaveBeenCalledWith(
          'org-a',
          expect.anything(),
          'image-a',
          'post'
        );
        if (selected)
          expect(production.assertInstagramImage).toHaveBeenCalledWith(
            'org-a',
            expect.anything(),
            'cover-a',
            'cover'
          );
        else expect(production.assertInstagramImage).toHaveBeenCalledTimes(1);
      } else {
        expect(production.assertInstagramImage).not.toHaveBeenCalled();
      }
    }
  );

  it.each(['post', 'cover'] as const)(
    'rejects an incompatible Instagram %s before reserving any draft in the batch',
    async (role) => {
      const { service, row, repo, posts, production, approve } = fixture();
      const asset = {
        id: 'png-a',
        name: 'external.png',
        path: 'https://assets.example.org/external.png',
      };
      const video = {
        id: 'video-a',
        name: 'video.mp4',
        path: 'https://assets.example.org/video.mp4',
      };
      const media = [asset, ...(role === 'cover' ? [video] : [])];
      row.document.media = [
        { ...asset, kind: 'image', license: 'owned' },
        ...(role === 'cover'
          ? [{ ...video, kind: 'video', license: 'owned' }]
          : []),
      ];
      row.document.packages.push({
        ...row.document.packages[0],
        platform: 'instagram',
        mediaIds: role === 'post' ? [asset.id] : [video.id],
        ...(role === 'cover' ? { thumbnailMediaId: asset.id } : {}),
      });
      repo.media.mockResolvedValue(media as any);
      repo.integrations.mockResolvedValue([
        { id: 'channel-a', name: 'Canal A', providerIdentifier: 'linkedin' },
        {
          id: 'instagram-a',
          name: 'Instagram A',
          providerIdentifier: 'instagram',
        },
      ]);
      production.assertInstagramImage.mockRejectedValueOnce(
        new BadRequestException(
          'O Instagram exige uma imagem JPEG. Converta, registre e aprove o novo arquivo.'
        )
      );
      approve();
      await expect(
        service.createDrafts(
          'org-a',
          row.id,
          {
            revision: 1,
            targets: [
              { platform: 'linkedin', integrationId: 'channel-a' },
              { platform: 'instagram', integrationId: 'instagram-a' },
            ],
          },
          'user'
        )
      ).rejects.toThrow('JPEG');
      expect(production.assertInstagramImage).toHaveBeenCalledWith(
        'org-a',
        expect.anything(),
        asset.id,
        role
      );
      expect(repo.claimDraft).not.toHaveBeenCalled();
      expect(posts.createPost).not.toHaveBeenCalled();
    }
  );

  it('keeps editorial feedback when warning about a repeated topic', async () => {
    const { service, row, repo, writer, approve } = fixture();
    row.document.editorialNotes = [
      'Observação: chegaram perguntas sobre o briefing; confirmar demanda.',
    ];
    const other = structuredClone(row);
    other.id = 'project-b';
    repo.list.mockResolvedValue([other]);
    writer.generate.mockResolvedValue(structuredClone(row.document));
    approve(['identity']);
    const result = await service.generate(
      'org-a',
      row.id,
      { revision: 1, stage: 'outline' },
      'user'
    );
    expect(result.document.editorialNotes).toContain(
      'Observação: chegaram perguntas sobre o briefing; confirmar demanda.'
    );
    expect(result.document.editorialNotes).toContain(
      'Esta pauta já aparece em outro projeto. Confirme um novo enfoque antes de produzir novamente.'
    );
  });

  it('reports missing dependencies honestly and never reports a draft as published', async () => {
    const { service, row, repo } = fixture();
    const capabilities = await service.capabilities('org-a');
    expect(capabilities.text.available).toBe(false);
    expect(capabilities.media.available).toBe(false);
    row.publications = [
      {
        id: 'pub',
        revision: 1,
        platform: 'linkedin',
        integrationId: 'channel-a',
        postId: 'post-a',
        state: 'draft',
        createdAt: new Date(),
      },
    ];
    repo.posts.mockResolvedValue([
      {
        id: 'post-a',
        state: 'DRAFT',
        publishDate: new Date(),
        releaseURL: null,
      },
    ] as any);
    const project = await service.get('org-a', row.id);
    expect(project.publications[0].state).toBe('DRAFT');
    expect(project.publications[0].releaseUrl).toBeUndefined();
  });

  it('does not equate a proposal to money received and rejects future outcomes', async () => {
    const { service, repo } = fixture();
    await service.outcome(
      'org-a',
      'project-a',
      {
        stage: 'proposal',
        valueCents: 800000,
        currency: 'BRL',
        reference: 'PRO-2026-1',
        note: 'Proposta enviada',
        occurredAt: '2026-01-01T00:00:00Z',
      },
      'user'
    );
    expect(repo.outcome.mock.calls[0][3].stage).toBe('proposal');
    expect(repo.outcome).toHaveBeenCalledTimes(1);
    await expect(
      service.outcome(
        'org-a',
        'project-a',
        {
          stage: 'received',
          valueCents: 800000,
          currency: 'BRL',
          reference: 'REC-1',
          note: '',
          occurredAt: '2099-01-01T00:00:00Z',
        },
        'user'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects explicit null values at the public DTO and requires a real amount for every financial stage', async () => {
    const { service, repo } = fixture();
    const base = {
      stage: 'lead' as const,
      currency: 'BRL',
      reference: 'FORM-1',
      note: '',
      occurredAt: '2026-01-01T00:00:00Z',
    };
    expect(
      await validate(plainToInstance(StudioOutcomeDto, base))
    ).toHaveLength(0);
    for (const field of ['externalId', 'valueCents']) {
      const errors = await validate(
        plainToInstance(StudioOutcomeDto, { ...base, [field]: null })
      );
      expect(errors.map((error) => error.property)).toContain(field);
    }
    for (const stage of [
      'proposal',
      'contract',
      'invoiced',
      'received',
    ] as const) {
      for (const valueCents of [null, undefined]) {
        await expect(
          service.outcome(
            'org-a',
            'project-a',
            { ...base, stage, valueCents } as any,
            'user'
          )
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    }
    await expect(
      service.outcome(
        'org-a',
        'project-a',
        { ...base, externalId: null } as any,
        'user'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.outcome).not.toHaveBeenCalled();
    await service.outcome(
      'org-a',
      'project-a',
      { ...base, stage: 'proposal', valueCents: 0 },
      'user'
    );
    expect(repo.outcome).toHaveBeenCalledTimes(1);
  });

  it('never exposes stored provider errors or unsafe publication URLs on the studio endpoint', async () => {
    const { service, row, repo } = fixture();
    row.publications = [
      {
        id: 'pub',
        revision: 1,
        platform: 'linkedin',
        integrationId: 'channel-a',
        postId: 'post-a',
        state: 'draft',
        createdAt: new Date(),
      },
    ];
    repo.posts.mockResolvedValue([
      {
        id: 'post-a',
        state: 'PUBLISHED',
        publishDate: new Date(),
        releaseURL: 'javascript:alert(1)',
        error: 'Provider request token=secret-token',
      },
    ] as any);
    const project = await service.get('org-a', row.id);
    expect(JSON.stringify(project)).not.toContain('secret-token');
    expect(project.publications[0].releaseUrl).toBeUndefined();
    expect(project.publications[0].error).toContain(
      'A publicação encontrou um erro'
    );
  });
});
