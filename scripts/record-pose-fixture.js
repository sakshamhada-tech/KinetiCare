#!/usr/bin/env node
'use strict';

/**
 * record-pose-fixture.js
 *
 * Records a landmark fixture from a live camera pose session and saves it as
 * a JSON file (numbers only — no video, no images). Intended for offline
 * testing and replay via ReplayPoseSource.
 *
 * Usage:
 *   node scripts/record-pose-fixture.js <output-file.json> [duration-ms]
 *
 * Prints progress to stderr. Writes a JSON array of { timestampMs, landmarks[] }
 * frames to the output file.
 *
 * Fails loudly (non-zero exit) if camera access, MediaPipe loading, or file
 * writing fails.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const DEFAULT_DURATION_MS = 10000; // 10 seconds

function fail(message) {
  console.error(`[record-pose-fixture] ERROR: ${message}`);
  process.exit(1);
}

async function main() {
  const outputFile = process.argv[2];
  const durationMs = parseInt(process.argv[3] || String(DEFAULT_DURATION_MS), 10);

  if (!outputFile) {
    fail('Usage: node scripts/record-pose-fixture.js <output-file.json> [duration-ms]');
  }

  if (Number.isNaN(durationMs) || durationMs <= 0) {
    fail(`Invalid duration-ms: ${process.argv[3]}`);
  }

  // Resolve output path relative to cwd, ensure parent dir exists.
  const outPath = path.resolve(ROOT, outputFile);
  const outParent = path.dirname(outPath);
  fs.mkdirSync(outParent, { recursive: true });

  // Dynamically import the browser-only LiveCameraPoseSource.
  // This script is intended to run in a browser-like environment (e.g.
  // Playwright or jsdom with MediaPipe polyfilled). In plain Node it will
  // fail because navigator.mediaDevices and PoseLandmarker are unavailable.
  let LiveCameraPoseSource;
  try {
    const mod = await import('../apps/web/src/pose/live-camera-pose-source.ts');
    LiveCameraPoseSource = mod.LiveCameraPoseSource;
  } catch (err) {
    fail(
      `Failed to import LiveCameraPoseSource: ${err.message}. ` +
        'This script must run in a browser environment with MediaPipe available.'
    );
  }

  const source = new LiveCameraPoseSource({
    minLandmarkConfidence: 0.5,
    requireAllLandmarks: false,
  });

  const frames = [];
  const startTime = Date.now();

  source.onResult((result) => {
    const elapsed = Date.now() - startTime;
    frames.push({
      timestampMs: result.timestampMs,
      landmarks: result.landmarks.map((lm) => ({
        index: lm.index,
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      })),
    });
    process.stderr.write(
      `\rRecorded frame ${frames.length} at t=${elapsed}ms (${result.landmarks.length} landmarks)`
    );
  });

  try {
    await source.start();
  } catch (err) {
    fail(`Failed to start camera pose source: ${err.message}`);
  }

  // Auto-stop after duration.
  setTimeout(async () => {
    try {
      await source.stop();
    } catch {
      // Best-effort stop.
    }

    const fixture = {
      recordedAt: new Date().toISOString(),
      durationMs,
      frameCount: frames.length,
      frames,
    };

    fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
    process.stderr.write(`\n[record-pose-fixture] Wrote ${frames.length} frames to ${outPath}\n`);
    process.exit(0);
  }, durationMs);
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
});
