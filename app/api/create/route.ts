import { createDraft, type DraftRequest } from "@/lib/alldata";

export async function POST(req: Request) {
  const draft: DraftRequest = await req.json();
  if (!draft.items?.length) return Response.json({ error: "Add at least one service." }, { status: 400 });
  // A missing price goes in as $0 for the owner to fill in on the draft.
  for (const i of draft.items) if (!(typeof i.price === "number" && i.price >= 0)) i.price = 0;
  try {
    return Response.json(await createDraft(draft));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
