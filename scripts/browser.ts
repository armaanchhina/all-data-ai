// Launches the real Google Chrome (not Playwright's bundled Chromium, which ALLDATA's
// login verification rejects) with a separate local profile (.browser-profile) and a
// CDP port. Playwright only attaches over CDP, so Chrome carries no automation flags.
import { spawn } from "child_process";
import path from "path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = path.join(process.cwd(), ".browser-profile");
const START_URL = process.env.ALLDATA_URL ?? "https://my.alldata.com";

const chrome = spawn(CHROME, [
  `--user-data-dir=${PROFILE}`,
  "--remote-debugging-port=9222",
  "--no-first-run",
  "--no-default-browser-check",
  START_URL,
], { stdio: "ignore" });

console.log("Chrome open. Log in to ALLDATA Shop Manager manually. Ctrl+C to close.");
chrome.on("exit", () => process.exit(0));
process.on("SIGINT", () => chrome.kill());
