import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { songFileName, tempoAndKey } from './songDownload';

const song = (extra: Partial<Song> = {}) => ({ id: 's', title: 'Северный ветер', ...extra }) as Song;

describe('songFileName', () => {
  it('names the original by its title and stored format', () => {
    expect(songFileName(song(), 'audio/wav')).toBe('Северный ветер.wav');
    expect(songFileName(song({ activeVersion: 'original', audioVersions: [{ id: 'v', label: 'x', createdAt: '' }] }), 'audio/mpeg')).toBe('Северный ветер.mp3');
  });

  it('carries the processing of the version that plays', () => {
    const processed = song({ activeVersion: 'v', audioVersions: [{ id: 'v', label: 'Шумоподавление 0.40 + Мастеринг · Big Pineapple', createdAt: '' }] });
    expect(songFileName(processed, 'audio/wav')).toBe('Северный ветер (Шумоподавление 0.40 + Мастеринг · Big Pineapple).wav');
  });

  it('keeps the name legal on Windows', () => {
    expect(songFileName(song({ title: 'A/B: "test"?' }), 'audio/flac')).toBe('A_B_ _test__.flac');
  });
});

const header = (key: string) => `X:1\nT:\nM:4/4\nL:1/32\nQ:1/4=109\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nK:${key}\n`;

describe('tempo and key in a stem file name', () => {
  it('reads the tempo and the key from the score header', () => {
    expect(tempoAndKey(header('D'))).toBe('109 BPM, D major');
    expect(tempoAndKey(header('F#m'))).toBe('109 BPM, F# minor');
    expect(tempoAndKey(header('Bbdor'))).toBe('109 BPM, Bb dorian');
  });

  it('says nothing for a song without a score', () => {
    expect(tempoAndKey(undefined)).toBe('');
    expect(tempoAndKey('')).toBe('');
  });
});
