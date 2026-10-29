import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { ClsService } from 'nestjs-cls';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);

  // Security Headers (RULE SEC-001 & Phase 3 Cross-Cutting Requirements)
  app.use((req: any, res: any, next: any) => {
    const isEmbedOrForm = req.path.startsWith('/embed') || req.path.startsWith('/f/');

    if (isEmbedOrForm) {
      // Relaxed framing for white-label embedding and public forms
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors *;",
      );
    } else {
      // Strict framing protection for standard internal SaaS routes
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none';",
      );
      res.setHeader('X-Frame-Options', 'DENY');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false, // Managed custom dynamically above
      frameguard: false, // Managed custom dynamically above
    }),
  );

  // CORS allowlist configuration
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    process.env.NEXT_PUBLIC_VIEWER_URL || 'http://localhost:3000',
  ];
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('CORS origin not allowed by policy.'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Organization-ID',
      'Idempotency-Key',
    ],
  });

  // Global Interceptors & Filters
  const cls = app.get(ClsService);
  app.useGlobalInterceptors(new RequestIdInterceptor(cls), new AuditLogInterceptor(cls));
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`PactIntel API listening on port ${port} [env: ${process.env.NODE_ENV || 'dev'}]`);
}

bootstrap();
