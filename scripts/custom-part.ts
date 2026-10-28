// Dev helper: fill the open Custom Part row (description, cost), click Add, log saves.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("request", (r) => { if (r.url().includes("/ADAG/shopmgr") && r.method() !== "GET") console.log(">>", r.method(), r.url().slice(0, 160)); });
  page.on("response", (r) => { if (r.url().includes("/ADAG/shopmgr") && r.request().method() !== "GET") console.log("<<", r.status()); });
  await page.getByPlaceholder("Add Description*").fill(process.argv[2]);
  const cost = page.getByPlaceholder("Cost*");
  await cost.click();
  await cost.pressSequentially(process.argv[3], { delay: 40 });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(3000);
  process.exit(0);
}
main();
