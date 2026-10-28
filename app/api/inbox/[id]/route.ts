import { getNote, markDone, readAudio } from "@/lib/inbox";
import { sendText } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };
const TYPES: Record<string, string> = { ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", webm: "audio/webm" };

// The note's audio, for the player on the review screen.
export async function GET(_: Request, { params }: Params) {
  const note = await getNote((await params).id);
  const audio = note && (await readAudio(note));
  if (!audio) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(audio), { headers: { "content-type": TYPES[note.audio!.split(".").pop()!] ?? "audio/webm" } });
}

// Marks the note done once its draft exists, and tells the sender.
export async function PATCH(req: Request, { params }: Params) {
  const { documentId } = await req.json();
  const note = await markDone((await params).id, Number(documentId));
  if (!note) return Response.json({ error: "Note not found." }, { status: 404 });
  if (/^\d+$/.test(note.from)) await sendText(note.from, `✅ Draft #${documentId} created in ALLDATA.`, note.via ?? undefined);
  return Response.json(note);
}
