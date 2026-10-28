// Dev helper: fill a field without pressing Enter, e.g. `npx tsx scripts/fill.ts "#licensePlate" "MJ8 9PC"`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const field = page.locator(process.argv[2]).filter({ visible: true }).first();
  await field.fill("");
  await field.pressSequentially(process.argv[3], { delay: 40 });
  await field.blur();
  await page.waitForTimeout(800);
  process.exit(0);
}
main();
