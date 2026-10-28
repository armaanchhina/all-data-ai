// Dev helper: type into a field in the active ALLDATA tab, e.g. `npx tsx scripts/type.ts "#txtSearchCustomer" "Chhina"`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  await page.locator(process.argv[2]).fill("");
  await page.locator(process.argv[2]).pressSequentially(process.argv[3], { delay: 60 });
  await page.locator(process.argv[2]).press("Enter");
  await page.waitForTimeout(2500);
  process.exit(0);
}
main();
