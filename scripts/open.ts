// Dev helper: open a fresh ALLDATA tab in the running browser and bring it to the front.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = await browser.contexts()[0].newPage();
  await page.goto(process.env.ALLDATA_URL ?? "https://my.alldata.com");
  await page.bringToFront();
  process.exit(0);
}
main();
