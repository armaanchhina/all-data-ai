import { getSettings, saveSettings } from "@/lib/inbox";

export async function GET() {
  return Response.json(await getSettings());
}

export async function POST(req: Request) {
  const { autoCreate } = await req.json();
  await saveSettings({ autoCreate: autoCreate === true });
  return Response.json(await getSettings());
}
