// Dev helper: tick shop jobs by exact title in the Add Shop Job panel, e.g. `npx tsx scripts/check-jobs.ts "Inspection" "Air Filter"`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  for (const name of process.argv.slice(2)) {
    const header = page.locator("ad-uib-panel-header").filter({ has: page.locator(".shop-job-title", { hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }) }).first();
    await header.scrollIntoViewIfNeeded();
    await header.locator(".vehicle-check").click();
    await page.waitForTimeout(400);
    console.log(name, "->", await header.locator(".vehicle-check").getAttribute("class"));
  }
  process.exit(0);
}
main();
