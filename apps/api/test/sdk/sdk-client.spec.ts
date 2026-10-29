import { PactIntelClient, PactIntelApiError } from '@pactintel/sdk';

describe('TypeScript SDK Client (@pactintel/sdk)', () => {
  it('instantiates client with apiKey and exposes all core resource namespaces', () => {
    const client = new PactIntelClient({
      apiKey: 'pi_live_test_key_123',
    });

    expect(client.documents).toBeDefined();
    expect(client.forms).toBeDefined();
    expect(client.webhooks).toBeDefined();
    expect(client.devices).toBeDefined();
    expect(client.apiKeys).toBeDefined();
  });

  it('throws validation error if apiKey is missing', () => {
    expect(() => new PactIntelClient({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('retries on 429 status code with exponential backoff before throwing error', async () => {
    const client = new PactIntelClient({
      apiKey: 'pi_live_test_key_123',
      maxRetries: 2,
    });

    let attempts = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      attempts++;
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({ error: { message: 'Rate limit exceeded', code: 'RATE_LIMIT' } }),
        headers: new Headers(),
      });
    });

    await expect(client.documents.list()).rejects.toThrow(PactIntelApiError);
    expect(attempts).toBe(3); // Initial + 2 retries
  });
});
