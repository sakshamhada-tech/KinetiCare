#!/usr/bin/env node
'use strict';

/**
 * copy-mediapipe-assets.js
 *
 * Copies the MediaPipe Tasks Vision WASM assets from
 * node_modules/@mediapipe/tasks-vision/wasm/ into
 * apps/web/public/mediapipe/wasm/ so they are served from the same origin
 * as the web app (offline-capable, no CDN).
 *
 * Fails loudly (non-zero exit) if any step cannot complete.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const DEST_DIR = path.join(ROOT, 'apps', 'web', 'public', 'mediapipe', 'wasm');

const EXPECTED_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
];

function fail(message) {
  console.error(`[copy-mediapipe-assets] ERROR: ${message}`);
  process.exit(1);
}

function main() {
  // 1. Verify source directory exists.
  if (!fs.existsSync(SRC_DIR)) {
    fail(`Source WASM directory not found: ${SRC_DIR}. Run \`npm install\` first.`);
  }

  // 2. Verify every expected file exists in source.
  const missing = EXPECTED_FILES.filter((f) => !fs.existsSync(path.join(SRC_DIR, f)));
  if (missing.length > 0) {
    fail(`Missing WASM asset(s) in ${SRC_DIR}: ${missing.join(', ')}`);
  }

  // 3. Create destination directory.
  fs.mkdirSync(DEST_DIR, { recursive: true });

  // 4. Copy each file, verifying byte-for-byte integrity.
  let copied = 0;
  for (const file of EXPECTED_FILES) {
    const srcPath = path.join(SRC_DIR, file);
    const destPath = path.join(DEST_DIR, file);

    const srcBuffer = fs.readFileSync(srcPath);
    fs.writeFileSync(destPath, srcBuffer);

    // Verify the copy by reading it back and comparing.
    const destBuffer = fs.readFileSync(destPath);
    if (!srcBuffer.equals(destBuffer)) {
      fail(`Copy verification failed for ${file}: source and destination bytes differ.`);
    }

    copied += 1;
    console.log(`[copy-mediapipe-assets] OK ${file} (${srcBuffer.length} bytes)`);
  }

  console.log(`[copy-mediapipe-assets] Copied ${copied} WASM asset(s) to ${DEST_DIR}`);
}

main();
