/**
 * record-demo.ts — Playwright script to record a video of the Cortex Underwriter interactive demo.
 *
 * Prerequisites:
 *   - Agent runtime running at localhost:4567
 *   - Dashboard running at localhost:3004
 *
 * Usage:
 *   npx tsx scripts/record-demo.ts
 */

import { chromium, type Page, type BrowserContext, type Browser } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const DASHBOARD_URL = "http://localhost:3004";
const AGENT_API_URL = "http://localhost:4567";
const DEMO_PATH = "/demo";

// Timeouts
const STEP_TIMEOUT = 60_000; // 60s per step (on-chain txs can be slow)
const PAGE_LOAD_TIMEOUT = 15_000;
const VIEWER_PAUSE = 2_500; // pause between steps so viewers can follow

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function smoothScroll(page: Page, y: number) {
  await page.evaluate((scrollY) => {
    window.scrollTo({ top: scrollY, behavior: "smooth" });
  }, y);
  await page.waitForTimeout(800);
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
  await page.waitForTimeout(800);
}

async function scrollToTop(page: Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  await page.waitForTimeout(800);
}

/**
 * Wait for a specific step card to reach "complete" status.
 * Step cards transition: pending -> active -> complete.
 * A completed step has a checkmark SVG inside its number circle (bg-emerald-500).
 */
async function waitForStepComplete(
  page: Page,
  stepNumber: number,
  timeout: number = STEP_TIMEOUT
): Promise<void> {
  // The step cards are rendered in order. Each StepCard has a number circle.
  // When complete, the circle gets bg-emerald-500 and shows a checkmark SVG.
  // We can target the nth step card's circle by looking for the emerald background.
  //
  // Strategy: wait for the nth .relative.flex.gap-4 container to have
  // a circle with bg-emerald-500 class.
  const selector = `.relative.flex.gap-4:nth-child(${stepNumber}) .bg-emerald-500`;

  await page.waitForSelector(selector, { timeout, state: "visible" });
}

/**
 * Wait for a step to become active (blue pulsing indicator).
 */
async function waitForStepActive(
  page: Page,
  stepNumber: number,
  timeout: number = STEP_TIMEOUT
): Promise<void> {
  // Active steps have bg-blue-500 on their number circle
  const selector = `.relative.flex.gap-4:nth-child(${stepNumber}) [class*="bg-blue-500"]`;
  await page.waitForSelector(selector, { timeout, state: "visible" });
}

async function checkService(url: string, name: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    console.error(`[PREFLIGHT] ${name} is not reachable at ${url}`);
    return false;
  }
}

async function main() {
  const currentFile = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFile), "..");
  const recordingsDir = path.join(projectRoot, "recordings");
  const screenshotsDir = path.join(projectRoot, "screenshots");

  await ensureDir(recordingsDir);
  await ensureDir(screenshotsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // ── Preflight checks ──────────────────────────────────────────────────────
  console.log("[PREFLIGHT] Checking services...");

  const dashboardOk = await checkService(
    `${DASHBOARD_URL}`,
    "Dashboard"
  );
  const agentOk = await checkService(
    `${AGENT_API_URL}/health`,
    "Agent API"
  );

  if (!dashboardOk) {
    console.error(
      `[PREFLIGHT] Dashboard is not running at ${DASHBOARD_URL}. Start it first:\n  cd dashboard && npm run dev -- -p 3004`
    );
    process.exit(1);
  }

  if (!agentOk) {
    console.warn(
      `[PREFLIGHT] Agent API is not running at ${AGENT_API_URL}. The demo will show the API-offline banner and the Start Demo button will be disabled.`
    );
    console.warn(
      "[PREFLIGHT] Proceeding anyway — the recording will capture the offline state."
    );
  }

  // ── Launch browser ─────────────────────────────────────────────────────────
  console.log("[RECORD] Launching Chromium...");

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
    colorScheme: "dark",
  });

  const page = await context.newPage();

  try {
    // ── Step 1: Navigate to demo page ──────────────────────────────────────
    console.log("[RECORD] Navigating to demo page...");

    await page.goto(`${DASHBOARD_URL}${DEMO_PATH}`, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT,
    });

    // Wait for the page to fully render (dark theme, contract info visible)
    await page.waitForTimeout(3000);

    // ── Step 2: Screenshot initial state ───────────────────────────────────
    console.log("[RECORD] Taking initial screenshot...");

    await page.screenshot({
      path: path.join(screenshotsDir, `demo-initial-${timestamp}.png`),
      fullPage: false,
    });

    // ── Step 3: Scroll to show agent wallets ───────────────────────────────
    console.log("[RECORD] Scrolling to agent wallets section...");

    // The "Deployed Contracts" section and agent cards in Step 1 are near the top.
    // Scroll down slightly to bring the Start Demo button and Step 1 cards into view.
    await smoothScroll(page, 300);
    await page.waitForTimeout(VIEWER_PAUSE);

    // ── Step 4: Click "Start Demo" ─────────────────────────────────────────
    if (!agentOk) {
      console.log(
        "[RECORD] Agent API is offline — Start Demo button is disabled. Taking screenshot and exiting."
      );
      await page.screenshot({
        path: path.join(screenshotsDir, `demo-offline-${timestamp}.png`),
        fullPage: true,
      });
      await cleanup(context, browser, recordingsDir, timestamp);
      return;
    }

    console.log('[RECORD] Clicking "Start Demo"...');

    // The button text is either "Start Demo" or "Restart Demo"
    const startButton = page.locator("button", {
      hasText: /Start Demo|Restart Demo/,
    });
    await startButton.waitFor({ state: "visible", timeout: 5000 });
    await startButton.click();

    await page.waitForTimeout(1000);

    // ── Step 5: Wait for Step 1 — Agent Registration ───────────────────────
    console.log("[RECORD] Waiting for Step 1 (Agent Registration)...");

    await waitForStepComplete(page, 1, STEP_TIMEOUT);
    console.log("[RECORD] Step 1 complete.");
    await page.waitForTimeout(VIEWER_PAUSE);

    // Scroll to bring Step 1 results into view
    await smoothScroll(page, 400);

    // ── Step 6: Wait for Step 2 — Create Prediction ────────────────────────
    console.log("[RECORD] Waiting for Step 2 (Create Prediction)...");

    await waitForStepActive(page, 2, 10_000);
    console.log("[RECORD] Step 2 is active, waiting for completion...");

    await waitForStepComplete(page, 2, STEP_TIMEOUT);
    console.log("[RECORD] Step 2 complete.");

    // Scroll to show prediction details (asset, direction, target price, confidence)
    await smoothScroll(page, 600);
    await page.waitForTimeout(VIEWER_PAUSE);

    // Look for the tx hash link that appears on completion
    const txHashLink = page.locator(
      ".relative.flex.gap-4:nth-child(2) a[href*='basescan']"
    );
    const hasTxHash = await txHashLink.count();
    if (hasTxHash > 0) {
      console.log("[RECORD] Transaction hash visible on-screen.");
    }

    await page.waitForTimeout(VIEWER_PAUSE);

    // ── Step 7: Wait for Step 3 — Insurer Evaluation ───────────────────────
    console.log("[RECORD] Waiting for Step 3 (Insurer Evaluation)...");

    await waitForStepActive(page, 3, 10_000);
    console.log(
      "[RECORD] Step 3 is active, waiting for completion (up to 60s)..."
    );

    // Scroll to show Step 3
    await smoothScroll(page, 800);

    await waitForStepComplete(page, 3, STEP_TIMEOUT);
    console.log("[RECORD] Step 3 complete.");
    await page.waitForTimeout(VIEWER_PAUSE);

    // ── Step 8: Wait for Step 4 — Trust Score ──────────────────────────────
    console.log("[RECORD] Waiting for Step 4 (Trust Score)...");

    await waitForStepActive(page, 4, 10_000);
    await smoothScroll(page, 1000);

    await waitForStepComplete(page, 4, STEP_TIMEOUT);
    console.log("[RECORD] Step 4 complete.");
    await page.waitForTimeout(VIEWER_PAUSE);

    // ── Step 9: Wait for Step 5 — x402 Payment Demo ────────────────────────
    console.log("[RECORD] Waiting for Step 5 (x402 Payment Gate)...");

    await waitForStepActive(page, 5, 10_000);
    await smoothScroll(page, 1200);

    await waitForStepComplete(page, 5, STEP_TIMEOUT);
    console.log("[RECORD] Step 5 complete.");

    // Scroll to show the full x402 response
    await scrollToBottom(page);
    await page.waitForTimeout(VIEWER_PAUSE);

    // ── Step 10: Final screenshot ──────────────────────────────────────────
    console.log("[RECORD] Taking final screenshot...");

    // Scroll back to top for a full-page screenshot
    await scrollToTop(page);
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(screenshotsDir, `demo-complete-${timestamp}.png`),
      fullPage: true,
    });

    // One more pause at the bottom for the video
    await scrollToBottom(page);
    await page.waitForTimeout(2000);

    console.log("[RECORD] Demo recording complete.");
  } catch (error) {
    console.error("[RECORD] Error during recording:", error);

    // Take error screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `demo-error-${timestamp}.png`),
      fullPage: true,
    });
  }

  await cleanup(context, browser, recordingsDir, timestamp);
}

async function cleanup(
  context: BrowserContext,
  browser: Browser,
  recordingsDir: string,
  timestamp: string
) {
  // Close context first to finalize the video
  await context.close();
  await browser.close();

  // Find the recorded video file and rename it
  const files = fs.readdirSync(recordingsDir);
  const latestVideo = files
    .filter((f) => f.endsWith(".webm"))
    .sort()
    .pop();

  if (latestVideo) {
    const src = path.join(recordingsDir, latestVideo);
    const dest = path.join(recordingsDir, `demo-${timestamp}.webm`);
    if (src !== dest) {
      fs.renameSync(src, dest);
    }
    console.log(`[RECORD] Video saved: ${dest}`);
  } else {
    console.warn("[RECORD] No video file found in recordings directory.");
  }

  console.log("[RECORD] Done.");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
