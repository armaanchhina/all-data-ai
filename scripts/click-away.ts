// Dev helper: click a neutral area (the document title) and log any save requests that follow.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (["POST", "PUT", "PATCH"].includes(r.method())) console.log(">>", r.method(), r.url().slice(0, 140)); });
  page.on("response", (r) => { if (["POST", "PUT", "PATCH"].includes(r.request().method())) console.log("<<", r.status(), r.url().slice(0, 140)); });
  await page.locator("text=Item").filter({ visible: true }).first().click();
  await page.waitForTimeout(4000);
  process.exit(0);
}
main();
