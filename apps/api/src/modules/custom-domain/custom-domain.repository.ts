import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomDomain } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class CustomDomainRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    domain: string;
    cloudflareHostnameId: string;
    sslStatus?: string;
  }): Promise<CustomDomain> {
    const id = generateId();
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.customDomain.create({
        data: {
          id,
          organizationId: data.organizationId,
          domain: data.domain.toLowerCase().trim(),
          cloudflareHostnameId: data.cloudflareHostnameId,
          sslStatus: data.sslStatus || 'pending',
        },
      });

      // Outbox event (Architecture Invariant I-06 & Sprint 5.2)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: data.organizationId,
          eventType: 'custom_domain.provisioned',
          aggregateType: 'custom_domain',
          aggregateId: record.id,
          payload: {
            customDomainId: record.id,
            organizationId: record.organizationId,
            domain: record.domain,
            sslStatus: record.sslStatus,
            cloudflareHostnameId: record.cloudflareHostnameId,
          },
        },
      });

      return record;
    });
  }

  async findById(id: string, organizationId: string): Promise<CustomDomain | null> {
    return this.prisma.customDomain.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });
  }

  async findByDomain(domain: string): Promise<CustomDomain | null> {
    return this.prisma.customDomain.findFirst({
      where: {
        domain: domain.toLowerCase().trim(),
        deletedAt: null,
      },
    });
  }

  async findByOrgAndDomain(organizationId: string, domain: string): Promise<CustomDomain | null> {
    return this.prisma.customDomain.findFirst({
      where: {
        organizationId,
        domain: domain.toLowerCase().trim(),
        deletedAt: null,
      },
    });
  }

  async list(organizationId: string): Promise<CustomDomain[]> {
    return this.prisma.customDomain.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSslStatus(
    id: string,
    organizationId: string,
    sslStatus: string,
    verifiedAt?: Date,
  ): Promise<CustomDomain> {
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      throw new NotFoundException(`Custom domain with id ${id} not found.`);
    }

    return this.prisma.customDomain.update({
      where: { id },
      data: {
        sslStatus,
        lastHealthCheck: new Date(),
        ...(verifiedAt ? { verifiedAt } : {}),
      },
    });
  }

  async updateHealthCheck(id: string, sslStatus: string, verifiedAt?: Date): Promise<CustomDomain> {
    return this.prisma.customDomain.update({
      where: { id },
      data: {
        sslStatus,
        lastHealthCheck: new Date(),
        ...(verifiedAt ? { verifiedAt } : {}),
      },
    });
  }

  async softDelete(id: string, organizationId: string): Promise<CustomDomain> {
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      throw new NotFoundException(`Custom domain with id ${id} not found.`);
    }

    return this.prisma.customDomain.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async findAllActiveHostnames(): Promise<CustomDomain[]> {
    return this.prisma.customDomain.findMany({
      where: {
        deletedAt: null,
        cloudflareHostnameId: { not: null },
      },
    });
  }
}
