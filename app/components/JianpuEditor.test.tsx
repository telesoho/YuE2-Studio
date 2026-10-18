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
  keyLabel: string;
  originalKeyLabel: string;
  capoFret: number | null;
  sections: Array<{
    label: string;
    lines: Array<{ kind: string; cells: Array<{ text: string; chord: string; bar?: boolean }> }>;
  }>;
  chords: Array<{ symbol: string }>;
};

const editor = (globalThis as {
  yueScoreEditor?: {
    leadSheet: (abc: string, fallbackTitle?: string, keyName?: string) => LeadSheet;
    leadSheetDocument: (sheet: LeadSheet) => string;
    capoFret: (originalName: string, selectedName: string) => number | null;
    keyLegend: (originalName: string, selectedName: string) => string;
    withKeyLegend: (abc: string, legend: string) => string;
    setStrings: (next: Record<string, string>) => void;
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

function press(key: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

async function commitText(next: string) {
  const text = document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement;
  await act(async () => {
    text.value = next;
    text.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
}

async function mountEditor(abc: string) {
  localStorage.setItem('language', 'en');
  const globals = globalThis as { abc2svg?: unknown };
  const previous = globals.abc2svg;
  globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <StrictMode>
        <I18nProvider>
          <JianpuEditor abc={abc} onClose={() => {}} />
        </I18nProvider>
      </StrictMode>,
    );
  });
  return {
    async close() {
      await act(async () => {
        (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement | null)?.click();
        root?.unmount();
      });
      host.remove();
      globals.abc2svg = previous;
    },
  };
}

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
      expect(document.querySelector('.yue-jp-orig-key')?.textContent).toBe('1=C');
      expect(document.querySelector('.yue-jp-capo')?.textContent).toBe('Capo 0');
      const keySelect = document.querySelector('.yue-jp-chord-key');
      expect(keySelect).toBeInstanceOf(HTMLSelectElement);
      expect((keySelect as HTMLSelectElement).value).toBe('C');
      await act(async () => {
        (keySelect as HTMLSelectElement).value = 'G';
        keySelect?.dispatchEvent(new Event('change'));
      });
      expect((keySelect as HTMLSelectElement).value).toBe('G');
      expect(document.querySelector('.yue-jp-orig-key')?.textContent).toBe('1=C');
      expect(document.querySelector('.yue-jp-capo')?.textContent).toBe('Capo 5');
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

  it('transposes lead-sheet chords into the selected key', () => {
    const sheet = editor.leadSheet(LEAD_ABC, undefined, 'G');
    expect(sheet.originalKeyLabel).toBe('1=C');
    expect(sheet.keyLabel).toBe('1=G');
    expect(sheet.capoFret).toBe(5);
    expect(sheet.chords.map(c => c.symbol)).toEqual(['Em', 'D', 'G', 'C', 'Bm7']);
    const intro = sheet.sections[0].lines[0];
    expect(intro.cells.filter(c => !c.bar).map(c => c.chord)).toEqual(['Em', 'D', 'G', 'C']);
    expect(sheet.sections[1].lines[0].cells.map(c => c.chord)).toEqual(['G', '', '', 'Bm7']);
    expect(editor.leadSheet(LEAD_ABC, undefined, 'F').chords.map(c => c.symbol)).toEqual(['Dm', 'C', 'F', 'Bb', 'Am7']);
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

  it('places the capo fret between the selected key and the original key', () => {
    expect(editor.capoFret('C', 'C')).toBe(0);
    expect(editor.capoFret('E', 'C')).toBe(4);
    expect(editor.capoFret('C', 'G')).toBe(5);
    expect(editor.capoFret('Em', 'Am')).toBe(7);
    expect(editor.capoFret('C', 'Am')).toBeNull();
    editor.setStrings({
      jpLeadKey: '选调',
      jpCapoAt: '变调夹 {n}品',
      jpOriginalKey: '原调',
      jpLead: '弹唱谱',
    });
    expect(editor.keyLegend('E', 'C')).toBe('选调 1=C  变调夹 4品  原调 1=E');
    const engraved = editor.withKeyLegend('T:知了\nK:C\n', editor.keyLegend('C', 'C'));
    expect(engraved).toBe('T:知了\nT:选调 1=C  变调夹 0品  原调 1=C\nK:C\n');
    const sheet = editor.leadSheet(LEAD_ABC, undefined, 'C');
    const html = editor.leadSheetDocument(sheet);
    const selected = html.indexOf('选调');
    const capo = html.indexOf('变调夹 0品');
    const original = html.indexOf('原调');
    expect(selected).toBeGreaterThan(-1);
    expect(selected).toBeLessThan(capo);
    expect(capo).toBeLessThan(original);
  });

  it('undoes and redoes text and note edits', async () => {
    const vocal = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
K:C
V: Vocal
C4D4E4F4|
`;
    const mounted = await mountEditor(vocal);
    try {
      const undo = () => document.querySelector('.yue-jp-editor [data-act="undo"]') as HTMLButtonElement;
      const redo = () => document.querySelector('.yue-jp-editor [data-act="redo"]') as HTMLButtonElement;
      const text = () => document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement;
      const abc = () => (editor as { currentAbc: () => string }).currentAbc();
      expect(undo().disabled).toBe(true);
      expect(redo().disabled).toBe(true);
      expect(undo().getAttribute('aria-label')).toBe('Undo (Ctrl+Z)');
      expect(redo().getAttribute('aria-label')).toBe('Redo (Ctrl+Y)');

      const written = text().value;
      await commitText(written.replace('♩=120', '♩=90'));
      expect(abc()).toContain('Q:1/4=90');
      expect(undo().disabled).toBe(false);

      press('z', { ctrlKey: true });
      expect(abc()).toBe(vocal);
      expect(text().value).toContain('♩=120');
      expect(undo().disabled).toBe(true);
      expect(redo().disabled).toBe(false);

      press('y', { ctrlKey: true });
      expect(abc()).toContain('Q:1/4=90');
      expect(redo().disabled).toBe(true);

      press('z', { ctrlKey: true });
      await commitText(text().value.replace('♩=120', '♩=60'));
      expect(abc()).toContain('Q:1/4=60');
      expect(redo().disabled).toBe(true);
      press('y', { ctrlKey: true });
      expect(abc()).toContain('Q:1/4=60');

      const lines = text().value.split('\n');
      const voice = lines.findIndex((line) => line.trim() === 'V:');
      const digit = /[1-7]/.exec(lines[voice + 1] || '');
      expect(digit).not.toBeNull();
      const caret = lines.slice(0, voice + 1).join('\n').length + 1 + (digit?.index || 0);
      const area = text();
      area.focus();
      area.setSelectionRange(caret, caret);
      area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      (document.querySelector('.yue-jp-card') as HTMLElement).focus();
      press('5');
      expect(abc()).toMatch(/G4\s+D4\s+E4\s+F4/);
      undo().click();
      expect(abc()).toMatch(/C4\s+D4\s+E4\s+F4/);
      expect(abc()).not.toMatch(/G4/);
      redo().click();
      expect(abc()).toMatch(/G4\s+D4\s+E4\s+F4/);
    } finally {
      await mounted.close();
    }
  });

  it('groups rapid text edits and ignores an unreadable line', async () => {
    const mounted = await mountEditor(ABC);
    try {
      const undo = () => document.querySelector('.yue-jp-editor [data-act="undo"]') as HTMLButtonElement;
      const text = () => document.querySelector('#yue-jp-score-text') as HTMLTextAreaElement;
      const abc = () => (editor as { currentAbc: () => string }).currentAbc();
      const written = text().value;

      await commitText(`${written}\n???`);
      expect(undo().disabled).toBe(true);
      expect(abc()).toBe(ABC);

      await commitText(written.replace('♩=120', '♩=90'));
      await commitText(written.replace('♩=120', '♩=60'));
      expect(abc()).toContain('Q:1/4=60');
      press('z', { ctrlKey: true });
      expect(abc()).toBe(ABC);

      await commitText(text().value.replace('♩=120', '♩=90'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 900));
      });
      await commitText(text().value.replace('♩=90', '♩=60'));
      press('z', { ctrlKey: true });
      expect(abc()).toContain('Q:1/4=90');
      press('Z', { ctrlKey: true, shiftKey: true });
      expect(abc()).toContain('Q:1/4=60');
      press('z', { ctrlKey: true });
      press('z', { ctrlKey: true });
      expect(abc()).toBe(ABC);
    } finally {
      await mounted.close();
    }
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
