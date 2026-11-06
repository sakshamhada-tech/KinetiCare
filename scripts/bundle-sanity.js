'use strict';

/**
 * Sanity checks on the production web bundle:
 *   - no external http(s) URLs that the app would fetch at runtime
 *     (all assets must be self-hosted / same-origin)
 *   - no test-only flags or test-only imports compiled in
 *
 * Copied MediaPipe WASM assets under dist/mediapipe/wasm/ are excluded
 * because they contain benign URLs in comments (emscripten toolchain),
 * not runtime network calls.
 *
 * React and react-router bundle internal strings that look like URLs
 * (error-documentation links, XML/XLink/SVG namespace identifiers,
 * localhost dev strings) but are never fetched. Those are benign and ignored.
 */

import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'apps/web/dist');
const assets = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) assets.push(full);
  }
}
collect(dist);

// Skip copied MediaPipe WASM assets — they contain emscripten comment URLs,
// not runtime fetch targets.
const isWasmAsset = (file) => file.includes('/mediapipe/wasm/');

// Benign http(s) strings bundled by third-party UI libraries that are not
// network endpoints the app fetches.
const benignUrl = /w3\.org\//;
const benignOrigin = [
  'http://localhost',
  'https://react.dev/errors/',
  'https://reactrouter.com/',
  'https://json-schema.org/draft/', // zod JSON Schema $schema reference
  'https://odml.pa.googleapis.com/', // protobufjs internal logging endpoint string
];

let failures = 0;
for (const file of assets) {
  // Skip WASM asset directory entirely.
  if (isWasmAsset(file)) continue;

  const src = fs.readFileSync(file, 'utf8');

  // External URL check (allow relative paths).
  const externalUrl = src.match(/\b(https?:)\/\/[^"'\s]+/gi);
  if (externalUrl) {
    for (const m of externalUrl) {
      // Skip template literals (contain ${) — not real URLs.
      if (m.includes('${')) continue;
      const isBenign = benignUrl.test(m) || benignOrigin.some((o) => m.startsWith(o));
      if (!isBenign) {
        console.error(`[bundle-sanity] EXTERNAL URL in ${file}: ${m.slice(0, 120)}`);
        failures += 1;
      }
    }
  }

  // Test-only flag must not ship to production.
  // `describe(` and `it(` are omitted here because minified third-party
  // libraries use them as variable/function names (false positives).
  // Real test code would import from vitest/@testing-library, which we
  // catch via the `vitest` marker below.
  for (const [marker, re] of [
    ['__TEST_ONLY__', /__TEST_ONLY__/],
    ['vitest', /\bvitest\b/],
  ]) {
    if (re.test(src)) {
      console.error(`[bundle-sanity] TEST-ONLY MARKER '${marker}' in ${file}`);
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`[bundle-sanity] FAILED with ${failures} issue(s)`);
  process.exit(1);
}
console.log(
  `[bundle-sanity] OK (${assets.length} asset(s) checked, no external URLs or test flags)`
);
process.exit(0);
