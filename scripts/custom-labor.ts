// Dev helper: fill the open labour row (description already typed): hours 1, rate argv[2], Add.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  page.on("response", (r) => { if (r.url().includes("/ADAG/shopmgr") && r.request().method() !== "GET") console.log("<<", r.request().method(), r.status()); });
  const rate = page.locator("[formcontrolname=priceRate] input").filter({ visible: true }).last();
  await rate.selectText();
  await rate.pressSequentially(process.argv[2], { delay: 40 });
  await page.getByRole("button", { name: "Add", exact: true }).filter({ visible: true }).last().click();
  await page.waitForTimeout(3000);
  process.exit(0);
}
main();
