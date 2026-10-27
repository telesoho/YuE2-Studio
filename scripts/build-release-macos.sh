#!/bin/bash
# Builds an unsigned (ad-hoc signed) YuE2 Studio .dmg for Apple Silicon:
# the pinned yue2.cpp engine with Metal is bundled into the app. Model
# weights are not part of it; they are downloaded in the app on first start.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
engine="$root/desktop/src-tauri/resources/yue2-cpp"
commit="$(sed -n 's/.*"commit": "\(.*\)".*/\1/p' "$root/engines/yue2-cpp-source.json")"

if [ ! -x "$engine/yue-server" ] || [ "$(cat "$engine/runtime.commit" 2>/dev/null)" != "$commit" ]; then
    rm -rf "$engine"
    "$root/scripts/build-yue-runtime.sh" "$engine"
    echo "$commit" > "$engine/runtime.commit"
fi

midi="$root/desktop/src-tauri/resources/music-midi"
midi_commit="$(sed -n 's/.*"commit": "\(.*\)".*/\1/p' "$root/engines/music-midi-source.json")"
if [ ! -x "$midi/music-midi" ] || [ "$(cat "$midi/runtime.commit" 2>/dev/null)" != "$midi_commit" ]; then
    rm -rf "$midi"
    "$root/scripts/build-midi-runtime.sh" "$midi"
    echo "$midi_commit" > "$midi/runtime.commit"
fi

cd "$root"
npm --prefix app ci --no-audit --no-fund
npm --prefix desktop ci --no-audit --no-fund
cd desktop
# Ad-hoc code signing stays in the macOS release config. The updater signature
# is separate and only produced when the release signing key is present.
config_args=(--config src-tauri/tauri.macos-release.conf.json)
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
        echo "TAURI_SIGNING_PRIVATE_KEY is set but TAURI_SIGNING_PRIVATE_KEY_PASSWORD is empty." >&2
        exit 1
    fi
    config_args+=(--config src-tauri/tauri.updater.conf.json)
fi
npm exec tauri build -- "${config_args[@]}" --bundles dmg

find src-tauri/target/release/bundle/dmg -name '*.dmg'
