import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { DealRoomService } from './deal-room.service';
import { DealRoomMemberService } from './deal-room-member.service';
import { DealRoomDocumentService } from './deal-room-document.service';
import { DealRoomMessageService } from './deal-room-message.service';
import { DealRoomMagicLinkService } from './deal-room-magic-link.service';
import { DealRoomActivityService } from './deal-room-activity.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateDealRoomDtoSchema,
  CreateDealRoomDto,
  UpdateDealRoomDtoSchema,
  UpdateDealRoomDto,
  InviteDealRoomMemberDtoSchema,
  InviteDealRoomMemberDto,
  AddDealRoomDocumentDtoSchema,
  AddDealRoomDocumentDto,
  CreateDealRoomMessageDtoSchema,
  CreateDealRoomMessageDto,
  UpdateMapDtoSchema,
  UpdateMapDto,
  DealRoomStatus,
} from '@pactintel/shared-types';

@Controller('api/v1/deal-rooms')
export class DealRoomController {
  constructor(
    private readonly roomService: DealRoomService,
    private readonly memberService: DealRoomMemberService,
    private readonly documentService: DealRoomDocumentService,
    private readonly messageService: DealRoomMessageService,
    private readonly magicLinkService: DealRoomMagicLinkService,
    private readonly activityService: DealRoomActivityService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. PUBLIC RECIPIENT ACCESS (MAGIC LINK VERIFICATION)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('access/:token')
  async verifyMagicLinkAndAccess(@Param('token') token: string) {
    const session = await this.magicLinkService.verifyMagicLink(token);
    const room = await this.roomService.getDealRoomById(session.organizationId, session.dealRoomId);
    const messages = await this.messageService.getMessages(
      session.organizationId,
      session.dealRoomId,
      {
        isExternalGuest: true,
        visibilityFilter: 'external',
      },
    );
    const activities = await this.activityService.getActivityFeed(
      session.organizationId,
      session.dealRoomId,
      { isExternalGuest: true },
    );

    return {
      session,
      room,
      messages,
      activities,
    };
  }

  @Get('public/:slug')
  async getPublicRoomBySlug(
    @Param('slug') slug: string,
    @Query('token') token?: string,
    @Headers('x-magic-link-token') headerToken?: string,
  ) {
    const activeToken = token || headerToken;
    let guestSession = null;

    if (activeToken) {
      guestSession = await this.magicLinkService.verifyMagicLink(activeToken);
    }

    const room = await this.roomService.getDealRoomBySlug(slug);

    let messages: any[] = [];
    if (guestSession) {
      messages = await this.messageService.getMessages(room.organizationId, room.id, {
        isExternalGuest: true,
        visibilityFilter: 'external',
      });
    }

    return {
      room,
      guestSession,
      messages,
    };
  }

  @Post('public/:slug/messages')
  @HttpCode(HttpStatus.CREATED)
  async postPublicMessage(
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Headers('x-magic-link-token') headerToken: string,
    @Body(new ZodValidationPipe(CreateDealRoomMessageDtoSchema)) body: CreateDealRoomMessageDto,
  ) {
    const activeToken = token || headerToken;
    if (!activeToken) {
      throw new UnauthorizedException('Valid magic link token required to post in deal room');
    }

    const session = await this.magicLinkService.verifyMagicLink(activeToken);
    const room = await this.roomService.getDealRoomBySlug(slug, session.organizationId);

    if (room.id !== session.dealRoomId) {
      throw new ForbiddenException('Token is not authorized for this deal room');
    }

    return this.messageService.postMessage(
      session.organizationId,
      session.dealRoomId,
      {
        name: session.name,
        email: session.email,
        isExternalGuest: true,
      },
      body,
    );
  }

  @Put('public/:slug/map')
  async updatePublicMap(
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Headers('x-magic-link-token') headerToken: string,
    @Body(new ZodValidationPipe(UpdateMapDtoSchema)) body: UpdateMapDto,
  ) {
    const activeToken = token || headerToken;
    if (!activeToken) {
      throw new UnauthorizedException('Valid magic link token required to update map');
    }

    const session = await this.magicLinkService.verifyMagicLink(activeToken);
    const room = await this.roomService.getDealRoomBySlug(slug, session.organizationId);

    if (room.id !== session.dealRoomId) {
      throw new ForbiddenException('Token is not authorized for this deal room');
    }

    return this.roomService.updateMap(
      session.organizationId,
      session.dealRoomId,
      body.mutualActionPlan,
      session.name || session.email,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. INTERNAL AUTHENTICATED MANAGEMENT (CASL PROTECTED)
  // ═══════════════════════════════════════════════════════════════════════

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'DealRoom' })
  @HttpCode(HttpStatus.CREATED)
  async createDealRoom(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateDealRoomDtoSchema)) body: CreateDealRoomDto,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const userName = req.user.name || req.user.email?.split('@')[0] || 'User';
    const userEmail = req.user.email;

    return this.roomService.createDealRoom(orgId, userId, userName, userEmail, body);
  }

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoom' })
  async listDealRooms(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: DealRoomStatus,
    @Query('search') search?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.roomService.getDealRooms(orgId, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      search,
    });
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoom' })
  async getDealRoomById(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.roomService.getDealRoomById(orgId, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  async updateDealRoom(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDealRoomDtoSchema)) body: UpdateDealRoomDto,
  ) {
    const orgId = req.user.organizationId;
    return this.roomService.updateDealRoom(orgId, id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'DealRoom' })
  async deleteDealRoom(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.roomService.softDeleteDealRoom(orgId, id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. MUTUAL ACTION PLAN
  // ═══════════════════════════════════════════════════════════════════════

  @Put(':id/map')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  async updateMap(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMapDtoSchema)) body: UpdateMapDto,
  ) {
    const orgId = req.user.organizationId;
    const actorId = req.user.name || req.user.email || req.user.id;
    return this.roomService.updateMap(orgId, id, body.mutualActionPlan, actorId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. MEMBERS & COLLABORATORS
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':id/members')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  @HttpCode(HttpStatus.CREATED)
  async inviteMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(InviteDealRoomMemberDtoSchema)) body: InviteDealRoomMemberDto,
  ) {
    const orgId = req.user.organizationId;
    return this.memberService.inviteMember(orgId, id, body);
  }

  @Get(':id/members')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoom' })
  async getMembers(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.memberService.getMembers(orgId, id);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  async removeMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    const orgId = req.user.organizationId;
    return this.memberService.removeMember(orgId, id, memberId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':id/documents')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  @HttpCode(HttpStatus.CREATED)
  async addDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddDealRoomDocumentDtoSchema)) body: AddDealRoomDocumentDto,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    return this.documentService.addDocument(orgId, id, body.documentId, userId);
  }

  @Get(':id/documents')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoom' })
  async getDocuments(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.documentService.getDocuments(orgId, id);
  }

  @Delete(':id/documents/:docId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  async removeDocument(@Req() req: any, @Param('id') id: string, @Param('docId') docId: string) {
    const orgId = req.user.organizationId;
    return this.documentService.removeDocument(orgId, id, docId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. MESSAGES (INTERNAL & BUYER CHAT)
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':id/messages')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'DealRoomMessage' })
  @HttpCode(HttpStatus.CREATED)
  async postMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateDealRoomMessageDtoSchema)) body: CreateDealRoomMessageDto,
  ) {
    const orgId = req.user.organizationId;
    const author = {
      userId: req.user.id,
      name: req.user.name || req.user.email?.split('@')[0] || 'Seller',
      email: req.user.email,
      isExternalGuest: false,
    };

    return this.messageService.postMessage(orgId, id, author, body);
  }

  @Get(':id/messages')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoomMessage' })
  async getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('visibility') visibility?: 'external' | 'all',
  ) {
    const orgId = req.user.organizationId;
    return this.messageService.getMessages(orgId, id, {
      isExternalGuest: false,
      visibilityFilter: visibility,
    });
  }

  @Patch(':id/messages/:messageId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoomMessage' })
  async updateMessage(
    @Req() req: any,
    @Param('messageId') messageId: string,
    @Body() body: { content: string },
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const isAdmin = ['owner', 'admin', 'manager'].includes(req.user.role);
    return this.messageService.updateMessage(orgId, messageId, userId, body.content, isAdmin);
  }

  @Delete(':id/messages/:messageId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'DealRoomMessage' })
  async deleteMessage(@Req() req: any, @Param('messageId') messageId: string) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const isAdmin = ['owner', 'admin', 'manager'].includes(req.user.role);
    return this.messageService.deleteMessage(orgId, messageId, userId, isAdmin);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. MAGIC LINKS & ACTIVITY
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':id/magic-links')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'DealRoom' })
  @HttpCode(HttpStatus.CREATED)
  async generateMagicLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { memberId: string; expiresInDays?: number },
  ) {
    const orgId = req.user.organizationId;
    return this.magicLinkService.generateMagicLink(orgId, id, body.memberId, {
      expiresInDays: body.expiresInDays,
    });
  }

  @Get(':id/activity')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'DealRoom' })
  async getActivityFeed(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.activityService.getActivityFeed(orgId, id, { isExternalGuest: false });
  }
}
