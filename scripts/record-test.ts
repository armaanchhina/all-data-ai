// Dev helper: in a localhost:3000 tab, record 2s of tone with MediaRecorder (as the Record button does) and POST it to /api/transcribe.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = await browser.contexts()[0].newPage();
  await page.goto("http://localhost:3000");
  const out = await page.evaluate(async (fixed) => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    const rec = new MediaRecorder(dest.stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, 2000));
    rec.stop();
    await stopped;
    const form = new FormData();
    form.append("audio", new File(chunks, "speech.webm", { type: rec.mimeType }));
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    return `${rec.mimeType} ${chunks.reduce((n, c) => n + c.size, 0)} bytes -> ${res.status} ${await res.text()}`;
  }, false);
  console.log(out);
  await page.close();
  process.exit(0);
}
main();
