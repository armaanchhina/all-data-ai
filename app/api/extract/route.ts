import { extract } from "@/lib/extract";

export async function POST(req: Request) {
  const { text, vin } = await req.json();
  try {
    return Response.json(await extract(String(text ?? ""), vin ?? null));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
