import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { StudioProductionManager } from '@gitroom/nestjs-libraries/studio/studio.production.manager';
import {
  StudioAttachRenderDto,
  StudioImagesDto,
  StudioRenderDto,
  StudioResearchDto,
  StudioStyleDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.production.dto';

@ApiTags('Studio production')
@Controller('/studio/projects')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class StudioProductionController {
  constructor(private readonly production: StudioProductionManager) {}

  @Post('/:id/render')
  render(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: StudioRenderDto
  ) {
    return this.production.start(org.id, id, body);
  }

  @Get('/:id/render/:jobId')
  status(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Param('jobId') jobId: string
  ) {
    return this.production.status(org.id, id, jobId);
  }

  @Post('/:id/render/:jobId/attach')
  attach(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Body() body: StudioAttachRenderDto
  ) {
    return this.production.attach(org.id, id, jobId, body.revision, user.id);
  }

  @Post('/:id/images')
  images(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioImagesDto
  ) {
    return this.production.images(org.id, id, body, user.id);
  }

  @Post('/:id/research')
  research(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioResearchDto
  ) {
    return this.production.search(org.id, id, body, user.id);
  }

  @Post('/:id/style')
  style(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioStyleDto
  ) {
    return this.production.style(org.id, id, body, user.id);
  }
}
