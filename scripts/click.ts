// Dev helper: click an element by visible text in the active ALLDATA tab, e.g. `npx tsx scripts/click.ts "SHOP MANAGER"`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const pages = ctx.pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const popup = ctx.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await page.getByText(process.argv[2], { exact: true }).filter({ visible: true }).first().click();
  const newPage = await popup;
  const target = newPage ?? page;
  await target.waitForLoadState("networkidle").catch(() => {});
  console.log("now at:", target.url());
  process.exit(0);
}
main();
