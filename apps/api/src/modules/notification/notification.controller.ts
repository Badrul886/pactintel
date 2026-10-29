import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  Req,
  Sse,
  UseGuards,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { UpdateNotificationPreferencesDto } from '@pactintel/shared-types';

@Controller('api/v1')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Real-time Server-Sent Events (SSE) stream for authenticated user.
   * GET /api/v1/notifications/stream
   */
  @Sse('notifications/stream')
  streamNotifications(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user?.id || req.user?.sub;
    return this.notificationService.getSseStream(userId);
  }

  /**
   * Notification Inbox (cursor paginated).
   * GET /api/v1/notifications
   */
  @Get('notifications')
  async getNotifications(
    @Req() req: any,
    @Query('is_read') isRead?: string,
    @Query('event_type') eventType?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;

    return this.notificationService.getNotifications(userId, orgId, {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      eventType,
      cursor,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Mark single notification as read.
   * PATCH /api/v1/notifications/:id/read
   */
  @Patch('notifications/:id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.markAsRead(id, userId, orgId);
  }

  /**
   * Mark all notifications as read for current user.
   * POST /api/v1/notifications/mark-all-read
   */
  @Post('notifications/mark-all-read')
  async markAllRead(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.markAllAsRead(userId, orgId);
  }

  /**
   * Delete single notification.
   * DELETE /api/v1/notifications/:id
   */
  @Delete('notifications/:id')
  async deleteNotification(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.deleteNotification(id, userId, orgId);
  }

  /**
   * Get user notification preferences.
   * GET /api/v1/notification-preferences
   */
  @Get('notification-preferences')
  async getPreferences(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.getPreferences(userId, orgId);
  }

  /**
   * Upsert user notification preferences.
   * PUT /api/v1/notification-preferences
   */
  @Put('notification-preferences')
  async updatePreferences(@Req() req: any, @Body() body: UpdateNotificationPreferencesDto) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.updatePreferences(userId, orgId, body.preferences);
  }

  // --- Mobile Devices Registration (Sprint 3.12 Backend Readiness) ---

  /**
   * Register mobile device push token (FCM/APNs).
   * POST /api/v1/devices/register
   */
  @Post('devices/register')
  async registerDevice(
    @Req() req: any,
    @Body() body: { platform: 'ios' | 'android'; token: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.registerDevice(orgId, userId, body.platform, body.token);
  }

  /**
   * Deregister mobile device on logout.
   * DELETE /api/v1/devices/:id
   */
  @Delete('devices/:id')
  async deregisterDevice(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.organizationId || req.user?.organizationId;
    return this.notificationService.deregisterDevice(orgId, userId, id);
  }
}
