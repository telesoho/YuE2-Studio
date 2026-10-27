#!/bin/bash
# Builds YuE2 Studio for Linux x86-64: a .deb and an AppImage with the pinned
# yue2.cpp engine on Vulkan and the audio-to-MIDI transcriber bundled. Model weights are downloaded in the app.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
engine="$root/desktop/src-tauri/resources/yue2-cpp"
commit="$(sed -n 's/.*"commit": "\(.*\)".*/\1/p' "$root/engines/yue2-cpp-source.json")"

if [ ! -x "$engine/yue-server" ] || ! grep -q "$commit" "$engine/runtime.json" 2>/dev/null; then
    rm -rf "$engine"
    "$root/scripts/build-yue-runtime-linux.sh" "$engine"
fi

midi="$root/desktop/src-tauri/resources/music-midi"
midi_commit="$(sed -n 's/.*"commit": "\(.*\)".*/\1/p' "$root/engines/music-midi-source.json")"
if [ ! -x "$midi/music-midi" ] || [ "$(cat "$midi/runtime.commit" 2>/dev/null)" != "$midi_commit" ]; then
    rm -rf "$midi"
    "$root/scripts/build-midi-runtime-linux.sh" "$midi"
fi

cd "$root"
npm --prefix app ci --no-audit --no-fund
npm --prefix desktop ci --no-audit --no-fund
cd desktop
# The Linux release config leaves updater artifacts off so a build without the
# signing key still produces a .deb and an AppImage. Release CI sets the key
# and turns signing on; an encrypted key with no password waits on stdin.
config_args=(--config src-tauri/tauri.linux-release.conf.json)
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
        echo "TAURI_SIGNING_PRIVATE_KEY is set but TAURI_SIGNING_PRIVATE_KEY_PASSWORD is empty." >&2
        exit 1
    fi
    config_args+=(--config src-tauri/tauri.updater.conf.json)
fi
npm exec tauri build -- "${config_args[@]}" --bundles deb,appimage

find src-tauri/target/release/bundle -name '*.deb' -o -name '*.AppImage'
