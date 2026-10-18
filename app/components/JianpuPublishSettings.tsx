import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { localizeCode } from '../services/localizeCode';

const INPUT =
  'w-full rounded-lg border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 outline-hidden focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';

interface PublishSettings {
  repo: string;
  branch: string;
  site: string;
  token_configured: boolean;
  token_source: 'environment' | 'local_store' | null;
}

export const JianpuPublishSettings: React.FC = () => {
  const { t } = useI18n();
  const [settings, setSettings] = useState<PublishSettings | null>(null);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [site, setSite] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (body: PublishSettings) => {
    setSettings(body);
    setRepo(body.repo);
    setBranch(body.branch);
    setSite(body.site);
  };

  useEffect(() => {
    let gone = false;
    void fetch('/v1/score/publish-settings')
      .then(response => response.json())
      .then((body: PublishSettings) => {
        if (!gone) apply(body);
      })
      .catch(() => {
        if (!gone) setError(t('githubPublishFailed').replace('{detail}', 'settings'));
      });
    return () => {
      gone = true;
    };
  }, []);

  const send = async (path: string, method: 'PUT' | 'POST', clearToken: boolean) => {
    const payload: Record<string, unknown> = { repo: repo.trim(), branch: branch.trim(), site: site.trim() };
    if (clearToken) payload.token = null;
    else if (token.trim()) payload.token = token.trim();
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body: (PublishSettings & { error?: string; repo?: string; branch?: string }) | null = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok || !body || body.error) throw new Error(body?.error || text.trim() || `${response.status}`);
    return body;
  };

  const save = async (clearToken: boolean) => {
    setBusy('save');
    setError(null);
    setNotice(null);
    setProbe(null);
    try {
      const body = await send('/v1/score/publish-settings', 'PUT', clearToken);
      apply(body);
      setToken('');
      setNotice(t('jianpuPublishSaved'));
    } catch (reason) {
      setError(localizeCode(reason instanceof Error ? reason.message : String(reason), t));
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('test');
    setError(null);
    setNotice(null);
    setProbe(null);
    try {
      const body = await send('/v1/score/publish-settings/test', 'POST', false);
      if (body.site) setSite(body.site);
      setProbe(t('jianpuPublishTestOk').replace('{repo}', body.repo ?? '').replace('{branch}', body.branch ?? ''));
    } catch (reason) {
      setError(localizeCode(reason instanceof Error ? reason.message : String(reason), t));
    } finally {
      setBusy(null);
    }
  };

  const fromEnv = settings?.token_source === 'environment';
  const configured = settings?.token_configured === true;

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t('jianpuPublishIntro')}</p>
      <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${configured ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-500'}`}>
        {fromEnv ? t('jianpuPublishTokenEnv') : configured ? t('jianpuPublishTokenConfigured') : t('jianpuPublishTokenMissing')}
      </span>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('jianpuPublishRepo')}</span>
        <input value={repo} onChange={event => setRepo(event.target.value)} className={INPUT} spellCheck={false} autoComplete="off" placeholder="owner/name" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('jianpuPublishBranch')}</span>
        <input value={branch} onChange={event => setBranch(event.target.value)} className={INPUT} spellCheck={false} autoComplete="off" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('jianpuPublishSite')}</span>
        <input value={site} onChange={event => setSite(event.target.value)} className={INPUT} spellCheck={false} autoComplete="off" placeholder="https://" />
      </label>
      {!fromEnv && (
        <label className="block space-y-1">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('githubTokenLabel')}</span>
          <input
            type="password"
            value={token}
            onChange={event => setToken(event.target.value)}
            className={INPUT}
            autoComplete="off"
            placeholder={configured ? '••••••••' : 'ghp_…'}
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || !repo.trim() || !branch.trim() || !site.trim()}
          onClick={() => void check()}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200"
        >
          {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : t('jianpuPublishTest')}
        </button>
        <button
          type="button"
          disabled={busy !== null || !repo.trim() || !branch.trim() || !site.trim()}
          onClick={() => void save(false)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : t('jianpuPublishSave')}
        </button>
        {!fromEnv && configured && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void save(true)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-rose-400 hover:text-rose-600 dark:border-white/15 dark:text-zinc-300"
          >
            {t('jianpuPublishClearToken')}
          </button>
        )}
      </div>
      {notice && <p className="text-xs text-emerald-600 dark:text-emerald-300">{notice}</p>}
      {probe && <p className="text-xs text-emerald-600 dark:text-emerald-300">{probe}</p>}
      {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
};
