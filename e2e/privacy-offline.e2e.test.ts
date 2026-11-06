/**
 * privacy-offline.e2e.test.ts
 *
 * Privacy/offline E2E tests:
 *   - Zero non-local network requests during the golden path
 *   - Pose model and WASM assets load from same-origin only
 */

import { test, expect } from '@playwright/test';

test('zero non-local network requests during golden path', async ({ page }) => {
  const nonLocalRequests: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    const isLocal =
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:') ||
      url.startsWith('https://localhost:') ||
      url.startsWith('https://127.0.0.1:');
    if (!isLocal) {
      nonLocalRequests.push(url);
    }
  });

  // Navigate through the app (live session page).
  await page.goto('/live', { waitUntil: 'networkidle' });

  // Interact with controls (no camera needed to just mount).
  const startBtn = page.getByRole('button', { name: /start camera/i });
  if ((await startBtn.count()) > 0) {
    await startBtn.click();
  }

  // Wait a tick for any network activity.
  await page.waitForTimeout(1000);

  // Assert no non-local requests were made.
  expect(nonLocalRequests).toEqual([]);
});

test('pose model + WASM loaded from same-origin paths only', async ({ page }) => {
  const externalAssetRequests: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    // Same-origin asset paths we expect:
    //   /mediapipe/wasm/*
    //   /models/pose_landmarker_lite.task
    const isLocalAsset =
      url.includes('/mediapipe/wasm/') || url.includes('/models/pose_landmarker_lite.task');
    const isExternal =
      url.includes('storage.googleapis.com') ||
      url.includes('cdn.jsdelivr.net') ||
      url.includes('mediapipe-models');
    if (isExternal || (!isLocalAsset && url.includes('mediapipe'))) {
      externalAssetRequests.push(url);
    }
  });

  await page.goto('/live', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  expect(externalAssetRequests).toEqual([]);
});
