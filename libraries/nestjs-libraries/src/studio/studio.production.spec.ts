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
import { StudioProductionService } from './studio.production.service';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

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
    const captionText = result.srt.split('\n').filter((line: string) => line && !/^\d+$/.test(line) && !line.includes('-->')).join(' ');
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
  });
});
