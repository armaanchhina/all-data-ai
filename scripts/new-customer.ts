// Dev helper: fill the open New Customer form (last, first, phone) and log save requests.
import { chromium } from "playwright";

async function main() {
  const [, , last, first, phone] = process.argv;
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/shopmgr") && r.method() !== "GET") console.log(">>", r.method(), r.url().slice(0, 160), (r.postData() ?? "").slice(0, 300)); });
  page.on("response", async (r) => { if (r.url().includes("/ADAG/shopmgr") && r.request().method() !== "GET") console.log("<<", r.status(), (await r.text().catch(() => "")).slice(0, 200)); });
  for (const [sel, val] of [["#lastName", last], ["#firstName", first], ["#value", phone]]) {
    const f = page.locator(sel).filter({ visible: true }).first();
    await f.click();
    await f.pressSequentially(val, { delay: 40 });
    await page.waitForTimeout(300);
  }
  await page.getByText("Customer Information", { exact: true }).click();
  await page.waitForTimeout(4000);
  process.exit(0);
}
main();
