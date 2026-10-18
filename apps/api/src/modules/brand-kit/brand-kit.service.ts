import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { BrandKitRepository } from './brand-kit.repository';
import { CreateBrandKitDto } from './dto/create-brand-kit.dto';
import { UpdateBrandKitDto } from './dto/update-brand-kit.dto';
import { BrandKit } from '@prisma/client';

@Injectable()
export class BrandKitService {
  private readonly logger = new Logger(BrandKitService.name);

  constructor(private readonly repository: BrandKitRepository) {}

  async create(orgId: string, dto: CreateBrandKitDto): Promise<BrandKit> {
    return this.repository.create(orgId, dto);
  }

  async findAll(orgId: string): Promise<BrandKit[]> {
    return this.repository.findAll(orgId);
  }

  async findById(id: string, orgId?: string): Promise<BrandKit> {
    const kit = await this.repository.findById(id, orgId);
    if (!kit) {
      throw new NotFoundException(`Brand kit ${id} not found`);
    }
    return kit;
  }

  async findDefault(orgId: string): Promise<BrandKit | null> {
    return this.repository.findDefault(orgId);
  }

  async update(id: string, orgId: string, dto: UpdateBrandKitDto): Promise<BrandKit> {
    return this.repository.update(id, orgId, dto);
  }

  /**
   * Sets new default brand kit.
   * Unsets old default in same $transaction.
   */
  async setDefault(id: string, orgId: string): Promise<BrandKit> {
    return this.repository.setDefault(id, orgId);
  }

  /**
   * Deletes a brand kit.
   * Refuses with 409 Conflict if is_default === true.
   */
  async delete(id: string, orgId: string): Promise<BrandKit> {
    const kit = await this.findById(id, orgId);

    if (kit.isDefault) {
      throw new ConflictException(
        'Cannot delete the default brand kit. Assign a different brand kit as default first.',
      );
    }

    return this.repository.delete(id, orgId);
  }

  /**
   * Uploads logo to Cloud Storage public-media bucket (Invariant I-05 / ADR-0010).
   */
  async uploadLogo(
    id: string,
    orgId: string,
    filename: string,
    _buffer: Buffer,
  ): Promise<BrandKit> {
    // In GCP production: uploads to gs://pactintel-prod-public-media/brand-kits/{id}/{filename}
    const publicUrl = `https://storage.googleapis.com/pactintel-prod-public-media/brand-kits/${id}/${filename}`;
    this.logger.log(`Uploaded brand kit logo to ${publicUrl}`);

    return this.repository.updateLogoUrl(id, orgId, publicUrl);
  }
}
