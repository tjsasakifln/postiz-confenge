import { Body, Controller, Get, Param, Post, Put, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { StudioAudienceService } from '@gitroom/nestjs-libraries/studio/audience/studio.audience.service';
import {
  StudioAudienceApproveDto, StudioAudienceDraftDto, StudioAudienceMetricsDto,
  StudioAudienceRevisionDto, StudioAudienceSendDto, StudioAudienceSyncDto,
} from '@gitroom/nestjs-libraries/studio/audience/studio.audience.dto';

@ApiTags('Studio audience')
@Controller('/studio/projects/:projectId/audience')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class StudioAudienceController {
  constructor(private readonly audience: StudioAudienceService) {}

  @Get('/capabilities')
  capabilities(@GetOrgFromRequest() org: Organization, @Param('projectId') projectId: string) {
    return this.audience.capabilities(org.id, projectId);
  }

  @Get('/threads')
  threads(@GetOrgFromRequest() org: Organization, @Param('projectId') projectId: string) {
    return this.audience.threads(org.id, projectId);
  }

  @Post('/sync')
  sync(@GetOrgFromRequest() org: Organization, @Param('projectId') projectId: string, @Body() body: StudioAudienceSyncDto) {
    return this.audience.sync(org.id, projectId, body);
  }

  @Put('/threads/:id/draft')
  draft(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('projectId') projectId: string, @Param('id') id: string, @Body() body: StudioAudienceDraftDto) {
    return this.audience.draft(org.id, projectId, id, user.id, body);
  }

  @Post('/threads/:id/suggest')
  suggest(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('projectId') projectId: string, @Param('id') id: string, @Body() body: StudioAudienceRevisionDto) {
    return this.audience.suggest(org.id, projectId, id, user.id, body.revision);
  }

  @Post('/threads/:id/approve')
  approve(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('projectId') projectId: string, @Param('id') id: string, @Body() body: StudioAudienceApproveDto) {
    return this.audience.approve(org.id, projectId, id, user.id, body);
  }

  @Post('/threads/:id/send')
  send(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('projectId') projectId: string, @Param('id') id: string, @Body() body: StudioAudienceSendDto) {
    return this.audience.send(org.id, projectId, id, user.id, body);
  }

  @Post('/threads/:id/reconcile')
  reconcile(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('projectId') projectId: string, @Param('id') id: string, @Body() body: StudioAudienceRevisionDto) {
    return this.audience.reconcile(org.id, projectId, id, user.id, body.revision);
  }

  @Get('/metrics')
  metrics(@GetOrgFromRequest() org: Organization, @Param('projectId') projectId: string, @Query() query: StudioAudienceMetricsDto) {
    return this.audience.metrics(org.id, projectId, query.days);
  }
}
