import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../context/I18nContext';
import { ScoreReadingPanel } from './ScoreReadingPanel';
import { scoreFitTiming, setScoreFitTiming } from '../services/scoreReading';

vi.mock('../services/scoreReading', () => ({
  listCaptureWindows: vi.fn(async () => []),
  readScore: vi.fn(),
  scoreFitTiming: vi.fn(() => false),
  setScoreFitTiming: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
}));

describe('ScoreReadingPanel preview', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.setItem('language', 'en');
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('plays prepared audio and clears it', async () => {
    const play = vi.fn(async () => undefined);
    const pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => true });

    await act(async () => {
      root = createRoot(host);
      root.render(
        <I18nProvider>
          <ScoreReadingPanel />
        </I18nProvider>,
      );
    });

    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([0, 0, 0, 0])], 'ready.wav', { type: 'audio/wav' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.textContent).toContain('ready.wav');
    const listen = host.querySelector('button[aria-label="Listen"]') as HTMLButtonElement;
    expect(listen).toBeTruthy();

    await act(async () => {
      listen.click();
    });
    expect(play).toHaveBeenCalled();

    const clear = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Clear'));
    expect(clear).toBeTruthy();
    await act(async () => {
      clear!.click();
    });
    expect(pause).toHaveBeenCalled();
    expect(host.textContent).toContain('No audio yet');
    expect(host.querySelector('button[aria-label="Listen"]')).toBeNull();

    expect(host.textContent).toContain('Fit by scale and offset');
    const fit = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(fit).toBeTruthy();
    expect(fit.checked).toBe(false);
    await act(async () => {
      fit.click();
    });
    expect(setScoreFitTiming).toHaveBeenCalledWith(true);
    expect(scoreFitTiming).toHaveBeenCalled();
  });
});
