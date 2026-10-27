/**
 * Collab Server Document Permission Service
 * Enforces CASL permissions and document lifecycle write protection.
 */
import { config } from '../config';

export interface DocumentPermissionCheck {
  canRead: boolean;
  canWrite: boolean;
  isSigned: boolean;
  organizationId?: string;
}

export class DocumentService {
  private static mockPermissions = new Map<string, DocumentPermissionCheck>();

  static setMockPermission(key: string, check: DocumentPermissionCheck | null) {
    if (check) {
      this.mockPermissions.set(key, check);
    } else {
      this.mockPermissions.delete(key);
    }
  }

  static clearMockPermissions() {
    this.mockPermissions.clear();
  }

  async checkAccess(userId: string, documentId: string): Promise<boolean> {
    const mockKey = `${userId}:${documentId}`;
    if (DocumentService.mockPermissions.has(mockKey)) {
      return DocumentService.mockPermissions.get(mockKey)?.canRead ?? false;
    }

    if (config.env !== 'production') {
      return true;
    }

    try {
      const res = await fetch(
        `${config.apiUrl}/api/v1/documents/${documentId}/permissions?userId=${userId}`,
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.canRead);
    } catch {
      return false;
    }
  }

  async checkWriteAccess(userId: string, documentId: string): Promise<boolean> {
    const mockKey = `${userId}:${documentId}`;
    if (DocumentService.mockPermissions.has(mockKey)) {
      const perm = DocumentService.mockPermissions.get(mockKey);
      return Boolean(perm?.canWrite && !perm?.isSigned);
    }

    if (config.env !== 'production') {
      return true;
    }

    try {
      const res = await fetch(
        `${config.apiUrl}/api/v1/documents/${documentId}/permissions?userId=${userId}`,
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.canWrite && !data.isSigned);
    } catch {
      return false;
    }
  }
}

export const documentService = new DocumentService();
