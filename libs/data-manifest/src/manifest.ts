/**
 * Machine-Readable Data Manifest
 * Invariant I-10: Every datastore, table, bucket prefix, ClickHouse table,
 * Redis keyspace, index, and vector collection is registered here.
 * CI enforces RLS, retention, erasure, and residency across all registered entities.
 */

export interface DataManifestEntry {
  id: string;
  type: 'postgresql_table' | 'clickhouse_table' | 'gcs_bucket' | 'redis_keyspace';
  tableOrResource: string;
  rls: boolean;
  retention: 'until_org_deletion' | '7_years' | '2_years' | '90_days' | '30_days' | 'ephemeral';
  erasure:
    | 'soft_delete'
    | 'hard_delete_cascade'
    | 'partition_drop'
    | 'crypto_shred'
    | 'ttl_expire'
    | 'immutable_locked';
  residency: 'cell_jurisdiction' | 'global_control_plane';
  description: string;
}

export interface DataManifest {
  version: string;
  stores: readonly DataManifestEntry[];
}

export const dataManifest: DataManifest = {
  version: '1.0.0',
  stores: [
    // --- PostgreSQL: Organization & Identity ---
    {
      id: 'pg-organizations',
      type: 'postgresql_table',
      tableOrResource: 'organizations',
      rls: false, // Root tenant entity
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Tenant organization root directory entry',
    },
    {
      id: 'pg-workspaces',
      type: 'postgresql_table',
      tableOrResource: 'workspaces',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Workspace partition within organization',
    },
    {
      id: 'pg-teams',
      type: 'postgresql_table',
      tableOrResource: 'teams',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Departmental teams within organization',
    },
    {
      id: 'pg-users',
      type: 'postgresql_table',
      tableOrResource: 'users',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Organization member profiles and seat records',
    },
    {
      id: 'pg-workspace-memberships',
      type: 'postgresql_table',
      tableOrResource: 'workspace_memberships',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'hard_delete_cascade',
      residency: 'cell_jurisdiction',
      description: 'User workspace role assignments',
    },
    {
      id: 'pg-team-memberships',
      type: 'postgresql_table',
      tableOrResource: 'team_memberships',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'hard_delete_cascade',
      residency: 'cell_jurisdiction',
      description: 'User team memberships',
    },

    // --- PostgreSQL: Documents & Content ---
    {
      id: 'pg-documents',
      type: 'postgresql_table',
      tableOrResource: 'documents',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Core document entity metadata and lifecycle states',
    },
    {
      id: 'pg-document-versions',
      type: 'postgresql_table',
      tableOrResource: 'document_versions',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'immutable_locked', // Signed versions locked by trigger
      residency: 'cell_jurisdiction',
      description: 'Point-in-time immutable block tree snapshots and SHA-256 hashes',
    },
    {
      id: 'pg-templates',
      type: 'postgresql_table',
      tableOrResource: 'templates',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Reusable document blueprints with merge-tags',
    },
    {
      id: 'pg-content-blocks',
      type: 'postgresql_table',
      tableOrResource: 'content_blocks',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Content library reusable text/clause blocks',
    },
    {
      id: 'pg-folders',
      type: 'postgresql_table',
      tableOrResource: 'folders',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Hierarchical file folders for documents and templates',
    },
    {
      id: 'pg-comments',
      type: 'postgresql_table',
      tableOrResource: 'comments',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Collaborative feedback and inline suggestions',
    },

    // --- PostgreSQL: E-Signature & Audit ---
    {
      id: 'pg-signature-requests',
      type: 'postgresql_table',
      tableOrResource: 'signature_requests',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Envelope orchestration records for BoldSign',
    },
    {
      id: 'pg-signers',
      type: 'postgresql_table',
      tableOrResource: 'signers',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Assigned signing parties and status',
    },
    {
      id: 'pg-signature-events',
      type: 'postgresql_table',
      tableOrResource: 'signature_events',
      rls: true,
      retention: '7_years',
      erasure: 'immutable_locked', // Database trigger forbids UPDATE and DELETE
      residency: 'cell_jurisdiction',
      description: 'Append-only legal audit trail of all signing events',
    },

    // --- PostgreSQL: Payments & BYOK Credentials ---
    {
      id: 'pg-payment-provider-connections',
      type: 'postgresql_table',
      tableOrResource: 'payment_provider_connections',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'crypto_shred', // Destroying wrapped key shreds stored secret
      residency: 'cell_jurisdiction',
      description: 'Customer-connected payment integrations (Payment Links / BYOK)',
    },
    {
      id: 'pg-payments',
      type: 'postgresql_table',
      tableOrResource: 'payments',
      rls: true,
      retention: '7_years',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'End-user payment transactions tied to signed documents',
    },
    {
      id: 'pg-payment-credential-audit-logs',
      type: 'postgresql_table',
      tableOrResource: 'payment_credential_audit_logs',
      rls: true,
      retention: '7_years',
      erasure: 'immutable_locked',
      residency: 'cell_jurisdiction',
      description: 'Append-only audit trail for any payment credential access',
    },

    // --- PostgreSQL: Subscriptions & Billing ---
    {
      id: 'pg-subscriptions',
      type: 'postgresql_table',
      tableOrResource: 'subscriptions',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Tenant SaaS plan tier, seat limits, and quota records',
    },
    {
      id: 'pg-billing-events',
      type: 'postgresql_table',
      tableOrResource: 'billing_events',
      rls: true,
      retention: '7_years',
      erasure: 'immutable_locked',
      residency: 'cell_jurisdiction',
      description: 'Paddle webhook idempotent event log',
    },

    // --- PostgreSQL: Access & System ---
    {
      id: 'pg-api-keys',
      type: 'postgresql_table',
      tableOrResource: 'api_keys',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Hashed API tokens for external API access',
    },
    {
      id: 'pg-webhooks',
      type: 'postgresql_table',
      tableOrResource: 'webhooks',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Outbound webhook subscriptions configured by customer org',
    },
    {
      id: 'pg-audit-log-entries',
      type: 'postgresql_table',
      tableOrResource: 'audit_log_entries',
      rls: true,
      retention: '7_years',
      erasure: 'immutable_locked',
      residency: 'cell_jurisdiction',
      description: 'Append-only administrative actions log',
    },
    {
      id: 'pg-brand-kits',
      type: 'postgresql_table',
      tableOrResource: 'brand_kits',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Custom logo, fonts, and colors for recipient document view',
    },
    {
      id: 'pg-outbox-events',
      type: 'postgresql_table',
      tableOrResource: 'outbox_events',
      rls: true,
      retention: '30_days',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'Transactional outbox for reliable asynchronous event delivery',
    },

    // --- ClickHouse: Analytics Store ---
    {
      id: 'ch-analytics-events',
      type: 'clickhouse_table',
      tableOrResource: 'analytics_events',
      rls: false,
      retention: '2_years',
      erasure: 'partition_drop',
      residency: 'cell_jurisdiction',
      description: 'High-volume viewer telemetry and reading duration logs',
    },

    // --- Cloud Storage Buckets ---
    {
      id: 'gcs-evidence',
      type: 'gcs_bucket',
      tableOrResource: 'pactintel-evidence',
      rls: false,
      retention: '7_years',
      erasure: 'immutable_locked', // Object Retention Lock in Locked Mode
      residency: 'cell_jurisdiction',
      description: 'Completed signed PDFs and cryptographic audit certificates',
    },
    {
      id: 'gcs-uploads',
      type: 'gcs_bucket',
      tableOrResource: 'pactintel-uploads',
      rls: false,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'User-uploaded images, attachments, and brand assets',
    },
    {
      id: 'gcs-exports',
      type: 'gcs_bucket',
      tableOrResource: 'pactintel-exports',
      rls: false,
      retention: '30_days',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'Temporary batch export archives and bulk download bundles',
    },
    {
      id: 'gcs-public-media',
      type: 'gcs_bucket',
      tableOrResource: 'pactintel-public-media',
      rls: false,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
      description: 'Public assets delivered through CDN edge',
    },

    // --- Redis / Memorystore Role-Split Instances ---
    {
      id: 'redis-queue',
      type: 'redis_keyspace',
      tableOrResource: 'bullmq:*',
      rls: false,
      retention: 'ephemeral',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'BullMQ asynchronous job queue store (noeviction policy)',
    },
    {
      id: 'redis-session',
      type: 'redis_keyspace',
      tableOrResource: 'sess:*',
      rls: false,
      retention: '30_days',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'Server-side user authentication sessions (volatile-lru)',
    },
    {
      id: 'redis-cache',
      type: 'redis_keyspace',
      tableOrResource: 'cache:*',
      rls: false,
      retention: 'ephemeral',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'Plan limits, tenant entitlement cache, and rate limit counters',
    },
    {
      id: 'redis-realtime',
      type: 'redis_keyspace',
      tableOrResource: 'collab:*',
      rls: false,
      retention: 'ephemeral',
      erasure: 'ttl_expire',
      residency: 'cell_jurisdiction',
      description: 'Hocuspocus pub/sub message bus and room presence state',
    },
  ],
} as const;

/**
 * Checks if a table is registered in the data manifest.
 */
export const isTableRegistered = (tableName: string): boolean => {
  return dataManifest.stores.some(
    (store) => store.tableOrResource.toLowerCase() === tableName.toLowerCase(),
  );
};
