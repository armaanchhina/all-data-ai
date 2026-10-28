// Dev helper: list all Shop Jobs (name + price) from the Shop Jobs page.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const text = await page.evaluate(() => {
    const start = Array.from(document.querySelectorAll("*")).find((e) => e.childElementCount === 0 && e.textContent?.trim() === "All Shop Jobs");
    return (start?.parentElement?.parentElement?.parentElement as HTMLElement | undefined)?.innerText ?? "";
  });
  console.log(text.replace(/\n(Remove|Clone)/g, "").replace(/\n{2,}/g, "\n"));
  process.exit(0);
}
main();
