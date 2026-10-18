import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly cls: ClsService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  getCurrentTenantId(): string | undefined {
    return this.cls.get<string>('organizationId');
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma client connected successfully to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }

  /**
   * Runs an operation with a verified tenant context on Cloud SQL.
   * Ensures SET LOCAL app.current_tenant is executed on the exact same connection (X-02, MT-002).
   */
  async withTenantContext<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!organizationId) {
      throw new Error('Tenant context organizationId must be provided.');
    }

    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${organizationId}'`);
      return operation(tx);
    });
  }
}
