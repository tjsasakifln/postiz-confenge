import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { StudioIdentityDto } from '@gitroom/nestjs-libraries/dtos/studio/studio.dto';

const legacy = () => ({
  audience: 'Compradores',
  positioning: 'Projetos',
  tone: 'Claro',
  visualStyle: 'Sóbrio',
  evidence: [],
  hypotheses: [],
});
const check = (value: object) =>
  validate(plainToInstance(StudioIdentityDto, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('Identidade editorial estruturada e compatibilidade', () => {
  it('accepts old identities without inventing language, schedule, narration or audience declarations', async () => {
    const identity = plainToInstance(StudioIdentityDto, legacy());
    expect(
      await validate(identity, { whitelist: true, forbidNonWhitelisted: true })
    ).toEqual([]);
    expect(identity.language).toBeUndefined();
    expect(identity.schedule).toBeUndefined();
    expect(identity.narration).toBeUndefined();
    expect(identity).not.toHaveProperty('madeForKids');
    expect(identity).not.toHaveProperty('containsSyntheticMedia');
  });

  it('validates language, voice, brand and a local weekly schedule together', async () => {
    expect(
      await check({
        ...legacy(),
        language: 'es',
        narration: { provider: 'local' },
        brandName: 'Marca autorizada',
        primaryColor: '#132128',
        secondaryColor: '#f9733d',
        fontFamily: 'sans',
        channel: { platform: 'youtube', integrationId: 'account-test' },
        schedule: {
          timezone: 'America/Sao_Paulo',
          weeklyFrequency: 2,
          slots: [
            { dayOfWeek: 1, time: '09:00' },
            { dayOfWeek: 4, time: '14:30' },
          ],
        },
      })
    ).toEqual([]);
  });

  it('rejects invalid zones, duplicate slots and undocumented declarations in the reusable model', async () => {
    expect(
      await check({
        ...legacy(),
        schedule: { timezone: 'Mars/Base', slots: [] },
      })
    ).not.toEqual([]);
    expect(
      await check({
        ...legacy(),
        schedule: {
          timezone: 'UTC',
          slots: [
            { dayOfWeek: 1, time: '09:00' },
            { dayOfWeek: 1, time: '09:00' },
          ],
        },
      })
    ).not.toEqual([]);
    expect(
      await check({
        ...legacy(),
        schedule: { timezone: 'UTC', slots: [{ dayOfWeek: 7, time: '25:61' }] },
      })
    ).not.toEqual([]);
    expect(
      await check({
        ...legacy(),
        madeForKids: false,
        containsSyntheticMedia: false,
      })
    ).not.toEqual([]);
  });
});
