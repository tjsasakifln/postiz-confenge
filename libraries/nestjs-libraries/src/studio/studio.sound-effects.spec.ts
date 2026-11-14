import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { STUDIO_SOUND_EFFECTS } from '@gitroom/helpers/studio/studio.sound-effects';
import { studioSoundWave } from './studio.sound-effects';

describe('Original scene sounds', () => {
  it('generates twenty different bounded PCM recordings without remote assets', () => {
    const hashes = new Set<string>();
    for (const effect of STUDIO_SOUND_EFFECTS) {
      const wave = studioSoundWave(effect.id);
      expect(wave.subarray(0, 4).toString()).toBe('RIFF');
      expect(wave.readUInt32LE(24)).toBe(48000);
      expect(wave.readUInt32LE(40)).toBeLessThanOrEqual(96000);
      let peak = 0;
      for (let i = 44; i < wave.length; i += 2)
        peak = Math.max(peak, Math.abs(wave.readInt16LE(i)));
      expect(peak).toBeGreaterThan(100);
      expect(peak).toBeLessThan(7000);
      hashes.add(createHash('sha256').update(wave).digest('hex'));
    }
    expect(hashes.size).toBe(20);
  });
  it('refuses unknown effect identifiers', () => {
    expect(() => studioSoundWave('../../file' as any)).toThrow('inválido');
  });
});
