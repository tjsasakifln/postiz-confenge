import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createStudioAgentServer } from '../src/server.js';
import type { StudioApiClient } from '../src/api.js';

const reviewHash = 'a'.repeat(64);
const review = { projectId: 'project-a', title: 'Projeto de teste', revision: 3, stage: 'script', reviewHash, content: { topic: 'Revisão de projeto', scenes: [{ narration: 'Texto a revisar.' }] } };
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });

async function fixture(elicitation?: 'accept' | 'decline' | 'false', replyState: 'draft' | 'approved' | 'uncertain' | 'sent' = 'draft') {
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    if (path.includes('/review')) return structuredClone(review);
    if (path.endsWith('/audience/threads')) return { threads: [{ id: 'thread-a', integrationId: 'channel-a', postId: 'post-a', platform: 'youtube', authorName: 'Autor', text: 'Pergunta original?', revision: 5, replyState, replyDraft: 'Resposta exata.', draftHash: reviewHash, approvalHash: replyState === 'draft' ? undefined : reviewHash }] };
    return { method, path, body, ok: true };
  });
  const api = { request, reviewLocation: () => 'https://postiz.example.invalid/studio' } as unknown as StudioApiClient;
  const server = createStudioAgentServer(api);
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: elicitation ? { elicitation: { form: {} } } : {} });
  const confirmations = vi.fn(async (_request: unknown) => ({ action: elicitation === 'decline' ? 'decline' as const : 'accept' as const, content: { confirmed: elicitation === 'accept' } }));
  if (elicitation) client.setRequestHandler(ElicitRequestSchema, confirmations);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(async () => { await client.close(); await server.close(); });
  return { server, client, request, confirmations };
}

describe('Studio MCP protocol, contracts and human confirmation', () => {
  it('lists all implemented tools and the review contract through the real MCP SDK', async () => {
    const { client } = await fixture();
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(25);
    expect(tools.find(tool => tool.name === 'studio_get_project')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find(tool => tool.name === 'studio_send_reply')?.annotations?.destructiveHint).toBe(true);
    const contract = await client.readResource({ uri: 'studio://contract' });
    expect(JSON.stringify(contract)).toContain('não identifica uma pessoa');
  });

  it('never approves without elicitation support, even if the model tries to claim confirmation', async () => {
    const { client, request } = await fixture();
    const result = await client.callTool({ name: 'studio_approve_project', arguments: { projectId: 'project-a', revision: 3, stage: 'script', reviewHash } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('human_review_required');
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
    const forged = await client.callTool({ name: 'studio_approve_project', arguments: { projectId: 'project-a', revision: 3, stage: 'script', reviewHash, humanConfirmed: true } });
    expect(forged.isError).toBe(true);
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it.each(['decline', 'false'] as const)('does not mutate after confirmation result %s', async answer => {
    const { client, request } = await fixture(answer);
    const result = await client.callTool({ name: 'studio_approve_project', arguments: { projectId: 'project-a', revision: 3, stage: 'script', reviewHash } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('confirmation_declined');
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('shows the exact stage, content and hash to the person and sends only the reviewed version', async () => {
    const { client, request, confirmations } = await fixture('accept');
    const result = await client.callTool({ name: 'studio_approve_project', arguments: { projectId: 'project-a', revision: 3, stage: 'script', reviewHash, acknowledgedSourceIds: ['source-a'] } });
    expect(result.isError).not.toBe(true);
    const confirmation = JSON.stringify(confirmations.mock.calls[0]);
    expect(confirmation).toContain('Texto a revisar.');
    expect(confirmation).toContain(reviewHash);
    expect(confirmation).toContain('script');
    expect(request).toHaveBeenLastCalledWith('POST', '/projects/project-a/approve', { revision: 3, stage: 'script', reviewHash, acknowledgedSourceIds: ['source-a'], confirmed: true }, expect.any(AbortSignal));
  });

  it('rejects a stale review before asking the person to approve it', async () => {
    const { client, request, confirmations } = await fixture('accept');
    const result = await client.callTool({ name: 'studio_approve_project', arguments: { projectId: 'project-a', revision: 2, stage: 'script', reviewHash } });
    expect(result.isError).toBe(true);
    expect(confirmations).not.toHaveBeenCalled();
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('cannot replace the API URL, credentials or organization through tool arguments', async () => {
    const { client, request } = await fixture();
    const result = await client.callTool({ name: 'studio_get_project', arguments: { projectId: 'project-a', baseUrl: 'https://attacker.invalid', apiKey: 'other', organizationId: 'org-b' } });
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
    const traversal = await client.callTool({ name: 'studio_get_project', arguments: { projectId: '../../other' } });
    expect(traversal.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('requires the operator request contract for generation and never forwards that assertion as approval', async () => {
    const { client, request } = await fixture();
    expect((await client.callTool({ name: 'studio_generate', arguments: { projectId: 'project-a', revision: 3, stage: 'script', requestedByOperator: false } })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
    await client.callTool({ name: 'studio_generate', arguments: { projectId: 'project-a', revision: 3, stage: 'script', requestedByOperator: true } });
    expect(request).toHaveBeenLastCalledWith('POST', '/projects/project-a/generate', { revision: 3, stage: 'script' }, expect.any(AbortSignal));
  });

  it('does not approve audience replies or record commercial facts without human elicitation', async () => {
    const { client, request } = await fixture();
    expect((await client.callTool({ name: 'studio_approve_reply', arguments: { projectId: 'project-a', threadId: 'thread-a', revision: 5, draftHash: reviewHash } })).isError).toBe(true);
    expect((await client.callTool({ name: 'studio_record_outcome', arguments: { projectId: 'project-a', stage: 'received', valueCents: 10000, currency: 'BRL', reference: 'event-a', note: 'Synthetic event', occurredAt: '2026-01-01T00:00:00Z', externalId: 'synthetic-event' } })).isError).toBe(true);
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it.each([undefined, 'decline', 'false'] as const)('does not send a public reply without accepted human confirmation (%s)', async answer => {
    const { client, request } = await fixture(answer, 'approved');
    const result = await client.callTool({ name: 'studio_send_reply', arguments: { projectId: 'project-a', threadId: 'thread-a', revision: 5, draftHash: reviewHash } });
    expect(result.isError).toBe(true);
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('confirms the exact public reply and destination before one send request', async () => {
    const { client, request, confirmations } = await fixture('accept', 'approved');
    const result = await client.callTool({ name: 'studio_send_reply', arguments: { projectId: 'project-a', threadId: 'thread-a', revision: 5, draftHash: reviewHash } });
    expect(result.isError).not.toBe(true);
    const confirmation = JSON.stringify(confirmations.mock.calls[0]);
    expect(confirmation).toContain('Resposta exata.');
    expect(confirmation).toContain('channel-a');
    expect(confirmation).toContain('post-a');
    expect(confirmation).toContain(reviewHash);
    expect(request.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(1);
    expect(request).toHaveBeenLastCalledWith('POST', '/projects/project-a/audience/threads/thread-a/send', { revision: 5, draftHash: reviewHash, confirmed: true }, expect.any(AbortSignal));
  });

  it('refuses to send again when the previous result is uncertain', async () => {
    const { client, request, confirmations } = await fixture('accept', 'uncertain');
    const result = await client.callTool({ name: 'studio_send_reply', arguments: { projectId: 'project-a', threadId: 'thread-a', revision: 5, draftHash: reviewHash } });
    expect(result.isError).toBe(true);
    expect(confirmations).not.toHaveBeenCalled();
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('does not ask for a second confirmation for generation already requested by the operator', async () => {
    const { client, request, confirmations } = await fixture('decline');
    const result = await client.callTool({ name: 'studio_generate', arguments: { projectId: 'project-a', revision: 3, stage: 'script', requestedByOperator: true } });
    expect(result.isError).not.toBe(true);
    expect(confirmations).not.toHaveBeenCalled();
    expect(request).toHaveBeenLastCalledWith('POST', '/projects/project-a/generate', { revision: 3, stage: 'script' }, expect.any(AbortSignal));
  });
});
