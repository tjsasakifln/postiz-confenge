import { ConflictException, Injectable } from '@nestjs/common';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import type { StudioApprovalStage } from '@gitroom/helpers/studio/studio.types';
import { PublicStudioApproveDto } from './public.studio.dto';

/** Public API adapter. It never claims that an organization API key identifies a human reviewer. */
@Injectable()
export class PublicStudioService {
  constructor(private readonly studio: StudioService) {}

  actor(organizationId: string, oauthUserId?: string): string {
    return oauthUserId || `api:studio-agent:${organizationId}`;
  }

  async review(organizationId: string, projectId: string, stage: StudioApprovalStage) {
    const project = await this.studio.get(organizationId, projectId);
    const document = project.document;
    const content = stage === 'identity'
      ? { brief: document.brief, identity: document.identity }
      : stage === 'script'
        ? { brief: document.brief, identity: document.identity, topic: document.topic, sources: document.sources, scenes: document.scenes }
        : { brief: document.brief, identity: document.identity, topic: document.topic, sources: document.sources, scenes: document.scenes, packages: document.packages, media: document.media, renders: document.renders, backgroundMusicMediaId: document.backgroundMusicMediaId };
    return {
      projectId: project.id, title: project.title, revision: project.revision, stage,
      reviewHash: this.studio.stageHash(document, stage), content,
      alreadyApproved: project.approvals[stage]?.hash === this.studio.stageHash(document, stage),
      confirmation: 'A pessoa deve revisar este conteúdo e esta versão antes de confirmar. A chave de API identifica a organização, não comprova a identidade de uma pessoa.',
    };
  }

  async approve(organizationId: string, projectId: string, body: PublicStudioApproveDto, oauthUserId?: string) {
    const project = await this.studio.get(organizationId, projectId);
    if (project.revision !== body.revision || this.studio.stageHash(project.document, body.stage) !== body.reviewHash) {
      throw new ConflictException('A versão ou o conteúdo mudou desde a revisão. Consulte a revisão atual e solicite nova confirmação.');
    }
    return this.studio.approve(organizationId, projectId, {
      revision: body.revision, stage: body.stage, confirmed: body.confirmed,
      acknowledgedSourceIds: body.acknowledgedSourceIds,
    }, this.actor(organizationId, oauthUserId));
  }
}
