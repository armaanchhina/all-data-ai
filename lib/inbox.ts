// Voice notes and texts waiting for the front desk. Each note is a JSON file (plus its audio, for
// voice notes) in `inbox/`; it is read as soon as it arrives, so it opens instantly on the web page.
import fs from "fs/promises";
import path from "path";
import { extract, transcribe, type Review } from "./extract";

const DIR = path.join(process.cwd(), "inbox");

export type Note = {
  id: string;
  from: string;
  via: string | null; // WhatsApp number ID it was sent to, so the reply comes from the same number
  receivedAt: number;
  audio: string | null; // file name in inbox/; null for a text message
  status: "processing" | "ready" | "done";
  transcript: string | null;
  review: Review | null;
  error: string | null;
  documentId: number | null;
};

const file = (id: string) => path.join(DIR, `${path.basename(id)}.json`);
const save = (note: Note) => fs.writeFile(file(note.id), JSON.stringify(note, null, 1));

export async function getNote(id: string): Promise<Note | null> {
  return JSON.parse(await fs.readFile(file(id), "utf8").catch(() => "null"));
}

// Waiting notes first, then the 20 most recent finished ones.
export async function listNotes(): Promise<Note[]> {
  const names = (await fs.readdir(DIR).catch(() => [])).filter((n) => n.endsWith(".json"));
  const notes: Note[] = (await Promise.all(names.map((n) => getNote(n.slice(0, -5))))).filter(Boolean) as Note[];
  // A restart mid-transcription would otherwise leave a note stuck on "processing".
  for (const n of notes)
    if (n.status === "processing" && Date.now() - n.receivedAt > 3 * 60_000)
      Object.assign(n, { status: "ready", error: "Processing was interrupted. Play the audio and type the details instead." });
  notes.sort((a, b) => b.receivedAt - a.receivedAt);
  return [...notes.filter((n) => n.status !== "done"), ...notes.filter((n) => n.status === "done").slice(0, 20)];
}

// Saves the note and returns at once; transcription and review finish in the background.
export async function addNote(from: string, input: { text: string } | { audio: Buffer; mimeType: string }, via?: string): Promise<Note> {
  await fs.mkdir(DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const note: Note = { id, from, via: via ?? null, receivedAt: Date.now(), audio: null, status: "processing", transcript: null, review: null, error: null, documentId: null };
  let audio: File | null = null;
  if ("audio" in input) {
    // OpenAI detects the format from the extension; WhatsApp sends ogg/opus, browsers webm or mp4.
    const m = input.mimeType;
    const ext = m.includes("ogg") ? "ogg" : m.includes("mp4") || m.includes("m4a") ? "m4a" : m.includes("mpeg") ? "mp3" : m.includes("wav") ? "wav" : "webm";
    note.audio = `${id}.${ext}`;
    await fs.writeFile(path.join(DIR, note.audio), input.audio);
    audio = new File([new Uint8Array(input.audio)], note.audio, { type: m.split(";")[0] });
  } else note.transcript = input.text;
  await save(note);
  prepare(note, audio).catch(() => {});
  return note;
}

async function prepare(note: Note, audio: File | null) {
  try {
    if (audio) note.transcript = await transcribe(audio);
    note.review = await extract(note.transcript!);
  } catch (e: any) {
    note.error = e.message;
  }
  note.status = "ready";
  await save(note);
}

export async function readAudio(note: Note): Promise<Buffer | null> {
  return note.audio ? fs.readFile(path.join(DIR, path.basename(note.audio))) : null;
}

export async function markDone(id: string, documentId: number): Promise<Note | null> {
  const note = await getNote(id);
  if (!note) return null;
  Object.assign(note, { status: "done", documentId });
  await save(note);
  return note;
}
