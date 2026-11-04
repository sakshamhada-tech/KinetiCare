'use strict';

/** Sanity checks on the production web bundle:
 *  - no external http(s) URLs that the app would fetch at runtime (all assets self-hosted)
 *  - no test-only flags/replay sources compiled in
 *
 * React and react-router bundle internal strings that look like URLs
 * (error-documentation links, XML/XLink/SVG namespace identifiers, localhost
 * dev strings) but are never fetched. Those are benign and ignored. The checks
 * below still flag genuine external endpoints and imported test code.
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

// Benign http(s) strings bundled by third-party UI libraries that are not
// network endpoints the app fetches:
//   - w3.org/*  XML / SVG / MathML / XLink namespace identifiers
//   - http://localhost  dev-only string
//   - https://react.dev/errors/  React error-documentation link
//   - https://reactrouter.com/  react-router documentation link
const benignUrl = /w3\.org\//;
const benignOrigin = ['http://localhost', 'https://react.dev/errors/', 'https://reactrouter.com/'];

let failures = 0;
for (const file of assets) {
  const src = fs.readFileSync(file, 'utf8');
  // External URL check (allow relative paths and protocol-relative nothing).
  const externalUrl = src.match(/\b(https?:)\/\/[^"'\s]+/gi);
  if (externalUrl) {
    for (const m of externalUrl) {
      const isBenign = benignUrl.test(m) || benignOrigin.some((o) => m.startsWith(o));
      if (!isBenign) {
        console.error(`[bundle-sanity] EXTERNAL URL in ${file}: ${m.slice(0, 120)}`);
        failures += 1;
      }
    }
  }
  // Test-only flag / replay source must not ship to production.
  // Use word boundaries so `it(` does not match `split(`, etc.
  for (const [marker, re] of [
    ['ReplayPoseSource', /ReplayPoseSource/],
    ['__TEST_ONLY__', /__TEST_ONLY__/],
    ['vitest', /\bvitest\b/],
    ['describe(', /\bdescribe\(/],
    ['it(', /\bit\(/],
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
