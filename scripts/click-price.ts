// Dev helper: click the price cell of the job whose title is argv[2], then list visible inputs inside that line.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const panel = page.locator(".p-panel").filter({ has: page.locator("#jobNameReadOnly", { hasText: process.argv[2] }) }).first();
  await panel.locator("ad-estimator-lineitem .price").first().click();
  await page.waitForTimeout(800);
  const inputs = await panel.locator("ad-estimator-lineitem input").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent).map((e) => `${e.id}|${(e as HTMLInputElement).name}|${e.getAttribute("formcontrolname") ?? e.parentElement?.getAttribute("formcontrolname")}|${(e as HTMLInputElement).value}|${e.closest("div[class]")?.className}`));
  console.log(inputs.join("\n"));
  process.exit(0);
}
main();
