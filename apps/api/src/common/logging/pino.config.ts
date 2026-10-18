import { Params } from 'nestjs-pino';

export const pinoLoggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    // Sensitive field redaction (RULE PAY-001, AUTH security)
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passcode',
        '*.passcodeHash',
        '*.secret',
        '*.token',
        '*.apiKey',
        '*.refreshToken',
        '*.encryptedCredentials',
        '*.creditCard',
        '*.cvv',
        '*.cardNumber',
      ],
      censor: '[REDACTED]',
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
            },
          }
        : undefined,
    // Structured contextual attributes per log line
    customProps: (req: any) => ({
      requestId: req.headers['x-request-id'] || req.id,
      organizationId: req.headers['x-organization-id'] || req.user?.organizationId,
      userId: req.user?.id || req.headers['x-user-id'],
      traceId: req.headers['x-trace-id'] || req.headers['traceparent'],
      service: 'pactintel-api',
      cell: process.env.CELL_ID || 'gcp-us1',
    }),
  },
};
