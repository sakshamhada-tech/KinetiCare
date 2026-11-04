'use strict';

/** Fail if any raw hex color appears in component/style source outside the
 *  design-token file (apps/web/src/styles/tokens.css). Enforces DESIGN.md.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tokenFile = path.join(root, 'apps/web/src/styles/tokens.css');

// Match hex colors like #f0f0f0, #fff, #FF0000 (with optional surrounding chars).
const hexRe = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

const sourceDirs = [path.join(root, 'apps/web/src'), path.join(root, 'packages/shared/src')];
let failures = 0;
let checked = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.match(/\.(ts|tsx|css)$/)) {
      checked += 1;
      const src = fs.readFileSync(full, 'utf8');
      // Tokens file is the single allowed location for hex colors.
      if (full === tokenFile) continue;
      let m;
      while ((m = hexRe.exec(src)) !== null) {
        console.error(`[hex-color-check] RAW HEX ${m[0]} in ${full}`);
        failures += 1;
      }
    }
  }
}

for (const dir of sourceDirs) walk(dir);

if (failures > 0) {
  console.error(`[hex-color-check] FAILED: ${failures} raw hex color(s) outside ${tokenFile}`);
  process.exit(1);
}
console.log(`[hex-color-check] OK (${checked} file(s) checked, no raw hex colors outside tokens)`);
process.exit(0);
