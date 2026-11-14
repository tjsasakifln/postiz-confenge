import { afterEach, describe, expect, it, vi } from 'vitest';
import { YoutubeAudienceProvider } from './youtube.audience.provider';
import { InstagramAudienceProvider } from './instagram.audience.provider';
import { AudienceProviderError, audienceRequest } from './studio.audience.provider';

vi.mock('@gitroom/nestjs-libraries/integrations/social/facebook.provider', () => ({ META_GRAPH_API_VERSION: 'v23.0' }));
afterEach(() => { vi.unstubAllGlobals(); });
const connection = { internalId: 'owner-a', token: 'SECRET_TOKEN' };
const post = { releaseId: 'video-a', releaseUrl: 'https://www.youtube.com/watch?v=video-a' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Official audience provider boundaries', () => {
  it('refuses a YouTube video owned by another account before reading its comments', async () => {
    const fetch = vi.fn(async () => json({ items: [{ snippet: { channelId: 'other-owner' } }] }));
    vi.stubGlobal('fetch', fetch);
    await expect(new YoutubeAudienceProvider().listUnanswered(connection, post)).rejects.toMatchObject({ code: 'ownership_unverified' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not classify an incomplete or anonymous reply history as unanswered', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ items: [{ snippet: { channelId: 'owner-a' } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: 'thread-a', snippet: {
        canReply: true, totalReplyCount: 1,
        topLevelComment: { id: 'comment-a', snippet: { authorChannelId: { value: 'person-a' }, textOriginal: 'Pergunta?', publishedAt: new Date().toISOString() } },
      } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: 'reply-a', snippet: { textOriginal: 'Resposta sem identificação.' } }] }));
    vi.stubGlobal('fetch', fetch);
    const result = await new YoutubeAudienceProvider().listUnanswered(connection, post);
    expect(result.comments).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it('recognizes a real reply made by the connected brand', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ items: [{ snippet: { channelId: 'owner-a' } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: 'thread-a', snippet: {
        canReply: true, totalReplyCount: 1,
        topLevelComment: { id: 'comment-a', snippet: { authorChannelId: { value: 'person-a' }, textOriginal: 'Pergunta?', publishedAt: new Date().toISOString() } },
      } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: 'reply-a', snippet: { authorChannelId: { value: 'owner-a' }, textOriginal: 'Resposta real.', publishedAt: new Date().toISOString() } }] }));
    vi.stubGlobal('fetch', fetch);
    const result = await new YoutubeAudienceProvider().listUnanswered(connection, post);
    expect(result.comments).toHaveLength(0);
    expect(result.answered[0].reply.id).toBe('reply-a');
  });

  it('refuses Instagram comments that cannot be linked to the selected media', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ owner: { id: 'owner-a' } }))
      .mockResolvedValueOnce(json({ id: 'comment-a', text: 'Pergunta?', from: { id: 'person-a' }, media: { id: 'other-media' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(new InstagramAudienceProvider().inspectThread(connection, post, 'comment-a')).rejects.toMatchObject({ code: 'not_found' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the verified media owner username to recognize Instagram replies across scoped IDs', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ owner: { id: 'owner-a' }, username: 'brand' }))
      .mockResolvedValueOnce(json({ data: [{ id: 'comment-a', text: 'Pergunta?', timestamp: new Date().toISOString(), from: { id: 'person-a', username: 'person' } }] }))
      .mockResolvedValueOnce(json({ data: [{ id: 'reply-a', text: 'Já respondido.', timestamp: new Date().toISOString(), from: { id: 'different-scoped-owner-id', username: 'brand' } }] }));
    vi.stubGlobal('fetch', fetch);
    const result = await new InstagramAudienceProvider().listUnanswered(connection, post);
    expect(result.comments).toHaveLength(0);
    expect(result.answered[0].reply.id).toBe('reply-a');
  });

  it('sends only to the official endpoint, with tokens in headers and no automatic retry', async () => {
    const fetch = vi.fn(async () => json({ id: 'reply-a', snippet: { parentId: 'comment-a', textOriginal: 'Resposta aprovada.' } }));
    vi.stubGlobal('fetch', fetch);
    await new YoutubeAudienceProvider().reply(connection, 'comment-a', 'Resposta aprovada.');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://www.googleapis.com');
    expect(url.search).not.toContain('SECRET');
    expect(options.redirect).toBe('error');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer SECRET_TOKEN' });
    expect(JSON.parse(options.body as string)).toEqual({ snippet: { parentId: 'comment-a', textOriginal: 'Resposta aprovada.' } });
  });

  it('sanitizes failed responses and distinguishes definitive rejection from uncertain server errors', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: 'SECRET_TOKEN' }, 403))
      .mockResolvedValueOnce(json({ error: 'SECRET_TOKEN' }, 503));
    vi.stubGlobal('fetch', fetch);
    const url = new URL('https://www.googleapis.com/youtube/v3/comments');
    await expect(audienceRequest(url, connection.token, {})).rejects.toEqual(new AudienceProviderError('access_denied', true));
    await expect(audienceRequest(url, connection.token, {})).rejects.toEqual(new AudienceProviderError('provider_unavailable', false));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps HTTP 408 and proxy 499 write timeouts uncertain and does not retry', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: 'request timed out after acceptance' }, 408))
      .mockResolvedValueOnce(json({ error: 'client closed request' }, 499));
    vi.stubGlobal('fetch', fetch);
    const url = new URL('https://www.googleapis.com/youtube/v3/comments');
    await expect(audienceRequest(url, connection.token, {})).rejects.toMatchObject({ code: 'provider_unavailable', definitive: false });
    await expect(audienceRequest(url, connection.token, {})).rejects.toMatchObject({ code: 'provider_unavailable', definitive: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
