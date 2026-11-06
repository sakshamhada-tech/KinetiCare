#!/usr/bin/env node
'use strict';

/**
 * verify-scripts-exist.js
 *
 * Checks that every script declared in any package.json (root + workspaces)
 * references an existing, executable entry point. Fails loudly (non-zero exit)
 * on the first missing or unresolvable script.
 *
 * For npm script entries (e.g. "npm --prefix apps/web run dev"), verifies the
 * target package.json exists and has the referenced script.
 * For direct node invocations (e.g. "node scripts/foo.js"), verifies the file
 * exists.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKSPACE_PACKAGES = [
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'apps', 'web', 'package.json'),
  path.join(ROOT, 'apps', 'server', 'package.json'),
  path.join(ROOT, 'packages', 'shared', 'package.json'),
];

function fail(message) {
  console.error(`[verify-scripts] ERROR: ${message}`);
  process.exit(1);
}

/**
 * Extract direct `node scripts/...` references from a script command.
 * Quotes around the file path are stripped.
 */
function nodeFileRefs(command) {
  const refs = [];
  // Match: node [--experimental-strip-types] <file.ts|file.js>
  const nodeRe = /node\s+(--experimental-strip-types\s+)?["']?([^\s&|;`"']+\.ts|\.js)["']?/g;
  let m;
  while ((m = nodeRe.exec(command)) !== null) {
    refs.push(m[2]);
  }
  return refs;
}

/**
 * Extract the target directory and script name from an
 * `npm --prefix <dir> run <script>` command, stripping surrounding quotes.
 */
function prefixScriptRef(command) {
  const m = command.match(/npm\s+--prefix\s+["']?([^\s"']+)["']?\s+run\s+["']?([^\s"']+)["']?/);
  return m ? { dir: m[1], script: m[2] } : null;
}

function main() {
  let failures = 0;

  for (const pkgPath of WORKSPACE_PACKAGES) {
    if (!fs.existsSync(pkgPath)) {
      console.log(`[verify-scripts] WARN: ${pkgPath} not found, skipping`);
      continue;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const pkgDir = path.dirname(pkgPath);

    console.log(`[verify-scripts] Checking ${pkg.name || path.basename(pkgDir)}`);

    for (const [name, cmd] of Object.entries(scripts)) {
      if (typeof cmd !== 'string') continue;

      // "npm --prefix <dir> run <script>" — check the target package has that script.
      const prefixRef = prefixScriptRef(cmd);
      if (prefixRef) {
        const targetDir = path.resolve(pkgDir, prefixRef.dir);
        const targetPkgPath = path.join(targetDir, 'package.json');
        const targetScript = prefixRef.script;
        if (!fs.existsSync(targetPkgPath)) {
          console.error(`  MISSING: ${pkg.name} script "${name}" → ${targetPkgPath} not found`);
          failures += 1;
          continue;
        }
        const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
        if (!targetPkg.scripts || !targetPkg.scripts[targetScript]) {
          console.error(
            `  MISSING: ${pkg.name} script "${name}" → "${targetScript}" not in ${targetPkgPath}`
          );
          failures += 1;
        }
        continue;
      }

      // Direct `node <file>` invocation — check file exists.
      const fileRefs = nodeFileRefs(cmd);
      for (const fileRef of fileRefs) {
        const filePath = path.resolve(pkgDir, fileRef);
        if (!fs.existsSync(filePath)) {
          console.error(`  MISSING: ${pkg.name} script "${name}" → ${filePath} not found`);
          failures += 1;
        }
      }
    }
  }

  if (failures > 0) {
    fail(`${failures} script reference(s) not found.`);
  }

  console.log('[verify-scripts] All package.json script references resolved.');
}

main();
