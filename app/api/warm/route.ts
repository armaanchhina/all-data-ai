import { warm } from "@/lib/alldata";

// Loads the Shop Jobs and customer names into the cache while the user is still recording.
export async function POST() {
  try {
    await warm();
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
