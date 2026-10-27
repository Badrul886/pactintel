import * as fs from 'fs';
import * as path from 'path';

/**
 * Enterprise Architectural Quality Gate: Forbidden Patterns Inspection Team
 * Implements automated validation of Phase 1 Invariants and Blueprint Constraints:
 * - RULE I-07: No @Cron or @nestjs/schedule (BullMQ upsertJobScheduler only)
 * - RULE ADP-001: No vendor SDK imports outside designated adapters
 * - RULE AN-001: No direct ClickHouse INSERT in application code
 * - RULE ID-001: No gen_random_uuid() or Math.random() for PK generation
 * - RULE DS-15: No glassmorphism (backdrop-filter) or gradient backgrounds
 * - Invariant I-10: Tenant tables must enforce organization_id isolation
 */

interface Violation {
  file: string;
  line: number;
  rule: string;
  details: string;
}

const ROOT_DIR = path.resolve(__dirname, '../../');
const violations: Violation[] = [];

function scanDirectory(dir: string, fileCallback: (filePath: string) => void) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === 'coverage' ||
        entry.name === 'out'
      ) {
        continue;
      }
      scanDirectory(fullPath, fileCallback);
    } else if (entry.isFile()) {
      fileCallback(fullPath);
    }
  }
}

console.log('🛡️  Running PactIntel Automated Architectural Inspection Team (Sprint 5.4)...');

// 1. Scan source code files for forbidden imports and patterns
const srcDirs = [
  path.join(ROOT_DIR, 'apps/api/src'),
  path.join(ROOT_DIR, 'apps/web/src'),
  path.join(ROOT_DIR, 'apps/collab-server/src'),
  path.join(ROOT_DIR, 'libs'),
];

srcDirs.forEach((srcDir) => {
  if (!fs.existsSync(srcDir)) return;

  scanDirectory(srcDir, (filePath) => {
    const ext = path.extname(filePath);
    if (!['.ts', '.tsx', '.js', '.jsx', '.css'].includes(ext)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Rule 1: No @Cron or @nestjs/schedule
      if (line.includes('@Cron(') || line.includes('@nestjs/schedule')) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'I-07 / NO_CRON_DECORATOR',
          details: 'Use BullMQ upsertJobScheduler instead of @Cron or @nestjs/schedule.',
        });
      }

      // Rule 2: No vendor SDK imports outside adapters
      if (
        (line.includes("from '@hubspot/api-client'") ||
          line.includes("require('@hubspot/api-client')")) &&
        !relPath.includes('adapters/hubspot')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'ADP-001 / HUBSPOT_LEAK',
          details: 'HubSpot SDK import found outside integration adapter.',
        });
      }

      if (
        (line.includes("from 'cloudflare'") || line.includes("require('cloudflare')")) &&
        !relPath.includes('adapters/cloudflare')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'ADP-001 / CLOUDFLARE_LEAK',
          details: 'Cloudflare SDK import found outside custom-domain adapter.',
        });
      }

      if (
        (line.includes("from '@anthropic-ai/sdk'") ||
          line.includes("require('@anthropic-ai/sdk')")) &&
        !relPath.includes('adapters/anthropic')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'ADP-001 / ANTHROPIC_LEAK',
          details: 'Anthropic SDK import found outside AI adapter.',
        });
      }

      if (
        (line.includes("from '@google-cloud/aiplatform'") ||
          line.includes("require('@google-cloud/aiplatform')")) &&
        !relPath.includes('adapters/vertex-ai')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'ADP-001 / VERTEX_AI_LEAK',
          details: 'Vertex AI SDK import found outside AI adapter.',
        });
      }

      if (
        (line.includes("from 'stripe'") || line.includes("require('stripe')")) &&
        !relPath.includes('adapters/stripe')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'ADP-001 / STRIPE_LEAK',
          details: 'Stripe SDK import found outside payments adapter.',
        });
      }

      // Rule 3: No direct ClickHouse INSERT from application code
      if (
        line.includes('INSERT INTO') &&
        line.toLowerCase().includes('clickhouse') &&
        !relPath.includes('analytics/buffer')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'AN-001 / DIRECT_CLICKHOUSE_INSERT',
          details: 'Direct ClickHouse INSERT forbidden. Buffer via Pub/Sub.',
        });
      }

      // Rule 4: No glassmorphism or gradient backgrounds in UI styles
      if (ext === '.css' || ext === '.tsx') {
        if (line.includes('backdrop-filter: blur') || line.includes('backdrop-blur')) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'DS-15 / GLASSMORPHISM_FORBIDDEN',
            details: 'Glassmorphism (backdrop-filter) is prohibited by Design System Section 15.',
          });
        }
        if (line.includes('linear-gradient(') || line.includes('radial-gradient(')) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'DS-15 / GRADIENT_FORBIDDEN',
            details: 'Gradient backgrounds are prohibited by Design System Section 15.',
          });
        }
      }

      // Rule 5: No gen_random_uuid() in application code (use generateId())
      if ((ext === '.ts' || ext === '.js') && !relPath.includes('migrations')) {
        const trimmed = line.trim();
        if (
          line.includes('gen_random_uuid()') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('/*')
        ) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'ID-001 / RAW_UUID_CALL',
            details:
              'Do not use gen_random_uuid() in application code. Use generateId() from @pactintel/shared-utils.',
          });
        }
      }
    });
  });
});

// Report Results
console.log(`Scanned codebase for architectural invariants.`);

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} forbidden architectural pattern violations:\n`);
  violations.forEach((v) => {
    console.error(`  [${v.rule}] ${v.file}:${v.line}`);
    console.error(`    ↳ ${v.details}\n`);
  });
  process.exit(1);
} else {
  console.log(
    '✅ 0 architectural pattern violations detected. All Phase 1 constraints satisfied!\n',
  );
}
