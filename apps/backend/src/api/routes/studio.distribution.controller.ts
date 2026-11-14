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
import { StudioDistributionService } from '@gitroom/nestjs-libraries/studio/studio.distribution.service';
import {
  StudioDistributionConfirmDto,
  StudioDistributionPlanDto,
  StudioDistributionRevisionDto,
} from '@gitroom/nestjs-libraries/dtos/studio/studio.distribution.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Studio distribution')
@Controller('/studio/distribution')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class StudioDistributionController {
  constructor(private readonly distribution: StudioDistributionService) {}
  @Get('/capabilities')
  capabilities(@GetOrgFromRequest() org: Organization) {
    return this.distribution.capabilities(org.id);
  }
  @Get('/inventory')
  inventory(@GetOrgFromRequest() org: Organization) {
    return this.distribution.inventory(org.id);
  }
  @Get('/batches/:id')
  batch(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this.distribution.get(org.id, id);
  }
  @Post('/plan')
  plan(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioDistributionPlanDto
  ) {
    return this.distribution.plan(org.id, user.id, body);
  }
  @Post('/batches/:id/confirm')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  confirm(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioDistributionConfirmDto
  ) {
    return this.distribution.confirm(org.id, id, body, user.id);
  }
  @Post('/batches/:id/cancel')
  cancel(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioDistributionRevisionDto
  ) {
    return this.distribution.cancel(org.id, id, body, user.id);
  }
  @Post('/items/:id/reconcile')
  reconcile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: StudioDistributionRevisionDto
  ) {
    return this.distribution.reconcile(org.id, id, body);
  }
}
