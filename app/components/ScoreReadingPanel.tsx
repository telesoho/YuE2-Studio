import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Mic, Square, Upload } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { ScoreView } from './ScoreView';
import { JianpuEditor } from './JianpuEditor';
import {
  downloadScoreShare,
  listCaptureWindows,
  readScore,
  startCapture,
  stopCapture,
  type CaptureWindow,
  type ScoreReading,
} from '../services/scoreReading';
import { apiUrl } from '../services/apiBase';
import { localizeCode } from '../services/localizeCode';

const CONTROL =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-pink-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white';

/**
 * 识谱: upload or window-capture audio, run SheetSage2 + lyrics, edit jianpu,
 * export a share zip.
 */
export const ScoreReadingPanel: React.FC = () => {
  const { t, language: uiLanguage } = useI18n();
  const tt = t as unknown as (key: string) => string;
  const say = useCallback((raw: string) => localizeCode(raw, t), [t]);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('zh');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScoreReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [capturing, setCapturing] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [editing, setEditing] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const audioUrl = useMemo(() => {
    if (result?.song_id) return apiUrl(`/v1/library/media/${result.song_id}`);
    return file ? URL.createObjectURL(file) : null;
  }, [result?.song_id, file]);
  useEffect(() => {
    if (!audioUrl?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const refreshWindows = useCallback(() => {
    void listCaptureWindows()
      .then(list => {
        setWindows(list);
        setChosen(current => (list.some(item => item.value === current) ? current : list[0]?.value || ''));
        setCaptureNote(list.length ? tt('scoreCaptureFound').replace('{count}', String(list.length)) : tt('scoreCaptureEmpty'));
      })
      .catch(err => setCaptureNote(say(err instanceof Error ? err.message : String(err))));
  }, [tt, say]);

  useEffect(() => {
    refreshWindows();
  }, [refreshWindows]);

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
    setResult(null);
    setProgress(0);
    setStage(tt('scoreStageTranscribe'));
    try {
      const reading = await readScore({ file: source }, language, controller.signal, state => {
        setStage(stageLabel(state.stage));
        if (typeof state.progress === 'number') setProgress(Math.max(0, Math.min(1, state.progress)));
      });
      setResult(reading);
      setProgress(1);
      setStage('');
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
  };

  const beginCapture = async () => {
    const target = windows.find(item => item.value === chosen);
    if (!target) return;
    try {
      await startCapture(target);
      setCapturing(true);
      setCaptureNote(tt('scoreCapturing'));
    } catch (err) {
      setCaptureNote(say(err instanceof Error ? err.message : String(err)));
    }
  };

  const endCapture = async () => {
    try {
      const recording = await stopCapture();
      setCapturing(false);
      setFile(recording.file);
      const done = tt('scoreCaptured').replace('{seconds}', recording.duration.toFixed(1));
      setCaptureNote(recording.silent ? `${say(recording.note || '{"code":"captureSilent"}')}\n${done}` : done);
    } catch (err) {
      setCapturing(false);
      setCaptureNote(say(err instanceof Error ? err.message : String(err)));
    }
  };

  const share = async () => {
    if (!result?.song_id) return;
    try {
      const blob = await downloadScoreShare(result.song_id, uiLanguage);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${result.song_id}-share.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(say(err instanceof Error ? err.message : String(err)));
    }
  };

  const displayAbc = result?.display_abc || result?.abc || '';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{tt('scoreReading')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{tt('scoreReadingHint')}</p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tt('scoreSource')}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-pink-500/40 px-3 py-1.5 text-xs font-semibold text-pink-600 hover:bg-pink-500/10 dark:text-pink-300">
            <Upload size={14} />
            {tt('scoreUpload')}
            <input type="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a" className="hidden" onChange={onUpload} />
          </label>
          {file && <span className="text-xs text-zinc-500">{file.name}</span>}
          <select className={`${CONTROL} max-w-[8rem]`} value={language} onChange={event => setLanguage(event.target.value)} aria-label={tt('scoreLanguage')}>
            <option value="zh">zh</option>
            <option value="en">en</option>
            <option value="auto">auto</option>
          </select>
          <button
            type="button"
            disabled={!file || running}
            onClick={() => file && void run(file)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : null}
            {running ? stage || tt('scoreReadingRunning') : tt('scoreStart')}
          </button>
          {running && (
            <button type="button" className="text-xs text-zinc-500 underline" onClick={() => abort.current?.abort()}>
              {tt('scoreCancel')}
            </button>
          )}
        </div>
        {running && (
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-xs text-zinc-500">
              <span>{stage || tt('scoreReadingRunning')}</span>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-linear-to-r from-pink-500 to-purple-500 transition-[width] duration-300"
                style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-white/5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{tt('scoreCapture')}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className={`${CONTROL} max-w-md`} value={chosen} onChange={event => setChosen(event.target.value)} disabled={capturing}>
              {windows.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="button" className="text-xs text-pink-600 dark:text-pink-300" onClick={refreshWindows}>
              {tt('scoreCaptureRefresh')}
            </button>
            {!capturing ? (
              <button type="button" disabled={!chosen} onClick={() => void beginCapture()} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-white/20">
                <Mic size={12} /> {tt('scoreCaptureStart')}
              </button>
            ) : (
              <button type="button" onClick={() => void endCapture()} className="inline-flex items-center gap-1 rounded-lg border border-rose-400 px-2 py-1 text-xs text-rose-600">
                <Square size={12} /> {tt('scoreCaptureStop')}
              </button>
            )}
          </div>
          {captureNote && <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{captureNote}</p>}
        </div>
      </section>

      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}

      {result && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tt('scoreResult')}</h2>
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-pink-500/40 px-2 py-1 text-xs font-semibold text-pink-600 dark:text-pink-300">
              {tt('scoreEditJianpu')}
            </button>
            {result.song_id && (
              <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-white/20">
                <Download size={12} /> {tt('scoreShare')}
              </button>
            )}
          </div>
          {(result.warnings?.length ?? 0) > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
              {result.warnings!.map(item => (
                <li key={item}>{say(item)}</li>
              ))}
            </ul>
          )}
          {result.lyrics && (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs dark:bg-black/30">{result.lyrics}</pre>
          )}
          {displayAbc && (
            <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 dark:border-white/10">
              <ScoreView abc={displayAbc.replace(/^w:.*$/gim, '').replace(/\n{3,}/g, '\n\n')} />
            </div>
          )}
          {displayAbc && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-[11px] dark:bg-black/30">{displayAbc}</pre>
          )}
        </section>
      )}

      {editing && displayAbc && (
        <JianpuEditor
          abc={displayAbc}
          audioUrl={audioUrl}
          songId={result?.song_id}
          onClose={edited => {
            setEditing(false);
            if (edited && result) {
              setResult({ ...result, display_abc: edited, abc: edited.replace(/^w:.*$/gim, '').replace(/\n{3,}/g, '\n\n') });
            }
          }}
        />
      )}
    </div>
  );
};
