/**
 * 识谱: audio → SheetSage2 → lyrics alignment → library track, plus the
 * jianpu editor save and share package.
 */

import { mapNativeLibrarySong } from './nativeLibrary';
import type { NativeLibrarySong, Song } from '../types';

export interface ScoreReading {
  id: string;
  status: 'running' | 'done' | 'failed' | 'cancelled' | string;
  stage: 'transcribe' | 'vocals' | 'lyrics' | 'align' | 'done' | string;
  /** Overall fraction 0..1 while the job runs. */
  progress?: number;
  song_id?: string;
  abc?: string;
  display_abc?: string;
  lyrics?: string;
  warnings?: string[];
  error?: string;
}

export interface CaptureWindow {
  pid: number;
  label: string;
  process_name: string;
  value: string;
}

const POLL_MS = 500;

async function cancelReading(id: string): Promise<void> {
  const url = `/v1/score-readings/${encodeURIComponent(id)}`;
  await fetch(url, { method: 'POST' }).catch(() => undefined);
}

async function awaitReading(
  id: string,
  signal?: AbortSignal,
  onUpdate?: (state: ScoreReading) => void,
): Promise<ScoreReading> {
  const url = `/v1/score-readings/${encodeURIComponent(id)}`;
  const abort = () => {
    void cancelReading(id);
  };
  if (signal) {
    if (signal.aborted) {
      abort();
      throw new DOMException('cancelled', 'AbortError');
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      const response = await fetch(url);
      const state = (await response.json().catch(() => ({}))) as Partial<ScoreReading>;
      if (!response.ok) throw new Error(state.error || `job status failed (${response.status})`);
      onUpdate?.(state as ScoreReading);
      if (state.status === 'done') return state as ScoreReading;
      if (state.status === 'failed') throw new Error(state.error || '识谱失败');
      if (state.status === 'cancelled') throw new DOMException('cancelled', 'AbortError');
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, POLL_MS);
        const onAbort = () => {
          window.clearTimeout(timer);
          reject(new DOMException('cancelled', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export async function readScore(
  source: { file?: File; songId?: string },
  language: string,
  signal?: AbortSignal,
  onUpdate?: (state: ScoreReading) => void,
): Promise<ScoreReading> {
  const form = new FormData();
  if (source.file) form.append('audio', source.file, source.file.name);
  else if (source.songId) form.append('song_id', source.songId);
  else throw new Error('no audio to read');
  form.append('language', language || 'zh');
  const submitted = await fetch('/v1/score-readings', { method: 'POST', body: form, signal });
  const job = (await submitted.json().catch(() => ({}))) as Partial<ScoreReading>;
  if (!submitted.ok || !job.id) throw new Error(job.error || `the engine refused the job (${submitted.status})`);
  onUpdate?.(job as ScoreReading);
  return awaitReading(job.id, signal, onUpdate);
}

export async function saveSongScore(songId: string, abc: string): Promise<Song> {
  const response = await fetch(`/v1/library/songs/${encodeURIComponent(songId)}/score`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ abc }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `save failed (${response.status})`);
  }
  const body = (await response.json()) as NativeLibrarySong;
  return mapNativeLibrarySong(body);
}

export async function downloadScoreShare(songId: string, lang?: string): Promise<Blob> {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const response = await fetch(`/v1/library/songs/${encodeURIComponent(songId)}/score-share${query}`, { method: 'POST' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `share failed (${response.status})`);
  }
  return response.blob();
}

export async function listCaptureWindows(): Promise<CaptureWindow[]> {
  const response = await fetch('/v1/capture/windows');
  const payload = (await response.json().catch(() => ({}))) as { windows?: CaptureWindow[]; error?: string };
  if (!response.ok) throw new Error(payload.error || `list windows failed (${response.status})`);
  return payload.windows ?? [];
}

export async function startCapture(target: CaptureWindow): Promise<void> {
  const response = await fetch('/v1/capture/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: target.value, label: target.label, process_name: target.process_name }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `capture start failed (${response.status})`);
  }
}

export async function stopCapture(): Promise<{ file: File; silent: boolean; note: string; duration: number }> {
  const response = await fetch('/v1/capture/stop', { method: 'POST' });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    audio_base64?: string;
    filename?: string;
    silent?: boolean;
    note?: string;
    duration?: number;
  };
  if (!response.ok || !payload.audio_base64) {
    throw new Error(payload.error || `capture stop failed (${response.status})`);
  }
  const binary = atob(payload.audio_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], payload.filename || 'capture.wav', { type: 'audio/wav' });
  return { file, silent: Boolean(payload.silent), note: payload.note || '', duration: payload.duration || 0 };
}
