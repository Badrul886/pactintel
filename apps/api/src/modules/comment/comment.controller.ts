import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateCommentDto,
  CreateCommentDtoSchema,
  UpdateCommentDto,
  UpdateCommentDtoSchema,
  ListCommentsQuery,
  ListCommentsQuerySchema,
  UserRole,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/documents/:id/comments')
export class CommentController {
  constructor(
    private readonly commentService: CommentService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(ListCommentsQuerySchema))
  async listComments(@Param('id') documentId: string, @Query() query: ListCommentsQuery) {
    const orgId = this.cls.get<string>('organizationId');
    return this.commentService.listComments(orgId, documentId, query);
  }

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(CreateCommentDtoSchema))
  async createComment(@Param('id') documentId: string, @Body() dto: CreateCommentDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.commentService.createComment(orgId, userId, documentId, dto);
  }

  @Patch(':commentId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(UpdateCommentDtoSchema))
  async updateComment(
    @Param('id') _documentId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const role = (this.cls.get<string>('userRole') as UserRole) || 'member';
    return this.commentService.updateComment(orgId, userId, role, commentId, dto);
  }

  @Delete(':commentId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async deleteComment(@Param('id') _documentId: string, @Param('commentId') commentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const role = (this.cls.get<string>('userRole') as UserRole) || 'member';
    return this.commentService.deleteComment(orgId, userId, role, commentId);
  }

  @Post(':commentId/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async resolveThread(@Param('id') _documentId: string, @Param('commentId') commentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.commentService.resolveThread(orgId, userId, commentId);
  }

  @Post(':commentId/reopen')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async reopenThread(@Param('id') _documentId: string, @Param('commentId') commentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.commentService.reopenThread(orgId, commentId);
  }
}
