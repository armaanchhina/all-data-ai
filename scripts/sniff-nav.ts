// Dev helper: log shopmgr API calls while visiting Shop Jobs and searching a customer.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/shopmgr")) console.log(r.method(), r.url().slice(0, 220)); });
  await page.getByText("Shop Jobs", { exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(3000);
  console.log("---- customers");
  await page.getByText("Customers", { exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(2000);
  await page.locator("#txtSearchCustomer").pressSequentially("Chhina", { delay: 60 });
  await page.waitForTimeout(3000);
  process.exit(0);
}
main();
