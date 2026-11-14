import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';

const fake = vi.hoisted(() => ({
  fetch: vi.fn(),
  thumbnail: vi.fn(async () => ({})),
}));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    youtube: () => ({ thumbnails: { set: fake.thumbnail } }),
  },
}));
vi.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({
  SocialAbstract: class {
    fetch = fake.fetch;
    getSsrfSafeAxios() {
      return async () => ({ data: 'image-stream' });
    }
  },
  BadBody: class extends Error {},
  PublishedWithError: class extends Error {},
  RefreshToken: class extends Error {},
  rangeReadFailure: () => '',
  stripQuery: () => '',
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
function provider() {
  const value = new YoutubeProvider();
  (value as any).youtubeMediaSize = vi.fn(async () => 123);
  return value;
}

describe('Existing YouTube provider optional native scheduling', () => {
  it('adds native publishAt only for private future settings and preserves omitted fields for old callers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T18:00:00Z'));
    fake.fetch.mockResolvedValue(
      new Response('', {
        status: 200,
        headers: {
          location:
            'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test',
        },
      })
    );
    const youtube = provider();
    const details: any = [
      {
        id: 'post-a',
        message: 'Description',
        media: [
          { type: 'video', path: 'https://assets.example.org/video.mp4' },
        ],
        settings: {
          title: 'Title',
          type: 'private',
          publishAt: '2026-11-14T20:00:00Z',
          selfDeclaredMadeForKids: 'no',
          containsSyntheticMedia: true,
        },
      },
    ];
    await youtube.postPending('channel', 'token', details, {} as any);
    expect(JSON.parse(fake.fetch.mock.calls[0][1].body).status).toEqual({
      privacyStatus: 'private',
      publishAt: '2026-11-14T20:00:00.000Z',
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
    });
    delete details[0].settings.publishAt;
    delete details[0].settings.containsSyntheticMedia;
    await youtube.postPending('channel', 'token', details, {} as any);
    const legacy = JSON.parse(fake.fetch.mock.calls[1][1].body).status;
    expect(legacy).not.toHaveProperty('publishAt');
    expect(legacy).not.toHaveProperty('containsSyntheticMedia');
  });
  it('refuses public or past native dates before making an upload request', async () => {
    const youtube = provider();
    for (const settings of [
      { type: 'public', publishAt: '2099-01-01T12:00:00Z' },
      { type: 'private', publishAt: '2000-01-01T12:00:00Z' },
    ]) {
      await expect(
        youtube.postPending(
          'channel',
          'token',
          [{ id: 'post', message: '', settings, media: [] }],
          {} as any
        )
      ).rejects.toThrow();
      expect(
        await validate(
          plainToInstance(YoutubeSettingsDto, { title: 'Title', ...settings })
        )
      ).not.toHaveLength(0);
    }
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('uses the no-retry path for a ledger-reserved insert and thumbnail', async () => {
    fake.fetch.mockResolvedValue(
      new Response('', {
        status: 200,
        headers: {
          location:
            'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test',
        },
      })
    );
    const youtube = provider();
    await youtube.studioStartUpload(
      'channel',
      'token',
      [
        {
          id: 'post',
          message: '',
          settings: { title: 'Title', type: 'private' },
          media: [
            { type: 'video', path: 'https://assets.example.org/video.mp4' },
          ],
        },
      ],
      {} as any
    );
    expect(fake.fetch.mock.calls[0][3]).toBe(3);
    await youtube.studioSetThumbnail(
      'token',
      'video-a',
      'https://assets.example.org/cover.jpg'
    );
    expect(fake.thumbnail.mock.calls[0][1]).toEqual({ retry: false });
  });
});
