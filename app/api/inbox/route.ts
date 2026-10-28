import { addNote, clearDone, listNotes } from "@/lib/inbox";

export async function GET() {
  return Response.json(await listNotes());
}

// "Clear" on the Completed list.
export async function DELETE() {
  await clearDone();
  return Response.json({ ok: true });
}

// Adds a voice note by upload: for testing without WhatsApp, or notes received another way.
export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return Response.json({ error: "No audio received." }, { status: 400 });
  const note = await addNote(String(form.get("from") ?? "upload"), { audio: Buffer.from(await audio.arrayBuffer()), mimeType: audio.type || "audio/webm" });
  return Response.json(note);
}
