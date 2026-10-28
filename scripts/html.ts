// Dev helper: print outerHTML of the nearest ancestor (N levels up) of visible text, e.g. `npx tsx scripts/html.ts "2016 Honda Civic" 4`.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const el = page.getByText(process.argv[2], { exact: true }).filter({ visible: true }).last();
  const html = await el.evaluate((e, up) => {
    let n: Element = e;
    for (let i = 0; i < up && n.parentElement; i++) n = n.parentElement;
    return n.outerHTML.replace(/<!--.*?-->/g, "").replace(/\s(_ngcontent|_nghost)[^=\s]*="[^"]*"/g, "");
  }, Number(process.argv[3] ?? 3));
  console.log(html.slice(0, 6000));
  process.exit(0);
}
main();
