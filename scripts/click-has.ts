// Dev helper: click the first visible element containing text (substring), e.g. `npx tsx scripts/click-has.ts "DX CAN"`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  await page.getByText(process.argv[2]).filter({ visible: true }).last().click();
  await page.waitForTimeout(2500);
  process.exit(0);
}
main();
