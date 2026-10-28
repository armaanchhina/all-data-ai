import { addNote, getSettings, saveSettings } from "@/lib/inbox";
import { downloadMedia, isAllowed, sendText, validSignature } from "@/lib/whatsapp";

// Meta's one-time webhook check when the URL is saved in the developer console.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response(q.get("hub.challenge"));
  return new Response("Forbidden", { status: 403 });
}

// Meta redelivers a message when it isn't sure the first delivery landed; each one is handled once.
const seen: Set<string> = ((globalThis as any).__whatsappSeen ??= new Set());

export async function POST(req: Request) {
  const body = await req.text();
  if (!validSignature(body, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  const values = JSON.parse(body).entry?.flatMap((e: any) => e.changes?.map((c: any) => c.value) ?? []) ?? [];
  for (const value of values) {
    const via: string | undefined = value?.metadata?.phone_number_id; // the shop number that received it
    for (const m of value?.messages ?? []) {
      if (!isAllowed(m.from)) {
        console.log(`WhatsApp: ignored message from ${m.from} (not in WHATSAPP_ALLOWED)`);
        continue;
      }
      if (seen.has(m.id) || m.type === "reaction") continue;
      seen.add(m.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value!);
      // A voice note, a photo (e.g. the VIN sticker) or a text with the job details. A photo's caption
      // counts as the text; short replies like "ok" or "thanks" are skipped.
      const raw: string = m.type === "text" ? m.text.body : m.type === "image" ? m.image.caption ?? "" : "";
      // "enable" turns on the review step on the web page; "disable" goes back to straight-to-ALLDATA.
      const command = m.type === "text" ? raw.trim().toLowerCase() : "";
      if (command === "enable" || command === "disable") {
        await saveSettings({ autoCreate: command === "disable" });
        await sendText(m.from, command === "enable"
          ? "🔒 Review on: notes wait on the web page until the front desk clicks Create draft. Text \"disable\" to turn it off."
          : "⚡ Review off: notes go straight into ALLDATA as drafts. Text \"enable\" to check them first.", via);
        continue;
      }
      const text = raw.trim().split(/\s+/).length >= 4 ? raw.trim() : undefined;
      if (m.type !== "audio" && m.type !== "image" && !text) {
        await sendText(m.from, "Send a voice note or text with the customer, car, mileage and repairs. You can add a photo of the VIN sticker. Text \"enable\" or \"disable\" to turn the front-desk review on or off.", via);
        continue;
      }
      try {
        const media = m.type === "audio" || m.type === "image" ? await downloadMedia(m[m.type].id) : null;
        const note = await addNote(m.from, { text, audio: m.type === "audio" ? media! : undefined, image: m.type === "image" ? media! : undefined }, via);
        const auto = (await getSettings()).autoCreate;
        await sendText(m.from,
          !note.audio && !note.transcript ? "📷 Got the photo. Now send the voice note or text with the job."
          : auto ? "👍 Got it — creating the draft." : "👍 Got it — sent to the front desk.", via);
      } catch {
        await sendText(m.from, "Sorry, that didn't come through. Please send it again.", via);
      }
    }
  }
  return Response.json({ ok: true }); // always 200 quickly, or Meta retries
}
