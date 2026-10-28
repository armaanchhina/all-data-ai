import { addNote, clearDone, listNotes } from "@/lib/inbox";

export async function GET() {
  return Response.json(await listNotes());
}

// "Clear" on the Completed list.
export async function DELETE() {
  await clearDone();
  return Response.json({ ok: true });
}

// Adds a voice note or photo by upload: for testing without WhatsApp, or notes received another way.
// A photo and a voice note uploaded within a few minutes of each other become one note.
export async function POST(req: Request) {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  const media = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "audio/webm" };
  const note = await addNote("upload", file.type.startsWith("image/") ? { image: media } : { audio: media });
  return Response.json(note);
}
