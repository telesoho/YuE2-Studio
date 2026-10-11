import React, { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../context/I18nContext';
import { jianpuStrings } from '../i18n/jianpu';
import type { Language } from '../i18n/translations';
import { saveSongScore } from '../services/scoreReading';

declare global {
  interface Window {
    yuePiano?: { prepare?: (ctx: AudioContext) => Promise<unknown> };
    yueScoreEditor?: {
      open: (
        abc: string,
        audio: string | null,
        options?: {
          saveButton?: HTMLElement | null;
          saveNote?: HTMLElement | null;
          strings?: Record<string, string>;
          title?: string | null;
        },
      ) => Promise<string | null>;
      currentAbc: () => string;
      setStrings?: (next: Record<string, string>) => void;
      applyChrome?: () => void;
      leadSheet?: (abc: string, fallbackTitle?: string) => unknown;
    };
  }
}

let loading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(src));
    document.head.appendChild(script);
  });
}

function loadEditor(): Promise<void> {
  const editorReady = !!window.yueScoreEditor?.open;
  const pianoReady = !!window.yuePiano;
  if (editorReady && pianoReady) return Promise.resolve();
  if (loading) return loading;
  const jobs: Promise<void>[] = [];
  if (!pianoReady) jobs.push(loadScript('/score/piano.js'));
  if (!editorReady) jobs.push(loadScript('/score/score_edit.js'));
  loading = Promise.all(jobs).then(() => undefined).finally(() => {
    loading = null;
  });
  return loading;
}

function catalog(language: Language): Record<string, string> {
  return { ...jianpuStrings[language] };
}

/**
 * Opens the vendored jianpu editor over the page. Save writes through the
 * studio service when a library song id is given; closing returns the ABC.
 */
export const JianpuEditor: React.FC<{
  abc: string;
  audioUrl?: string | null;
  songId?: string | null;
  /** Library / form song name for blank T: display (not written into ABC). */
  title?: string | null;
  onClose: (edited: string | null) => void;
  onSaved?: () => void;
}> = ({ abc, audioUrl, songId, title, onClose, onSaved }) => {
  const { language, t } = useI18n();
  const strings = useMemo(() => catalog(language), [language]);
  const saveButton = useRef<HTMLButtonElement | null>(null);
  const saveNote = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stringsRef = useRef(strings);
  stringsRef.current = strings;
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    let alive = true;
    let showed = false;
    void (async () => {
      try {
        await loadEditor();
        if (!alive) return;
        const open = window.yueScoreEditor?.open;
        if (!open) {
          onCloseRef.current(null);
          return;
        }
        showed = true;
        const edited = await open(abc, audioUrl || null, {
          saveButton: saveButton.current,
          saveNote: saveNote.current,
          strings: stringsRef.current,
          title: titleRef.current,
        });
        if (alive) onCloseRef.current(edited);
      } catch {
        if (alive) onCloseRef.current(null);
      }
    })();
    return () => {
      alive = false;
      if (!showed) return;
      const root = document.querySelector('.yue-jp-editor');
      if (root instanceof HTMLElement) root.hidden = true;
    };
  }, [abc, audioUrl, title]);

  useEffect(() => {
    window.yueScoreEditor?.setStrings?.(strings);
  }, [strings]);

  const persist = async () => {
    const current = window.yueScoreEditor?.currentAbc?.() || abc;
    if (!songId) {
      if (saveNote.current) saveNote.current.textContent = t('jpUpdatedForm');
      onSaved?.();
      return;
    }
    try {
      await saveSongScore(songId, current);
      if (saveNote.current) saveNote.current.textContent = t('jpSaved');
      onSaved?.();
    } catch (error) {
      if (saveNote.current) saveNote.current.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[80] h-0 w-0 overflow-hidden">
      <button ref={saveButton} type="button" onClick={() => void persist()} aria-hidden>
        save
      </button>
      <div ref={saveNote} />
    </div>
  );
};
