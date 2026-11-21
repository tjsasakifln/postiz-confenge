import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { StudioService } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.service';
import {
  StudioApproveDto,
  StudioCreateDto,
  StudioDraftDto,
  StudioGenerateDto,
  StudioOutcomeDto,
  StudioUpdateDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';
import { StudioEditorialBatchStartDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.editorial.batch.dto';
import { StudioEditorialBatchManager } from '@gitroom/nestjs-libraries/studio/studio.editorial.batch.manager';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Studio')
@Controller('/studio')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly editorialBatch: StudioEditorialBatchManager
  ) {}

  @Get('/capabilities')
  capabilities(@GetOrgFromRequest() org: Organization) {
    return this.studio.capabilities(org.id);
  }

  @Get('/projects')
  list(@GetOrgFromRequest() org: Organization) {
    return this.studio.list(org.id);
  }

  @Post('/suggestions')
  suggestions(@GetOrgFromRequest() org: Organization) {
    return this.studio.suggestQuick(org.id);
  }

  @Post('/projects')
  create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioCreateDto
  ) {
    return this.studio.create(org.id, user.id, body);
  }

  @Get('/projects/:id')
  get(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this.studio.get(org.id, id);
  }

  @Get('/projects/:id/events/:eventId')
  event(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Param('eventId') eventId: string
  ) {
    return this.studio.getEvent(org.id, id, eventId);
  }

  @Put('/projects/:id')
  update(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioUpdateDto
  ) {
    return this.studio.update(org.id, id, body, user.id);
  }

  @Post('/projects/:id/generate')
  generate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioGenerateDto
  ) {
    return this.studio.generate(org.id, id, body, user.id);
  }

  @Post('/projects/:id/editorial-batch')
  editorialBatchStart(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioEditorialBatchStartDto
  ) {
    return this.editorialBatch.start(org.id, id, body.revision, user.id);
  }

  @Get('/projects/:id/editorial-batch')
  editorialBatchStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this.editorialBatch.status(org.id, id);
  }

  @Post('/projects/:id/approve')
  approve(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioApproveDto
  ) {
    return this.studio.approve(org.id, id, body, user.id);
  }

  @Post('/projects/:id/drafts')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  drafts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioDraftDto
  ) {
    return this.studio.createDrafts(org.id, id, body, user.id);
  }

  @Post('/projects/:id/outcomes')
  outcome(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioOutcomeDto
  ) {
    return this.studio.outcome(org.id, id, body, user.id);
  }
}
