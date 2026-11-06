#!/usr/bin/env node
'use strict';

/**
 * setup-models.js
 *
 * Downloads the MediaPipe Pose Landmarker model bundle from Google's official
 * mediapipe-models storage bucket, verifies its SHA-256 checksum, and saves it
 * to apps/web/public/models/ so the web app can load it from the same origin
 * (offline-capable, no CDN at runtime).
 *
 * Model: Pose Landmarker Lite, float16, version 1
 *   URL:   https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
 *   SHA-256: 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a
 *   Size:    5,777,746 bytes
 *
 * Fails loudly (non-zero exit) if download, checksum, or write cannot complete.
 * Never silently skips.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const DEST_DIR = path.join(ROOT, 'apps', 'web', 'public', 'models');
const MODEL_FILE = 'pose_landmarker_lite.task';
const DEST_PATH = path.join(DEST_DIR, MODEL_FILE);
const CHECKSUM_PATH = path.join(DEST_DIR, `${MODEL_FILE}.sha256`);

// Official MediaPipe model source (versioned, immutable).
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Expected SHA-256, verified against multiple independent mirrors of the
// official mediapipe-models storage bucket (October 2026).
const EXPECTED_SHA256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';

const EXPECTED_SIZE = 5777746;

const DOWNLOAD_TIMEOUT_MS = 300000; // 5 minutes

function fail(message) {
  console.error(`[setup-models] ERROR: ${message}`);
  process.exit(1);
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume(); // consume response to free memory
        reject(new Error(`HTTP ${res.statusCode} while downloading ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS} ms`));
    });
  });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  console.log(`[setup-models] Downloading ${MODEL_FILE} from ${MODEL_URL}`);

  let modelBuffer;
  try {
    modelBuffer = await download(MODEL_URL);
  } catch (err) {
    fail(`Failed to download model from ${MODEL_URL}: ${err.message}`);
  }

  // 1. Verify downloaded size.
  if (modelBuffer.length !== EXPECTED_SIZE) {
    fail(
      `Size mismatch for ${MODEL_FILE}: expected ${EXPECTED_SIZE} bytes, got ${modelBuffer.length} bytes.`
    );
  }

  // 2. Verify SHA-256 checksum.
  const actualHash = sha256(modelBuffer);
  if (actualHash !== EXPECTED_SHA256) {
    fail(
      `Checksum mismatch for ${MODEL_FILE}:\n` +
        `  expected: ${EXPECTED_SHA256}\n` +
        `  actual:   ${actualHash}`
    );
  }

  // 3. Create destination directory.
  fs.mkdirSync(DEST_DIR, { recursive: true });

  // 4. Write model file.
  fs.writeFileSync(DEST_PATH, modelBuffer);

  // 5. Write sidecar checksum file.
  fs.writeFileSync(CHECKSUM_PATH, `${EXPECTED_SHA256}  ${MODEL_FILE}\n`);

  console.log(`[setup-models] OK ${MODEL_FILE} (${modelBuffer.length} bytes, SHA-256 verified)`);
  console.log(`[setup-models] Model saved to ${DEST_PATH}`);
  console.log(`[setup-models] Checksum saved to ${CHECKSUM_PATH}`);
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
});
