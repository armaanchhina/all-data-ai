// Dev helper: reload the active tab and log the shopmgr API GET requests it makes.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/")) console.log(r.method(), r.url().slice(0, 200)); });
  await page.reload();
  await page.waitForTimeout(6000);
  process.exit(0);
}
main();
