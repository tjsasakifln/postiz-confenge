import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfiguration, StudioApiClient } from './api.js';
import { createStudioAgentServer } from './server.js';

async function main() {
  const server = createStudioAgentServer(new StudioApiClient(loadConfiguration()));
  await server.connect(new StdioServerTransport());
  const close = async () => { await server.close(); process.exitCode = 0; };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
}

main().catch(() => {
  // stdout belongs exclusively to the MCP transport. Errors never print secrets.
  process.stderr.write('O servidor MCP do Estúdio não iniciou. Confira a configuração local e a versão do Node.\n');
  process.exitCode = 1;
});
