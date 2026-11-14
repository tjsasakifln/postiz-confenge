import { describe, expect, it, vi } from 'vitest';
import { countStudioDistributionReservations } from './studio.distribution.count';

describe('Native distribution shares the calendar allowance', () => {
  it('counts private reservations once and releases only the definitively failed target', async () => {
    const items = [
      {
        id: 'private',
        postId: 'p-private',
        instagramPostId: 'ig-private',
        instagramIntegrationId: 'ig',
        youtubePublicConfirmedAt: null,
        instagramPublishedAt: null,
        youtubeReservationReleased: false,
        instagramReservationReleased: false,
      },
      {
        id: 'public',
        postId: 'p-public',
        instagramPostId: 'ig-failed',
        instagramIntegrationId: 'ig',
        youtubePublicConfirmedAt: new Date(),
        instagramPublishedAt: null,
        youtubeReservationReleased: false,
        instagramReservationReleased: true,
      },
      {
        id: 'rejected',
        postId: 'p-rejected',
        instagramPostId: null,
        instagramIntegrationId: null,
        youtubePublicConfirmedAt: null,
        instagramPublishedAt: null,
        youtubeReservationReleased: true,
        instagramReservationReleased: true,
      },
    ];
    const client = {
      studioDistributionItem: { findMany: vi.fn(async () => items) },
      post: { findMany: vi.fn(async () => [{ id: 'p-public' }]) },
    };
    const since = new Date('2026-01-01T00:00:00Z');
    expect(
      await countStudioDistributionReservations(client as any, 'org', since)
    ).toBe(2);
    expect(
      client.studioDistributionItem.findMany.mock.calls[0][0].where
    ).toMatchObject({
      organizationId: 'org',
      publishAt: { gte: since },
      batch: { confirmedAt: { not: null } },
    });
    expect(client.post.findMany.mock.calls[0][0].where.organizationId).toBe(
      'org'
    );
  });

  it('still counts a remotely confirmed publication that has not yet become a Post row', async () => {
    const client = {
      studioDistributionItem: {
        findMany: vi.fn(async () => [
          {
            id: 'remote',
            postId: null,
            instagramPostId: null,
            instagramIntegrationId: 'ig',
            youtubePublicConfirmedAt: new Date(),
            instagramPublishedAt: new Date(),
            youtubeReservationReleased: true,
            instagramReservationReleased: true,
          },
        ]),
      },
      post: { findMany: vi.fn() },
    };
    expect(
      await countStudioDistributionReservations(
        client as any,
        'org',
        new Date()
      )
    ).toBe(2);
    expect(client.post.findMany).not.toHaveBeenCalled();
  });
});
