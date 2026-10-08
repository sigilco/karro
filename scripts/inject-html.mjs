// Post-build HTML injector — One's static emit drops <script> elements rendered
// via React (React 19 hoists them), so the theme bootstrap and SW registration
// never reach dist/client/*.html. Injects both after `one build`.
//
// - THEME_BOOTSTRAP_JS: pre-paint dataset.theme setter (no flash on reload)
// - register-sw.js: service worker registration (PWA)
//
// Single source: extracts the THEME_BOOTSTRAP_JS template literal from
// packages/ui/theme.ts so the injected code can't drift from the store.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const clientDir = join(root, "dist/client");

const themeSrc = readFileSync(join(root, "packages/ui/theme.ts"), "utf8");
const match = themeSrc.match(/THEME_BOOTSTRAP_JS = `([^`]*)`/);
if (!match) throw new Error("THEME_BOOTSTRAP_JS not found in packages/ui/theme.ts");
const bootstrap = match[1].replace("${STORAGE_KEY}", "karro_theme");

const injections = [
  { snippet: `<script>${bootstrap}</script>`, where: "<head>", insert: "after" },
  { snippet: `<script src="/register-sw.js" defer></script>`, where: "</head>", insert: "before" },
];

for (const file of readdirSync(clientDir)) {
  if (!file.endsWith(".html")) continue;
  const path = join(clientDir, file);
  let html = readFileSync(path, "utf8");
  for (const { snippet, where, insert } of injections) {
    if (html.includes(snippet)) continue; // idempotent
    if (!html.includes(where)) throw new Error(`${file}: no ${where} tag found`);
    html = html.replace(where, insert === "after" ? `${where}${snippet}` : `${snippet}${where}`);
  }
  writeFileSync(path, html);
  console.log(`injected ${file}`);
}
