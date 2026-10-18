import * as fs from 'fs';
import * as path from 'path';
import { dataManifest } from '../../libs/data-manifest/src/manifest';

function checkDataManifest(): void {
  console.log('🔍 Checking Data Manifest adherence (Invariant I-10)...');

  const schemaPath = path.resolve(__dirname, '../../apps/api/src/prisma/schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Prisma schema not found at: ${schemaPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(schemaPath, 'utf-8').split(/\r?\n/);

  const tablesInPrisma: { modelName: string; tableName: string }[] = [];

  let currentModel: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const modelMatch = trimmed.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      currentBody = [];
      continue;
    }

    if (currentModel) {
      if (trimmed === '}') {
        const bodyText = currentBody.join('\n');
        const mapMatch = bodyText.match(/@@map\("([^"]+)"\)/);
        const tableName = mapMatch ? mapMatch[1] : currentModel.toLowerCase();
        tablesInPrisma.push({ modelName: currentModel, tableName });
        currentModel = null;
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
  }

  console.log(`Found ${tablesInPrisma.length} Prisma models in schema.`);

  const errors: string[] = [];

  // Check 1: Every Prisma model has an entry in data-manifest
  for (const { modelName, tableName } of tablesInPrisma) {
    const entry = dataManifest.stores.find(
      (s) =>
        s.type === 'postgresql_table' &&
        s.tableOrResource.toLowerCase() === tableName.toLowerCase(),
    );

    if (!entry) {
      errors.push(
        `Table '${tableName}' (model '${modelName}') is NOT registered in libs/data-manifest!`,
      );
    } else {
      // Check mandatory fields
      if (typeof entry.rls !== 'boolean') {
        errors.push(`Table '${tableName}' in manifest is missing a valid 'rls' boolean flag.`);
      }
      if (!entry.retention) {
        errors.push(`Table '${tableName}' in manifest is missing 'retention' policy.`);
      }
      if (!entry.erasure) {
        errors.push(`Table '${tableName}' in manifest is missing 'erasure' policy.`);
      }
      if (!entry.residency) {
        errors.push(`Table '${tableName}' in manifest is missing 'residency' policy.`);
      }
    }
  }

  // Check 2: Manifest entries have valid types and residency
  for (const store of dataManifest.stores) {
    if (!['cell_jurisdiction', 'global_control_plane'].includes(store.residency)) {
      errors.push(`Store '${store.id}' has invalid residency: '${store.residency}'.`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Data Manifest Check FAILED with the following errors:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error(
      '\nInvariant I-10 Violation: All stores must be registered with complete policies in libs/data-manifest before merging.',
    );
    process.exit(1);
  }

  console.log(
    `✅ Data Manifest Check PASSED: All ${tablesInPrisma.length} PostgreSQL tables and ${dataManifest.stores.length} total stores are verified.`,
  );
}

checkDataManifest();
