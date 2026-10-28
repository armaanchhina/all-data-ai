// Dev helper: load the local app in the running Chrome, enter text, click Review Invoice, screenshot. Never clicks Create.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = await browser.contexts()[0].newPage();
  await page.goto("http://localhost:3000");
  await page.locator("textarea").fill(process.argv[2]);
  await page.getByText("Review Invoice", { exact: true }).click();
  await page.getByText("Create Draft in ALLDATA").waitFor({ timeout: 60000 });
  await page.screenshot({ path: "debug/app.png", fullPage: true });
  process.exit(0);
}
main();
