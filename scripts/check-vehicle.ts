// Dev helper: tick the vehicle-check for the vehicle row whose header contains the given text.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const row = page.locator(".vehicle-form-header").filter({ hasText: process.argv[2] }).filter({ visible: true }).first();
  await row.locator(".vehicle-check").click();
  await page.waitForTimeout(1000);
  console.log("checked:", await row.locator(".vehicle-check").getAttribute("class"));
  process.exit(0);
}
main();
