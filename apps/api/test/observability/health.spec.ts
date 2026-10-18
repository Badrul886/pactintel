import { HealthController } from '../../src/common/health/health.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Response } from 'express';

describe('RULE INFRA-002: Observability Health Probes (/health/live & /health/ready)', () => {
  let healthController: HealthController;
  let mockPrisma: any;
  let mockResponse: Partial<Response>;
  let statusCode: number;
  let responseJson: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
    };

    statusCode = 200;
    responseJson = null;

    mockResponse = {
      status: jest.fn().mockImplementation((code: number) => {
        statusCode = code;
        return mockResponse;
      }),
      json: jest.fn().mockImplementation((data: any) => {
        responseJson = data;
        return mockResponse;
      }),
    };

    healthController = new HealthController(mockPrisma as PrismaService);
  });

  describe('Liveness Probe (GET /health/live)', () => {
    it('returns 200 OK instantly with uptime and timestamp without checking downstream dependencies', () => {
      const result = healthController.getLive();

      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();

      // Ensures downstream database was NOT touched
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('Readiness Probe (GET /health/ready)', () => {
    it('returns 200 OK with all health checks when database and services are responsive', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await healthController.getReady(mockResponse as Response);

      expect(statusCode).toBe(200);
      expect(responseJson.status).toBe('healthy');
      expect(responseJson.checks.database.status).toBe('healthy');
      expect(responseJson.checks.redis.status).toBe('healthy');
      expect(responseJson.checks.clickhouse.status).toBe('healthy');
      expect(typeof responseJson.checks.database.latencyMs).toBe('number');
    });

    it('returns 503 Service Unavailable when PostgreSQL database query fails', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection terminated by Cloud SQL'));

      await healthController.getReady(mockResponse as Response);

      expect(statusCode).toBe(503);
      expect(responseJson.status).toBe('unhealthy');
      expect(responseJson.checks.database.status).toBe('unhealthy');
      expect(responseJson.checks.database.error).toContain('Connection terminated by Cloud SQL');
    });
  });
});
