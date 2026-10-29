# @pactintel/sdk

The official TypeScript & JavaScript SDK for the PactIntel contract intelligence and e-signature platform.

## Installation

```bash
npm install @pactintel/sdk
# or
pnpm add @pactintel/sdk
```

## Quickstart

```typescript
import { PactIntelClient } from '@pactintel/sdk';

const client = new PactIntelClient({
  apiKey: process.env.PACTINTEL_API_KEY!,
});

// 1. Create a contract document
const doc = await client.documents.create({
  title: 'Consulting Services Agreement',
  type: 'contract',
});

// 2. Send for e-signature
await client.documents.send(doc.id, [
  { name: 'Alice Smith', email: 'alice@company.com', role: 'Client' },
]);

// 3. List recent standalone forms
const forms = await client.forms.list();
console.log('Active forms:', forms);
```
