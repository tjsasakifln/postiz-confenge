import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import type {
  StudioDocument,
  StudioAsset,
  StudioFormat,
  StudioRender,
  StudioScene,
} from '@gitroom/helpers/studio/studio.types';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp, { type Metadata as SharpMetadata } from 'sharp';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import {
  studioBrand,
  studioBrandImage,
  studioFrameCover,
} from './studio.visuals';
import { writeStudioSound } from './studio.sound-effects';

const execute = promisify(execFile);
const dimensions: Record<StudioFormat, [number, number]> = {
  vertical: [1080, 1920],
  horizontal: [1920, 1080],
  square: [1080, 1080],
};
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[
        char
      ]!)
  );
const assText = (value: string) =>
  value.replace(/[{}\\]/g, '').replace(/\r?\n/g, '\\N');
const maxAssetBytes = 256 * 1024 * 1024;
const mediaFormats =
  'mov,mp3,wav,ogg,flac,aac,png_pipe,jpeg_pipe,webp_pipe,image2';
const safeInputs = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  mediaFormats,
];
// Bound concurrency across all requests handled by this worker, including batches.
const renderLimit = pLimit(2);

export interface StudioRenderOptions {
  format: StudioFormat;
  sceneIds?: string[];
  voice?: 'alloy' | 'nova' | 'onyx' | 'shimmer' | 'local';
  language?: 'pt-BR' | 'en' | 'es';
  maxDurationSeconds?: number;
}

export function resolveStudioRenderOptions(
  document: StudioDocument,
  requested: StudioRenderOptions
): StudioRenderOptions {
  const narration = document.identity.narration;
  const language = requested.language || document.identity.language || 'pt-BR';
  if (
    document.identity.language &&
    requested.language &&
    requested.language !== document.identity.language
  )
    throw new BadRequestException(
      'O idioma difere da identidade aprovada. Atualize e revise a identidade antes de produzir.'
    );
  if (!narration) return { ...requested, language };
  const expected =
    narration.provider === 'local'
      ? 'local'
      : narration.provider === 'openai'
      ? narration.voice || 'nova'
      : undefined;
  if (requested.voice !== undefined && requested.voice !== expected)
    throw new BadRequestException(
      'A voz difere da identidade aprovada. Atualize e revise a identidade antes de produzir.'
    );
  if (narration.provider === 'recorded') {
    const scenes = requested.sceneIds?.length
      ? requested.sceneIds.map((id) =>
          document.scenes.find((scene) => scene.id === id)
        )
      : document.scenes;
    if (!scenes.length || scenes.some((scene) => !scene?.audioMediaId))
      throw new BadRequestException(
        'A identidade exige áudio gravado em todas as cenas selecionadas.'
      );
  }
  return { ...requested, voice: expected, language };
}

export interface StudioImageOptions {
  mediaId?: string;
  format?: 'vertical' | 'horizontal';
  brandName?: string;
  variant?: number;
}
type StudioGeneratedAsset = StudioAsset & { path: string; name: string };

@Injectable()
export class StudioProductionService {
  constructor(private readonly media: MediaRepository) {}

  async capabilities() {
    let localVoice = false;
    try {
      await execute('espeak-ng', ['--version'], { timeout: 5000 });
      localVoice = true;
    } catch {
      /* Voice is optional; recorded audio remains available. */
    }
    try {
      await execute('ffmpeg', ['-version'], { timeout: 5000 });
      await execute('ffprobe', ['-version'], { timeout: 5000 });
      return {
        available: true,
        localVoice,
        openaiVoice: Boolean(process.env.OPENAI_API_KEY),
        images: true,
        reason: process.env.OPENAI_API_KEY
          ? 'FFmpeg e narração configurados. Cada geração usa a conta do provedor.'
          : localVoice
          ? 'FFmpeg e voz local disponíveis. Voz local funciona sem cobrança de API; confira sua qualidade antes de publicar.'
          : 'FFmpeg disponível. Use áudio gravado, instale espeak-ng para voz local ou configure OPENAI_API_KEY para narração.',
      };
    } catch {
      return {
        available: false,
        localVoice,
        openaiVoice: Boolean(process.env.OPENAI_API_KEY),
        images: true,
        reason: 'Instale FFmpeg e ffprobe no servidor de produção de mídia.',
      };
    }
  }

  private async run(args: string[], cwd: string) {
    try {
      const constrained = args.flatMap((arg, index) =>
        arg === '-i'
          ? [
              '-protocol_whitelist',
              'file,pipe',
              '-format_whitelist',
              args[index + 1] === 'concat.txt' ? 'concat,mov' : mediaFormats,
              arg,
            ]
          : [arg]
      );
      return await execute(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          ...constrained,
        ],
        { cwd, timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024 }
      );
    } catch {
      // Do not return provider URLs, filesystem paths or subprocess output to users.
      throw new BadRequestException(
        'Não foi possível montar a mídia. Confira formato, duração e os arquivos de origem.'
      );
    }
  }

  private async duration(path: string) {
    const { stdout } = await execute(
      'ffprobe',
      [
        '-v',
        'error',
        ...safeInputs,
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        path,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    const seconds = Number(JSON.parse(stdout).format?.duration);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 900)
      throw new BadRequestException(
        'A mídia precisa ter duração entre zero e quinze minutos.'
      );
    return seconds;
  }

  /** Only media owned by this organization and explicitly licensed in this project is readable. */
  private async material(
    orgId: string,
    document: StudioDocument,
    id: string,
    destination: string,
    kind: 'image' | 'video' | 'audio'
  ) {
    const license = document.media.find(
      (asset) => asset.id === id && asset.kind === kind
    );
    if (
      !license ||
      !['owned', 'licensed', 'public-domain'].includes(license.license)
    )
      throw new BadRequestException(
        'Registre a origem e o direito de uso da mídia antes de produzir.'
      );
    if (license.license === 'licensed' && !license.sourceUrl)
      throw new BadRequestException(
        'A mídia licenciada precisa da referência da licença.'
      );
    const item = await this.media.getMediaStatus(orgId, id);
    if (!item || item.status !== 'ready')
      throw new BadRequestException('Mídia indisponível nesta organização.');
    if ((process.env.STORAGE_PROVIDER || 'local') === 'local') {
      const prefix = `${process.env.FRONTEND_URL}/uploads/`;
      if (!item.path.startsWith(prefix))
        throw new BadRequestException('Origem de mídia inválida.');
      const base = await realpath(
        resolve(process.env.UPLOAD_DIRECTORY || 'uploads')
      );
      const path = await realpath(
        resolve(base, item.path.slice(prefix.length))
      );
      if (!path.startsWith(base + sep))
        throw new BadRequestException('Origem de mídia inválida.');
      const info = await stat(path);
      if (!info.isFile() || info.size > maxAssetBytes)
        throw new BadRequestException('Arquivo maior que o limite de 256 MB.');
      await pipeline(
        createReadStream(path),
        createWriteStream(destination, { flags: 'wx' })
      );
    } else {
      const storage = UploadFactory.createStorage();
      if (!storage.signDownloadUrl)
        throw new BadRequestException('Armazenamento sem leitura assinada.');
      const url = await storage.signDownloadUrl(item.name);
      if (new URL(url).protocol !== 'https:')
        throw new BadRequestException('Origem de mídia inválida.');
      const response = await fetch(url, {
        // @ts-ignore undici extends the standard fetch options
        dispatcher: ssrfSafeDispatcher,
        redirect: 'error',
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok || !response.body)
        throw new BadRequestException('Não foi possível ler a mídia.');
      let bytes = 0;
      await pipeline(
        Readable.fromWeb(response.body as any),
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            callback(
              bytes > maxAssetBytes
                ? new Error('Media size limit exceeded')
                : null,
              chunk
            );
          },
        }),
        createWriteStream(destination, { flags: 'wx' })
      );
    }
    // Match the CommonJS bridge used by Postiz's existing upload providers.
    const { fileTypeFromFile } = require('file-type') as {
      fileTypeFromFile: (path: string) => Promise<{ mime: string } | undefined>;
    };
    const type = await fileTypeFromFile(destination);
    const allowed = {
      image: ['image/png', 'image/jpeg', 'image/webp'],
      video: ['video/mp4'],
      audio: [
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'audio/mp4',
        'audio/ogg',
      ],
    };
    if (!type || !allowed[kind].includes(type.mime))
      throw new BadRequestException(
        'Formato de mídia inválido. Use PNG/JPEG/WebP, MP4 ou áudio WAV/MP3/M4A/OGG, sem playlists.'
      );
    return destination;
  }

  private async save(
    orgId: string,
    path: string,
    kind: 'image' | 'video',
    name: string,
    imageFormat: 'png' | 'jpeg' = 'png'
  ) {
    if (kind === 'image' && imageFormat === 'jpeg') {
      const destination = `${path}.jpg`;
      await sharp(path)
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .jpeg({ quality: 90 })
        .toFile(destination);
      path = destination;
    }
    const storage = UploadFactory.createStorage();
    const uploaded = await storage.uploadStream(
      createReadStream(path),
      kind === 'video' ? 'video/mp4' : `image/${imageFormat}`,
      kind === 'video' ? 'mp4' : imageFormat === 'jpeg' ? 'jpg' : 'png'
    );
    return this.media.saveFile(orgId, uploaded.filename, uploaded.path, name);
  }

  /** Check the approved asset before reserving a publication; never convert it after approval. */
  async assertInstagramImage(
    orgId: string,
    document: StudioDocument,
    mediaId: string,
    role: 'post' | 'cover'
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-instagram-image-'));
    try {
      const path = await this.material(
        orgId,
        document,
        mediaId,
        join(dir, 'image'),
        'image'
      );
      if ((await stat(path)).size > 8 * 1024 * 1024)
        throw new BadRequestException(
          'A imagem do Instagram precisa ter no máximo 8 MB. Exporte um JPEG menor e aprove o pacote novamente.'
        );
      let metadata: SharpMetadata;
      try {
        metadata = await sharp(path).metadata();
      } catch {
        throw new BadRequestException(
          'A imagem do Instagram não pôde ser lida. Selecione um JPEG válido e aprove o pacote novamente.'
        );
      }
      if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height)
        throw new BadRequestException(
          'O Instagram exige JPEG nas imagens e capas. Gere uma nova capa ou exporte a imagem em JPEG e aprove o pacote novamente.'
        );
      const width = metadata.autoOrient?.width || metadata.width;
      const height = metadata.autoOrient?.height || metadata.height;
      const ratio = width / height;
      if (role === 'post' && (ratio < 4 / 5 || ratio > 1.91))
        throw new BadRequestException(
          'A imagem do post Instagram precisa ter proporção entre 4:5 e 1,91:1. Ajuste a composição e aprove o pacote novamente.'
        );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private lines(value: string, width: number, maximum: number) {
    const result: string[] = [];
    let line = '';
    for (const word of value
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((word) => word.match(new RegExp(`.{1,${width}}`, 'gu')) || [])) {
      if (line.length + word.length > width && line) {
        result.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + word;
    }
    if (line) result.push(line);
    return result
      .slice(0, maximum)
      .map((text, i) =>
        i === maximum - 1 && result.length > maximum
          ? text.replace(/.{3}$/, '…')
          : text
      );
  }

  private async card(
    path: string,
    title: string,
    body: string,
    format: StudioFormat,
    variant = 0,
    footer = '',
    visualStyle = '',
    fontFamily = 'DejaVu Sans'
  ) {
    const [width, height] = dimensions[format];
    const palette = visualStyle.match(/#[a-fA-F0-9]{6}\b/g) || [
      '#f9733d',
      '#38bdf8',
      '#a3e635',
    ];
    const color = palette[variant % palette.length];
    const titleLines = this.lines(title, format === 'horizontal' ? 32 : 18, 3);
    const bodyLines = this.lines(
      body,
      format === 'horizontal' ? 64 : 34,
      format === 'vertical' ? 9 : 5
    );
    const titleStart = Math.round(height * 0.25);
    const bodyStart = titleStart + titleLines.length * 86 + 70;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#132128"/><rect x="72" y="100" width="100" height="10" fill="${color}"/><g fill="#fff" font-family="${xml(
      fontFamily
    )}, sans-serif"><text x="72" y="165" font-size="25" letter-spacing="4">${xml(
      footer.slice(0, 48)
    )}</text>${titleLines
      .map(
        (line, i) =>
          `<text x="72" y="${
            titleStart + i * 86
          }" font-size="70" font-weight="bold">${xml(line)}</text>`
      )
      .join('')}${bodyLines
      .map(
        (line, i) =>
          `<text x="72" y="${
            bodyStart + i * 48
          }" font-size="32" fill="#cbd5e1">${xml(line)}</text>`
      )
      .join('')}<rect x="72" y="${height - 125}" width="${
      width - 144
    }" height="2" fill="${color}"/></g></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path);
  }

  private timestamp(seconds: number, ass = false) {
    const units = Math.round(seconds * (ass ? 100 : 1000));
    const base = ass ? 100 : 1000;
    const hour = Math.floor(units / (base * 3600));
    const minute = Math.floor(units / (base * 60)) % 60;
    const second = Math.floor(units / base) % 60;
    return `${ass ? hour : String(hour).padStart(2, '0')}:${String(
      minute
    ).padStart(2, '0')}:${String(second).padStart(2, '0')}${
      ass ? '.' : ','
    }${String(units % base).padStart(ass ? 2 : 3, '0')}`;
  }

  private captions(
    scenes: Array<{ scene: StudioScene; seconds: number }>,
    format: StudioFormat,
    limit = Infinity
  ) {
    const [width, height] = dimensions[format];
    const cues: Array<{ start: number; end: number; text: string }> = [];
    let offset = 0;
    for (const { scene, seconds } of scenes) {
      const lines = this.lines(
        scene.narration,
        format === 'horizontal' ? 65 : 42,
        Number.MAX_SAFE_INTEGER
      );
      // Timing is measured per audio scene; word alignment is deliberately not claimed.
      const weights = lines.map((line) => Math.max(line.length, 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let position = offset;
      lines.forEach((line, i) => {
        const end = position + (seconds * weights[i]) / total;
        if (position < limit)
          cues.push({ start: position, end: Math.min(end, limit), text: line });
        position = end;
      });
      offset += seconds;
    }
    const srt = cues
      .map(
        (cue, i) =>
          `${i + 1}\n${this.timestamp(cue.start)} --> ${this.timestamp(
            cue.end
          )}\n${cue.text}\n`
      )
      .join('\n');
    const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,${
      format === 'horizontal' ? 48 : 46
    },&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,3,3,0,2,72,72,${Math.round(
      height * 0.12
    )},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cues
      .map(
        (cue) =>
          `Dialogue: 0,${this.timestamp(cue.start, true)},${this.timestamp(
            cue.end,
            true
          )},Default,,0,0,0,,${assText(cue.text)}`
      )
      .join('\n')}`;
    return { srt, ass };
  }

  async render(
    orgId: string,
    document: StudioDocument,
    options: StudioRenderOptions
  ): Promise<StudioRender> {
    options = resolveStudioRenderOptions(document, options);
    return renderLimit(async () => {
      const capability = await this.capabilities();
      if (!capability.available)
        throw new ServiceUnavailableException(
          'FFmpeg não está instalado no servidor de produção.'
        );
      const selected = options.sceneIds?.length
        ? options.sceneIds.map((id) =>
            document.scenes.find((scene) => scene.id === id)
          )
        : document.scenes;
      if (
        !selected.length ||
        selected.length > 80 ||
        selected.some((scene) => !scene)
      )
        throw new BadRequestException(
          'Selecione entre uma e oitenta cenas existentes.'
        );
      if (new Set(selected.map((scene) => scene!.id)).size !== selected.length)
        throw new BadRequestException('Há cenas repetidas na seleção.');
      const scenes = selected as StudioScene[];
      if (scenes.some((scene) => !scene.narration.trim()))
        throw new BadRequestException('Cada cena precisa de narração.');
      const needsSpeech = scenes.some((scene) => !scene.audioMediaId);
      if (needsSpeech && options.voice === 'local' && !capability.localVoice)
        throw new ServiceUnavailableException(
          'Instale espeak-ng no worker para usar a voz local.'
        );
      if (
        scenes.some((scene) => !scene.audioMediaId) &&
        options.voice !== 'local' &&
        !process.env.OPENAI_API_KEY
      )
        throw new ServiceUnavailableException(
          'Adicione áudio gravado a cada cena ou configure OPENAI_API_KEY para a voz.'
        );
      if (
        scenes.some(
          (scene) =>
            !scene.audioMediaId &&
            (scene.pronunciation || scene.narration).length > 4096
        )
      )
        throw new BadRequestException(
          'Divida a narração em cenas de até 4096 caracteres para gerar a voz.'
        );
      if (!dimensions[options.format])
        throw new BadRequestException('Formato inválido.');
      const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-'));
      const [width, height] = dimensions[options.format];
      const completed: Array<{ scene: StudioScene; seconds: number }> = [];
      try {
        // Validate and stage all supplied assets before spending on any speech request.
        for (const [index, scene] of scenes.entries()) {
          if (scene.soundEffect)
            await writeStudioSound(
              scene.soundEffect,
              join(dir, `effect-${index}.wav`)
            );
          if (scene.audioMediaId)
            await this.material(
              orgId,
              document,
              scene.audioMediaId,
              join(dir, `audio-${index}`),
              'audio'
            );
          if (scene.kind !== 'card') {
            if (!scene.mediaId)
              throw new BadRequestException(
                `Adicione a mídia da cena ${index + 1} ou escolha cartela.`
              );
            await this.material(
              orgId,
              document,
              scene.mediaId,
              join(dir, `visual-${index}`),
              scene.kind
            );
          }
        }
        if (document.backgroundMusicMediaId)
          await this.material(
            orgId,
            document,
            document.backgroundMusicMediaId,
            join(dir, 'music'),
            'audio'
          );
        for (const [index, scene] of scenes.entries()) {
          let audio = join(dir, `audio-${index}`);
          if (!scene.audioMediaId && options.voice === 'local') {
            const language =
              options.language || document.identity.language || 'pt-BR';
            const voice = { 'pt-BR': 'pt-br', en: 'en', es: 'es' }[language];
            if (!voice)
              throw new BadRequestException('Idioma de narração inválido.');
            await writeFile(
              join(dir, 'speech.txt'),
              scene.pronunciation || scene.narration,
              'utf8'
            );
            try {
              await execute(
                'espeak-ng',
                [
                  '-v',
                  voice,
                  '-b',
                  '1',
                  '-s',
                  '165',
                  '-f',
                  join(dir, 'speech.txt'),
                  '-w',
                  audio,
                ],
                { cwd: dir, timeout: 120000, maxBuffer: 1024 * 1024 }
              );
            } catch {
              throw new ServiceUnavailableException(
                'A voz local falhou. Confira espeak-ng e o idioma no worker.'
              );
            }
          } else if (!scene.audioMediaId) {
            try {
              const response = await new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                timeout: 120000,
                maxRetries: 0,
              }).audio.speech.create({
                model: process.env.STUDIO_TTS_MODEL || 'tts-1',
                voice: options.voice || 'nova',
                input: scene.pronunciation || scene.narration,
                response_format: 'mp3',
              });
              await writeFile(audio, Buffer.from(await response.arrayBuffer()));
            } catch {
              throw new ServiceUnavailableException(
                'A narração não pôde ser gerada. Confira a configuração e o saldo do provedor.'
              );
            }
          }
          const seconds = await this.duration(audio);
          if (scene.soundEffect) {
            const mixed = join(dir, `mixed-${index}.wav`);
            await this.run(
              [
                '-i',
                audio,
                '-i',
                join(dir, `effect-${index}.wav`),
                '-filter_complex',
                '[1:a]volume=0.35[s];[0:a][s]amix=inputs=2:duration=first:normalize=0[m]',
                '-map',
                '[m]',
                '-c:a',
                'pcm_s16le',
                mixed,
              ],
              dir
            );
            audio = mixed;
          }
          if (
            completed.reduce((sum, value) => sum + value.seconds, 0) + seconds >
            900
          )
            throw new BadRequestException(
              'O vídeo ultrapassa quinze minutos. Divida o roteiro.'
            );
          const visual = join(
            dir,
            `visual-${index}${scene.kind === 'card' ? '.png' : ''}`
          );
          if (scene.kind === 'card')
            await this.card(
              visual,
              scene.visual || document.topic,
              '',
              options.format,
              0,
              document.identity.positioning,
              `${studioBrand(document).primary} ${
                studioBrand(document).secondary
              } ${document.identity.visualStyle}`,
              studioBrand(document).font
            );
          const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x132128,setsar=1,fps=25,format=yuv420p`;
          await this.run(
            [
              ...(scene.kind === 'video'
                ? ['-stream_loop', '-1']
                : ['-loop', '1']),
              '-i',
              visual,
              '-i',
              audio,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              '-vf',
              filter,
              '-c:v',
              'libx264',
              '-preset',
              'veryfast',
              '-crf',
              '23',
              '-threads',
              '2',
              '-c:a',
              'aac',
              '-ar',
              '48000',
              '-ac',
              '2',
              '-t',
              String(seconds),
              '-movflags',
              '+faststart',
              `scene-${index}.mp4`,
            ],
            dir
          );
          completed.push({ scene, seconds });
        }
        await writeFile(
          join(dir, 'concat.txt'),
          completed.map((_, i) => `file 'scene-${i}.mp4'`).join('\n')
        );
        await this.run(
          [
            '-f',
            'concat',
            '-safe',
            '1',
            '-i',
            'concat.txt',
            '-c',
            'copy',
            'joined.mp4',
          ],
          dir
        );
        const seconds = completed.reduce(
          (sum, value) => sum + value.seconds,
          0
        );
        // A Story is a cut of a selected sequence, capped explicitly by the request.
        const duration = Math.min(
          seconds,
          options.maxDurationSeconds || seconds
        );
        const { srt, ass } = this.captions(completed, options.format, duration);
        await writeFile(join(dir, 'captions.ass'), ass);
        const args = ['-i', 'joined.mp4'];
        if (document.backgroundMusicMediaId) {
          args.push(
            '-stream_loop',
            '-1',
            '-i',
            'music',
            '-filter_complex',
            '[1:a]volume=0.10[music];[0:a][music]amix=inputs=2:duration=first:normalize=0[a]',
            '-map',
            '0:v:0',
            '-map',
            '[a]'
          );
        }
        args.push(
          '-vf',
          'ass=captions.ass',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-threads',
          '2',
          '-c:a',
          'aac',
          '-t',
          String(duration),
          '-movflags',
          '+faststart',
          'result.mp4'
        );
        await this.run(args, dir);
        const saved = await this.save(
          orgId,
          join(dir, 'result.mp4'),
          'video',
          `${document.topic || 'Vídeo'} (${options.format}).mp4`
        );
        return {
          id: saved.id,
          path: saved.path,
          name: saved.name,
          durationSeconds: duration,
          format: options.format,
          subtitles: srt,
          sourcesSceneIds: scenes.map((scene) => scene.id),
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  async images(
    orgId: string,
    document: StudioDocument,
    kind: 'thumbnails' | 'carousel' | 'brand' | 'frame-covers' | 'brand-kit',
    options: StudioImageOptions = {}
  ): Promise<StudioGeneratedAsset[]> {
    if (kind === 'frame-covers')
      return this.frameCovers(orgId, document, options);
    if (kind === 'brand-kit') return this.brandKit(orgId, document, options);
    const cards =
      kind === 'carousel'
        ? document.scenes.slice(0, 10).map((scene) => ({
            title: scene.visual || document.topic,
            body: scene.narration,
            format: 'square' as StudioFormat,
          }))
        : Array.from({ length: 3 }, (_, i) => ({
            title:
              kind === 'brand'
                ? document.identity.positioning
                : (document.packages[i]?.title || document.topic)
                    .split(/\s+/)
                    .slice(0, 3)
                    .join(' '),
            body: kind === 'brand' ? document.identity.tone : '',
            format: 'horizontal' as StudioFormat,
          }));
    if (!cards.length)
      throw new BadRequestException(
        'Crie um roteiro antes de gerar o carrossel.'
      );
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-images-'));
    try {
      const result = [];
      for (const [index, card] of cards.entries()) {
        const path = join(dir, `card-${index}.png`);
        await this.card(
          path,
          card.title,
          card.body,
          card.format,
          index,
          kind === 'brand'
            ? 'PROPOSTA DE IDENTIDADE'
            : document.identity.positioning,
          `${studioBrand(document).primary} ${
            studioBrand(document).secondary
          } ${document.identity.visualStyle}`,
          studioBrand(document).font
        );
        const saved = await this.save(
          orgId,
          path,
          'image',
          `${kind}-${index + 1}.jpg`,
          'jpeg'
        );
        result.push({
          id: saved.id,
          path: saved.path,
          name: saved.name,
          kind: 'image' as const,
          license: 'owned' as const,
          attribution:
            'Composição própria de texto e formas. Revise marcas e alegações antes de publicar.',
        });
      }
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async brandKit(
    orgId: string,
    document: StudioDocument,
    options: StudioImageOptions
  ): Promise<StudioGeneratedAsset[]> {
    const name = (options.brandName || studioBrand(document).name).trim();
    if (!name || name.length > 80)
      throw new BadRequestException(
        'Informe o nome da marca com até oitenta caracteres.'
      );
    const variant = options.variant || 0;
    if (![0, 1, 2].includes(variant))
      throw new BadRequestException('Escolha uma das três direções de marca.');
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-brand-'));
    try {
      const result = [];
      for (const role of ['logo', 'avatar', 'banner', 'watermark'] as const) {
        const path = join(dir, `${role}.png`);
        await studioBrandImage(document, name, role, variant, path);
        const saved = await this.save(
          orgId,
          path,
          'image',
          `${role}-${variant + 1}.png`
        );
        result.push({
          id: saved.id,
          path: saved.path,
          name: saved.name,
          kind: 'image' as const,
          license: 'owned' as const,
          attribution: `Composição geométrica própria para ${name}. Revise a identidade; não houve pesquisa de exclusividade de marca. Banner: 2560x1440, texto em área central conservadora de 1235x338. O envio às redes é uma ação posterior.`,
        });
      }
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async frameCovers(
    orgId: string,
    document: StudioDocument,
    options: StudioImageOptions
  ): Promise<StudioGeneratedAsset[]> {
    if (!options.mediaId)
      throw new BadRequestException('Selecione o vídeo de origem das capas.');
    const format = options.format || 'vertical';
    if (!['vertical', 'horizontal'].includes(format))
      throw new BadRequestException('Formato de capa inválido.');
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-covers-'));
    try {
      const source = await this.material(
        orgId,
        document,
        options.mediaId,
        join(dir, 'reference'),
        'video'
      );
      const duration = await this.duration(source);
      const asset = document.media.find((item) => item.id === options.mediaId)!;
      const pkg = document.packages.find(
        (item) =>
          item.platform === (format === 'vertical' ? 'instagram' : 'youtube')
      );
      const result = [];
      for (const [index, fraction] of [0.2, 0.5, 0.8].entries()) {
        const timestamp = Math.min(duration - 0.04, duration * fraction);
        const frame = join(dir, `frame-${index}.png`);
        const destination = join(dir, `cover-${index}.png`);
        await this.run(
          [
            '-ss',
            String(Math.max(0, timestamp)),
            '-i',
            source,
            '-frames:v',
            '1',
            frame,
          ],
          dir
        );
        await studioFrameCover(
          frame,
          destination,
          document,
          pkg?.thumbnailOptions?.[index] || pkg?.title || document.topic,
          format
        );
        const saved = await this.save(
          orgId,
          destination,
          'image',
          `capa-${format}-${index + 1}.jpg`,
          'jpeg'
        );
        result.push({
          id: saved.id,
          path: saved.path,
          name: saved.name,
          kind: 'image' as const,
          license: asset.license,
          ...(asset.sourceUrl ? { sourceUrl: asset.sourceUrl } : {}),
          attribution: `Composição a partir da mídia ${
            options.mediaId
          }, quadro em ${timestamp.toFixed(2)} segundos. ${
            asset.attribution || ''
          }`,
        });
      }
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async inspectForDistribution(
    orgId: string,
    document: StudioDocument,
    mediaId: string
  ) {
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-inspect-'));
    try {
      const source = await this.material(
        orgId,
        document,
        mediaId,
        join(dir, 'video'),
        'video'
      );
      const { stdout } = await execute(
        'ffprobe',
        [
          '-v',
          'error',
          ...safeInputs,
          '-select_streams',
          'v:0',
          '-show_entries',
          'format=duration:stream=width,height',
          '-of',
          'json',
          source,
        ],
        { timeout: 30000, maxBuffer: 1024 * 1024 }
      );
      const info = JSON.parse(stdout);
      const durationSeconds = Number(info.format?.duration);
      const width = Number(info.streams?.[0]?.width);
      const height = Number(info.streams?.[0]?.height);
      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > 900 ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        width > 16384 ||
        height > 16384
      )
        throw new BadRequestException(
          'Confira duração e dimensões do vídeo antes de distribuir.'
        );
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(source)) digest.update(chunk);
      return { durationSeconds, width, height, sha256: digest.digest('hex') };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Não foi possível conferir o vídeo para distribuição.'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async measureStyle(orgId: string, document: StudioDocument, mediaId: string) {
    const dir = await mkdtemp(join(tmpdir(), 'postiz-studio-style-'));
    try {
      const source = await this.material(
        orgId,
        document,
        mediaId,
        join(dir, 'reference'),
        'video'
      );
      const duration = await this.duration(source);
      const sampledSeconds = Math.min(duration, 90);
      const { stdout } = await execute(
        'ffprobe',
        [
          '-v',
          'error',
          ...safeInputs,
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height,avg_frame_rate',
          '-of',
          'json',
          source,
        ],
        { timeout: 30000 }
      );
      const stream = JSON.parse(stdout).streams?.[0];
      if (!stream)
        throw new BadRequestException('A referência não contém vídeo.');
      const { stderr } = await execute(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          ...safeInputs,
          '-i',
          source,
          '-t',
          String(sampledSeconds),
          '-vf',
          'select=gt(scene\\,0.35),showinfo',
          '-an',
          '-f',
          'null',
          '-',
        ],
        { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
      );
      const cuts = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((match) =>
        Number(match[1])
      );
      await this.run(['-i', source, '-frames:v', '1', 'frame.png'], dir);
      const rgb = await sharp(join(dir, 'frame.png'))
        .resize(1, 1)
        .removeAlpha()
        .raw()
        .toBuffer();
      const meanFirstFrameColor =
        '#' +
        [...rgb]
          .slice(0, 3)
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
      return {
        mediaId,
        measuredAt: new Date().toISOString(),
        durationSeconds: duration,
        sampledSeconds,
        width: stream.width,
        height: stream.height,
        frameRate: stream.avg_frame_rate,
        detectedCuts: cuts.length,
        cutsPerMinute:
          Math.round(((cuts.length * 60) / sampledSeconds) * 100) / 100,
        averageShotSeconds:
          Math.round((sampledSeconds / (cuts.length + 1)) * 100) / 100,
        meanFirstFrameColor,
        method:
          'FFprobe para duração, resolução e taxa de quadros; FFmpeg scene > 0,35 nos primeiros 90 segundos; média RGB do primeiro quadro.',
        limitations:
          'Detecção de cortes é uma aproximação. Cor média não é paleta dominante. Fonte, gancho e sincronismo palavra a palavra exigem avaliação humana.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Não foi possível medir a referência. Confira o vídeo e a instalação do FFmpeg.'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
