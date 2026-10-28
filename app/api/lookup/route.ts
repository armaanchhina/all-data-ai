import { matchParty } from "@/lib/extract";

// Re-matches the customer and vehicle after the front desk edits the name or phone.
export async function POST(req: Request) {
  const { customer, vehicle, text } = await req.json();
  try {
    return Response.json(await matchParty(customer, vehicle, String(text ?? "")));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
