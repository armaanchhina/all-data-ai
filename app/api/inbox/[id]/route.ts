import { deleteNote, getNote, readMedia } from "@/lib/inbox";

type Params = { params: Promise<{ id: string }> };
const TYPES: Record<string, string> = {
  ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", webm: "audio/webm",
  jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

// The note's audio (or its photo with ?photo), for the review screen.
export async function GET(req: Request, { params }: Params) {
  const note = await getNote((await params).id);
  const name = new URL(req.url).searchParams.has("photo") ? note?.image : note?.audio;
  const data = name && (await readMedia(name).catch(() => null));
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": TYPES[name.split(".").pop()!] ?? "application/octet-stream" } });
}

// "Dismiss" for notes that aren't a job, e.g. a greeting.
export async function DELETE(_: Request, { params }: Params) {
  await deleteNote((await params).id);
  return Response.json({ ok: true });
}
