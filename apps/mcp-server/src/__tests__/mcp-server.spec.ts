import { PactIntelMcpServer } from '../index';

describe('Model Context Protocol (MCP) Server (Sprint 3.12)', () => {
  let server: PactIntelMcpServer;

  beforeEach(() => {
    server = new PactIntelMcpServer('pi_test_key_123');
  });

  it('lists all 8 required standard MCP tools', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(res.error).toBeUndefined();
    expect(res.result.tools.length).toBe(8);

    const toolNames = res.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('create_document');
    expect(toolNames).toContain('send_document');
    expect(toolNames).toContain('get_document_status');
    expect(toolNames).toContain('list_documents');
    expect(toolNames).toContain('create_signature_request');
    expect(toolNames).toContain('get_signature_status');
    expect(toolNames).toContain('trigger_workflow');
    expect(toolNames).toContain('search_portfolio');
  });

  it('handles unknown tool execution gracefully with JSON-RPC error', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'non_existent_tool' },
    });

    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32000);
    expect(res.error?.message).toContain('Unknown MCP tool');
  });

  it('returns method not found for unsupported JSON-RPC methods', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'unsupported/method',
    });

    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32601);
  });
});
