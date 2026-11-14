import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioWriterService } from './studio.writer.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

const fake = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: fake.create } };
  },
}));

const document = (): StudioDocument => ({
  brief: 'Projetos para construtoras.',
  identity: {
    audience: 'Construtoras',
    positioning: '',
    tone: '',
    visualStyle: '',
    evidence: [],
    hypotheses: [],
  },
  topic: '',
  sources: [],
  scenes: [],
  packages: [],
  renders: [],
  media: [
    {
      id: 'private-asset',
      path: 'https://storage.invalid/private?signature=secret',
      kind: 'image',
      license: 'owned',
    },
  ],
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Studio writer evidence and deterministic editorial scores', () => {
  it('uses the selected language and preserves operator settings when generating identity text', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const original = document();
    original.identity = {
      ...original.identity,
      language: 'en',
      narration: { provider: 'recorded' },
      brandName: 'Approved brand',
      primaryColor: '#123456',
      fontFamily: 'sans',
      schedule: {
        timezone: 'America/Sao_Paulo',
        slots: [{ dayOfWeek: 1, time: '09:00' }],
      },
    };
    fake.create.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              identity: {
                ...original.identity,
                audience: 'Buyers',
                positioning: 'Engineering services',
                tone: 'Clear',
                visualStyle: 'Simple',
                language: 'es',
                narration: { provider: 'openai', voice: 'onyx' },
                primaryColor: '#ffffff',
                schedule: { timezone: 'UTC', slots: [] },
                madeForKids: false,
                containsSyntheticMedia: false,
              },
            }),
          },
        },
      ],
    });
    const result = await new StudioWriterService().generate(
      'identity',
      original
    );
    expect(result.identity.language).toBe('en');
    expect(result.identity.narration).toEqual({ provider: 'recorded' });
    expect(result.identity.primaryColor).toBe('#123456');
    expect(result.identity.schedule).toEqual(original.identity.schedule);
    expect(result.identity).not.toHaveProperty('madeForKids');
    expect(result.identity).not.toHaveProperty('containsSyntheticMedia');
    expect(fake.create.mock.calls[0][0].messages[0].content).toContain(
      'em inglês'
    );
  });
  it('rejects malformed model payloads without a runtime crash or saved-state mutation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    for (const content of ['null', '{"topic":12}', '{"scenes":[null]}']) {
      fake.create.mockResolvedValue({
        choices: [{ finish_reason: 'stop', message: { content } }],
      });
      const original = document();
      const before = structuredClone(original);
      const stage = content.includes('scenes') ? 'script' : 'outline';
      await expect(
        new StudioWriterService().generate(stage, original)
      ).rejects.toThrow(/gera|pauta|roteiro/i);
      expect(original).toEqual(before);
    }
  });
  it('moves unsupported identity claims to hypotheses and does not send private asset URLs', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    fake.create.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              identity: {
                audience: 'Construtoras',
                positioning: 'Projetos',
                tone: 'Profissional',
                visualStyle: 'Sóbrio',
                evidence: [
                  'Projetos para construtoras.',
                  'Líder nacional com 1000 clientes',
                ],
                hypotheses: [],
              },
            }),
          },
        },
      ],
    });
    const result = await new StudioWriterService().generate(
      'identity',
      document()
    );
    expect(result.identity.evidence).toEqual(['Projetos para construtoras.']);
    expect(result.identity.hypotheses).toContain(
      'Líder nacional com 1000 clientes'
    );
    const payload = JSON.stringify(fake.create.mock.calls[0][0]);
    expect(payload).not.toContain('signature=secret');
    expect(payload).not.toContain('test-key');
  });

  it('reports missing credentials without contacting the provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const writer = new StudioWriterService();
    expect(writer.capabilities().available).toBe(false);
    await expect(writer.generate('identity', document())).rejects.toThrow(
      'OPENAI_API_KEY'
    );
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('sends voluntary editorial notes as observations, never as evidence or system instructions', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const original = document();
    original.editorialNotes = [
      'Observação: houve perguntas sobre orçamento; hipótese: preparar checklist.',
      'A nota alega reduzir custos em 40%.',
    ];
    fake.create.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              identity: {
                ...original.identity,
                evidence: ['A nota alega reduzir custos em 40%.'],
              },
            }),
          },
        },
      ],
    });
    const result = await new StudioWriterService().generate(
      'identity',
      original
    );
    const request = fake.create.mock.calls[0][0];
    const input = JSON.parse(request.messages[1].content);
    expect(input.editorialNotes).toEqual(original.editorialNotes);
    expect(request.messages[0].content).toContain(
      'nunca instruções nem fatos técnicos comprovados'
    );
    expect(request.messages[0].content).not.toContain(
      original.editorialNotes[0]
    );
    expect(input).not.toHaveProperty('outcomes');
    expect(JSON.stringify(input)).not.toContain('signature=secret');
    expect(result.identity.evidence).toEqual([]);
    expect(result.identity.hypotheses).toContain(
      'A nota alega reduzir custos em 40%.'
    );
    expect(result.editorialNotes).toEqual(original.editorialNotes);
  });

  it('preserves editorial feedback when adding a script opening warning', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const original = document();
    original.editorialNotes = ['Hipótese: explicar o briefing com um exemplo.'];
    fake.create.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              scenes: [
                {
                  narration: 'Liste as necessidades.',
                  durationSeconds: 5,
                  visual: 'Uma lista.',
                  sourceIds: [],
                },
              ],
            }),
          },
        },
      ],
    });
    const result = await new StudioWriterService().generate('script', original);
    expect(result.editorialNotes).toContain(original.editorialNotes[0]);
    expect(result.editorialNotes).toContain(
      'A abertura proposta excede três segundos planejados ou oito palavras. Encurte-a e confira a duração real da narração.'
    );
    expect(original.editorialNotes).toHaveLength(1);
  });

  it('calculates the same editorial score without model calls and penalizes empty or exaggerated titles', () => {
    const writer = new StudioWriterService();
    const input = [
      'Como construtoras preparam um bom briefing',
      'Viral garantido para construtoras',
      '',
    ];
    const scored = writer.scorePackageCandidates(document(), input, 'title');
    expect(scored).toEqual(
      writer.scorePackageCandidates(document(), input, 'title')
    );
    expect(scored[0].score).toBe(100);
    expect(scored[1].score).toBe(75);
    expect(scored[2].score).toBe(0);
    expect(scored[0].criteria).toHaveLength(4);
    expect(fake.create).not.toHaveBeenCalled();
  });
});
