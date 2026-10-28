// Dev helper: close the unsaved "Add Description*" item row without adding it.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const row = page.getByPlaceholder("Add Description*").locator("xpath=ancestor::form[1]");
  console.log((await row.evaluate((e) => e.outerHTML)).match(/<i class="[^"]*"/g));
  await row.locator("i[class*=delete], i[class*=close], .pi-times").last().click();
  await page.waitForTimeout(1500);
  console.log("open item rows left:", await page.getByPlaceholder("Add Description*").count());
  process.exit(0);
}
main();
