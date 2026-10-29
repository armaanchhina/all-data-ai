"use client";
import { useEffect, useRef, useState } from "react";
import type { Party, Review, ReviewItem } from "@/lib/extract";
import type { Note, Settings } from "@/lib/inbox";
import type { DraftRequest, DraftResult } from "@/lib/alldata";

// "16045551234" → "(604) 555-1234"; anything else (e.g. "upload") is shown as is.
const phone = (s: string) => {
  const d = s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s;
};
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const money = (n: number) => `$${n.toFixed(2)}`;

export default function Home() {
  const [text, setText] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [trim, setTrim] = useState(-1);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [found, setFound] = useState<Party | null>(null);
  const lookupId = useRef(0);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Voice notes from WhatsApp show up here on their own.
  const loadNotes = () => fetch("/api/inbox").then((r) => r.json()).then(setNotes).catch(() => {});
  // The mode can also be changed by texting "enable" / "disable", so it is refreshed with the inbox.
  const loadSettings = () => fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {});
  useEffect(() => {
    loadNotes();
    loadSettings();
    const timer = setInterval(() => (loadNotes(), loadSettings()), 4000);
    return () => clearInterval(timer);
  }, []);

  async function setAutoCreate(autoCreate: boolean) {
    setSettings(await fetch("/api/settings", { method: "POST", body: JSON.stringify({ autoCreate }) }).then((r) => r.json()));
  }

  function openNote(n: Note) {
    setNote(n);
    setResult(null);
    setText(n.transcript ?? "");
    setReview(n.review);
    setTrim(n.review?.vehicle.baseOption ?? -1);
    setError(n.error ?? "");
  }

  async function uploadNote(file: File) {
    const form = new FormData();
    form.append("file", file);
    await call("Uploading…", "/api/inbox", form, false);
    loadNotes();
  }

  async function call<T>(label: string, url: string, body: BodyInit, json = true): Promise<T | null> {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(url, { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function toggleRecording() {
    if (recording) return recorder.current?.stop();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) return setError("Microphone access was blocked.");
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const form = new FormData();
      // OpenAI detects the format from the file extension; Safari records mp4, Chrome webm.
      const type = rec.mimeType.split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
      form.append("audio", new File(chunks, `speech.${ext}`, { type }));
      const data = await call<{ text: string }>("Transcribing…", "/api/transcribe", form, false);
      if (data) {
        setText(data.text);
        analyse(data.text);
      }
    };
    recorder.current = rec;
    setNote(null);
    fetch("/api/warm", { method: "POST" }).catch(() => {});
    rec.start();
    setRecording(true);
  }

  async function analyse(input = text) {
    setResult(null);
    const data = await call<Review>("Reading invoice details…", "/api/extract", JSON.stringify({ text: input, vin: note?.vin ?? null }));
    if (data) {
      setReview(data);
      setTrim(data.vehicle.baseOption);
    }
  }

  // When a name, full phone number or plate is typed for a new customer, look for them in ALLDATA first.
  const c = review?.customer;
  useEffect(() => {
    setFound(null);
    if (!review || !c || c.match) return;
    const digits = (c.phone ?? "").replace(/\D/g, "");
    const plate = (review.vehicle.plate ?? "").replace(/\s/g, "");
    if (c.lastName.trim().length < 2 && digits.length < 10 && plate.length < 4) return;
    const id = ++lookupId.current;
    const timer = setTimeout(async () => {
      const res = await fetch("/api/lookup", { method: "POST", body: JSON.stringify({ customer: c, vehicle: review.vehicle, text }) }).then((r) => r.json()).catch(() => null);
      if (id === lookupId.current && res?.customer?.match) setFound(res);
    }, 500);
    return () => clearTimeout(timer);
  }, [c?.firstName, c?.lastName, c?.phone, c?.match, review?.vehicle.plate]);

  function applyFound() {
    if (!found) return;
    update((r) => {
      r.customer = found.customer;
      r.vehicle = { ...found.vehicle, mileage: r.vehicle.mileage };
      r.problems = found.problems;
    });
    setTrim(found.vehicle.baseOption);
    setFound(null);
  }

  function update(fn: (r: Review) => void) {
    const copy = structuredClone(review!);
    fn(copy);
    setReview(copy);
  }

  const option = review && !review.vehicle.match ? review.vehicle.options[trim] : undefined;
  const blocker =
    note?.status === "done" ? `Already created as Draft #${note.documentId}.`
    : !review?.items.length ? "Add at least one service."
    : review.items.some((i) => !i.description.trim()) ? "Every service needs a name."
    : null;
  const waiting = notes.filter((n) => n.status !== "done");
  const nextNote = waiting.find((n) => n.status === "ready" && n.id !== note?.id);
  const subtotal = review?.items.reduce((sum, i) => sum + (i.price || 0), 0) ?? 0;

  async function dismissNote() {
    if (!note || !confirm("Remove this message from the inbox?")) return;
    await fetch(`/api/inbox/${note.id}`, { method: "DELETE" });
    reset();
    loadNotes();
  }

  async function clearCompleted() {
    await fetch("/api/inbox", { method: "DELETE" });
    if (note?.status === "done") reset();
    loadNotes();
  }

  function reset() {
    setResult(null);
    setReview(null);
    setText("");
    setNote(null);
    setError("");
  }

  async function create() {
    if (!review) return;
    const v = review.vehicle;
    const vin = v.vin?.valid ? v.vin.vin : null; // a VIN that may be misread is never saved
    const draft: DraftRequest = {
      customer: review.customer.match ? { id: review.customer.match.id }
        : review.customer.firstName.trim() || review.customer.lastName.trim() || review.customer.phone ? { firstName: review.customer.firstName, lastName: review.customer.lastName, phone: review.customer.phone }
        : null,
      vehicle: v.match ? { id: v.match.id, vin } : option ? { option, plate: v.plate, vin } : null,
      mileage: v.mileage,
      items: review.items.map(({ description, price, type }) => ({ description, price, type })),
    };
    // With a note, the server marks it done and tells the sender; it refuses a second draft for it.
    const data = await call<DraftResult>("Creating draft in ALLDATA…", "/api/create", JSON.stringify({ ...draft, noteId: note?.id }));
    if (data) setResult(data);
    if (data && note) {
      setNote({ ...note, status: "done", documentId: data.documentId });
      loadNotes();
    }
  }

  const noteCard = (n: Note) => (
    <button key={n.id} className={`note${note?.id === n.id ? " active" : ""}${n.status === "done" ? " done" : ""}`} disabled={n.status === "processing" || !!busy} onClick={() => openNote(n)}>
      <div className="note-top">
        <span className="note-from">{n.audio ? "🎤" : n.transcript ? "💬" : "📷"}{n.image && (n.audio || n.transcript) ? " 📷" : ""} {phone(n.from)}</span>
        <span className="note-time">{ago(n.receivedAt)}</span>
      </div>
      <div className="note-text">{n.status === "processing" ? (n.audio ? "Transcribing…" : "Reading…") : n.error ?? n.transcript ?? (n.vin ? `Photo · VIN ${n.vin.vin}` : "Photo")}</div>
      {n.status === "processing" ? <span className="badge blue"><span className="spinner" /> Processing</span>
        : n.status === "done" ? <span className="badge green">✓ Draft #{n.documentId}</span>
        : n.error ? <span className="badge red">Needs attention</span>
        : !n.transcript ? <span className="badge gray">Waiting for job details</span>
        : n.held ? <span className="badge amber">Not auto-created</span>
        : <span className="badge amber">Ready to review</span>}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <b>A.S Auto Repair</b>
          <span>Invoice Assistant</span>
        </div>
        {settings && (
          <div className="mode">
            <div className="segmented">
              <button className={settings.autoCreate ? "" : "on"} onClick={() => setAutoCreate(false)}>Review first</button>
              <button className={settings.autoCreate ? "on" : ""} onClick={() => setAutoCreate(true)}>Create automatically</button>
            </div>
            <span className="sub">
              {settings.autoCreate
                ? "Clear WhatsApp notes become drafts right away. Anything unclear still waits here."
                : "Every WhatsApp note waits here until someone clicks Create draft."}
            </span>
          </div>
        )}
        <div className="inbox-head">
          <h2>Inbox {waiting.length > 0 && <span className="badge blue">{waiting.length}</span>}</h2>
          <label className="btn ghost" title="Add a voice note or VIN photo by hand">
            Upload
            <input type="file" accept="audio/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadNote(f); e.target.value = ""; }} />
          </label>
        </div>
        <div className="inbox-list">
          {!notes.length && <div className="inbox-empty">No voice notes yet.<br />WhatsApp notes appear here automatically.</div>}
          {waiting.map(noteCard)}
          {notes.length > waiting.length && (
            <div className="inbox-section inline" style={{ justifyContent: "space-between" }}>
              Completed
              <button className="btn ghost" style={{ fontSize: 12, padding: "2px 6px" }} onClick={clearCompleted}>Clear</button>
            </div>
          )}
          {notes.filter((n) => n.status === "done").map(noteCard)}
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          <section className="card">
            <div className="card-head">
              <div>
                <h1>{note ? `${note.audio ? "Voice note" : note.transcript ? "Text" : "Photo"} from ${phone(note.from)}` : "New invoice"}</h1>
                <div className="sub">{note ? ago(note.receivedAt) : "Record or type the customer, car, mileage and repairs."}</div>
              </div>
              <div className="inline">
                {note && note.status !== "done" && <button className="btn" onClick={dismissNote}>Dismiss</button>}
                {(review || result) && <button className="btn" onClick={reset}>New invoice</button>}
              </div>
            </div>
            {note?.audio && <audio controls src={`/api/inbox/${note.id}`} style={{ marginBottom: 10 }} />}
            {note?.image && (
              <a href={`/api/inbox/${note.id}?photo`} target="_blank" className="photo" title="Open full size">
                <img src={`/api/inbox/${note.id}?photo`} alt="Photo sent with the note" />
              </a>
            )}
            <textarea
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="e.g. Armaan Chhina, 2016 Honda Civic, plate MJ8 9PC, 197,899 km. Front brake pads 165, oil change, rear rotor 190."
            />
            <div className="inline" style={{ marginTop: 10 }}>
              <button className={`btn ${recording ? "danger" : ""}`} onClick={toggleRecording} disabled={!!busy}>
                {recording ? <><span className="rec-dot" /> Stop recording</> : "🎤 Record"}
              </button>
              <button className="btn primary" onClick={() => analyse()} disabled={!text.trim() || !!busy || recording}>
                {review ? "Re-read text" : "Read invoice"}
              </button>
              {busy && <span className="status"><span className="spinner" /> {busy}</span>}
            </div>
          </section>

          {error && <div className="callout red">{error}</div>}
          {note?.held && note.status !== "done" && <div className="callout amber">Not created automatically: {note.held}</div>}

          {!review && !result && !busy && !text && !note && (
            <div className="empty">
              <b>{waiting.length ? "Pick a voice note from the inbox" : "Nothing waiting"}</b>
              {waiting.length ? "Each one is already transcribed and ready to check." : "New WhatsApp voice notes will show up on the left."}
            </div>
          )}

          {review && !result && (
            <>
              <section className="card">
                <div className="card-head"><h2>Review</h2></div>
                <div className="rows">
                  <div className="row">
                    <div className="row-label">Customer</div>
                    {review.customer.match ? (
                      <div className="inline">
                        <span className="value">{review.customer.firstName} {review.customer.lastName}</span>
                        {review.customer.match.phone && <span className="sub" style={{ paddingTop: 7 }}>{phone(review.customer.match.phone)}</span>}
                        <span className="badge green" style={{ marginTop: 6 }}>✓ In ALLDATA</span>
                        <button className="btn ghost" onClick={() => update((r) => { r.customer.match = null; r.vehicle.match = null; })}>Change</button>
                      </div>
                    ) : (
                      <div className="row-body">
                        <div className="inline">
                          <input className="field" style={{ flex: 1 }} placeholder="First name" value={review.customer.firstName} onChange={(e) => update((r) => { r.customer.firstName = e.target.value; })} />
                          <input className="field" style={{ flex: 1 }} placeholder="Last name" value={review.customer.lastName} onChange={(e) => update((r) => { r.customer.lastName = e.target.value; })} />
                          <input className="field" style={{ flex: 1 }} placeholder="Phone" value={review.customer.phone ?? ""} onChange={(e) => update((r) => { r.customer.phone = e.target.value || null; })} />
                        </div>
                        {found?.customer.match && (
                          <div className="callout blue inline" style={{ justifyContent: "space-between" }}>
                            <span>
                              Found in ALLDATA: <b>{found.customer.match.firstName} {found.customer.match.lastName}</b>
                              {found.customer.match.phone && ` · ${phone(found.customer.match.phone)}`}
                              {found.vehicle.match && ` · ${found.vehicle.match.year} ${found.vehicle.match.make} ${found.vehicle.match.model}`}
                            </span>
                            <button className="btn primary" onClick={applyFound}>Use this customer</button>
                          </div>
                        )}
                        <div className="inline">
                          {!review.customer.firstName.trim() && !review.customer.lastName.trim() && !review.customer.phone ? (
                            <><span className="badge gray">No customer</span><span className="sub">The draft is left without one; add it in ALLDATA.</span></>
                          ) : (
                            <><span className="badge amber">New customer</span><span className="sub">{review.customer.lastName.trim() ? "Will be created in ALLDATA." : "No last name — will be created as “Unknown”."}</span></>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="row">
                    <div className="row-label">Vehicle</div>
                    {review.vehicle.match ? (
                      <div className="inline">
                        <span className="value">{review.vehicle.match.year} {review.vehicle.match.make} {review.vehicle.match.model} {review.vehicle.match.trim}</span>
                        {review.vehicle.match.plate && <span className="sub" style={{ paddingTop: 7 }}>{review.vehicle.match.plate}</span>}
                        <span className="badge green" style={{ marginTop: 6 }}>✓ On file</span>
                      </div>
                    ) : !review.vehicle.options.length ? (
                      <div className="inline">
                        {review.vehicle.model && <span className="value">{review.vehicle.year} {review.vehicle.make} {review.vehicle.model}</span>}
                        <span className="badge gray" style={{ marginTop: 6 }}>{review.vehicle.model ? "Not found in ALLDATA" : "No vehicle"}</span>
                        <span className="sub" style={{ paddingTop: 7 }}>Add it on the draft in ALLDATA.</span>
                      </div>
                    ) : (
                      <div className="row-body">
                        <div className="inline">
                          <span className="value" style={{ paddingTop: 0 }}>{review.vehicle.year} {review.vehicle.make} {review.vehicle.model}</span>
                          {option ? <span className="badge amber">New vehicle</span> : <span className="badge gray">Not added</span>}
                        </div>
                        <div className="inline">
                          <select className="field" style={{ flex: 2 }} value={trim} onChange={(e) => setTrim(Number(e.target.value))}>
                            <option value={-1}>Don’t add a vehicle</option>
                            {review.vehicle.options.map((o, i) => <option key={i} value={i}>{o.trim} — {o.engine}</option>)}
                          </select>
                          <input className="field" style={{ flex: 1 }} placeholder="Plate" value={review.vehicle.plate ?? ""} onChange={(e) => update((r) => { r.vehicle.plate = e.target.value.toUpperCase() || null; })} />
                        </div>
                        {trim >= 0 && trim === review.vehicle.baseOption && <span className="sub">Trim picked automatically — change it if needed.</span>}
                      </div>
                    )}
                  </div>

                  {(review.vehicle.vin || note?.image) && (
                    <div className="row">
                      <div className="row-label">VIN</div>
                      {review.vehicle.vin ? (
                        <div className="inline">
                          <span className="value mono">{review.vehicle.vin.vin}</span>
                          {!review.vehicle.vin.valid ? <span className="badge amber" style={{ marginTop: 6 }}>May be misread — won’t be saved</span>
                            : review.vehicle.match?.vin === review.vehicle.vin.vin ? <span className="badge green" style={{ marginTop: 6 }}>✓ On file</span>
                            : review.vehicle.match?.vin ? <span className="badge amber" style={{ marginTop: 6 }}>Car on file has a different VIN</span>
                            : review.vehicle.match || option ? <span className="badge blue" style={{ marginTop: 6 }}>Will be saved to the vehicle</span>
                            : <span className="badge gray" style={{ marginTop: 6 }}>Read from photo</span>}
                          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(review.vehicle.vin!.vin)}>Copy</button>
                        </div>
                      ) : <span className="sub" style={{ paddingTop: 7 }}>Couldn’t read a VIN from the photo.</span>}
                    </div>
                  )}

                  <div className="row">
                    <div className="row-label">Mileage in</div>
                    <div className="inline">
                      <input className="field" style={{ width: 160 }} inputMode="numeric" placeholder="—" value={review.vehicle.mileage?.toLocaleString() ?? ""} onChange={(e) => update((r) => { const d = e.target.value.replace(/\D/g, ""); r.vehicle.mileage = d ? Number(d) : null; })} />
                      <span className="sub">km</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Services</h2>
                  <button className="btn ghost" onClick={() => update((r) => { r.items.push({ description: "", type: "part", price: 0, shopJobPrice: null }); })}>+ Add service</button>
                </div>
                <table className="services">
                  <thead>
                    <tr><th>Service</th><th>Added as</th><th className="num">Price</th><th /></tr>
                  </thead>
                  <tbody>
                    {review.items.map((item, i) => (
                      <tr key={i}>
                        <td style={{ width: "45%" }}>
                          {item.type === "shopJob" ? <b>{item.description}</b> : (
                            <input className="field" placeholder="Service name" value={item.description} onChange={(e) => update((r) => { r.items[i].description = e.target.value; })} />
                          )}
                        </td>
                        <td>
                          {item.type === "shopJob" ? (
                            <span className="badge green">Shop Job · {money(item.shopJobPrice ?? 0)}</span>
                          ) : (
                            <select className="field" value={item.type} onChange={(e) => update((r) => { r.items[i].type = e.target.value as ReviewItem["type"]; })}>
                              <option value="newShopJob">New Shop Job</option>
                              <option value="part">Custom part</option>
                              <option value="labor">Custom labour</option>
                            </select>
                          )}
                        </td>
                        <td className="num">
                          <label className="price"><span>$</span><PriceInput value={item.price} onChange={(price) => update((r) => { r.items[i].price = price; })} /></label>
                        </td>
                        <td className="num" style={{ width: 36 }}>
                          <button className="icon-btn" title="Remove" onClick={() => update((r) => { r.items.splice(i, 1); })}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!review.items.length && <div className="sub" style={{ padding: "8px 0" }}>No services yet.</div>}
                <div className="subtotal">
                  <span className="sub">Subtotal before shop supplies and tax</span>
                  <b>{money(subtotal)}</b>
                </div>
                {review.items.some((i) => i.type === "newShopJob") && (
                  <div className="callout blue" style={{ marginTop: 12 }}>“New Shop Job” adds the service to the shop’s Shop Job list permanently. Use Custom part/labour for one-offs.</div>
                )}
              </section>

              {review.problems.length > 0 && (
                <div className="callout amber"><ul>{review.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
              )}

              <div className="actions">
                <span className="sub">{blocker ?? "Creates a Draft only — finish it in ALLDATA."}</span>
                <button className="btn primary big" disabled={!!blocker || !!busy} onClick={create}>
                  {busy.startsWith("Creating") ? <><span className="spinner" /> Creating…</> : "Create draft"}
                </button>
              </div>
            </>
          )}

          {result && (
            <section className="card">
              <div className="result-head">
                <div className={`check ${result.problems.length ? "warn" : "ok"}`}>{result.problems.length ? "!" : "✓"}</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{result.problems.length ? "Draft created — please check it" : `Draft #${result.documentId} created`}</h2>
                  <div className="sub">{result.customer || "No customer"} · {result.vehicle ?? "No vehicle"}{result.mileage ? ` · ${result.mileage.toLocaleString()} km` : ""}</div>
                </div>
              </div>
              <ul className="lines">
                {result.lines.map((l, i) => <li key={i}><span>{l.description}</span><span>{money(l.total)}</span></li>)}
                <li><b>Total with shop supplies & tax</b><b>{money(result.total)}</b></li>
              </ul>
              {result.problems.length > 0 && <div className="callout red" style={{ marginTop: 12 }}><ul>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
              <div className="inline" style={{ marginTop: 16, justifyContent: "space-between" }}>
                <span className="sub">Left as a Draft — finalize it in ALLDATA.</span>
                {nextNote ? <button className="btn primary" onClick={() => openNote(nextNote)}>Next voice note →</button> : <button className="btn" onClick={reset}>New invoice</button>}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// Keeps what is typed ("165.", "0.5") so cents can be entered; the number is passed up as it changes.
function PriceInput({ value, onChange }: { value: number; onChange: (price: number) => void }) {
  const [typed, setTyped] = useState(value ? String(value) : "");
  useEffect(() => {
    if ((Number(typed) || 0) !== value) setTyped(value ? String(value) : "");
  }, [value]);
  return (
    <input inputMode="decimal" placeholder="0" value={typed} onChange={(e) => {
      const t = e.target.value.replace(/[^\d.]/g, "");
      setTyped(t);
      onChange(Number(t) || 0);
    }} />
  );
}
