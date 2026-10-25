// What the project page says about this studio beyond its text: the release it offers, the features
// its tiles show (places in each language's features list, with the screenshot each shows), and the answers it points to.
export const STUDIO = {
  id: 'yue2',
  name: 'YuE2 Studio',
  repo: 'https://github.com/telesoho/YuE2-Studio',
  site: 'https://telesoho.github.io/YuE2-Studio/',
  installerMB: 319.23,
  updated: '2026-10-21',
  bento: [
    { feature: 1, shot: '02-score' },
    { feature: 3, shot: '04-cover' },
    { feature: 14, shot: '09-midi' },
    { feature: 10, shot: '08-training' },
    { feature: 19, shot: '15-covers' },
    { feature: 13, shot: '11-agent' },
  ],
  faq: { lora: 10, mcp: 13 },
  // Text under the tiles. A shot is drawn only where that language has the file.
  prose: [{ feature: 29, shot: '18-score-reading' }],
  arch: "React UI ─┐\n          ├─ YuE2-Studio.exe   (Tauri window + Rust/Axum service)\nRust axum ┘        │\n                   └─ yue2.cpp `yue-server`   (C++/CUDA, GGUF)",
};
