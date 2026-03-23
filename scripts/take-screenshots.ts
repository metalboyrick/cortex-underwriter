/**
 * take-screenshots.ts — Take 5 key screenshots of the Cortex Underwriter dashboard
 * for The Synthesis hackathon submission.
 *
 * Usage:
 *   mkdir -p screenshots
 *   npx tsx scripts/take-screenshots.ts
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const DASHBOARD_URL = "http://localhost:3004";
const AGENT_API_URL = "http://localhost:4567";
const BASE_PATH = "/underwriter";

const VIEWPORT = { width: 1280, height: 720 };
const PAGE_LOAD_TIMEOUT = 15_000;

async function main() {
  const currentFile =
    typeof __filename !== "undefined"
      ? __filename
      : fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFile), "..");
  const screenshotsDir = path.join(projectRoot, "screenshots");

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Preflight: check dashboard
  try {
    const resp = await fetch(`${DASHBOARD_URL}${BASE_PATH}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.error(
        `[ERROR] Dashboard returned ${resp.status}. Start it first:\n  cd dashboard && npm run dev -- -p 3004`
      );
      process.exit(1);
    }
  } catch {
    console.error(
      `[ERROR] Dashboard is not reachable at ${DASHBOARD_URL}. Start it first.`
    );
    process.exit(1);
  }

  // Check if API is running
  let apiRunning = false;
  try {
    const resp = await fetch(`${AGENT_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    apiRunning = resp.ok;
  } catch {
    apiRunning = false;
  }

  console.log(`[INFO] Dashboard: OK`);
  console.log(`[INFO] Agent API: ${apiRunning ? "OK" : "offline (will use demo/mock data)"}`);

  // Launch browser
  console.log("[SCREENSHOT] Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });

  const page = await context.newPage();

  // ── 1. Dashboard Overview ──────────────────────────────────────────────────
  console.log("[1/5] Dashboard Overview...");
  await page.goto(`${DASHBOARD_URL}${BASE_PATH}`, {
    waitUntil: "networkidle",
    timeout: PAGE_LOAD_TIMEOUT,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(screenshotsDir, "screenshot-dashboard.png"),
    fullPage: false,
  });
  console.log("  -> screenshot-dashboard.png");

  // ── 2. Interactive Demo Page ───────────────────────────────────────────────
  console.log("[2/5] Interactive Demo Page...");
  await page.goto(`${DASHBOARD_URL}${BASE_PATH}/demo`, {
    waitUntil: "networkidle",
    timeout: PAGE_LOAD_TIMEOUT,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(screenshotsDir, "screenshot-demo.png"),
    fullPage: false,
  });
  console.log("  -> screenshot-demo.png");

  // ── 3. Agent Detail with Trust Gauge ───────────────────────────────────────
  console.log("[3/5] Agent Detail with Trust Gauge...");
  // Try the specified address first, fall back to another if 500
  const agentAddress = "0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253";
  const agentUrl = `${DASHBOARD_URL}${BASE_PATH}/agents/${agentAddress}`;

  try {
    const resp = await page.goto(agentUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT,
    });

    if (resp && resp.status() >= 400) {
      // Try alternate addresses
      const alternates = [
        "0x2a0dc499F7F77077507f892Fa11710e51a65546b",
        "0x6CFCdEE09D7eFC1DdF7f8491d8a96444160B6454",
        "0xA17bD5f41053Ee7a3B4e38AC29D91490b30b485e",
      ];
      let found = false;
      for (const addr of alternates) {
        const altResp = await page.goto(
          `${DASHBOARD_URL}${BASE_PATH}/agents/${addr}`,
          { waitUntil: "networkidle", timeout: PAGE_LOAD_TIMEOUT }
        );
        if (altResp && altResp.status() < 400) {
          found = true;
          console.log(`  -> Used alternate address: ${addr}`);
          break;
        }
      }
      if (!found) {
        console.warn(
          "  -> All agent detail pages returned errors. Taking screenshot of error state."
        );
      }
    }
  } catch (err) {
    console.warn(`  -> Agent page navigation error: ${err}`);
  }

  await page.waitForTimeout(2000);
  // Wait for trust gauge SVG if it exists
  try {
    await page.waitForSelector("svg", { timeout: 3000 });
  } catch {
    // SVG might not be present, that's OK
  }
  await page.screenshot({
    path: path.join(screenshotsDir, "screenshot-trust-gauge.png"),
    fullPage: false,
  });
  console.log("  -> screenshot-trust-gauge.png");

  // ── 4. API Health / Demo Mode Banner ───────────────────────────────────────
  console.log("[4/5] API Health / Demo Mode...");
  if (apiRunning) {
    // Fetch the health JSON and render it nicely
    const healthResp = await fetch(`${AGENT_API_URL}/health`);
    const healthJson = await healthResp.json();
    const formatted = JSON.stringify(healthJson, null, 2);

    await page.setContent(`
      <html>
        <head>
          <style>
            body {
              background: #0a0a0f;
              color: #e2e8f0;
              font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
              padding: 40px;
              margin: 0;
            }
            .header {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-bottom: 32px;
            }
            .dot {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #22c55e;
              box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
            }
            h1 {
              font-size: 14px;
              font-weight: 700;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #fff;
              margin: 0;
            }
            .endpoint {
              font-size: 11px;
              color: #64748b;
              margin-left: auto;
              font-family: monospace;
            }
            .card {
              background: #111118;
              border: 1px solid rgba(255,255,255,0.05);
              border-radius: 12px;
              padding: 24px;
            }
            pre {
              margin: 0;
              font-size: 12px;
              line-height: 1.8;
              color: #94a3b8;
              white-space: pre-wrap;
              word-break: break-all;
            }
            .key { color: #60a5fa; }
            .string { color: #34d399; }
            .number { color: #fbbf24; }
            .bool { color: #f472b6; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="dot"></div>
            <h1>Cortex Underwriter API</h1>
            <span class="endpoint">GET ${AGENT_API_URL}/health</span>
          </div>
          <div class="card">
            <pre>${formatted
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
              .replace(/: "([^"]+)"/g, ': <span class="string">"$1"</span>')
              .replace(/: (\d+)/g, ': <span class="number">$1</span>')
              .replace(/: (true|false)/g, ': <span class="bool">$1</span>')
            }</pre>
          </div>
        </body>
      </html>
    `);
    await page.waitForTimeout(500);
  } else {
    // Show demo page with the "Demo Mode" banner
    await page.goto(`${DASHBOARD_URL}${BASE_PATH}/demo`, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT,
    });
    await page.waitForTimeout(2000);
  }
  await page.screenshot({
    path: path.join(screenshotsDir, "screenshot-api.png"),
    fullPage: false,
  });
  console.log("  -> screenshot-api.png");

  // ── 5. x402 Response Section ───────────────────────────────────────────────
  console.log("[5/5] x402 Response Section...");
  await page.goto(`${DASHBOARD_URL}${BASE_PATH}/demo`, {
    waitUntil: "networkidle",
    timeout: PAGE_LOAD_TIMEOUT,
  });
  await page.waitForTimeout(2000);

  // Scroll to the bottom to find the x402 step section
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: path.join(screenshotsDir, "screenshot-x402.png"),
    fullPage: false,
  });
  console.log("  -> screenshot-x402.png");

  // Cleanup
  await context.close();
  await browser.close();

  console.log(`\n[DONE] All screenshots saved to ${screenshotsDir}/`);
  console.log("Files:");
  const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith(".png"));
  for (const f of files) {
    const stats = fs.statSync(path.join(screenshotsDir, f));
    console.log(`  ${f} (${(stats.size / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
