// Dev helper: attach to the running browser, screenshot the active ALLDATA tab,
// and dump visible interactive elements so selectors can be chosen from the real UI.
import { chromium } from "playwright";
import fs from "fs";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  fs.mkdirSync("debug", { recursive: true });
  await page.screenshot({ path: "debug/page.png" });
  console.log("URL:", page.url(), "\nTITLE:", await page.title());
  for (const f of page.frames()) {
    const items = await f.evaluate(() =>
      Array.from(document.querySelectorAll("a,button,input,select,textarea,[role=button],[role=tab],[role=menuitem]"))
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => {
          const el = e as HTMLInputElement;
          const label = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ").slice(0, 60);
          return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.name ? "[name=" + el.name + "]" : ""}${el.type ? "[" + el.type + "]" : ""} ${label}`;
        })
    ).catch(() => []);
    if (items.length) console.log(`\n--- frame ${f.url()}\n` + items.join("\n"));
  }
  process.exit(0); // just detach; never close the user's browser
}
main();
