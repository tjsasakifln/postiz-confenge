import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';

vi.mock('@gitroom/nestjs-libraries/integrations/social/linkedin.provider', () => ({ LinkedinProvider: class {} }));
vi.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({ BadBody: class extends Error {} }));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Postiz LinkedIn page analytics used by Studio', () => {
  it('does not turn permission error bodies into measured zero likes and comments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Permission denied', status: 403 }, 403)));
    expect(await new LinkedinPageProvider().postAnalytics('account', 'dummy-token', 'post', 28)).toEqual([]);
  });

  it('preserves a measured zero while leaving missing social fields unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ elements: [] }))
      .mockResolvedValueOnce(json({ likesSummary: { totalLikes: 0 } })));
    const result = await new LinkedinPageProvider().postAnalytics('account', 'dummy-token', 'post', 28);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Likes');
    expect(result[0].data[0].total).toBe(0);
  });

  it('returns only share statistics actually supplied by the official API', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ elements: [{ totalShareStatistics: { impressionCount: 42, clickCount: 0 } }] }))
      .mockResolvedValueOnce(json({ message: 'Unavailable' }, 403)));
    const result = await new LinkedinPageProvider().postAnalytics('account', 'dummy-token', 'post', 28);
    expect(result.map(metric => metric.label)).toEqual(['Impressions', 'Clicks']);
    expect(result.map(metric => metric.data[0].total)).toEqual([42, 0]);
  });
});
