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
  }
);
