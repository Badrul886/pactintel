import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { AuthGuard, AuthenticatedUser } from '../../common/guards/auth.guard';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
    private readonly cls: ClsService,
  ) {}

  @Get('login')
  async login(@Query('redirectUri') redirectUri: string) {
    return this.authService.getLoginUrl(redirectUri);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('email') mockEmail: string,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new UnauthorizedException('Missing authorization code');
    }

    const { sessionId, user } = await this.authService.handleCallback(code, mockEmail);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('pactintel_session', sessionId, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 86400 * 1000, // 7 days absolute
      path: '/',
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      sessionId,
      user,
    });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const sessionId = (req as any).cookies?.['pactintel_session'];
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    res.clearCookie('pactintel_session', { path: '/' });
    return res.status(HttpStatus.OK).json({ success: true, message: 'Logged out successfully.' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getCurrentUser(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    return { data: user };
  }

  @Get('api-keys')
  @UseGuards(AuthGuard)
  async listApiKeys() {
    const organizationId = this.cls.get<string>('organizationId');
    return this.apiKeyService.listApiKeys(organizationId);
  }

  @Post('api-keys')
  @UseGuards(AuthGuard)
  async createApiKey(
    @Body('name') name: string,
    @Body('scopes') scopes?: string[],
    @Body('expiresInDays') expiresInDays?: number,
  ) {
    const organizationId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.apiKeyService.createApiKey(
      organizationId,
      userId,
      name,
      scopes || ['*'],
      expiresInDays,
    );
  }

  @Delete('api-keys/:id')
  @UseGuards(AuthGuard)
  async revokeApiKey(@Param('id') apiKeyId: string) {
    const organizationId = this.cls.get<string>('organizationId');
    return this.apiKeyService.revokeApiKey(organizationId, apiKeyId);
  }
}
