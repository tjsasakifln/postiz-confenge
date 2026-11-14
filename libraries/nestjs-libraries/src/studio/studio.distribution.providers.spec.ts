import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  distributionRequest,
  StudioDistributionInstagramAdapter,
  StudioDistributionProviderError,
  StudioDistributionYoutubeAdapter,
} from './studio.distribution.providers';

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
vi.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/youtube.provider',
  () => ({ YoutubeProvider: class {} })
);
vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/facebook.provider',
  () => ({ META_GRAPH_API_VERSION: 'v25.0' })
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const connection: any = {
  internalId: 'account-a',
  token: 'private-token___private-user-token',
  providerIdentifier: 'instagram',
};

describe('Distribution official adapters, uncertainty and native schedule', () => {
  it.each([408, 499, 500, 503])(
    'does not retry an ambiguous HTTP %s or include its token-bearing body in errors',
    async (status) => {
      const fetch = vi.fn(async () =>
        json({ access_token: 'must-not-escape', detail: 'private' }, status)
      );
      vi.stubGlobal('fetch', fetch);
      const error = await distributionRequest(
        new URL('https://graph.facebook.com/v25.0/id/media_publish'),
        'private-token',
        'POST',
        { creation_id: 'container-a' }
      ).catch((error) => error);
      expect(error).toBeInstanceOf(StudioDistributionProviderError);
      expect(error.definitive).toBe(false);
      expect(String(error)).not.toMatch(/must-not-escape|private-token/);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
  it('classifies an explicit 400 rejection as definitive with one attempt', async () => {
    const fetch = vi.fn(async () => json({ error: {} }, 400));
    vi.stubGlobal('fetch', fetch);
    await expect(
      distributionRequest(
        new URL('https://www.googleapis.com/youtube/v3/videos'),
        'token',
        'PUT',
        {}
      )
    ).rejects.toMatchObject({ definitive: true, code: 'remote_rejected' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires a future native date and sends private visibility plus both explicit declarations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T18:00:00Z'));
    const fetch = vi.fn(async () => json({ id: 'video-a' }));
    vi.stubGlobal('fetch', fetch);
    const adapter = new StudioDistributionYoutubeAdapter({} as any);
    await expect(
      adapter.schedule(
        { token: 'token' } as any,
        'video-a',
        'not-a-date',
        false,
        true
      )
    ).rejects.toMatchObject({ code: 'schedule_expired' });
    await expect(
      adapter.schedule(
        { token: 'token' } as any,
        'video-a',
        '2026-11-14T17:00:00Z',
        false,
        true
      )
    ).rejects.toMatchObject({ code: 'schedule_expired' });
    expect(fetch).not.toHaveBeenCalled();
    await adapter.schedule(
      { token: 'token' } as any,
      'video-a',
      '2026-11-14T20:00:00Z',
      false,
      true
    );
    const request = fetch.mock.calls[0] as any;
    expect(request[1].method).toBe('PUT');
    expect(JSON.parse(request[1].body)).toEqual({
      id: 'video-a',
      status: {
        privacyStatus: 'private',
        publishAt: '2026-11-14T20:00:00Z',
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      },
    });
  });
  it('refuses to infer public ownership from a video belonging to another channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          items: [
            {
              id: 'video-a',
              snippet: { channelId: 'foreign' },
              status: { privacyStatus: 'public', uploadStatus: 'processed' },
            },
          ],
        })
      )
    );
    await expect(
      new StudioDistributionYoutubeAdapter({} as any).observe(
        { internalId: 'mine', token: 'token' } as any,
        'video-a'
      )
    ).rejects.toMatchObject({ code: 'ownership_unverified' });
  });
  it('does not send an authorization token to an injected resumable endpoint', async () => {
    const provider = { finalizePost: vi.fn() };
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const adapter = new StudioDistributionYoutubeAdapter({
      getSocialIntegration: () => ({ ...provider, studioStartUpload: vi.fn() }),
    } as any);
    await expect(
      adapter.resume({ token: 'token' } as any, {
        uploadUri: 'https://evil.example/steal',
        videoSize: 1,
        path: 'video',
        uploadedBytes: 0,
        thumbnail: '',
      })
    ).rejects.toMatchObject({ code: 'invalid_session' });
    expect(provider.finalizePost).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the official Instagram host and page token, and fails closed when quota usage is unavailable', async () => {
    const fetch = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal('fetch', fetch);
    const adapter = new StudioDistributionInstagramAdapter();
    await expect(adapter.checkQuota(connection)).rejects.toMatchObject({
      code: 'quota_unknown',
    });
    const [url, request] = fetch.mock.calls[0] as any;
    expect(url.hostname).toBe('graph.facebook.com');
    expect(request.headers.Authorization).toBe('Bearer private-token');
    expect(String(url)).not.toContain('private-token');
  });
  it('creates one Reel container and publishes only the stored creation id without retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'container-a' }))
      .mockResolvedValueOnce(json({ id: 'media-a' }));
    vi.stubGlobal('fetch', fetch);
    const adapter = new StudioDistributionInstagramAdapter();
    const snapshot: any = {
      media: { path: 'https://assets.example.org/video.mp4' },
      instagram: {
        caption: 'Approved caption',
        thumbnail: { path: 'https://assets.example.org/cover.jpg' },
      },
    };
    const container = await adapter.create(connection, snapshot);
    expect(await adapter.publish(connection, container)).toBe('media-a');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      media_type: 'REELS',
      cover_url: snapshot.instagram.thumbnail.path,
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      creation_id: 'container-a',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
