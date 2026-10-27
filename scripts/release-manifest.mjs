// Builds the updater manifest the studio downloads from the GitHub release.
//
// `fragment` records one or more platform entries from a signature file.
// `assemble` merges those fragments into latest.json (UTF-8, no byte-order mark).
// Tauri looks up `{os}-{arch}-{bundle}` and then `{os}-{arch}`.
import { readFileSync, writeFileSync } from 'node:fs';

const required = ['windows-x86_64', 'linux-x86_64', 'darwin-aarch64'];
const order = [
  'windows-x86_64',
  'windows-x86_64-msi',
  'linux-x86_64',
  'linux-x86_64-appimage',
  'linux-x86_64-deb',
  'darwin-aarch64',
  'darwin-aarch64-app',
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function signatureOf(path) {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) fail(`empty signature file: ${path}`);
  return text;
}

function entry(signature, url) {
  if (!signature || !url) fail('a platform entry needs a signature and a url');
  if (!url.startsWith('https://') || /\s/.test(url)) fail(`updater url is not https: ${url}`);
  return { signature, url };
}

function sameEntry(left, right) {
  return left.signature === right.signature && left.url === right.url;
}

function writeJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('refusing to write a BOM');
  writeFileSync(path, bytes);
}

function fragment(argv) {
  const [output, ...rest] = argv;
  if (!output || rest.length < 3 || rest.length % 3 !== 0) {
    fail('usage: release-manifest.mjs fragment <output.json> <platform> <signature-file> <url> ...');
  }
  const platforms = {};
  for (let index = 0; index < rest.length; index += 3) {
    const platform = rest[index];
    const next = entry(signatureOf(rest[index + 1]), rest[index + 2]);
    if (platforms[platform] && !sameEntry(platforms[platform], next)) {
      fail(`conflicting entries for ${platform}`);
    }
    platforms[platform] = next;
  }
  writeJson(output, platforms);
  console.log(`wrote ${Object.keys(platforms).length} platform entries`);
}

function assemble(argv) {
  let version = '';
  let pubDate = '';
  let output = '';
  const fragments = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') version = argv[++index] ?? '';
    else if (arg === '--pub-date') pubDate = argv[++index] ?? '';
    else if (arg === '--out') output = argv[++index] ?? '';
    else fragments.push(arg);
  }
  if (!output || !version || !pubDate || fragments.length === 0) {
    fail('usage: release-manifest.mjs assemble --out <latest.json> --version <x.y.z> --pub-date <rfc3339> <fragment.json>...');
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`version is not x.y.z: ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(pubDate)) fail(`pub_date is not UTC RFC3339: ${pubDate}`);

  const platforms = {};
  for (const path of fragments) {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    for (const [platform, value] of Object.entries(parsed)) {
      const next = entry(String(value?.signature ?? '').trim(), String(value?.url ?? '').trim());
      if (platforms[platform] && !sameEntry(platforms[platform], next)) {
        fail(`conflicting entries for ${platform}`);
      }
      platforms[platform] = next;
    }
  }
  for (const platform of required) {
    if (!platforms[platform]) fail(`latest.json is missing ${platform}`);
  }
  const ordered = {};
  for (const platform of order) {
    if (platforms[platform]) ordered[platform] = platforms[platform];
  }
  for (const platform of Object.keys(platforms).sort()) {
    if (!ordered[platform]) ordered[platform] = platforms[platform];
  }
  writeJson(output, {
    version,
    notes: '',
    pub_date: pubDate,
    platforms: ordered,
  });
  console.log(`latest.json platforms: ${Object.keys(ordered).join(', ')}`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'fragment') fragment(rest);
else if (command === 'assemble') assemble(rest);
else fail('usage: release-manifest.mjs <fragment|assemble> ...');
