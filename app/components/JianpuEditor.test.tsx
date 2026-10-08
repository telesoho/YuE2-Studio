import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../context/I18nContext';
import { JianpuEditor } from './JianpuEditor';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(path.join(here, '../public/score/piano.js'));
require(path.join(here, '../public/score/score_edit.js'));

const ABC = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
K:C
C4D4E4F4|`;

describe('JianpuEditor', () => {
  it('opens the score editor under StrictMode', async () => {
    localStorage.setItem('language', 'en');
    const globals = globalThis as { abc2svg?: unknown };
    const previous = globals.abc2svg;
    globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const closed: Array<string | null> = [];
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(
          <StrictMode>
            <I18nProvider>
              <JianpuEditor abc={ABC} onClose={value => closed.push(value)} />
            </I18nProvider>
          </StrictMode>,
        );
      });
      const editor = document.querySelector('.yue-jp-editor');
      expect(editor).toBeInstanceOf(HTMLElement);
      expect((editor as HTMLElement).hidden).toBe(false);
      expect(document.querySelector('.yue-jp-editor h2')?.textContent).toBe('Edit jianpu');
      expect(closed).toEqual([]);
    } finally {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
      document.querySelector('.yue-jp-editor')?.remove();
      globals.abc2svg = previous;
    }
  });
});
