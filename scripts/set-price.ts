// Dev helper: set the price of the (single-line) job titled argv[2] to argv[3], logging save requests.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (["POST", "PUT", "PATCH"].includes(r.method())) console.log(">>", r.method(), r.url().slice(0, 140)); });
  page.on("response", (r) => { if (["POST", "PUT", "PATCH"].includes(r.request().method())) console.log("<<", r.status(), r.url().slice(0, 140)); });
  const panel = page.locator(".p-panel").filter({ has: page.locator("#jobNameReadOnly", { hasText: process.argv[2] }) }).first();
  await panel.locator("ad-estimator-lineitem .price").first().click();
  const input = panel.locator("ad-estimator-lineitem .price input").first();
  await input.waitFor();
  await input.selectText();
  await input.pressSequentially(process.argv[3], { delay: 50 });
  await input.press(process.argv[4] ?? "Enter");
  await page.waitForTimeout(3000);
  const msgs = await panel.locator("ad-uib-validation-messages").allInnerTexts();
  console.log("validation:", JSON.stringify(msgs.filter(Boolean)));
  console.log("price now:", (await panel.locator("ad-estimator-lineitem .price").first().innerText()).trim());
  process.exit(0);
}
main();
