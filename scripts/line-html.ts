// Dev helper: print the HTML of the job block on the document whose title matches argv[2].
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const title = page.getByText(process.argv[2], { exact: true }).filter({ visible: true }).first();
  const html = await title.evaluate((e) => {
    let n: Element = e;
    while (n.parentElement && !n.parentElement.className.toString().includes("p-panel ") && !(n.parentElement.tagName === "P-PANEL")) n = n.parentElement;
    return (n.parentElement ?? n).outerHTML.replace(/<!--.*?-->/g, "").replace(/\s(_ngcontent|_nghost)[^=\s]*="[^"]*"/g, "").replace(/\sng-tns-[^\s"]*/g, "");
  });
  console.log(html.slice(0, 7000));
  process.exit(0);
}
main();
