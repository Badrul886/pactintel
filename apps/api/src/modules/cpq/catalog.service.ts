import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from '@pactintel/shared-types';

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepo: CatalogRepository) {}

  async create(orgId: string, dto: CreateCatalogItemDto) {
    return this.catalogRepo.create(orgId, dto);
  }

  async findById(id: string, orgId?: string) {
    const item = await this.catalogRepo.findById(id, orgId);
    if (!item) {
      throw new NotFoundException(`Catalog item ${id} not found.`);
    }
    return item;
  }

  async findAll(orgId: string, filter?: { isActive?: boolean; search?: string }) {
    return this.catalogRepo.findAll(orgId, filter);
  }

  async update(id: string, orgId: string, dto: UpdateCatalogItemDto) {
    const existing = await this.catalogRepo.findById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Catalog item ${id} not found.`);
    }
    return this.catalogRepo.update(id, orgId, dto);
  }

  async delete(id: string, orgId: string) {
    const existing = await this.catalogRepo.findById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Catalog item ${id} not found.`);
    }
    return this.catalogRepo.delete(id, orgId);
  }
}
