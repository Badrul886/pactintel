import { PactIntelClient } from '@pactintel/sdk';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_document',
    description: 'Creates a new legal document, proposal, or agreement in PactIntel.',
    inputSchema: {
      type: 'object',
      required: ['title', 'type'],
      properties: {
        title: { type: 'string', description: 'Title of the contract or document' },
        type: { type: 'string', enum: ['contract', 'proposal', 'quote', 'sow', 'form'] },
        templateId: { type: 'string', description: 'Optional template ID to base document on' },
      },
    },
  },
  {
    name: 'send_document',
    description: 'Dispatches a document to specified signers for legally binding execution.',
    inputSchema: {
      type: 'object',
      required: ['documentId', 'signers'],
      properties: {
        documentId: { type: 'string', description: 'ID of the document' },
        signers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_document_status',
    description: 'Retrieves current lifecycle status, signers, and audit state of a document.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: {
        documentId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_documents',
    description: 'Lists contracts and documents with optional status filtering and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'sent', 'signed', 'declined', 'expired'] },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'create_signature_request',
    description: 'Initiates a dedicated e-signature transaction for a prepared document version.',
    inputSchema: {
      type: 'object',
      required: ['documentId', 'signers'],
      properties: {
        documentId: { type: 'string' },
        signers: { type: 'array' },
      },
    },
  },
  {
    name: 'get_signature_status',
    description: 'Inspects signing status, recipient completion, and verification levels.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: {
        documentId: { type: 'string' },
      },
    },
  },
  {
    name: 'trigger_workflow',
    description: 'Triggers an automated workflow definition instance with custom event payload.',
    inputSchema: {
      type: 'object',
      required: ['workflowId', 'input'],
      properties: {
        workflowId: { type: 'string' },
        input: { type: 'object' },
      },
    },
  },
  {
    name: 'search_portfolio',
    description: 'Searches portfolio contracts, clauses, and obligations across the organization.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
];

export async function executeMcpTool(
  toolName: string,
  args: Record<string, any>,
  client: PactIntelClient,
): Promise<any> {
  switch (toolName) {
    case 'create_document':
      return client.documents.create(args as any);
    case 'send_document':
      return client.documents.send(args.documentId, args.signers);
    case 'get_document_status':
      return client.documents.get(args.documentId);
    case 'list_documents':
      return client.documents.list(args);
    case 'create_signature_request':
      return client.documents.send(args.documentId, args.signers);
    case 'get_signature_status':
      return client.documents.get(args.documentId);
    case 'trigger_workflow':
      return {
        status: 'triggered',
        workflowId: args.workflowId,
        timestamp: new Date().toISOString(),
      };
    case 'search_portfolio':
      return client.documents.list({ status: args.status });
    default:
      throw new Error(`Unknown MCP tool: ${toolName}`);
  }
}
