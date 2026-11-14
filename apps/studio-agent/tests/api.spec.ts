import { describe, expect, it, vi } from 'vitest';
import { loadConfiguration, StudioAgentError, StudioApiClient } from '../src/api.js';

const environment = { POSTIZ_STUDIO_API_URL: 'http://127.0.0.1:3000/public/v1/studio', POSTIZ_API_KEY: 'dummy-secret-not-a-real-key' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Studio agent transport authorization boundary', () => {
  it('accepts configured HTTPS or loopback HTTP and rejects insecure remote URLs and credential-bearing URLs', () => {
    expect(loadConfiguration(environment).apiUrl.hostname).toBe('127.0.0.1');
    expect(loadConfiguration({ ...environment, POSTIZ_STUDIO_API_URL: 'https://postiz.example.invalid/api/public/v1/studio' }).apiUrl.protocol).toBe('https:');
    for (const url of ['http://10.0.0.2/public/v1/studio', 'https://user:secret@example.invalid/public/v1/studio', 'https://example.invalid/public/v1/studio?key=value', 'https://example.invalid/other']) {
      expect(() => loadConfiguration({ ...environment, POSTIZ_STUDIO_API_URL: url })).toThrow(StudioAgentError);
    }
    expect(() => loadConfiguration({ ...environment, POSTIZ_API_KEY: 'Bearer dummy-secret' })).toThrow(StudioAgentError);
  });

  it('uses native Postiz raw Authorization only on the fixed API and disables redirect following', async () => {
    const fetcher = vi.fn(async () => json({ projects: [] }));
    const api = new StudioApiClient(loadConfiguration(environment), fetcher as typeof fetch);
    await api.request('GET', '/projects');
    const [url, request] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://127.0.0.1:3000/public/v1/studio/projects');
    expect(url.toString()).not.toContain(environment.POSTIZ_API_KEY);
    expect(request.headers).toMatchObject({ Authorization: environment.POSTIZ_API_KEY });
    expect(request.redirect).toBe('error');
    expect(request.headers).not.toHaveProperty('x-postiz-org');
  });

  it('refuses path escape before sending credentials', async () => {
    const fetcher = vi.fn();
    const api = new StudioApiClient(loadConfiguration(environment), fetcher as typeof fetch);
    for (const path of ['//example.invalid/projects', '/../outside', '/../../outside', '/projects\\outside']) {
      await expect(api.request('GET', path)).rejects.toMatchObject({ code: 'invalid_path' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not expose raw API error bodies or automatically retry writes', async () => {
    const fetcher = vi.fn(async () => json({ error: `token=${environment.POSTIZ_API_KEY}` }, 503));
    const api = new StudioApiClient(loadConfiguration(environment), fetcher as typeof fetch);
    try { await api.request('POST', '/projects/project-a/generate', { stage: 'script', revision: 1 }); }
    catch (error) {
      expect(error).toMatchObject({ code: 'unconfirmed' });
      expect(String(error)).not.toContain(environment.POSTIZ_API_KEY);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('redacts echoed credentials in successful payloads as a final boundary', async () => {
    const fetcher = vi.fn(async () => json({ text: `prefix ${environment.POSTIZ_API_KEY}`, nested: { refreshToken: 'remote-platform-secret', token: 'raw-provider-token', clientSecret: 'raw-client-secret' } }));
    const api = new StudioApiClient(loadConfiguration(environment), fetcher as typeof fetch);
    const result = JSON.stringify(await api.request('GET', '/capabilities'));
    expect(result).not.toContain(environment.POSTIZ_API_KEY);
    expect(result).not.toContain('remote-platform-secret');
    expect(result).not.toContain('raw-provider-token');
    expect(result).not.toContain('raw-client-secret');
  });

  it('bounds responses before returning them to the model', async () => {
    const fetcher = vi.fn(async () => new Response('large', { headers: { 'content-length': String(5 * 1024 * 1024) } }));
    const api = new StudioApiClient(loadConfiguration(environment), fetcher as typeof fetch);
    await expect(api.request('GET', '/projects')).rejects.toMatchObject({ code: 'response_too_large' });
  });
});
