import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import type {
  StudioApprovals,
  StudioApprovalStage,
  StudioCapabilities,
  StudioDocument,
  StudioPackage,
  StudioPlatform,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import {
  StudioApproveDto,
  StudioCreateDto,
  StudioDocumentDto,
  StudioDraftDto,
  StudioGenerateDto,
  StudioOutcomeDto,
  StudioUpdateDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';
import { PostsService } from '../posts/posts.service';
import { StudioRepository } from './studio.repository';
import { StudioWriterService } from '@gitroom/nestjs-libraries/studio/studio.writer.service';
import { StudioResearchService } from '@gitroom/nestjs-libraries/studio/studio.research.service';
import { StudioProductionService } from '@gitroom/nestjs-libraries/studio/studio.production.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import type { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

const platforms: StudioPlatform[] = ['youtube', 'instagram', 'linkedin'];

@Injectable()
export class StudioService {
  constructor(
    private readonly repository: StudioRepository,
    private readonly posts: PostsService,
    private readonly writer: StudioWriterService,
    private readonly research: StudioResearchService,
    private readonly production: StudioProductionService,
    private readonly integrations: IntegrationManager
  ) {}

  private canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonical(item)).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.keys(value)
        .sort()
        .filter((key) => (value as any)[key] !== undefined)
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.canonical((value as any)[key])}`
        )
        .join(',')}}`;
    return JSON.stringify(value);
  }

  private hash(value: unknown) {
    return createHash('sha256').update(this.canonical(value)).digest('hex');
  }

  stageHash(document: StudioDocument, stage: StudioApprovalStage): string {
    const identity = this.hash({
      brief: document.brief,
      identity: document.identity,
    });
    if (stage === 'identity') return identity;
    // A generated/recorded asset can be attached after script review. The
    // approved narration, pronunciation, scenes and sources still cannot change.
    const script = this.hash({
      identity,
      topic: document.topic,
      sources: document.sources,
      scenes: document.scenes.map(
        ({ mediaId, audioMediaId, ...scene }) => scene
      ),
    });
    if (stage === 'script') return script;
    return this.hash({
      script,
      packages: document.packages,
      media: document.media,
      renders: document.renders,
      backgroundMusicMediaId: document.backgroundMusicMediaId,
      sceneAssets: document.scenes.map(({ id, mediaId, audioMediaId }) => ({
        id,
        mediaId,
        audioMediaId,
      })),
    });
  }

  requireApproval(project: StudioProject, stage: StudioApprovalStage) {
    const stages: StudioApprovalStage[] = ['identity', 'script', 'package'];
    for (const required of stages.slice(0, stages.indexOf(stage) + 1)) {
      const approval = project.approvals[required];
      if (
        !approval ||
        approval.hash !== this.stageHash(project.document, required)
      ) {
        const labels = {
          identity: 'a identidade',
          script: 'o roteiro',
          package: 'o pacote',
        };
        throw new BadRequestException(
          `Revise e aprove ${labels[required]} antes de continuar.`
        );
      }
    }
  }

  private platform(provider: string): StudioPlatform | undefined {
    const family = provider.split('-')[0] as StudioPlatform;
    return platforms.includes(family) ? family : undefined;
  }

  async capabilities(org: string): Promise<StudioCapabilities> {
    const connected = (await this.repository.integrations(org)).flatMap(
      (item) => {
        const platform = this.platform(item.providerIdentifier);
        const provider = this.integrations.getSocialIntegration(
          item.providerIdentifier
        );
        return platform && provider?.studioDraftSettings
          ? [
              {
                id: item.id,
                name: item.name,
                platform,
                provider: item.providerIdentifier,
              },
            ]
          : [];
      }
    );
    return {
      text: this.writer.capabilities(),
      research: this.research.capabilities(),
      media: await this.production.capabilities(),
      publishing: {
        available: connected.length > 0,
        reason: connected.length
          ? 'Crie rascunhos após aprovar o pacote e agende no calendário do Postiz. A grade de YouTube e Instagram tem configuração e confirmação próprias.'
          : 'Conecte um canal do YouTube, Instagram ou LinkedIn para criar rascunhos.',
      },
      platforms,
      integrations: connected,
    };
  }

  async list(org: string): Promise<StudioProject[]> {
    return Promise.all(
      (await this.repository.list(org)).map((row) => this.present(org, row))
    );
  }

  async get(org: string, id: string): Promise<StudioProject> {
    const row = await this.repository.get(org, id);
    if (!row) throw new NotFoundException('Projeto não encontrado.');
    return this.present(org, row);
  }

  async getEvent(org: string, projectId: string, eventId: string) {
    const event = await this.repository.event(org, projectId, eventId);
    if (!event)
      throw new NotFoundException('Registro não encontrado neste projeto.');
    return {
      id: event.id,
      revision: event.revision,
      action: event.action,
      actorId: event.actorId,
      detail: event.detail,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private async present(
    org: string,
    row: NonNullable<Awaited<ReturnType<StudioRepository['get']>>>
  ): Promise<StudioProject> {
    const document = row.document as unknown as StudioDocument;
    const approvals = row.approvals as unknown as StudioApprovals;
    const actualPosts = await this.repository.posts(
      org,
      row.publications.map((item) => item.postId)
    );
    const publications = row.publications.map((item) => {
      const post = actualPosts.find((post) => post.id === item.postId);
      return {
        id: item.id,
        revision: item.revision,
        platform: item.platform as StudioPlatform,
        integrationId: item.integrationId,
        postId: item.postId,
        state: post ? (post.deletedAt ? 'DELETED' : post.state) : item.state,
        releaseUrl:
          post?.state === 'PUBLISHED'
            ? this.publicReleaseUrl(post.releaseURL)
            : undefined,
        publishDate: post?.publishDate?.toISOString(),
        error: post?.error
          ? 'A publicação encontrou um erro. Confira o canal e o estado no calendário.'
          : item.error || undefined,
        createdAt: item.createdAt.toISOString(),
      };
    });
    const valid = (stage: StudioApprovalStage) =>
      approvals[stage]?.hash === this.stageHash(document, stage);
    const status = valid('identity')
      ? valid('script')
        ? valid('package')
          ? publications.some(
              (item) =>
                item.revision === row.revision &&
                !['creating', 'failed', 'DELETED'].includes(item.state)
            )
            ? 'drafted'
            : 'approved'
          : 'script_approved'
        : 'identity_approved'
      : 'draft';
    return {
      id: row.id,
      title: row.title,
      revision: row.revision,
      status,
      document,
      approvals,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publications,
      outcomes: row.outcomes.map((item) => ({
        id: item.id,
        stage: item.stage as any,
        externalId: item.externalId || undefined,
        valueCents: item.valueCents ?? undefined,
        currency: item.currency,
        reference: item.reference,
        note: item.note,
        recordedBy: item.recordedBy,
        occurredAt: item.occurredAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      })),
      events: row.events.map((item) => ({
        id: item.id,
        revision: item.revision,
        action: item.action,
        actorId: item.actorId,
        // Full approved content is available on the scoped event endpoint.
        // Do not duplicate every historical document in every project response.
        detail: {},
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private publicReleaseUrl(value?: string | null) {
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }

  async create(org: string, actorId: string, body: StudioCreateDto) {
    if (!body.title.trim() || !body.brief.trim())
      throw new BadRequestException(
        'Informe um título e o objetivo do projeto.'
      );
    const document: StudioDocument = {
      brief: body.brief.trim(),
      identity: {
        audience: '',
        positioning: '',
        tone: '',
        visualStyle: '',
        evidence: [],
        hypotheses: [],
      },
      sources: [],
      topic: '',
      scenes: [],
      packages: [],
      media: [],
      renders: [],
    };
    return this.present(
      org,
      await this.repository.create(org, actorId, body.title.trim(), document)
    );
  }

  private assertRevision(project: StudioProject, revision: number) {
    if (project.revision !== revision)
      throw new ConflictException(
        'O projeto mudou. Atualize a página antes de continuar.'
      );
  }

  private async validateDocument(
    org: string,
    input: StudioDocument
  ): Promise<StudioDocument> {
    const document = plainToInstance(StudioDocumentDto, input);
    const errors = await validate(document, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length)
      throw new BadRequestException(
        `Confira os campos do projeto: ${errors
          .map((error) => error.property)
          .join(', ')}.`
      );
    const duplicate = (ids: string[]) => new Set(ids).size !== ids.length;
    if (
      duplicate(document.sources.map((source) => source.id)) ||
      duplicate(document.scenes.map((scene) => scene.id)) ||
      duplicate(document.media.map((media) => media.id)) ||
      duplicate(document.renders.map((render) => render.id)) ||
      duplicate(document.packages.map((item) => item.platform))
    ) {
      throw new BadRequestException(
        'Fontes, cenas, mídias e pacotes precisam ter identificadores únicos.'
      );
    }
    const sourceIds = new Set(document.sources.map((source) => source.id));
    const sceneIds = new Set(document.scenes.map((scene) => scene.id));
    const mediaIds = new Set(document.media.map((media) => media.id));
    if (
      document.scenes.some((scene) =>
        scene.sourceIds.some((id) => !sourceIds.has(id))
      )
    )
      throw new BadRequestException(
        'Uma cena referencia uma fonte que não está no projeto.'
      );
    if (
      document.renders.some((render) =>
        render.sourcesSceneIds.some((id) => !sceneIds.has(id))
      )
    )
      throw new BadRequestException(
        'Um vídeo referencia uma cena que não está no projeto.'
      );
    const referenced = [
      ...document.scenes.flatMap((scene) => [
        scene.mediaId,
        scene.audioMediaId,
      ]),
      ...document.packages.flatMap((item) => [
        ...item.mediaIds,
        item.thumbnailMediaId,
      ]),
      ...document.renders.map((render) => render.id),
      document.backgroundMusicMediaId,
    ].filter(Boolean);
    if (referenced.some((id) => !mediaIds.has(id)))
      throw new BadRequestException(
        'Registre no catálogo do projeto os arquivos usados e seus direitos de uso.'
      );
    if (
      document.media.some(
        (asset) => asset.license !== 'owned' && !asset.sourceUrl
      )
    )
      throw new BadRequestException(
        'Informe a origem/licença das mídias licenciadas ou de domínio público.'
      );
    if (
      document.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) >
      900
    )
      throw new BadRequestException(
        'O roteiro pode ter até quinze minutos de duração.'
      );
    for (const item of document.packages) {
      if (item.landingUrl) {
        let url: URL;
        try {
          url = new URL(item.landingUrl);
        } catch {
          throw new BadRequestException('Informe uma URL de destino válida.');
        }
        if (
          !['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new BadRequestException(
            'O destino deve ser uma URL http(s) sem credenciais.'
          );
      }
    }
    const storedMedia = await this.repository.media(org, [...mediaIds]);
    if (storedMedia.length !== mediaIds.size)
      throw new BadRequestException(
        'Uma mídia não pertence a esta organização ou ainda não está pronta.'
      );
    // Client paths are never trusted, including links supplied for thumbnails.
    document.media = document.media.map((asset) => {
      const stored = storedMedia.find((item) => item.id === asset.id)!;
      return { ...asset, name: stored.name, path: stored.path };
    });
    document.renders = document.renders.map((render) => {
      const stored = storedMedia.find((item) => item.id === render.id)!;
      return { ...render, name: stored.name, path: stored.path };
    });
    document.packages = document.packages.map((item) => ({
      ...item,
      ...(item.titleOptions
        ? {
            titleCandidates: this.writer.scorePackageCandidates(
              document,
              item.titleOptions,
              'title'
            ),
          }
        : {}),
      ...(item.thumbnailOptions
        ? {
            thumbnailCandidates: this.writer.scorePackageCandidates(
              document,
              item.thumbnailOptions,
              'thumbnail'
            ),
          }
        : {}),
    }));
    return document;
  }

  async update(
    org: string,
    id: string,
    body: StudioUpdateDto,
    actorId: string
  ) {
    if (!body.title.trim())
      throw new BadRequestException('Informe o título do projeto.');
    return this.save(
      org,
      id,
      body.revision,
      body.document,
      actorId,
      'updated',
      body.title.trim()
    );
  }

  async updateDocument(
    org: string,
    id: string,
    revision: number,
    document: StudioDocument,
    actorId = 'system',
    action = 'updated'
  ) {
    return this.save(org, id, revision, document, actorId, action);
  }

  private async save(
    org: string,
    id: string,
    revision: number,
    input: StudioDocument,
    actorId: string,
    action: string,
    title?: string
  ) {
    const project = await this.get(org, id);
    this.assertRevision(project, revision);
    const candidate = structuredClone(input);
    // Keep old finished media in the library, but sever the automatic association
    // with a script that changed; it has not been rendered for that new script.
    if (
      this.stageHash(project.document, 'script') !==
      this.stageHash(candidate, 'script')
    ) {
      const obsolete = new Set(
        project.document.renders.map((render) => render.id)
      );
      candidate.renders = [];
      candidate.packages = candidate.packages.map((item) => ({
        ...item,
        mediaIds: item.mediaIds.filter((id) => !obsolete.has(id)),
      }));
    }
    const document = await this.validateDocument(org, candidate);
    const approvals: StudioApprovals = { ...project.approvals };
    const stages: StudioApprovalStage[] = ['identity', 'script', 'package'];
    let invalidate = false;
    for (const stage of stages) {
      invalidate ||=
        this.stageHash(project.document, stage) !==
        this.stageHash(document, stage);
      if (invalidate) delete approvals[stage];
    }
    const saved = await this.repository.updateDocument(
      org,
      id,
      revision,
      title ?? project.title,
      document,
      approvals,
      actorId,
      action
    );
    return this.present(org, saved!);
  }

  async generate(
    org: string,
    id: string,
    body: StudioGenerateDto,
    actorId: string
  ) {
    const project = await this.get(org, id);
    this.assertRevision(project, body.revision);
    if (body.stage !== 'identity')
      this.requireApproval(
        project,
        body.stage === 'package' ? 'script' : 'identity'
      );
    if (body.stage === 'script' && !project.document.topic.trim())
      throw new BadRequestException('Defina a pauta antes de gerar o roteiro.');
    const previousTopics =
      body.stage === 'outline'
        ? (await this.repository.list(org))
            .filter((item) => item.id !== id)
            .map((item) => (item.document as unknown as StudioDocument).topic)
            .filter(Boolean)
        : [];
    const document = await this.writer.generate(body.stage, project.document, {
      previousTopics,
    });
    if (
      body.stage === 'outline' &&
      previousTopics.some(
        (topic) =>
          topic.trim().toLocaleLowerCase() ===
          document.topic?.trim().toLocaleLowerCase()
      )
    ) {
      document.editorialNotes = [
        ...new Set([
          ...(document.editorialNotes || []),
          'Esta pauta já aparece em outro projeto. Confirme um novo enfoque antes de produzir novamente.',
        ]),
      ].slice(-20);
    }
    return this.updateDocument(
      org,
      id,
      body.revision,
      document,
      actorId,
      `generated:${body.stage}`
    );
  }

  async approve(
    org: string,
    id: string,
    body: StudioApproveDto,
    actorId: string
  ) {
    if (body.confirmed !== true || !actorId)
      throw new BadRequestException(
        'A aprovação exige confirmação explícita de um usuário autenticado.'
      );
    const project = await this.get(org, id);
    this.assertRevision(project, body.revision);
    const document = await this.validateDocument(org, project.document);
    if (
      this.stageHash(document, body.stage) !==
      this.stageHash(project.document, body.stage)
    )
      throw new ConflictException(
        'Os arquivos do projeto mudaram. Salve e revise o conteúdo atualizado antes de aprovar.'
      );
    if (body.stage === 'identity') {
      if (
        ![
          document.identity.audience,
          document.identity.positioning,
          document.identity.tone,
          document.identity.visualStyle,
        ].every((value) => value.trim())
      )
        throw new BadRequestException(
          'Preencha público, posicionamento, tom e estilo antes de aprovar a identidade.'
        );
    } else {
      this.requireApproval(
        project,
        body.stage === 'script' ? 'identity' : 'script'
      );
      if (
        !document.topic.trim() ||
        !document.scenes.length ||
        document.scenes.some(
          (scene) => !scene.narration.trim() || !scene.visual.trim()
        )
      )
        throw new BadRequestException(
          'Defina a pauta e todas as cenas antes de aprovar o roteiro.'
        );
      const highRisk = document.sources
        .filter((source) => source.risk === 'high')
        .map((source) => source.id);
      if (highRisk.some((id) => !body.acknowledgedSourceIds?.includes(id)))
        throw new BadRequestException(
          'Confirme a revisão das fontes de risco alto antes de aprovar.'
        );
      if (
        body.stage === 'package' &&
        (!document.packages.length ||
          document.packages.some(
            (item) =>
              !item.title.trim() || !item.description.trim() || !item.cta.trim()
          ))
      )
        throw new BadRequestException(
          'Cada pacote precisa de título, descrição e próximo passo antes da aprovação.'
        );
    }
    const hash = this.stageHash(document, body.stage);
    if (project.approvals[body.stage]?.hash === hash) return project;
    const approvals: StudioApprovals = {
      ...project.approvals,
      [body.stage]: {
        stage: body.stage,
        hash,
        revision: project.revision,
        approvedBy: actorId,
        approvedAt: new Date().toISOString(),
        ...(body.acknowledgedSourceIds
          ? { acknowledgedSourceIds: body.acknowledgedSourceIds }
          : {}),
      },
    };
    return this.present(
      org,
      (await this.repository.approve(
        org,
        id,
        body.revision,
        approvals,
        actorId,
        body.stage
      ))!
    );
  }

  private packageText(item: StudioPackage) {
    let link = '';
    if (item.landingUrl) {
      const url = new URL(item.landingUrl);
      if (item.utmSource) url.searchParams.set('utm_source', item.utmSource);
      if (item.utmMedium) url.searchParams.set('utm_medium', item.utmMedium);
      if (item.utmCampaign)
        url.searchParams.set('utm_campaign', item.utmCampaign);
      link = url.href;
    }
    return [
      item.description,
      item.cta,
      link,
      item.hashtags
        .map((tag) => `#${tag.replace(/^#+/, '').replace(/\s+/g, '')}`)
        .join(' '),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  async createDrafts(
    org: string,
    id: string,
    body: StudioDraftDto,
    actorId: string
  ) {
    const project = await this.get(org, id);
    this.assertRevision(project, body.revision);
    this.requireApproval(project, 'package');
    const currentDocument = await this.validateDocument(org, project.document);
    if (
      this.stageHash(currentDocument, 'package') !==
      project.approvals.package!.hash
    )
      throw new ConflictException(
        'Os arquivos do pacote mudaram. Salve e aprove a versão atual antes de criar rascunhos.'
      );
    if (
      new Set(body.targets.map((item) => item.integrationId)).size !==
      body.targets.length
    )
      throw new BadRequestException('Escolha cada canal apenas uma vez.');
    const connected = await this.repository.integrations(org);
    const drafts = [];
    // Validate the whole batch before creating the first draft.
    for (const target of body.targets) {
      const account = connected.find(
        (item) => item.id === target.integrationId
      );
      if (
        !account ||
        this.platform(account.providerIdentifier) !== target.platform
      )
        throw new BadRequestException(
          'O canal não está conectado e disponível nesta organização.'
        );
      const item = project.document.packages.find(
        (item) => item.platform === target.platform
      );
      if (!item)
        throw new BadRequestException(
          'Prepare e aprove um pacote para cada canal selecionado.'
        );
      const provider = this.integrations.getSocialIntegration(
        account.providerIdentifier
      );
      if (!provider?.studioDraftSettings)
        throw new BadRequestException(
          'Este canal não oferece rascunhos do estúdio.'
        );
      const ids = [...item.mediaIds, item.thumbnailMediaId].filter(Boolean);
      const media = await this.repository.media(org, ids);
      const thumbnail = item.thumbnailMediaId
        ? media.find((asset) => asset.id === item.thumbnailMediaId)
        : undefined;
      const settings = provider.studioDraftSettings({
        title: item.title,
        tags: item.hashtags.map((tag) => tag.replace(/^#+/, '')),
        mediaCount: item.mediaIds.length,
        ...(thumbnail
          ? { thumbnail: { id: thumbnail.id, path: thumbnail.path } }
          : {}),
      });
      const post = {
        integration: { id: account.id },
        settings,
        value: [
          {
            content: this.packageText(item),
            image: item.mediaIds.map((id) => {
              const asset = media.find((item) => item.id === id)!;
              const isVideo =
                currentDocument.media.find((item) => item.id === id)?.kind ===
                'video';
              const mediaThumbnail =
                (isVideo && thumbnail?.path) || asset.thumbnail;
              return {
                id: asset.id,
                path: asset.path,
                ...(mediaThumbnail ? { thumbnail: mediaThumbnail } : {}),
                ...(asset.alt ? { alt: asset.alt } : {}),
              };
            }),
          },
        ],
      };
      const [validation] = await this.posts.validatePosts(org, [post]);
      if (
        validation.emptyContent ||
        !validation.valid ||
        validation.errors !== true ||
        validation.tooLong
      ) {
        const reason = validation.emptyContent
          ? 'adicione texto ou mídia.'
          : !validation.valid
          ? 'confira título, capa e opções do canal.'
          : validation.errors !== true
          ? 'confira a quantidade, o formato e a disponibilidade das mídias para este canal.'
          : 'reduza o texto ao limite do canal.';
        throw new BadRequestException(`${account.name}: ${reason}`);
      }
      drafts.push({ target, post });
    }
    for (const { target, post } of drafts) {
      const { publication, claimed } = await this.repository.claimDraft(
        org,
        id,
        body.revision,
        project.approvals.package!.hash,
        target.platform,
        target.integrationId,
        actorId
      );
      if (!claimed) continue;
      try {
        const input: CreatePostDto = {
          type: 'draft',
          shortLink: false,
          date: new Date().toISOString(),
          tags: [],
          posts: [
            {
              ...post,
              settings: post.settings as any,
              group: publication.id,
              value: post.value.map((value) => ({
                ...value,
                id: publication.postId,
                delay: 0,
              })),
            },
          ],
        };
        const mapped = await this.posts.mapTypeToPost(input, org);
        const result = await this.posts.createPost(org, mapped, 'WEB', true);
        if (!result.some((item) => item.postId === publication.postId))
          throw new Error('Missing draft');
        await this.repository.finishDraft(org, publication.id);
      } catch {
        // PostsService can fail after writing. Observe the reserved id before
        // permitting a retry, and never turn an existing scheduled post into a draft.
        const existing = await this.repository.posts(org, [publication.postId]);
        if (existing.length)
          await this.repository.finishDraft(org, publication.id);
        else {
          await this.repository.finishDraft(
            org,
            publication.id,
            'Não foi possível criar o rascunho. Tente novamente após conferir o canal.'
          );
          throw new BadRequestException(
            'Um rascunho não foi criado. Os anteriores foram preservados; atualizar e repetir não os duplica.'
          );
        }
      }
    }
    return this.get(org, id);
  }

  async outcome(
    org: string,
    id: string,
    body: StudioOutcomeDto,
    actorId: string
  ) {
    await this.get(org, id);
    if (
      body.externalId !== undefined &&
      (typeof body.externalId !== 'string' || !body.externalId.trim())
    )
      throw new BadRequestException('Informe um identificador externo válido.');
    if (!body.reference.trim())
      throw new BadRequestException(
        'Informe uma referência verificável para este resultado.'
      );
    if (
      ['proposal', 'contract', 'invoiced', 'received'].includes(body.stage) &&
      body.valueCents == null
    )
      throw new BadRequestException(
        'Informe o valor desta etapa, em centavos.'
      );
    if (new Date(body.occurredAt).getTime() > Date.now() + 5 * 60 * 1000)
      throw new BadRequestException(
        'Registre somente resultados já ocorridos.'
      );
    await this.repository.outcome(org, id, actorId, {
      ...body,
      reference: body.reference.trim(),
      ...(body.externalId ? { externalId: body.externalId.trim() } : {}),
    });
    return this.get(org, id);
  }
}
