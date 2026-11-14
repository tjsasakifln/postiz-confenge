import type { Prisma } from '@prisma/client';

/** Native uploads reserve the same monthly allowance as calendar posts. */
export async function countStudioDistributionReservations(
  client: Pick<Prisma.TransactionClient, 'studioDistributionItem' | 'post'>,
  organizationId: string,
  since: Date
): Promise<number> {
  const items = await client.studioDistributionItem.findMany({
    where: {
      organizationId,
      publishAt: { gte: since },
      batch: { confirmedAt: { not: null } },
      phase: { notIn: ['planned', 'cancelled'] },
    },
    select: {
      id: true,
      postId: true,
      instagramPostId: true,
      instagramIntegrationId: true,
      youtubePublicConfirmedAt: true,
      instagramPublishedAt: true,
      youtubeReservationReleased: true,
      instagramReservationReleased: true,
    },
  });
  const targets = items.flatMap((item) => [
    ...(!item.youtubeReservationReleased || item.youtubePublicConfirmedAt
      ? [{ key: item.postId || `youtube:${item.id}`, postId: item.postId }]
      : []),
    ...(item.instagramIntegrationId &&
    (!item.instagramReservationReleased || item.instagramPublishedAt)
      ? [
          {
            key: item.instagramPostId || `instagram:${item.id}`,
            postId: item.instagramPostId,
          },
        ]
      : []),
  ]);
  if (!targets.length) return 0;
  const ids = targets
    .map((target) => target.postId)
    .filter((id): id is string => Boolean(id));
  const posts = ids.length
    ? await client.post.findMany({
        where: {
          id: { in: ids },
          organizationId,
          publishDate: { gte: since },
          OR: [{ deletedAt: null, state: 'QUEUE' }, { state: 'PUBLISHED' }],
        },
        select: { id: true },
      })
    : [];
  const represented = new Set(posts.map((post) => post.id));
  return new Set(
    targets
      .filter((target) => !target.postId || !represented.has(target.postId))
      .map((target) => target.key)
  ).size;
}
