// The release signing secret's public half has to be the key compiled into the
// studio. A mismatch would sign latest.json with a key every installed copy rejects.
import { readFileSync } from 'node:fs';

const conf = JSON.parse(
  readFileSync(new URL('../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const expected = String(conf.plugins?.updater?.pubkey ?? '').trim();
const got = String(process.env.TAURI_UPDATER_PUBKEY ?? '').trim();
if (!expected) {
  console.error('desktop/src-tauri/tauri.conf.json has no updater public key');
  process.exit(1);
}
if (!got) {
  console.error('TAURI_UPDATER_PUBKEY is empty');
  process.exit(1);
}
if (got !== expected) {
  console.error('TAURI_UPDATER_PUBKEY does not match desktop/src-tauri/tauri.conf.json');
  process.exit(1);
}
console.log('updater public key matches tauri.conf.json');
