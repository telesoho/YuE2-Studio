import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Square, Upload, X } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import {
  listCaptureWindows,
  readScore,
  scoreFitTiming,
  setScoreFitTiming,
  captureStatus,
  startCapture,
  stopCapture,
  type CaptureWindow,
} from '../services/scoreReading';
import { localizeCode } from '../services/localizeCode';
import { LYRIC_LANGUAGES, lyricLanguageLabel } from '../services/lyricLanguages';

const CONTROL =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-pink-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white';

/**
 * 识谱: upload or window-capture audio, then start SheetSage2 + lyrics.
 * Finished tracks land in the library beside this form.
 */
export const ScoreReadingPanel: React.FC<{ onDone?: (songId: string) => void }> = ({ onDone }) => {
  const { t } = useI18n();
  const tt = t as unknown as (key: string) => string;
  const say = useCallback((raw: string) => localizeCode(raw, t), [t]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState('zh');
  const [fitTiming, setFitTiming] = useState(() => scoreFitTiming());
  const [lyrics, setLyrics] = useState('');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState<{ licensed: boolean; expired: boolean; trial_days_left: number } | null>(null);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [listRev, setListRev] = useState(0);
  const [chosen, setChosen] = useState<string>('');
  const [capturing, setCapturing] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const captureLive = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const refreshWindows = useCallback(() => {
    void listCaptureWindows()
      .then(list => {
        setWindows(list);
        setListRev(rev => rev + 1);
        setChosen(current => (list.some(item => item.value === current) ? current : list[0]?.value || ''));
        setCaptureNote(list.length ? tt('scoreCaptureFound').replace('{count}', String(list.length)) : tt('scoreCaptureEmpty'));
      })
      .catch(err => setCaptureNote(say(err instanceof Error ? err.message : String(err))));
  }, [tt, say]);

  useEffect(() => {
    refreshWindows();
  }, [refreshWindows]);

  useEffect(() => {
    const load = () => {
      void fetch('/v1/license')
        .then(response => (response.ok ? response.json() : null))
        .then(body => setLicense(body))
        .catch(() => {});
    };
    load();
    window.addEventListener('yue:license', load);
    return () => window.removeEventListener('yue:license', load);
  }, []);

  useEffect(() => {
    setPreviewPlaying(false);
    preview.current?.pause();
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const stageLabel = (name: string | undefined) => {
    switch (name) {
      case 'vocals':
        return tt('scoreStageVocals');
      case 'lyrics':
        return tt('scoreStageLyrics');
      case 'align':
        return tt('scoreStageAlign');
      case 'done':
        return tt('scoreReadingRunning');
      default:
        return tt('scoreStageTranscribe');
    }
  };

  const run = async (source: File) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(null);
    setProgress(0);
    setStage(tt('scoreStageTranscribe'));
    try {
      const reading = await readScore({ file: source, lyrics, fitTiming }, language, controller.signal, state => {
        setStage(stageLabel(state.stage));
        if (typeof state.progress === 'number') setProgress(Math.max(0, Math.min(1, state.progress)));
      });
      setProgress(1);
      setStage('');
      if (reading.song_id) onDone?.(reading.song_id);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setError(tt('scoreCancelled'));
      else setError(say(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const onUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    setError(null);
  };

  const beginCapture = async () => {
    const target = windows.find(item => item.value === chosen);
    if (!target) return;
    try {
      await startCapture(target);
      captureLive.current = true;
      setCapturing(true);
      setCaptureNote(say('{"code":"captureWaiting"}'));
    } catch (err) {
      setCaptureNote(say(err instanceof Error ? err.message : String(err)));
    }
  };

  useEffect(() => {
    if (!capturing) return;
    let cancel = false;
    const tick = () => {
      void captureStatus()
        .then(status => {
          if (!cancel && captureLive.current) setCaptureNote(say(status.note));
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [capturing, say]);

  const endCapture = async () => {
    captureLive.current = false;
    try {
      const recording = await stopCapture();
      setCapturing(false);
      setFile(recording.file);
      setError(null);
      const done = tt('scoreCaptured').replace('{seconds}', recording.duration.toFixed(1));
      setCaptureNote(recording.silent ? `${say(recording.note || '{"code":"captureSilent"}')}\n${done}` : done);
    } catch (err) {
      setCapturing(false);
      setCaptureNote(say(err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-suno-panel dark:text-white">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
        <div className="space-y-3 p-4 pb-6">
          <header>
            <h1 className="text-base font-bold">{tt('scoreReading')}</h1>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{tt('scoreReadingHint')}</p>
          </header>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/60">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tt('scorePrepare')}</h2>

            <div className="mt-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-pink-500/40 px-3 py-2 text-xs font-semibold text-pink-600 hover:bg-pink-500/10 dark:text-pink-300">
                <Upload size={14} />
                {tt('scoreUpload')}
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
                  className="hidden"
                  onChange={onUpload}
                />
              </label>
            </div>

            <div className="my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
              {tt('scoreOr')}
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
            </div>

            <h3 className="text-xs font-semibold text-zinc-500">{tt('scoreCapture')}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* key: Chromium keeps the closed select's old caption when only the option text changes. */}
              <select
                key={listRev}
                className={`${CONTROL} min-w-0 flex-1`}
                value={chosen}
                onChange={event => setChosen(event.target.value)}
                disabled={capturing}
              >
                {windows.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="button" className="relative z-10 shrink-0 px-1 text-xs text-pink-600 dark:text-pink-300" onClick={refreshWindows}>
                {tt('scoreCaptureRefresh')}
              </button>
              {!capturing ? (
                <button
                  type="button"
                  disabled={!chosen}
                  onClick={() => void beginCapture()}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs dark:border-white/20"
                >
                  <Mic size={12} /> {tt('scoreCaptureStart')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void endCapture()}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-400 px-2 py-1.5 text-xs text-rose-600"
                >
                  <Square size={12} /> {tt('scoreCaptureStop')}
                </button>
              )}
            </div>
            {captureNote && <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{captureNote}</p>}

            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-black/30">
              {file && previewUrl ? (
                <>
                  <audio
                    key={previewUrl}
                    ref={preview}
                    src={previewUrl}
                    preload="metadata"
                    className="hidden"
                    onPlay={() => setPreviewPlaying(true)}
                    onPause={() => setPreviewPlaying(false)}
                    onEnded={() => setPreviewPlaying(false)}
                  />
                  <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-100">{file.name}</span>
                  <div className="inline-flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={running || capturing}
                      title={previewPlaying ? tt('scorePause') : tt('scoreListen')}
                      aria-label={previewPlaying ? tt('scorePause') : tt('scoreListen')}
                      onClick={() => {
                        const player = preview.current;
                        if (!player) return;
                        void (player.paused ? player.play() : player.pause());
                      }}
                      className="inline-flex items-center text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-white"
                    >
                      {previewPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                    </button>
                    <button
                      type="button"
                      disabled={running || capturing}
                      onClick={() => {
                        preview.current?.pause();
                        setFile(null);
                        if (fileInput.current) fileInput.current.value = '';
                      }}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-white"
                    >
                      <X size={12} /> {tt('scoreClearAudio')}
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-zinc-500">{tt('scoreNoAudio')}</span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/60">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tt('scoreStartStep')}</h2>
            <label className="mt-3 block text-xs font-medium text-zinc-500" htmlFor="score-language">
              {tt('scoreLanguage')}
            </label>
            <select
              id="score-language"
              className={`${CONTROL} mt-1`}
              value={language}
              onChange={event => setLanguage(event.target.value)}
              aria-label={tt('scoreLanguage')}
            >
              <option value="auto">auto</option>
              {LYRIC_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lyricLanguageLabel(lang)}
                </option>
              ))}
            </select>
            <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-pink-500"
                checked={fitTiming}
                disabled={running}
                onChange={event => {
                  const on = event.target.checked;
                  setFitTiming(on);
                  setScoreFitTiming(on);
                }}
              />
              <span>
                <span className="font-medium text-zinc-800 dark:text-zinc-100">{tt('scoreFitTiming')}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{tt('scoreFitTimingHint')}</span>
              </span>
            </label>
            <label className="mt-3 block text-xs font-medium text-zinc-500" htmlFor="score-lyrics">
              {tt('scoreProvidedLyrics')}
            </label>
            <textarea
              id="score-lyrics"
              className={`${CONTROL} mt-1 min-h-[7rem] resize-y font-mono text-xs leading-relaxed`}
              value={lyrics}
              onChange={event => setLyrics(event.target.value)}
              disabled={running}
              placeholder={tt('scoreProvidedLyricsHint')}
              aria-label={tt('scoreProvidedLyrics')}
            />
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">{tt('scoreProvidedLyricsHint')}</p>
            <button
              type="button"
              disabled={!file || running || Boolean(license?.expired)}
              onClick={() => file && void run(file)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-pink-500 to-orange-400 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : null}
              {running ? stage || tt('scoreReadingRunning') : tt('scoreStart')}
            </button>
            {license?.expired && <p className="mt-2 text-xs leading-5 text-rose-600 dark:text-rose-300">{tt('scoreLicenseExpired')}</p>}
            {license && !license.licensed && !license.expired && (
              <p className="mt-2 text-xs text-zinc-500">{tt('scoreLicenseTrial').replace('{days}', String(license.trial_days_left))}</p>
            )}
            {running && (
              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between text-xs text-zinc-500">
                  <span>{stage || tt('scoreReadingRunning')}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                    <button type="button" className="underline" onClick={() => abort.current?.abort()}>
                      {tt('scoreCancel')}
                    </button>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-pink-500 to-purple-500 transition-[width] duration-300"
                    style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </section>
  );
};
