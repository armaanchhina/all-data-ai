import { addNote } from "@/lib/inbox";
import { downloadMedia, isAllowed, sendText, validSignature } from "@/lib/whatsapp";

// Meta's one-time webhook check when the URL is saved in the developer console.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response(q.get("hub.challenge"));
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!validSignature(body, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  const values = JSON.parse(body).entry?.flatMap((e: any) => e.changes?.map((c: any) => c.value) ?? []) ?? [];
  for (const value of values) {
    const via: string | undefined = value?.metadata?.phone_number_id; // the shop number that received it
    for (const m of value?.messages ?? []) {
      if (!isAllowed(m.from)) continue;
      const text: string = m.type === "text" ? m.text.body.trim() : "";
      // A voice note or a text with the job details; short replies like "ok" or "thanks" are skipped.
      if (m.type !== "audio" && text.split(/\s+/).length < 4) {
        await sendText(m.from, "Send a voice note or text with the customer, car, mileage and repairs.", via);
        continue;
      }
      try {
        if (m.type === "audio") {
          const { data, mimeType } = await downloadMedia(m.audio.id);
          await addNote(m.from, { audio: data, mimeType }, via);
        } else await addNote(m.from, { text }, via);
        await sendText(m.from, "👍 Got it — sent to the front desk.", via);
      } catch {
        await sendText(m.from, "Sorry, that didn't come through. Please send it again.", via);
      }
    }
  }
  return Response.json({ ok: true }); // always 200 quickly, or Meta retries
}
