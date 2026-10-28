// Dev helper: fill a New Customer form with every customer write BLOCKED, and print the request ALLDATA would send.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = browser.contexts()[0].pages().find((p) => p.url().includes("/shop_manager"))!;
  await page.route("**/ADAG/shopmgr/customers**", async (route) => {
    const r = route.request();
    if (r.method() === "GET") return route.continue();
    console.log("BLOCKED", r.method(), r.url());
    console.log("headers:", JSON.stringify(Object.fromEntries(Object.entries(await r.allHeaders()).filter(([k]) => !["cookie", "user-agent"].includes(k) && !k.startsWith("sec-")))));
    console.log("body:", r.postData());
    await route.abort();
  });
  await page.goto("https://my.alldata.com/shop_manager/#/customers");
  await page.reload();
  await page.locator("#txtSearchCustomer").waitFor();
  await page.getByText("Create New Customer", { exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(2000);
  for (const [s, v] of [["#lastName", "BLOCKEDTEST"], ["#firstName", "NOSAVE"]]) {
    const f = page.locator(s).filter({ visible: true }).first();
    await f.click();
    await f.pressSequentially(v, { delay: 30 });
  }
  await page.getByText("Apply", { exact: true }).filter({ visible: true }).last().click().catch((e) => console.log("apply:", e.message));
  await page.waitForTimeout(3000);
  await page.unrouteAll();
  await page.reload();
  process.exit(0);
}
main();
