import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { StudioDistributionRepository } from './studio.distribution.repository';
import { countStudioDistributionReservations } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.distribution.count';

describe.skipIf(process.env.STUDIO_DATABASE_TESTS !== 'true')(
  'Distribution PostgreSQL quota, reservations and organization boundaries',
  () => {
    const prisma = new PrismaClient();
    const model = { model: prisma } as any;
    const repository = new StudioDistributionRepository(model, model);
    const namespace = `distribution-test-${randomUUID()}`;
    const orgIds: string[] = [];
    const scopes: string[] = [];
    const targetKeys: string[] = [];
    const quotaDay = '2026-11-15';
    const estimate = [
      {
        day: quotaDay,
        timezone: 'America/Los_Angeles' as const,
        uploads: 1,
        otherUnits: 60,
      },
    ];
    let serial = 0;
    beforeAll(async () => {
      for (let index = 0; index < 2; index++)
        orgIds.push(
          (
            await prisma.organization.create({
              data: { name: `${namespace}-${index}` },
            })
          ).id
        );
    });
    afterAll(async () => {
      await prisma.post.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.integration.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.studioProject.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.studioDistributionQuotaDay.deleteMany({
        where: { scope: { in: scopes } },
      });
      await prisma.studioDistributionMirrorGate.deleteMany({
        where: { targetKey: { in: targetKeys } },
      });
      await prisma.$disconnect();
    });
    async function plan(
      org: string,
      scope = `${namespace}-${serial++}`,
      mirror = false,
      budget = { uploads: 100, otherUnits: 10000 }
    ) {
      scopes.push(scope);
      const project = await prisma.studioProject.create({
        data: {
          organizationId: org,
          title: 'Synthetic distribution test',
          document: {},
          approvals: { package: { hash: 'approved-hash' } },
        },
      });
      const batchId = await repository.plan(
        org,
        'synthetic-reviewer',
        'America/Sao_Paulo',
        scope,
        budget,
        estimate,
        [
          {
            projectId: project.id,
            projectRevision: 1,
            packageHash: 'approved-hash',
            integrationId: `yt-${serial++}`,
            integrationName: 'Synthetic YouTube',
            mediaId: 'synthetic-video',
            title: 'Synthetic video',
            publishAt: new Date('2026-11-15T15:00:00Z'),
            madeForKids: false,
            containsSyntheticMedia: true,
            instagramIntegrationId: mirror ? `ig-${serial++}` : null,
            instagramIntegrationName: mirror ? 'Synthetic Instagram' : null,
            snapshot: {
              packageHash: 'approved-hash',
              approvals: {},
              document: {} as any,
              media: {
                id: 'synthetic-video',
                path: 'https://example.org/video.mp4',
                name: 'video.mp4',
                durationSeconds: 45,
                width: 1080,
                height: 1920,
                sha256: 'synthetic-bytes',
              },
              youtube: {
                title: 'Synthetic video',
                description: 'Synthetic content',
                tags: [],
                internalId: 'yt-account',
              },
              ...(mirror
                ? {
                    instagram: {
                      internalId: 'same-instagram-account',
                      provider: 'instagram',
                      caption: 'Synthetic content',
                    },
                  }
                : {}),
            },
          },
        ]
      );
      return { project, batch: await repository.batch(org, batchId) };
    }

    it('reserves one shared OAuth allowance across two organizations atomically, before any item can start', async () => {
      const scope = `${namespace}-shared`;
      const first = await plan(orgIds[0], scope, false, {
        uploads: 1,
        otherUnits: 1000,
      });
      const second = await plan(orgIds[1], scope, false, {
        uploads: 1,
        otherUnits: 1000,
      });
      const attempts = await Promise.allSettled([
        repository.confirm(orgIds[0], first.batch.id, 1, 'user', estimate),
        repository.confirm(orgIds[1], second.batch.id, 1, 'user', estimate),
      ]);
      expect(
        attempts.filter((item) => item.status === 'fulfilled')
      ).toHaveLength(1);
      const row = await prisma.studioDistributionQuotaDay.findUniqueOrThrow({
        where: { scope_day: { scope, day: quotaDay } },
      });
      expect(row.uploadsReserved).toBe(1);
      expect(row.otherUnitsReserved).toBe(60);
      const batches = await prisma.studioDistributionBatch.findMany({
        where: { id: { in: [first.batch.id, second.batch.id] } },
        include: { items: true },
      });
      expect(
        batches.filter((batch) => batch.state === 'confirmed')
      ).toHaveLength(1);
      expect(batches.filter((batch) => batch.state === 'planned')).toHaveLength(
        1
      );
      expect(
        await prisma.studioPublication.count({
          where: { projectId: { in: [first.project.id, second.project.id] } },
        })
      ).toBe(1);
    });

    it('rejects stale approvals with no quota or publication reservation left behind', async () => {
      const { project, batch } = await plan(orgIds[0]);
      await prisma.studioProject.update({
        where: { id: project.id },
        data: { revision: 2, approvals: {} },
      });
      await expect(
        repository.confirm(orgIds[0], batch.id, 1, 'user', estimate)
      ).rejects.toThrow('aprovação');
      expect((await repository.batch(orgIds[0], batch.id)).state).toBe(
        'planned'
      );
      expect(
        await prisma.studioDistributionQuotaReservation.count({
          where: { batchId: batch.id },
        })
      ).toBe(0);
      expect(
        await prisma.studioPublication.count({
          where: { projectId: project.id },
        })
      ).toBe(0);
    });

    it('enforces tenant reads and composite database foreign keys', async () => {
      const { batch } = await plan(orgIds[0]);
      await expect(
        repository.batch(orgIds[1], batch.id)
      ).rejects.toBeInstanceOf(NotFoundException);
      const original = batch.items[0];
      await expect(
        prisma.studioDistributionItem.create({
          data: {
            organizationId: orgIds[1],
            batchId: batch.id,
            projectId: original.projectId,
            projectRevision: 1,
            packageHash: 'x',
            integrationId: 'x',
            integrationName: 'x',
            mediaId: 'x',
            title: 'x',
            publishAt: new Date(),
            madeForKids: false,
            containsSyntheticMedia: false,
            snapshot: {},
          },
        })
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('does not let cancellation overwrite an upload reservation that won the race', async () => {
      const { batch } = await plan(orgIds[0]);
      const confirmed = await repository.confirm(
        orgIds[0],
        batch.id,
        1,
        'user',
        estimate
      );
      const item = confirmed.items[0];
      const [claimed] = await Promise.allSettled([
        repository.claim(orgIds[0], item, 'upload_starting'),
        repository.cancel(orgIds[0], batch.id, confirmed.revision, 'user'),
      ]);
      const current = await repository.item(orgIds[0], item.id);
      if (claimed.status === 'fulfilled')
        expect(current.phase).toBe('upload_starting');
      else expect(current.phase).toBe('cancelled');
      const secondRepository = new StudioDistributionRepository(model, model);
      await expect(
        secondRepository.claim(orgIds[0], item, 'upload_starting')
      ).rejects.toThrow();
    });

    it('serializes the real Instagram account across organizations and preserves a durable duplicate key', async () => {
      const first = await plan(orgIds[0], undefined, true);
      const second = await plan(orgIds[1], undefined, true);
      const targetKey = `${namespace}-instagram-target`;
      targetKeys.push(targetKey);
      const mirrorKey = `${namespace}-same-youtube-video`;
      await prisma.studioDistributionItem.updateMany({
        where: {
          id: { in: [first.batch.items[0].id, second.batch.items[0].id] },
        },
        data: {
          phase: 'mirror_waiting',
          youtubeVideoId: 'youtube-video',
          youtubePublicConfirmedAt: new Date(),
        },
      });
      const a = await repository.item(orgIds[0], first.batch.items[0].id);
      const b = await repository.item(orgIds[1], second.batch.items[0].id);
      expect(
        (await repository.reserveMirror(orgIds[0], a, targetKey, mirrorKey))
          .allowed
      ).toBe(true);
      expect(
        (
          await repository.reserveMirror(
            orgIds[1],
            b,
            targetKey,
            `${mirrorKey}-other`
          )
        ).allowed
      ).toBe(false);
      const published = new Date();
      await repository.releaseMirror(orgIds[0], a.id, published);
      const paced = await repository.reserveMirror(
        orgIds[1],
        b,
        targetKey,
        `${mirrorKey}-other`
      );
      expect(paced.allowed).toBe(false);
      expect(paced.nextAt.getTime()).toBeGreaterThanOrEqual(
        published.getTime() + 3600000
      );
      await prisma.studioDistributionMirrorGate.update({
        where: { targetKey },
        data: { lastPublishedAt: new Date(Date.now() - 7200000) },
      });
      expect(
        await repository.reserveMirror(orgIds[1], b, targetKey, mirrorKey)
      ).toMatchObject({ allowed: false, duplicate: true });
    });

    it('counts the optional mirror as a second monthly reservation and rolls back the whole batch if it does not fit', async () => {
      const org = await prisma.organization.create({
        data: { name: `${namespace}-monthly-limit` },
      });
      orgIds.push(org.id);
      const { batch } = await plan(org.id, undefined, true);
      await expect(
        repository.confirm(org.id, batch.id, 1, 'user', estimate, {
          from: new Date('2020-01-01'),
          maximum: 1,
        })
      ).rejects.toThrow('limite de publicações');
      expect((await repository.batch(org.id, batch.id)).state).toBe('planned');
      expect(
        await prisma.studioDistributionQuotaReservation.count({
          where: { batchId: batch.id },
        })
      ).toBe(0);
    });

    it('shares the monthly counter with calendar posts and releases only a definitively failed target', async () => {
      const org = await prisma.organization.create({
        data: { name: `${namespace}-monthly-accounting` },
      });
      orgIds.push(org.id);
      const { batch } = await plan(org.id, undefined, true);
      const confirmed = await repository.confirm(
        org.id,
        batch.id,
        1,
        'user',
        estimate,
        { from: new Date('2020-01-01'), maximum: 10 }
      );
      const item = confirmed.items[0];
      const since = new Date('2020-01-01');
      const reserved = () =>
        countStudioDistributionReservations(prisma, org.id, since);
      await prisma.studioDistributionItem.update({
        where: { id: item.id },
        data: {
          phase: 'youtube_scheduled',
          youtubeVideoId: 'synthetic-video-id',
          youtubePrivacy: 'private',
        },
      });
      expect(await reserved()).toBe(2);

      await prisma.integration.create({
        data: {
          id: item.integrationId,
          organizationId: org.id,
          internalId: 'synthetic-youtube-account',
          name: 'Synthetic channel',
          providerIdentifier: 'youtube',
          type: 'social',
          token: 'synthetic-no-credentials',
        },
      });
      await prisma.post.create({
        data: {
          id: item.postId!,
          organizationId: org.id,
          integrationId: item.integrationId,
          publishDate: item.publishAt,
          content: 'Synthetic published content',
          group: `${namespace}-monthly-post`,
          state: 'PUBLISHED',
        },
      });
      await prisma.studioDistributionItem.update({
        where: { id: item.id },
        data: {
          phase: 'uncertain',
          youtubePrivacy: 'public',
          youtubePublicConfirmedAt: new Date(),
        },
      });
      expect(await reserved()).toBe(1);

      await prisma.studioDistributionItem.update({
        where: { id: item.id },
        data: { phase: 'failed', instagramReservationReleased: true },
      });
      expect(await reserved()).toBe(0);
      expect(
        await prisma.post.count({
          where: { organizationId: org.id, state: 'PUBLISHED' },
        })
      ).toBe(1);

      // A public remote result remains billable if the local Post was lost,
      // even when a stale release flag exists on that target.
      await prisma.post.delete({ where: { id: item.postId! } });
      await prisma.studioDistributionItem.update({
        where: { id: item.id },
        data: { youtubeReservationReleased: true },
      });
      expect(await reserved()).toBe(1);

      await prisma.studioDistributionItem.update({
        where: { id: item.id },
        data: { youtubePublicConfirmedAt: null },
      });
      expect(await reserved()).toBe(0);
    });
  }
);
