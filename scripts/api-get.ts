// Dev helper: GET a shopmgr API path from inside the logged-in page and save the JSON to debug/api.json.
import { chromium } from "playwright";
import fs from "fs";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  const body = await page.evaluate("fetch(" + JSON.stringify(process.argv[2]) + ", { headers: { accept: 'application/json' } }).then(r => r.status + '\\n' + r.text())");
  const text = await page.evaluate("fetch(" + JSON.stringify(process.argv[2]) + ", { headers: { accept: 'application/json' } }).then(r => r.text())") as string;
  fs.writeFileSync("debug/api.json", text);
  console.log(String(body).slice(0, 4));
  process.exit(0);
}
main();
