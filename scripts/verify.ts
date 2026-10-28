// Dev helper: reload Shop Manager, reopen the most recent document for argv[2], and print what ALLDATA saved.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const pages = browser.contexts()[0].pages().filter((p) => p.url().startsWith("http"));
  const page = pages[pages.length - 1];
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText(process.argv[2], { exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(3000);
  const data = await page.evaluate(() => {
    const t = (s: string) => Array.from(document.querySelectorAll(s)).filter((e) => (e as HTMLElement).offsetParent).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim());
    const v = (s: string) => (document.querySelector(s) as HTMLInputElement | null)?.value;
    return {
      status: t(".p-button.p-highlight, .active, [aria-pressed=true]").slice(0, 3),
      mileageIn: v("#mileageIn"),
      jobs: Array.from(document.querySelectorAll(".p-panel")).filter((p) => p.querySelector("#jobNameReadOnly")).map((p) => ({
        job: (p.querySelector("#jobNameReadOnly") as HTMLElement).innerText.trim(),
        price: (p.querySelector("ad-estimator-lineitem .price") as HTMLElement | null)?.innerText.trim(),
        total: (p.querySelector(".job-group-footer .value") as HTMLElement | null)?.innerText.trim(),
      })),
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await page.screenshot({ path: "debug/page.png" });
  process.exit(0);
}
main();
