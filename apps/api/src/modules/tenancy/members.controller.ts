import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  createInvitationSchema,
  updateMembershipSchema,
  type CreateInvitationInput,
  type TenantContext,
  type UpdateMembershipInput,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  @Get('members')
  @RequirePermissions('user.read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.members.listMembers(ctx);
  }

  @Get('invitations')
  @RequireOrgAdmin()
  @RequirePermissions('user.invite')
  listInvitations(@CurrentTenant() ctx: TenantContext) {
    return this.members.listInvitations(ctx);
  }

  @Post('invitations')
  @RequireOrgAdmin()
  @RequirePermissions('user.invite')
  invite(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createInvitationSchema)) dto: CreateInvitationInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.invite(ctx, dto, this.meta(req));
  }

  @Delete('invitations/:id')
  @RequireOrgAdmin()
  @RequirePermissions('user.invite')
  revokeInvitation(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.members.revokeInvitation(ctx, id, this.meta(req));
  }

  @Patch('memberships/:id')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  updateMembership(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateMembershipSchema)) dto: UpdateMembershipInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.updateMembership(ctx, id, dto, this.meta(req));
  }

  @Delete('memberships/:id')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  removeMembership(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.members.removeMembership(ctx, id, this.meta(req));
  }
}
