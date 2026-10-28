// WhatsApp Business Cloud API: receive voice notes from approved numbers and send short replies.
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
// WHATSAPP_ALLOWED (comma-separated numbers, digits only, e.g. 16045551234).
import crypto from "crypto";

const GRAPH = "https://graph.facebook.com/v26.0";
const auth = () => ({ authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` });

export const isAllowed = (from: string) =>
  (process.env.WHATSAPP_ALLOWED ?? "").split(",").map((n) => n.replace(/\D/g, "")).includes(from.replace(/\D/g, ""));

// Meta signs every webhook with the app secret; anything unsigned is rejected.
export function validSignature(body: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth() }).then((r) => r.json());
  if (!meta.url) throw new Error(`WhatsApp media ${mediaId}: ${JSON.stringify(meta).slice(0, 200)}`);
  const res = await fetch(meta.url, { headers: auth() });
  if (!res.ok) throw new Error(`WhatsApp media download returned ${res.status}`);
  return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type ?? "audio/ogg" };
}

// Replies go out from the number the message was sent to (`via`), so any of the shop's numbers
// works. Best effort: a failure (expired token, unapproved display name) is logged, not thrown.
export async function sendText(to: string, body: string, via = process.env.WHATSAPP_PHONE_NUMBER_ID) {
  if (!process.env.WHATSAPP_TOKEN || !via) return;
  try {
    const res = await fetch(`${GRAPH}/${via}/messages`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!res.ok) console.error("WhatsApp reply failed:", res.status, await res.text());
  } catch (e) {
    console.error("WhatsApp reply failed:", e);
  }
}
