import { Body, Controller, Get, Param, Post, Put, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetOAuthUserIdFromRequest } from '@gitroom/nestjs-libraries/user/oauth.user.id.from.request';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import { StudioProductionManager } from '@gitroom/nestjs-libraries/studio/studio.production.manager';
import { StudioAudienceService } from '@gitroom/nestjs-libraries/studio/audience/studio.audience.service';
import { PublicStudioService } from '@gitroom/nestjs-libraries/studio/agent/public.studio.service';
import { PublicStudioApproveDto, PublicStudioReviewDto } from '@gitroom/nestjs-libraries/studio/agent/public.studio.dto';
import { StudioCreateDto, StudioDraftDto, StudioGenerateDto, StudioOutcomeDto, StudioUpdateDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';
import { StudioAttachRenderDto, StudioImagesDto, StudioRenderDto, StudioResearchDto, StudioStyleDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.production.dto';
import { StudioAudienceApproveDto, StudioAudienceDraftDto, StudioAudienceMetricsDto, StudioAudienceRevisionDto, StudioAudienceSendDto, StudioAudienceSyncDto } from '@gitroom/nestjs-libraries/studio/audience/studio.audience.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

/** Registered only behind the existing PublicAuthMiddleware in PublicApiModule. */
@ApiTags('Public Studio API')
@Controller('/public/v1/studio')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class PublicStudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly production: StudioProductionManager,
    private readonly audience: StudioAudienceService,
    private readonly publicStudio: PublicStudioService
  ) {}

  @Get('/capabilities')
  capabilities(@GetOrgFromRequest() org: Organization) { return this.studio.capabilities(org.id); }

  @Get('/projects')
  list(@GetOrgFromRequest() org: Organization) { return this.studio.list(org.id); }

  @Post('/projects')
  create(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Body() body: StudioCreateDto) {
    return this.studio.create(org.id, this.publicStudio.actor(org.id, userId), body);
  }

  @Get('/projects/:id')
  get(@GetOrgFromRequest() org: Organization, @Param('id') id: string) { return this.studio.get(org.id, id); }

  @Put('/projects/:id')
  update(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioUpdateDto) {
    return this.studio.update(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Get('/projects/:id/review')
  review(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Query() query: PublicStudioReviewDto) {
    return this.publicStudio.review(org.id, id, query.stage);
  }

  @Post('/projects/:id/approve')
  approve(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: PublicStudioApproveDto) {
    return this.publicStudio.approve(org.id, id, body, userId);
  }

  @Post('/projects/:id/generate')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  generate(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioGenerateDto) {
    return this.studio.generate(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/research')
  research(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioResearchDto) {
    return this.production.search(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/style')
  style(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioStyleDto) {
    return this.production.style(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/images')
  images(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioImagesDto) {
    return this.production.images(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/render')
  render(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Body() body: StudioRenderDto) {
    return this.production.start(org.id, id, body);
  }

  @Get('/projects/:id/render/:jobId')
  renderStatus(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Param('jobId') jobId: string) {
    return this.production.status(org.id, id, jobId);
  }

  @Post('/projects/:id/render/:jobId/attach')
  attach(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('jobId') jobId: string, @Body() body: StudioAttachRenderDto) {
    return this.production.attach(org.id, id, jobId, body.revision, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/drafts')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  drafts(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioDraftDto) {
    return this.studio.createDrafts(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Post('/projects/:id/outcomes')
  outcome(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Body() body: StudioOutcomeDto) {
    return this.studio.outcome(org.id, id, body, this.publicStudio.actor(org.id, userId));
  }

  @Get('/projects/:id/audience/capabilities')
  audienceCapabilities(@GetOrgFromRequest() org: Organization, @Param('id') id: string) { return this.audience.capabilities(org.id, id); }

  @Get('/projects/:id/audience/threads')
  threads(@GetOrgFromRequest() org: Organization, @Param('id') id: string) { return this.audience.threads(org.id, id); }

  @Post('/projects/:id/audience/sync')
  sync(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Body() body: StudioAudienceSyncDto) { return this.audience.sync(org.id, id, body); }

  @Put('/projects/:id/audience/threads/:threadId/draft')
  replyDraft(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('threadId') threadId: string, @Body() body: StudioAudienceDraftDto) {
    return this.audience.draft(org.id, id, threadId, this.publicStudio.actor(org.id, userId), body);
  }

  @Post('/projects/:id/audience/threads/:threadId/suggest')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  replySuggest(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('threadId') threadId: string, @Body() body: StudioAudienceRevisionDto) {
    return this.audience.suggest(org.id, id, threadId, this.publicStudio.actor(org.id, userId), body.revision);
  }

  @Post('/projects/:id/audience/threads/:threadId/approve')
  replyApprove(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('threadId') threadId: string, @Body() body: StudioAudienceApproveDto) {
    return this.audience.approve(org.id, id, threadId, this.publicStudio.actor(org.id, userId), body);
  }

  @Post('/projects/:id/audience/threads/:threadId/send')
  replySend(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('threadId') threadId: string, @Body() body: StudioAudienceSendDto) {
    return this.audience.send(org.id, id, threadId, this.publicStudio.actor(org.id, userId), body);
  }

  @Post('/projects/:id/audience/threads/:threadId/reconcile')
  replyReconcile(@GetOrgFromRequest() org: Organization, @GetOAuthUserIdFromRequest() userId: string | undefined, @Param('id') id: string, @Param('threadId') threadId: string, @Body() body: StudioAudienceRevisionDto) {
    return this.audience.reconcile(org.id, id, threadId, this.publicStudio.actor(org.id, userId), body.revision);
  }

  @Get('/projects/:id/audience/metrics')
  metrics(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Query() query: StudioAudienceMetricsDto) {
    return this.audience.metrics(org.id, id, query.days);
  }
}
