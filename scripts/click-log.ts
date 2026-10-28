// Dev helper: click visible text argv[2] and log non-GET shopmgr requests/responses that follow.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/shopmgr") && r.method() !== "GET") console.log(">>", r.method(), r.url().slice(0, 160)); });
  page.on("response", async (r) => { if (r.url().includes("/ADAG/shopmgr") && r.request().method() !== "GET") console.log("<<", r.status(), (await r.text().catch(() => "")).slice(0, 300)); });
  await page.getByText(process.argv[2], { exact: true }).filter({ visible: true }).last().click();
  await page.waitForTimeout(4000);
  process.exit(0);
}
main();
