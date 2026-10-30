// Runs everything the shop needs in one terminal: builds the app, then starts the
// logged-in Chrome, the app server and the Cloudflare tunnel. Ctrl+C stops all three;
// if any one of them stops, the others are stopped too.
import { spawn, spawnSync, type ChildProcess } from "child_process";

const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const children: ChildProcess[] = [];
let stopping = false;
let exitCode = 0;

function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  // Each child leads its own process group, so this also stops npm's own children (next, Chrome).
  for (const child of children) {
    if (child.exitCode === null && child.pid) {
      try { process.kill(-child.pid, "SIGINT"); } catch {}
    }
  }
  // Anything still running after a few seconds is killed outright.
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    }
    process.exit(exitCode);
  }, 5000).unref();
}

function run(name: string, script: string) {
  const child = spawn("npm", ["run", "--silent", script], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  const prefix = (chunk: Buffer) =>
    chunk.toString().split("\n").filter(Boolean).map((line) => `[${name}] ${line}\n`).join("");
  child.stdout!.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr!.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => {
    if (!stopping) console.log(`[${name}] stopped (exit ${code ?? "signal"}), stopping everything else.`);
    stopAll(code ?? 1);
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) process.exit(exitCode);
  });
  children.push(child);
}

run("chrome", "browser");
run("app", "start");
run("tunnel", "tunnel");

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
