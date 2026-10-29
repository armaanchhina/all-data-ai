// Voice notes, texts and photos waiting for the front desk. Each note is a JSON file (plus its audio
// and photo) in `inbox/`; it is read as soon as it arrives, so it opens instantly on the web page.
// With auto-create on, a clear note becomes a draft straight away; anything unclear still waits here.
import fs from "fs/promises";
import path from "path";
import { createDraft, type DraftRequest, type DraftResult } from "./alldata";
import { extract, transcribe, type Review } from "./extract";
import { readVin, type Vin } from "./vin";
import { sendText } from "./whatsapp";

const DIR = path.join(process.cwd(), "inbox");
const SETTINGS = path.join(DIR, "settings.json");
// WhatsApp delivers a photo and a voice note as separate messages; sent this close together, they are one job.
const PAIR_MS = 3 * 60_000;
// Auto-create waits this long after a note without a photo arrives, in case the photo is on its way.
const PHOTO_GRACE_MS = 20_000;
// Finished notes are deleted after this; their drafts stay in ALLDATA.
const KEEP_DONE_MS = 30 * 24 * 60 * 60_000;

export type Note = {
  id: string;
  from: string;
  via: string | null; // WhatsApp number ID it was sent to, so the reply comes from the same number
  receivedAt: number;
  audio: string | null; // file name in inbox/; null for a text message
  image: string | null; // photo file name in inbox/, e.g. the VIN sticker
  status: "processing" | "ready" | "done";
  transcript: string | null;
  vin: Vin | null;
  review: Review | null;
  error: string | null;
  held: string | null; // why auto-create left it for the front desk
  documentId: number | null;
  run: number; // bumped each time the note is (re)processed; an older run's result is dropped
};

export type Settings = { autoCreate: boolean };

export async function getSettings(): Promise<Settings> {
  // Straight to ALLDATA unless someone turned on the review step (web page toggle or "enable" on WhatsApp).
  return { autoCreate: true, ...JSON.parse(await fs.readFile(SETTINGS, "utf8").catch(() => "{}")) };
}

export async function saveSettings(settings: Settings) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(SETTINGS, JSON.stringify(settings));
}

const file = (id: string) => path.join(DIR, `${path.basename(id)}.json`);
const save = (note: Note) => fs.writeFile(file(note.id), JSON.stringify(note, null, 1));
const noteFiles = async () => (await fs.readdir(DIR).catch(() => [])).filter((n) => /^\d+-\w+\.json$/.test(n));

export async function getNote(id: string): Promise<Note | null> {
  return JSON.parse(await fs.readFile(file(id), "utf8").catch(() => "null"));
}

// Everything that changes a sender's notes runs one at a time, so a photo and a voice note arriving
// together pair up, and a note can't become two drafts.
const queues: Map<string, Promise<unknown>> = ((globalThis as any).__inboxQueues ??= new Map());
function bySender<T>(from: string, fn: () => Promise<T>): Promise<T> {
  const result = (queues.get(from) ?? Promise.resolve()).then(fn);
  queues.set(from, result.catch(() => {}));
  return result;
}

// A re-run (e.g. the photo arrived after the voice note) reuses the transcription or VIN read already done.
const jobs: Map<string, Promise<any>> = ((globalThis as any).__inboxJobs ??= new Map());
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!jobs.has(key)) {
    const job = fn();
    jobs.set(key, job);
    job.then(() => setTimeout(() => jobs.delete(key), 2 * PAIR_MS), () => jobs.delete(key));
  }
  return jobs.get(key)!;
}

// Waiting notes first, then the 20 most recent finished ones.
export async function listNotes(): Promise<Note[]> {
  const notes = (await Promise.all((await noteFiles()).map((n) => getNote(n.slice(0, -5))))).filter(Boolean) as Note[];
  for (const n of notes) {
    // A restart mid-transcription would otherwise leave a note stuck on "processing".
    if (n.status === "processing" && Date.now() - n.receivedAt > 3 * 60_000)
      Object.assign(n, { status: "ready", error: "Processing was interrupted. Play the audio and type the details instead." });
    if (n.status === "done" && Date.now() - n.receivedAt > KEEP_DONE_MS) deleteNote(n.id).catch(() => {});
  }
  notes.sort((a, b) => b.receivedAt - a.receivedAt);
  return [...notes.filter((n) => n.status !== "done"), ...notes.filter((n) => n.status === "done").slice(0, 20)];
}

type Media = { data: Buffer; mimeType: string };

// Saves the message and returns at once; transcription, VIN reading and review finish in the background.
// A photo joins the sender's recent note that has none, and details join a recent photo-only note.
export function addNote(from: string, input: { text?: string; audio?: Media; image?: Media }, via?: string): Promise<Note> {
  return bySender(from, async () => {
    await fs.mkdir(DIR, { recursive: true });
    const details = !!(input.text || input.audio);
    const hasDetails = (n: Note) => !!(n.audio || n.transcript);
    const recent = (await Promise.all((await noteFiles()).filter((n) => Date.now() - parseInt(n) < PAIR_MS).map((n) => getNote(n.slice(0, -5)))))
      .filter((n): n is Note => !!n && n.from === from && n.status !== "done")
      .sort((a, b) => b.receivedAt - a.receivedAt);
    const pair = input.image && !details ? recent.find((n) => !n.image && hasDetails(n)) : !input.image ? recent.find((n) => n.image && !hasDetails(n)) : undefined;

    const id = pair?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const note: Note = pair ?? { id, from, via: via ?? null, receivedAt: Date.now(), audio: null, image: null, status: "processing", transcript: null, vin: null, review: null, error: null, held: null, documentId: null, run: 0 };
    if (input.audio) {
      // OpenAI detects the format from the extension; WhatsApp sends ogg/opus, browsers webm or mp4.
      const m = input.audio.mimeType;
      note.audio = `${id}.${m.includes("ogg") ? "ogg" : m.includes("mp4") || m.includes("m4a") ? "m4a" : m.includes("mpeg") ? "mp3" : m.includes("wav") ? "wav" : "webm"}`;
      await fs.writeFile(path.join(DIR, note.audio), input.audio.data);
    }
    if (input.image) {
      const m = input.image.mimeType;
      note.image = `${id}-photo.${m.includes("png") ? "png" : m.includes("webp") ? "webp" : "jpg"}`;
      await fs.writeFile(path.join(DIR, note.image), input.image.data);
    }
    if (input.text) note.transcript = input.text;
    Object.assign(note, { status: "processing", error: null, held: null, run: (note.run ?? 0) + 1 });
    await save(note);
    prepare(note.id, note.run).catch(() => {});
    return note;
  });
}

async function prepare(id: string, run: number) {
  const note = await getNote(id);
  if (!note) return;
  try {
    // The voice note and the photo are read at the same time, so a photo adds little or no wait.
    const [transcript, vin] = await Promise.all([
      note.transcript ?? (note.audio ? once(note.audio, async () => transcribe(new File([new Uint8Array(await readMedia(note.audio!))], note.audio!))) : null),
      note.vin ?? (note.image ? once(note.image, async () => readVin(await readMedia(note.image!), imageType(note.image!)).catch(() => null)) : null),
    ]);
    Object.assign(note, { transcript, vin });
    // A photo on its own waits for the voice note or text with the job.
    if (transcript) {
      note.review = await extract(transcript, vin);
      if (note.image && !vin) note.review.problems.push("Couldn't read a VIN from the photo.");
    }
  } catch (e: any) {
    note.error = e.message;
  }

  const auto = !note.error && !!note.review && (await getSettings()).autoCreate;
  if (auto && !note.image) await new Promise((r) => setTimeout(r, PHOTO_GRACE_MS - (Date.now() - note.receivedAt)));
  let created = null as DraftResult | null;
  await bySender(note.from, async () => {
    if ((await getNote(id))?.run !== run) return; // dismissed, or re-run because its photo or voice note arrived
    if (auto) {
      note.held = autoBlocker(note.review!);
      if (!note.held) {
        try {
          created = await createDraft(autoDraft(note.review!));
          Object.assign(note, { status: "done", documentId: created.documentId });
        } catch (e: any) {
          note.held = `Auto-create failed: ${e.message}`;
        }
      }
    }
    if (note.status !== "done") note.status = "ready";
    await save(note);
  });
  if (created) await reply(note, draftMessage(created));
  // The full reason (an ALLDATA error can quote prices) is on the web page; the technician gets the gist.
  else if (note.held) await reply(note, `📝 Left for the front desk to check: ${note.held.startsWith("Auto-create failed") ? "it couldn't be created automatically." : note.held}`);
}

// Anything a person should look at keeps the note in the inbox instead of creating the draft.
function autoBlocker(r: Review): string | null {
  if (!r.items.length) return "No services were mentioned.";
  if (r.items.some((i) => !i.description.trim())) return "A service has no name.";
  if (r.problems.length) return r.problems[0];
  // Mechanics often say only the car; the draft then has no customer and the front desk adds one in
  // ALLDATA. With no car either, there's nothing to tell the job apart by.
  const car = r.vehicle.match || r.vehicle.options[r.vehicle.baseOption];
  if (!r.customer.match && !r.customer.lastName.trim() && !r.customer.phone && !car) return "No customer or car was given.";
  return null;
}

// The same draft the review screen would create with nothing changed, except that only a person adds
// to the shop's permanent Shop Job list: unattended, a new job goes in as a custom part.
function autoDraft(r: Review): DraftRequest {
  const v = r.vehicle;
  const option = v.match ? undefined : v.options[v.baseOption];
  const vin = v.vin?.valid ? v.vin.vin : null;
  return {
    customer: r.customer.match ? { id: r.customer.match.id }
      : r.customer.firstName.trim() || r.customer.lastName.trim() || r.customer.phone ? { firstName: r.customer.firstName, lastName: r.customer.lastName, phone: r.customer.phone }
      : null,
    vehicle: v.match ? { id: v.match.id, vin } : option ? { option, plate: v.plate, vin } : null,
    mileage: v.mileage,
    items: r.items.map(({ description, price, type }) => ({ description, price, type: type === "newShopJob" ? "part" : type })),
  };
}

// The front desk's Create for an inbox note: one draft per note, even with two tabs open.
export async function createFromNote(id: string, draft: DraftRequest): Promise<DraftResult> {
  const from = (await getNote(id))?.from ?? "";
  const { note, result } = await bySender(from, async () => {
    const note = await getNote(id);
    if (!note) throw new Error("This message was removed from the inbox.");
    if (note.status === "done") throw new Error(`Already created as Draft #${note.documentId}.`);
    const result = await createDraft(draft);
    Object.assign(note, { status: "done", documentId: result.documentId });
    await save(note);
    return { note, result };
  });
  await reply(note, draftMessage(result));
  return result;
}

// Technicians see what was created but never prices; the draft's own warnings (which quote prices)
// stay on the web page and in ALLDATA.
const draftMessage = (r: DraftResult) =>
  `✅ Draft #${r.documentId} created in ALLDATA: ${[r.customer || "no customer", r.vehicle].filter(Boolean).join(" · ")}, ` +
  `${r.lines.length} service${r.lines.length === 1 ? "" : "s"}: ${r.lines.map((l) => l.description).join(", ")}.` +
  (r.problems.length ? "\n⚠️ The front desk will double-check it in ALLDATA." : "");

// Notes added by upload have no phone number to answer.
const reply = (note: Note, text: string) => (/^\d+$/.test(note.from) ? sendText(note.from, text, note.via ?? undefined) : Promise.resolve());

const imageType = (name: string) => (name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg");

export async function readMedia(name: string): Promise<Buffer> {
  return fs.readFile(path.join(DIR, path.basename(name)));
}

// Removes a note, its audio and photo. Drafts already created in ALLDATA are not touched.
export async function deleteNote(id: string) {
  const note = await getNote(id);
  if (!note) return;
  await fs.rm(file(note.id), { force: true });
  for (const media of [note.audio, note.image]) if (media) await fs.rm(path.join(DIR, path.basename(media)), { force: true });
}

export async function clearDone() {
  for (const n of await noteFiles()) if ((await getNote(n.slice(0, -5)))?.status === "done") await deleteNote(n.slice(0, -5));
}
