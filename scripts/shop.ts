// Runs everything the shop needs in one terminal (or under launchd): builds the app, then
// starts the logged-in Chrome, the app server and the Cloudflare tunnel. Ctrl+C (or launchd's
// SIGTERM) stops all three. If the app or the tunnel stops, everything stops, so launchd can
// start it all again. Chrome is kept open instead: closed, crashed or frozen, it is reopened.
import { spawn, spawnSync, type ChildProcess } from "child_process";

const CDP = "http://127.0.0.1:9222/json/version"; // what the app attaches to (lib/alldata.ts)
const CHECK_EVERY = 10_000;
const FROZEN_AFTER = 3; // failed checks in a row before our Chrome counts as frozen
const MIN_RESTART_GAP = 30_000;

const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const children = new Set<ChildProcess>();
let stopping = false;
let exitCode = 0;

function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  // Each child leads its own process group, so this also stops npm's own children (next, Chrome).
  for (const child of children) kill(child, "SIGINT");
  // Anything still running after a few seconds is killed outright.
  setTimeout(() => {
    for (const child of children) kill(child, "SIGKILL");
    process.exit(exitCode);
  }, 5000).unref();
}

function kill(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    try { process.kill(-child.pid, signal); } catch {}
  }
}

function run(name: string, script: string, onExit: (code: number | null) => void) {
  const child = spawn("npm", ["run", "--silent", script], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  const prefix = (chunk: Buffer) =>
    chunk.toString().split("\n").filter(Boolean).map((line) => `[${name}] ${line}\n`).join("");
  child.stdout!.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr!.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => {
    children.delete(child);
    if (stopping) {
      if (!children.size) process.exit(exitCode);
    } else onExit(code);
  });
  children.add(child);
  return child;
}

// Exits non-zero even if the child exited cleanly, so launchd's KeepAlive starts everything again.
function essential(name: string, script: string) {
  run(name, script, (code) => {
    console.log(`[${name}] stopped (exit ${code ?? "signal"}), stopping everything else.`);
    stopAll(code || 1);
  });
}

// Chrome answering on the CDP port is all the app needs, even a Chrome opened by hand with the
// same profile (a new launch would only hand off to it). Not answering → (re)open it, at most
// every 30 seconds. Ours but not answering for 30 seconds → frozen, so it is killed and reopened.
// The app reconnects on its next request, and logs back in if ALL_DATA_USER/PASSWORD are set.
const cdpUp = () => fetch(CDP, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false);
let chrome: ChildProcess | null = null;
let lastStart = 0;
let misses = 0;

async function watchChrome() {
  if (stopping) return;
  const up = await cdpUp();
  misses = up ? 0 : misses + 1;
  if (chrome && misses >= FROZEN_AFTER) {
    console.log("[chrome] not responding, restarting it.");
    kill(chrome, "SIGKILL");
  } else if (!chrome && !up && Date.now() - lastStart >= MIN_RESTART_GAP) {
    if (lastStart) console.log("[chrome] not running, reopening it.");
    lastStart = Date.now();
    misses = 0;
    chrome = run("chrome", "browser", () => (chrome = null));
  }
  setTimeout(watchChrome, CHECK_EVERY);
}

watchChrome();
essential("app", "start");
essential("tunnel", "tunnel");

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
