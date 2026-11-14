import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { StudioRepository } from '@gitroom/nestjs-libraries/database/prisma/studio/studio.repository';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

// Opt in only for a disposable database. Never writes to a developer's default database.
describe.skipIf(process.env.STUDIO_DATABASE_TESTS !== 'true')(
  'Studio PostgreSQL persistence',
  () => {
    const prisma = new PrismaClient();
    const model = { model: prisma } as any;
    const repository = new StudioRepository(
      model,
      model,
      model,
      model,
      model,
      model
    );
    const orgIds: string[] = [];
    const doc: StudioDocument = {
      brief: 'Isolated database test',
      identity: {
        audience: '',
        positioning: '',
        tone: '',
        visualStyle: '',
        evidence: [],
        hypotheses: [],
      },
      sources: [],
      topic: '',
      scenes: [],
      packages: [],
      media: [],
      renders: [],
    };
    beforeAll(async () => {
      for (let i = 0; i < 2; i++)
        orgIds.push(
          (
            await prisma.organization.create({
              data: { name: `Studio test ${i}` },
            })
          ).id
        );
    });
    afterAll(async () => {
      await prisma.studioProject.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.$disconnect();
    });

    it('isolates tenants and permits exactly one concurrent update of a revision', async () => {
      const project = await repository.create(
        orgIds[0],
        'test-user',
        'Test project',
        doc
      );
      expect(await repository.get(orgIds[1], project.id)).toBeNull();
      const writes = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          repository.updateDocument(
            orgIds[0],
            project.id,
            project.revision,
            `Update ${i}`,
            doc,
            {},
            'test-user',
            'test'
          )
        )
      );
      expect(
        writes.filter((write) => write.status === 'fulfilled')
      ).toHaveLength(1);
      const saved = await repository.get(orgIds[0], project.id);
      expect(saved!.revision).toBe(project.revision + 1);
      expect(saved!.events).toHaveLength(2);
    });

    it('records a received lead once under concurrent external retries and rejects conflicting reuse', async () => {
      const project = await repository.create(
        orgIds[0],
        'test-user',
        'Lead source',
        doc
      );
      const other = await repository.create(
        orgIds[0],
        'test-user',
        'Other source',
        doc
      );
      const elsewhere = await repository.create(
        orgIds[1],
        'test-user',
        'Other organization',
        doc
      );
      const lead = {
        externalId: 'form-event-1',
        stage: 'lead' as const,
        currency: 'BRL',
        reference: 'contact-1',
        note: 'utm_source=linkedin',
        occurredAt: '2026-01-01T12:00:00Z',
      };
      await Promise.all(
        Array.from({ length: 5 }, () =>
          repository.outcome(orgIds[0], project.id, 'api:studio-agent', lead)
        )
      );
      expect(
        await prisma.studioOutcome.count({
          where: { organizationId: orgIds[0], externalId: lead.externalId },
        })
      ).toBe(1);
      const saved = await repository.get(orgIds[0], project.id);
      expect(saved!.outcomes[0].stage).toBe('lead');
      expect(
        saved!.events.filter((event) => event.action === 'outcome:lead')
      ).toHaveLength(1);
      await expect(
        repository.outcome(orgIds[0], project.id, 'api:studio-agent', {
          ...lead,
          stage: 'contract',
          valueCents: 50000,
        })
      ).rejects.toThrow('evento diferente');
      await expect(
        repository.outcome(orgIds[0], other.id, 'api:studio-agent', lead)
      ).rejects.toThrow('evento diferente');
      await repository.outcome(
        orgIds[1],
        elsewhere.id,
        'api:studio-agent',
        lead
      );
      expect(
        await prisma.studioOutcome.count({
          where: { organizationId: orgIds[1], externalId: lead.externalId },
        })
      ).toBe(1);
    });

    it('does not let the same external event be attributed to two projects racing concurrently', async () => {
      const first = await repository.create(
        orgIds[0],
        'test-user',
        'Race one',
        doc
      );
      const second = await repository.create(
        orgIds[0],
        'test-user',
        'Race two',
        doc
      );
      const lead = {
        externalId: 'form-event-race',
        stage: 'lead' as const,
        currency: 'BRL',
        reference: 'contact-race',
        note: '',
        occurredAt: '2026-01-01T12:00:00Z',
      };
      const results = await Promise.allSettled(
        [first, second].map((project) =>
          repository.outcome(orgIds[0], project.id, 'api:studio-agent', lead)
        )
      );
      expect(
        results.filter((result) => result.status === 'fulfilled')
      ).toHaveLength(1);
      expect(
        await prisma.studioOutcome.count({
          where: { organizationId: orgIds[0], externalId: lead.externalId },
        })
      ).toBe(1);
    });
  }
);
