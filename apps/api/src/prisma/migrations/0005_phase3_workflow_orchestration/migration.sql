-- =============================================================================
-- Migration: 0005_phase3_workflow_orchestration
-- Phase 3 Sprint 3.2: Visual Workflow Orchestration Visual Builder (5.19 Maestro-equivalent)
-- Tables: workflow_definitions, workflow_instances, workflow_node_executions.
-- Adheres strictly to Invariants I-01..I-15, RULE WF-002, and ADR-0049.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. WORKFLOW_DEFINITIONS (DAG flow blueprints per workspace)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  trigger_event   TEXT NOT NULL,
  dag             JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  version         INTEGER NOT NULL DEFAULT 1,
  max_instances   INTEGER NOT NULL DEFAULT 1000,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_definitions
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_workflow_defs_org ON workflow_definitions (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_defs_workspace ON workflow_definitions (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_defs_org_status ON workflow_definitions (organization_id, status) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. WORKFLOW_INSTANCES (Runtime execution instances of a workflow DAG)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflow_instances (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  trigger_payload JSONB NOT NULL DEFAULT '{}',
  current_node_id TEXT,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'halted', 'paused')),
  chain_depth     INTEGER NOT NULL DEFAULT 0,
  visited_nodes   JSONB NOT NULL DEFAULT '[]',
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_instances
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_workflow_instances_org ON workflow_instances (organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow ON workflow_instances (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_org_status ON workflow_instances (organization_id, status);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. WORKFLOW_NODE_EXECUTIONS (Immutable execution step history)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflow_node_executions (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id     UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  node_type       TEXT NOT NULL,
  input           JSONB NOT NULL DEFAULT '{}',
  output          JSONB,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE workflow_node_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_node_executions
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_workflow_node_execs_org ON workflow_node_executions (organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_node_execs_instance ON workflow_node_executions (instance_id);

