import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Globe2, Loader2, X } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

/**
 * Where model downloads and Hub API calls go: the official Hub, the usual
 * China mirror, or any other base that serves the same paths.
 */

type Preset = 'official' | 'hf-mirror' | 'custom';

interface Settings {
  endpoint: string | null;
}

const OFFICIAL = 'https://huggingface.co';
const HF_MIRROR = 'https://hf-mirror.com';

const CONTROL =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-hidden focus:border-pink-500 disabled:opacity-50 dark:border-white/10 dark:bg-black/20 dark:text-white';

function presetOf(endpoint: string | null): Preset {
  if (!endpoint || endpoint === OFFICIAL) return 'official';
  if (endpoint === HF_MIRROR) return 'hf-mirror';
  return 'custom';
}

export const HubMirrorSettings: React.FC = () => {
  const { t } = useI18n();
  const [preset, setPreset] = useState<Preset>('official');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [probe, setProbe] = useState<{ ok: boolean; endpoint: string; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch('/v1/network/hub')
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: Settings & { endpoint_effective?: string; problem?: string | null }) => {
        const endpoint = body.endpoint ?? null;
        setPreset(presetOf(endpoint));
        if (presetOf(endpoint) === 'custom') setCustom(endpoint ?? '');
        if (body.problem) setError(body.problem);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const form = (): Settings => {
    if (preset === 'official') return { endpoint: null };
    if (preset === 'hf-mirror') return { endpoint: HF_MIRROR };
    return { endpoint: custom.trim() || null };
  };

  const send = async (path: string, method: 'PUT' | 'POST') => {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form()),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || String(response.status));
    return body;
  };

  const check = async () => {
    setBusy('test');
    setError(null);
    setProbe(null);
    setSaved(false);
    try {
      setProbe(await send('/v1/network/hub/test', 'POST'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    setSaved(false);
    try {
      await send('/v1/network/hub', 'PUT');
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const presets: { id: Preset; label: string }[] = [
    { id: 'official', label: t('hubMirrorOfficial') },
    { id: 'hf-mirror', label: t('hubMirrorChina') },
    { id: 'custom', label: t('hubMirrorCustom') },
  ];

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
        <Globe2 size={16} className="text-pink-500" /> {t('hubMirrorTitle')}
      </h4>
      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t('hubMirrorIntro')}</p>

      <div className="mt-3 flex w-fit flex-wrap rounded-lg border border-zinc-200 p-0.5 dark:border-white/10">
        {presets.map(choice => (
          <button
            key={choice.id}
            type="button"
            onClick={() => { setPreset(choice.id); setProbe(null); setSaved(false); }}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${preset === choice.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500'}`}
          >
            {choice.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="mt-3">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hubMirrorAddress')}</span>
          <input
            type="text"
            value={custom}
            onChange={event => { setCustom(event.target.value); setProbe(null); setSaved(false); }}
            placeholder={t('hubMirrorAddressPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className={`${CONTROL} font-mono`}
          />
          <p className="mt-1 text-[11px] leading-4 text-zinc-500">{t('hubMirrorAddressHint')}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-pink-400 hover:text-pink-600 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200"
        >
          {busy === 'test' && <Loader2 size={13} className="animate-spin" />} {t('hubMirrorTest')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null}
          className="rounded-lg bg-linear-to-r from-orange-500 to-pink-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : t('hubMirrorSave')}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-300">
            <Check size={14} /> {t('hubMirrorSaved')}
          </span>
        )}
      </div>

      {probe && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-black/20">
          {probe.ok ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" /> : <X size={14} className="mt-0.5 shrink-0 text-rose-500" />}
          <span className="min-w-0">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">{probe.endpoint}</span>{' '}
            <span className={probe.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
              {probe.ok ? t('proxyReachable') : t('proxyUnreachable')}
            </span>
            {!probe.ok && probe.error && <span className="block wrap-break-word text-[11px] text-zinc-500">{probe.error}</span>}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle size={14} className="shrink-0" /> {error}
        </p>
      )}
    </section>
  );
};
