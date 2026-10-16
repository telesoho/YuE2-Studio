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

type LeadSheet = {
  error: string | null;
  title: string;
  sections: Array<{
    label: string;
    lines: Array<{ kind: string; cells: Array<{ text: string; chord: string; bar?: boolean }> }>;
  }>;
  chords: Array<{ symbol: string }>;
};

const editor = (globalThis as {
  yueScoreEditor?: {
    leadSheet: (abc: string, fallbackTitle?: string) => LeadSheet;
    leadSheetDocument: (sheet: LeadSheet) => string;
    rewriteCjkFonts: (text: string) => string;
    embedPdfFonts: (svg: string) => string;
    displayTitle: (abc: string, fallback?: string) => string;
    withDisplayTitle: (abc: string, fallback?: string) => string;
  };
}).yueScoreEditor!;

const ABC = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
K:C
C4D4E4F4|`;

const LEAD_ABC = `X:1
T:知了
M:4/4
L:1/16
Q:1/4=72
V: Vocal clef=treble
V: Ins clef=treble
K:C
% 前奏
V: Vocal
"Am"z4"G"z4"C"z4"F"z4|
V: Ins
Z|
% 主歌
V: Vocal
"C"C4D4E4"Em7"F4|
w: 知 了 夏 天
V: Ins
Z|
`;

describe('JianpuEditor', () => {
  it('keeps a Save when Cancel closes the editor', async () => {
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
      const rootEl = document.querySelector('.yue-jp-editor');
      expect(rootEl).toBeInstanceOf(HTMLElement);
      const save = document.querySelector('.yue-jp-editor [data-act="save"]') as HTMLButtonElement;
      await act(async () => {
        save.click();
      });
      const status = document.querySelector('.yue-jp-status');
      expect(status?.textContent).toBe('Updated (form)');
      expect(status?.classList.contains('ok')).toBe(true);
      const textBefore = (document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement).value;
      status!.textContent = '';
      status!.classList.remove('ok');
      await act(async () => {
        save.click();
      });
      expect(status?.textContent).toBe('Updated (form)');
      expect(status?.classList.contains('ok')).toBe(true);
      await act(async () => {
        root!.render(
          <StrictMode>
            <I18nProvider>
              <JianpuEditor abc={`${ABC}\nC4D4E4F4|`} onClose={value => closed.push(value)} />
            </I18nProvider>
          </StrictMode>,
        );
      });
      expect(document.querySelector('.yue-jp-status')?.textContent).toBe('Updated (form)');
      expect((document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement).value).toBe(textBefore);
      await act(async () => {
        (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement).click();
      });
      expect(closed.length).toBeGreaterThan(0);
      expect(closed[closed.length - 1]?.replace(/\s+/g, '')).toBe(ABC.replace(/\s+/g, ''));
    } finally {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
      globals.abc2svg = previous;
    }
  });

  it('numbers each text-score line and marks the error line', async () => {
    localStorage.setItem('language', 'en');
    const globals = globalThis as { abc2svg?: unknown };
    const previous = globals.abc2svg;
    globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(host);
        root.render(
          <StrictMode>
            <I18nProvider>
              <JianpuEditor abc={ABC} onClose={() => {}} />
            </I18nProvider>
          </StrictMode>,
        );
      });
      const text = document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement;
      const numbers = () => [...document.querySelectorAll('.yue-jp-lines-inner > div')].map(el => el.textContent);
      expect(numbers()).toEqual(text.value.split('\n').map((_, i) => String(i + 1)));
      const broken = `${text.value}\n???`;
      await act(async () => {
        text.value = broken;
        text.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 180));
      });
      expect(numbers()).toEqual(broken.split('\n').map((_, i) => String(i + 1)));
      const status = document.querySelector('.yue-jp-status')?.textContent || '';
      const line = Number(/^Line (\d+):/.exec(status)?.[1]);
      expect(line).toBe(broken.split('\n').length);
      expect(document.querySelector('.yue-jp-lines-inner > div.bad')?.textContent).toBe(String(line));
    } finally {
      await act(async () => {
        (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement | null)?.click();
        root?.unmount();
      });
      host.remove();
      globals.abc2svg = previous;
    }
  });

  it('opens the score editor under StrictMode', async () => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('yue-jp-chord-diagram', 'off');
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
      const rootEl = document.querySelector('.yue-jp-editor');
      expect(rootEl).toBeInstanceOf(HTMLElement);
      expect((rootEl as HTMLElement).hidden).toBe(false);
      expect(document.querySelector('.yue-jp-editor h2')?.textContent).toBe('Edit jianpu');
      const cancel = document.querySelector('.yue-jp-editor [data-act="cancel"]');
      expect(cancel).toBeInstanceOf(HTMLButtonElement);
      expect(cancel?.querySelector('svg')).toBeTruthy();
      expect(cancel?.textContent?.trim()).toBe('');
      expect(cancel?.getAttribute('title')).toBe('Cancel');
      const printBtn = document.querySelector('.yue-jp-editor [data-act="print"]');
      expect(printBtn).toBeInstanceOf(HTMLButtonElement);
      expect(printBtn?.getAttribute('title')).toBe('Print the jianpu (A4)');
      expect(document.querySelector('.yue-jp-editor [data-act="lead"]')?.textContent).toBe('Lead sheet');
      const diagram = document.querySelector('.yue-jp-editor [data-act="diagram"]');
      expect(diagram).toBeInstanceOf(HTMLButtonElement);
      expect(diagram?.getAttribute('data-diagram')).toBe('off');
      expect(diagram?.querySelector('svg')).toBeTruthy();
      const offSvg = diagram?.innerHTML ?? '';
      await act(async () => {
        (diagram as HTMLButtonElement).click();
      });
      expect(diagram?.getAttribute('data-diagram')).toBe('guitar');
      expect(diagram?.querySelector('svg')).toBeTruthy();
      expect(diagram?.innerHTML).not.toBe(offSvg);
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

  it('puts rest-line chords on beats and lyric chords on syllables', () => {
    const sheet = editor.leadSheet(LEAD_ABC);
    expect(sheet.error).toBeFalsy();
    expect(sheet.chords.map(c => c.symbol)).toEqual(['Am', 'G', 'C', 'F', 'Em7']);
    expect(sheet.sections.map(s => s.label)).toEqual(['前奏', '主歌']);
    const intro = sheet.sections[0].lines[0];
    expect(intro.kind).toBe('beats');
    const beatCells = intro.cells.filter(c => !c.bar);
    expect(beatCells.map(c => c.text)).toEqual(['-', '-', '-', '-']);
    expect(beatCells.map(c => c.chord)).toEqual(['Am', 'G', 'C', 'F']);
    const verse = sheet.sections[1].lines[0];
    expect(verse.kind).toBe('lyrics');
    expect(verse.cells.map(c => c.text)).toEqual(['知', '了', '夏', '天']);
    expect(verse.cells.map(c => c.chord)).toEqual(['C', '', '', 'Em7']);
    expect(verse.cells.every(c => c.text)).toBe(true);
  });

  it('uses the library title when T: is blank, and keeps an existing T:', () => {
    const blank = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble
V: Ins clef=treble
K:C
V: Vocal
C4D4E4F4|
V: Ins
Z|
`;
    expect(blank).toMatch(/^T:\s*$/m);
    expect(editor.displayTitle(blank, 'さよならの夏')).toBe('さよならの夏');
    expect(editor.withDisplayTitle(blank, 'さよならの夏')).toMatch(/^T:さよならの夏$/m);
    expect(editor.withDisplayTitle(blank, 'さよならの夏')).not.toMatch(/^T:\s*$/m);
    expect(editor.leadSheet(blank, 'さよならの夏').title).toBe('さよならの夏');
    expect(editor.leadSheetDocument(editor.leadSheet(blank, 'さよならの夏'))).toContain('さよならの夏');
    expect(editor.displayTitle(LEAD_ABC, 'other')).toBe('知了');
    expect(editor.withDisplayTitle(LEAD_ABC, 'other')).toMatch(/^T:知了$/m);
    expect(editor.leadSheet(LEAD_ABC, 'other').title).toBe('知了');
  });

  it('builds a light lead document with lyric cells', () => {
    const sheet = editor.leadSheet(LEAD_ABC);
    const html = editor.leadSheetDocument(sheet);
    expect(html).toContain('知');
    expect(html).toContain('夏');
    expect(html).toContain('.yue-jp-lead-ly{');
    expect(html).toContain('color:#18181b');
    expect(html).toContain('background:#fff');
  });

  it('rewrites CJK font stacks for PDF SVG rasterization', () => {
    const src = '<svg><style>.f0{font:13px text,serif}.fj{font:15px sans-serif}</style></svg>';
    const out = editor.rewriteCjkFonts(src);
    expect(out).toContain('Yu Gothic UI');
    expect(out).toContain('Microsoft YaHei');
    expect(out).not.toContain('text,serif');
    expect(out).not.toMatch(/font:15px sans-serif/);
  });
});
