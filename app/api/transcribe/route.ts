import { transcribe } from "@/lib/extract";

export async function POST(req: Request) {
  const audio = (await req.formData()).get("audio");
  if (!(audio instanceof File)) return Response.json({ error: "No audio received." }, { status: 400 });
  if (audio.size < 1000) return Response.json({ error: "Recording was empty — hold Record a little longer." }, { status: 400 });
  try {
    return Response.json({ text: await transcribe(audio) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
