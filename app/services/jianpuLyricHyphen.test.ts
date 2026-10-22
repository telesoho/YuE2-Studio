import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const abcDir = path.join(here, '../public/score/abc2svg');

function loadAbc2svg() {
  const window = new Window({ url: 'https://local.test/' });
  const sandbox: Record<string, unknown> = {
    window,
    document: window.document,
    console,
    navigator: window.navigator,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const name of ['abc2svg-1.js', 'jianpu-1.js']) {
    vm.runInContext(fs.readFileSync(path.join(abcDir, name), 'utf8'), sandbox, { filename: name });
  }
  return sandbox.abc2svg as {
    Abc: new (user: {
      img_out: (s: string) => void;
      errbld: () => void;
      errmsg: (m: string) => void;
      read_file: () => string;
    }) => { tosvg: (name: string, src: string) => void };
  };
}

function render(abc2svg: ReturnType<typeof loadAbc2svg>, src: string) {
  const buf: string[] = [];
  const abc = new abc2svg.Abc({
    img_out: (s) => buf.push(s),
    errbld: () => {},
    errmsg: () => {},
    read_file: () => '',
  });
  abc.tosvg('check', src);
  return buf.join('');
}

function holdLines(svg: string) {
  return [...svg.matchAll(/class="stroke jp-ly"[^>]*d="m([0-9.]+) [0-9.]+h([0-9.]+)"/g)].map((m) => ({
    end: +m[1] + +m[2],
    w: +m[2],
  }));
}

function restXs(svg: string) {
  return [...svg.matchAll(/class="fj[^"]*"[^>]*\bx="([0-9.]+)"[^>]*>0</g)].map((m) => +m[1]);
}

describe('jianpu lyric hyphen', () => {
  it('stops before rests after a hold dash', () => {
    const abc2svg = loadAbc2svg();
    const svg = render(
      abc2svg,
      `X:1
M:4/4
L:1/4
K:C
%%jianpu true
V:Vocal name="Vocal"
C D z2|
w: Oh - * *
`,
    );
    const zeros = restXs(svg);
    const lines = holdLines(svg);
    expect(zeros.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    const firstRest = Math.min(...zeros);
    for (const line of lines) {
      expect(line.w).toBeGreaterThan(12);
      expect(line.end).toBeLessThan(firstRest - 1);
    }
  });

  it('still draws a hold between notes', () => {
    const abc2svg = loadAbc2svg();
    const svg = render(
      abc2svg,
      `X:1
M:4/4
L:1/4
K:C
%%jianpu true
V:Vocal name="Vocal"
C D E z|
w: a - b *
`,
    );
    const lines = holdLines(svg);
    expect(lines.length).toBeGreaterThan(0);
    const firstRest = Math.min(...restXs(svg));
    for (const line of lines) {
      expect(line.w).toBeGreaterThan(12);
      expect(line.end).toBeLessThan(firstRest - 1);
    }
  });
});
