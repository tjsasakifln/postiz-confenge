import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('Built Studio MCP process over stdio', () => {
  let http: Server;
  let endpoint: string;
  let receivedAuthorization: string | undefined;
  let receivedRequests = 0;
  beforeAll(async () => {
    http = createServer((request, response) => {
      receivedRequests++;
      receivedAuthorization = request.headers.authorization;
      if (request.headers.authorization !== 'synthetic-process-key') {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid test key' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: 'project-a', title: 'Synthetic local project', revision: 1 }));
    });
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Missing local test address');
    endpoint = `http://127.0.0.1:${address.port}/public/v1/studio`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())); });

  it('discovers tools and authenticates an HTTP read without printing secrets in protocol results', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath, args: [fileURLToPath(new URL('../dist/main.js', import.meta.url))],
      env: { POSTIZ_STUDIO_API_URL: endpoint, POSTIZ_API_KEY: 'synthetic-process-key' }, stderr: 'pipe',
    });
    const client = new Client({ name: 'studio-stdio-smoke-test', version: '1.0.0' });
    let diagnostics = '';
    transport.stderr?.on('data', chunk => { diagnostics += String(chunk); });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(25);
      const result = await client.callTool({ name: 'studio_get_project', arguments: { projectId: 'project-a' } });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain('Synthetic local project');
      expect(receivedAuthorization).toBe('synthetic-process-key');
      expect(receivedRequests).toBe(1);
      expect(JSON.stringify(result)).not.toContain('synthetic-process-key');
      expect(diagnostics).not.toContain('synthetic-process-key');
    } finally { await client.close(); }
  });
});
