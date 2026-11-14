import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StudioProductionService,
  resolveStudioRenderOptions,
} from './studio.production.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';
import sharp from 'sharp';

const execute = promisify(execFile);
let dir: string;
let service: StudioProductionService;
const files = new Map<string, any>();
const repository = {
  getMediaStatus: vi.fn(async (org: string, id: string) =>
    org === 'org-a' ? files.get(id) : undefined
  ),
  saveFile: vi.fn(async (_org: string, name: string, path: string) => {
    const saved = { id: `saved-${files.size}`, name, path, status: 'ready' };
    files.set(saved.id, saved);
    return saved;
  }),
};
function document(): StudioDocument {
  return {
    brief: 'Teste local sem cliente ou dado comercial.',
    identity: {
      audience: 'Compradores',
      positioning: 'Teste de produção',
      tone: 'Claro',
      visualStyle: '#f9733d',
      evidence: [],
      hypotheses: [],
    },
    sources: [],
    topic: 'Revisão de projeto',
    packages: [],
    renders: [],
    media: [{ id: 'audio', kind: 'audio', license: 'owned' }],
    scenes: [
      {
        id: 'scene-1',
        narration: 'Uma revisão antes da obra.',
        pronunciation: 'Pronúncia separada que não entra na legenda.',
        visual: 'Revisão do projeto',
        durationSeconds: 1.2,
        sourceIds: [],
        kind: 'card',
        audioMediaId: 'audio',
      },
    ],
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'postiz-studio-test-'));
  await mkdir(join(dir, 'uploads'));
  vi.stubEnv('UPLOAD_DIRECTORY', join(dir, 'uploads'));
  vi.stubEnv('FRONTEND_URL', 'https://studio.test');
  vi.stubEnv('STORAGE_PROVIDER', 'local');
  vi.stubEnv('OPENAI_API_KEY', '');
  await execute('ffmpeg', [
    '-nostdin',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1.2',
    '-c:a',
    'pcm_s16le',
    join(dir, 'uploads', 'audio.wav'),
  ]);
  files.set('audio', {
    id: 'audio',
    name: 'audio.wav',
    path: 'https://studio.test/uploads/audio.wav',
    status: 'ready',
  });
  service = new StudioProductionService(repository as any);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('Studio production with real FFmpeg and recorded audio', () => {
  it('uses the approved narration provider and refuses a switch to paid speech or missing recorded audio', () => {
    const doc = document();
    doc.identity.narration = { provider: 'local' };
    expect(
      resolveStudioRenderOptions(doc, { format: 'vertical' })
    ).toMatchObject({ voice: 'local', language: 'pt-BR' });
    expect(() =>
      resolveStudioRenderOptions(doc, { format: 'vertical', voice: 'nova' })
    ).toThrow('identidade aprovada');
    doc.identity.narration = { provider: 'recorded' };
    expect(
      resolveStudioRenderOptions(doc, { format: 'vertical' }).voice
    ).toBeUndefined();
    delete doc.scenes[0].audioMediaId;
    expect(() =>
      resolveStudioRenderOptions(doc, { format: 'vertical' })
    ).toThrow('áudio gravado');
    doc.identity.narration = { provider: 'openai', voice: 'onyx' };
    expect(resolveStudioRenderOptions(doc, { format: 'vertical' }).voice).toBe(
      'onyx'
    );
    expect(() =>
      resolveStudioRenderOptions(doc, { format: 'vertical', voice: 'local' })
    ).toThrow('identidade aprovada');
  });
  it('creates a consistent logo, avatar, banner and transparent watermark', async () => {
    const doc = document();
    doc.identity.brandName = 'MARCA DE TESTE';
    doc.identity.primaryColor = '#1367c2';
    doc.identity.fontFamily = 'serif';
    const files = await service.images('org-a', doc, 'brand-kit', {
      variant: 2,
    });
    expect(files).toHaveLength(4);
    const expected = [
      [1200, 320],
      [800, 800],
      [2560, 1440],
      [150, 150],
    ];
    for (const [index, file] of files.entries()) {
      const path = join(dir, 'uploads', file.path.split('/uploads/')[1]);
      const info = await sharp(path).metadata();
      expect([info.width, info.height]).toEqual(expected[index]);
      if (index === 3) {
        expect(info.hasAlpha).toBe(true);
        const { data, info: raw } = await sharp(path)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(data[raw.channels - 1]).toBe(0);
      }
    }
  });

  it('extracts three licensed video frames into vertical covers and rejects other organizations', async () => {
    const rendered = await service.render('org-a', document(), {
      format: 'square',
    });
    const doc = document();
    doc.media.push({
      id: rendered.id,
      kind: 'video',
      license: 'licensed',
      sourceUrl: 'https://example.com/license',
      attribution: 'Referência de teste.',
    });
    const options = { mediaId: rendered.id, format: 'vertical' as const };
    const covers = await service.images('org-a', doc, 'frame-covers', options);
    expect(covers).toHaveLength(3);
    for (const cover of covers) {
      const info = await sharp(
        join(dir, 'uploads', cover.path.split('/uploads/')[1])
      ).metadata();
      expect([info.width, info.height]).toEqual([1080, 1920]);
      expect(cover.license).toBe('licensed');
      expect(cover.sourceUrl).toBe('https://example.com/license');
      expect(cover.attribution).toContain(rendered.id);
    }
    await expect(
      service.images('org-b', doc, 'frame-covers', options)
    ).rejects.toThrow('organização');
  });

  it('uses local speech without an API key when espeak-ng is installed', async ({
    skip,
  }) => {
    if (!(await service.capabilities()).localVoice) {
      skip();
      return;
    }
    const doc = document();
    delete doc.scenes[0].audioMediaId;
    doc.scenes[0].narration = 'Uma revisão de teste.';
    delete doc.scenes[0].pronunciation;
    const result = await service.render('org-a', doc, {
      format: 'horizontal',
      voice: 'local',
      language: 'pt-BR',
    });
    expect(result.durationSeconds).toBeGreaterThan(0.5);
    expect(result.subtitles).toContain('Uma revisão de teste.');
  });
  for (const [format, width, height] of [
    ['vertical', 1080, 1920],
    ['horizontal', 1920, 1080],
    ['square', 1080, 1080],
  ] as const) {
    it(`exports playable ${format} video, audible track and clean captions`, async () => {
      const result = await service.render('org-a', document(), {
        format,
        maxDurationSeconds: 1,
      });
      const path = join(dir, 'uploads', result.path.split('/uploads/')[1]);
      const { stdout } = await execute('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        path,
      ]);
      const info = JSON.parse(stdout);
      const video = info.streams.find(
        (stream: any) => stream.codec_type === 'video'
      );
      expect([video.width, video.height, video.codec_name]).toEqual([
        width,
        height,
        'h264',
      ]);
      expect(
        info.streams.some((stream: any) => stream.codec_type === 'audio')
      ).toBe(true);
      expect(Number(info.format.duration)).toBeLessThanOrEqual(1.1);
      expect(result.subtitles).toContain('00:00:01,000');
      expect(result.subtitles).toContain('Uma revisão antes da obra.');
      expect(result.subtitles).not.toContain('Pronúncia');
      expect(result.sourcesSceneIds).toEqual(['scene-1']);
    });
  }

  it('generates three usable PNG covers and a carousel', async () => {
    const covers = await service.images('org-a', document(), 'thumbnails');
    expect(covers).toHaveLength(3);
    const bytes = await readFile(
      join(dir, 'uploads', covers[0].path.split('/uploads/')[1])
    );
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(await service.images('org-a', document(), 'carousel')).toHaveLength(
      1
    );
  });

  it('mixes an optional original sound without extending narration or captions', async () => {
    const doc = document();
    doc.scenes[0].soundEffect = 'chime';
    const video = await service.render('org-a', doc, { format: 'square' });
    expect(video.durationSeconds).toBeGreaterThan(1.1);
    expect(video.durationSeconds).toBeLessThan(1.3);
    expect(video.subtitles).toContain('Uma revisão antes da obra.');
  });

  it('rejects assets from another organization before rendering', async () => {
    await expect(
      service.render('org-b', document(), { format: 'vertical' })
    ).rejects.toThrow('organização');
  });

  it('requires recorded media rights and a reference for a licensed asset', async () => {
    const doc = document();
    doc.media = [];
    await expect(
      service.render('org-a', doc, { format: 'vertical' })
    ).rejects.toThrow('direito de uso');
    doc.media = [{ id: 'audio', kind: 'audio', license: 'licensed' }];
    await expect(
      service.render('org-a', doc, { format: 'vertical' })
    ).rejects.toThrow('licença');
  });

  it('blocks symbolic links outside the uploads directory', async () => {
    await writeFile(join(dir, 'private.txt'), 'not an asset');
    await symlink(join(dir, 'private.txt'), join(dir, 'uploads', 'link.wav'));
    files.set('escape', {
      id: 'escape',
      name: 'link.wav',
      path: 'https://studio.test/uploads/link.wav',
      status: 'ready',
    });
    const doc = document();
    doc.media.push({ id: 'escape', kind: 'audio', license: 'owned' });
    doc.scenes[0].audioMediaId = 'escape';
    await expect(
      service.render('org-a', doc, { format: 'vertical' })
    ).rejects.toThrow('Origem');
  });

  it('does not invent an available voice when no audio or API key exists', async () => {
    const doc = document();
    delete doc.scenes[0].audioMediaId;
    await expect(
      service.render('org-a', doc, { format: 'vertical' })
    ).rejects.toThrow('OPENAI_API_KEY');
  });

  it('rejects a playlist disguised as recorded audio before FFmpeg can open its references', async () => {
    await writeFile(
      join(dir, 'uploads', 'playlist.wav'),
      '#EXTM3U\n#EXTINF:2,\nhttp://127.0.0.1/private\n'
    );
    files.set('playlist', {
      id: 'playlist',
      name: 'playlist.wav',
      path: 'https://studio.test/uploads/playlist.wav',
      status: 'ready',
    });
    const doc = document();
    doc.media.push({ id: 'playlist', kind: 'audio', license: 'owned' });
    doc.scenes[0].audioMediaId = 'playlist';
    await expect(
      service.render('org-a', doc, { format: 'vertical' })
    ).rejects.toThrow('playlists');
  });

  it('preserves long recorded narration in subtitles without a hidden 100-line cap', () => {
    const doc = document();
    doc.scenes[0].narration =
      'Uma legenda longa. '.repeat(400) + 'FINAL VISÍVEL';
    const result = (service as any).captions(
      [{ scene: doc.scenes[0], seconds: 300 }],
      'vertical'
    );
    const captionText = result.srt
      .split('\n')
      .filter(
        (line: string) => line && !/^\d+$/.test(line) && !line.includes('-->')
      )
      .join(' ');
    expect(captionText).toContain('FINAL VISÍVEL');
  });

  it('measures uploaded reference metadata and labels limits of cut detection', async () => {
    const rendered = await service.render('org-a', document(), {
      format: 'square',
    });
    const doc = document();
    doc.media.push({ id: rendered.id, kind: 'video', license: 'owned' });
    const result = await service.measureStyle('org-a', doc, rendered.id);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.durationSeconds).toBeGreaterThan(1);
    expect(result.meanFirstFrameColor).toMatch(/^#[a-f0-9]{6}$/);
    expect(result.limitations).toContain('aproximação');
    const inspected = await service.inspectForDistribution(
      'org-a',
      doc,
      rendered.id
    );
    expect([inspected.width, inspected.height]).toEqual([1080, 1080]);
    expect(inspected.durationSeconds).toBeGreaterThan(1);
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
    const repeat = await service.inspectForDistribution(
      'org-a',
      doc,
      rendered.id
    );
    expect(repeat.sha256).toBe(inspected.sha256);
    await expect(
      service.inspectForDistribution('org-b', doc, rendered.id)
    ).rejects.toThrow('organização');
  });
});
