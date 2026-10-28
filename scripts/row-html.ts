// Dev helper: print inputs in the nearest ancestor of the "Add Description*" field that also contains the Add button.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const out = await page.getByPlaceholder("Add Description*").evaluate((e) => {
    let n: Element = e;
    while (n.parentElement && !Array.from(n.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Add")) n = n.parentElement;
    return Array.from(n.querySelectorAll("input,textarea,button")).map((i) => `${i.tagName} ${(i as HTMLInputElement).type} val=${(i as HTMLInputElement).value} fc=${i.closest("[formcontrolname]")?.getAttribute("formcontrolname")} cls=${i.parentElement?.className}`);
  });
  console.log(out.join("\n"));
  process.exit(0);
}
main();
