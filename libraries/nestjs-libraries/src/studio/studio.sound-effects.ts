import { writeFile } from 'node:fs/promises';
import { BadRequestException } from '@nestjs/common';
import {
  STUDIO_SOUND_EFFECTS,
  StudioSoundEffect,
} from '@gitroom/helpers/studio/studio.sound-effects';

/** Generated sine/noise envelopes; no third-party sample recordings. */
export function studioSoundWave(effect: StudioSoundEffect): Buffer {
  const index = STUDIO_SOUND_EFFECTS.findIndex((item) => item.id === effect);
  if (index < 0) throw new BadRequestException('Efeito sonoro inválido.');
  const frequencies = [
    1800, 420, 2400, 230, 1300, 880, 220, 1400, 600, 300, 1600, 660, 440, 110,
    700, 1900, 900, 350, 90, 1040,
  ];
  const seconds = [
    0.08, 0.14, 0.08, 0.12, 0.3, 0.5, 0.6, 0.6, 0.4, 0.5, 0.6, 0.8, 0.4, 0.25,
    0.3, 0.45, 0.5, 0.6, 0.4, 0.5,
  ][index];
  const rate = 48000;
  const count = Math.floor(seconds * rate);
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 2, 40);
  let phase = 0;
  let seed = 12345 + index;
  for (let i = 0; i < count; i++) {
    const progress = i / count;
    const frequency =
      frequencies[index] *
      (effect === 'rise'
        ? 1 + 3 * progress
        : effect === 'fall'
        ? 1 - 0.8 * progress
        : 1);
    phase += (2 * Math.PI * frequency) / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    const repeats =
      effect === 'double-tap' ? 2 : effect === 'triple-tick' ? 3 : 1;
    const envelopePosition = (progress * repeats) % 1;
    const envelope =
      Math.sin(Math.PI * envelopePosition) ** 2 *
      Math.exp(-2 * envelopePosition);
    const carrier =
      effect === 'swoosh' || effect === 'transition'
        ? noise * 0.7 + Math.sin(phase) * 0.3
        : Math.sin(phase) * 0.75 + Math.sin(phase * (1.5 + index / 100)) * 0.25;
    buffer.writeInt16LE(
      Math.round(carrier * envelope * 0.2 * 32767),
      44 + i * 2
    );
  }
  return buffer;
}
export async function writeStudioSound(
  effect: StudioSoundEffect,
  path: string
) {
  await writeFile(path, studioSoundWave(effect));
}
