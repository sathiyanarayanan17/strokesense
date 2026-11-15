// End-to-end smoke test: drives the real app in Microsoft Edge (or Chrome) with a
// fake camera/microphone, checks that the on-device AI models load, walks the
// whole flow and verifies the results screen, QR code, translation and report.
//
// Usage: npm run build && npm start   (in one terminal)
//        npm run e2e                  (in another)       BASE_URL defaults to http://localhost:3000
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const channel = process.env.BROWSER ?? "msedge"; // or "chrome"

const steps = [];
const ok = (name) => {
  steps.push(name);
  console.log(`  ✓ ${name}`);
};

const browser = await chromium.launch({
  channel,
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const consoleLog = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleLog.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});

try {
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: /Spot a stroke in 60 seconds/ }).waitFor();
  ok("landing page renders");

  await page.getByRole("link", { name: "Start stroke check" }).click();
  await page.getByText("When was the person last seen normal?").waitFor();
  await page.getByRole("button", { name: /Just now/ }).click();
  ok("onset time recorded");

  for (const group of await page.locator("fieldset").all()) {
    await group.getByRole("button", { name: "No", exact: true }).click();
  }
  await page.getByRole("button", { name: "Continue to camera checks" }).click();
  ok("balance and eyes answered");

  // Face model: the badge leaves "Loading model…" once MediaPipe is ready.
  await page.getByText(/Looking for a face…|Face tracked|Face the camera directly/).waitFor({ timeout: 60_000 });
  if (await page.getByText("The face model could not load").count()) throw new Error("face model failed to load");
  ok("face landmark model loaded in the browser (WASM)");
  await page.getByRole("button", { name: /Skip it/ }).click();

  const armButton = page.getByRole("button", { name: "Start arm check" });
  await armButton.waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Start arm check");
    return b && !b.disabled;
  }, null, { timeout: 60_000 });
  ok("pose landmark model loaded in the browser (WASM)");
  await page.getByRole("button", { name: /Skip it/ }).click();

  await page.getByRole("button", { name: "Start speech check" }).waitFor();
  ok("speech step shown");
  // Run the speech check for real with the fake microphone (exercises AudioWorklet capture + speech model).
  await page.getByRole("button", { name: "Start speech check" }).click();
  await page.getByText(/Did their speech sound slurred/).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "No", exact: true }).click();
  if (consoleLog.some((l) => l.includes("Speech model capture unavailable") || l.includes("Speech model failed"))) {
    throw new Error("speech model pipeline failed in the browser");
  }
  ok("speech check ran with on-device audio capture");

  const heading = page.locator("#result-title");
  await heading.waitFor();
  const headline = (await heading.innerText()).trim();
  if (headline === "No warning signs detected") throw new Error("skipped checks produced an all-clear");
  ok(`results: skipped checks never produce an all-clear ("${headline}")`);
  const speechCard = page.locator("li").filter({ hasText: "Clinical details" }).filter({ hasText: "Speech" }).first();
  await speechCard.getByText("Clinical details").click();
  console.log(`    speech finding for the fake-mic tone: ${(await speechCard.innerText()).split("\n").slice(0, 6).join(" | ")}`);

  await page.getByAltText("QR code linking to the handoff report").waitFor({ timeout: 10_000 });
  ok("handoff QR code generated");

  await page.getByRole("button", { name: "हिन्दी" }).click();
  await page.getByText("जांच नहीं हुई").first().waitFor();
  await page.getByRole("button", { name: "தமிழ்" }).click();
  await page.getByText("சோதிக்கப்படவில்லை").first().waitFor();
  ok("results translate to Hindi and Tamil");

  const reportUrl = await page.getByRole("link", { name: "Open report" }).getAttribute("href");
  const report = await context.newPage();
  await report.goto(reportUrl);
  await report.getByRole("heading", { name: "StrokeSense handoff report" }).waitFor();
  const rows = await report.locator("tbody tr").count();
  if (rows !== 5) throw new Error(`expected 5 BE-FAST rows in report, got ${rows}`);
  ok("handoff report opens from the link with all 5 BE-FAST items");

  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log(`\nE2E smoke test passed (${steps.length} checks).`);
} catch (e) {
  console.error(`\nE2E FAILED after: ${steps.at(-1) ?? "start"}\n`, e);
  const alerts = await page.getByRole("alert").allInnerTexts().catch(() => []);
  if (alerts.length) console.error("On-screen alerts:", alerts);
  if (consoleLog.length) console.error("Browser console:\n" + consoleLog.slice(-15).join("\n"));
  await page.screenshot({ path: "e2e-failure.png", fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
