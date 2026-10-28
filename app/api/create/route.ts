import { createDraft, type DraftRequest } from "@/lib/alldata";
import { createFromNote } from "@/lib/inbox";

// `noteId` when the draft is for an inbox note: it is marked done and the sender is told.
export async function POST(req: Request) {
  const { noteId, ...draft }: DraftRequest & { noteId?: string } = await req.json();
  if (!draft.items?.length) return Response.json({ error: "Add at least one service." }, { status: 400 });
  // A missing price goes in as $0 for the owner to fill in on the draft.
  for (const i of draft.items) if (!(typeof i.price === "number" && i.price >= 0)) i.price = 0;
  try {
    return Response.json(noteId ? await createFromNote(noteId, draft) : await createDraft(draft));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
