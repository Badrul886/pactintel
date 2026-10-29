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
   * Ensures SET LOCAL app.current_tenant and app.current_workspace are executed
   * on the exact same connection (X-02, MT-002, RULE AUTH-003).
   */
  async withTenantContext<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    workspaceId?: string,
  ): Promise<T> {
    if (!organizationId) {
      throw new Error('Tenant context organizationId must be provided.');
    }

    const ws = workspaceId || this.cls.get<string>('workspaceId');

    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${organizationId}'`);
      if (ws) {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_workspace = '${ws}'`);
      } else {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_workspace = ''`);
      }
      return operation(tx);
    });
  }
}
