// Dev helper: open + New Vehicle on the selected customer, search, log API calls, then Cancel (nothing saved).
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/") && !r.url().includes("settings")) console.log(r.method(), r.url().slice(0, 250)); });
  await page.getByText("Armaan Chhina", { exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText("+ New Vehicle", { exact: true }).filter({ visible: true }).first().click();
  await page.locator("#ymmeSearchBox").pressSequentially("2018 Toyota Camry", { delay: 60 });
  await page.locator("#ymmeSearchBox").press("Enter");
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Cancel" }).filter({ visible: true }).last().click();
  await page.waitForTimeout(1000);
  process.exit(0);
}
main();
