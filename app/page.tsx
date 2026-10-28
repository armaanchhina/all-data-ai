"use client";
import { useRef, useState } from "react";
import type { Review, ReviewItem } from "@/lib/extract";
import type { DraftRequest, DraftResult } from "@/lib/alldata";

const box: React.CSSProperties = { border: "1px solid #d5dae3", borderRadius: 8, padding: 16, marginTop: 16 };
const button: React.CSSProperties = { padding: "10px 16px", borderRadius: 6, border: "none", background: "#2f6fd6", color: "white", fontSize: 15, cursor: "pointer" };
const input: React.CSSProperties = { padding: 6, border: "1px solid #c3c9d4", borderRadius: 4, fontSize: 14 };

export default function Home() {
  const [text, setText] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [trim, setTrim] = useState(-1);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

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
    fetch("/api/warm", { method: "POST" }).catch(() => {});
    rec.start();
    setRecording(true);
  }

  async function analyse(input = text) {
    setResult(null);
    const data = await call<Review>("Reading invoice details…", "/api/extract", JSON.stringify({ text: input }));
    if (data) {
      setReview(data);
      setTrim(data.vehicle.baseOption);
    }
  }

  function update(fn: (r: Review) => void) {
    const copy = structuredClone(review!);
    fn(copy);
    setReview(copy);
  }

  const option = review && !review.vehicle.match ? review.vehicle.options[trim] : undefined;
  const blockers = review && !review.items.length ? ["Add at least one service."] : [];

  async function create() {
    if (!review) return;
    const v = review.vehicle;
    const draft: DraftRequest = {
      customer: review.customer.match ? { id: review.customer.match.id } : { firstName: review.customer.firstName, lastName: review.customer.lastName, phone: review.customer.phone },
      vehicle: v.match ? { id: v.match.id } : option ? { option, plate: v.plate } : null,
      mileage: v.mileage,
      items: review.items.map(({ description, price, type }) => ({ description, price, type })),
    };
    const data = await call<DraftResult>("Creating draft in ALLDATA…", "/api/create", JSON.stringify(draft));
    if (data) setResult(data);
  }

  return (
    <main>
      <h1 style={{ fontSize: 26 }}>A.S Auto — AI Invoice Assistant</h1>

      <div style={box}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="e.g. Armaan Chhina, 2016 Honda Civic, plate MJ8 9PC, 197899 km. Front brake pads 165, oil change 90, rear rotor 190."
          style={{ ...input, width: "100%", boxSizing: "border-box", fontSize: 15 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={{ ...button, background: recording ? "#c93636" : "#4a5568" }} onClick={toggleRecording} disabled={!!busy}>
            {recording ? "■ Stop" : "🎤 Record"}
          </button>
          <button style={button} onClick={() => analyse()} disabled={!text.trim() || !!busy || recording}>Review Invoice</button>
        </div>
      </div>

      {busy && <p>{busy}</p>}
      {error && <p style={{ color: "#c93636" }}>{error}</p>}

      {review && !result && (
        <div style={box}>
          <h2 style={{ marginTop: 0 }}>Review Invoice</h2>

          <p>
            <b>Customer:</b>{" "}
            {review.customer.match ? (
              <>
                {review.customer.firstName} {review.customer.lastName} <span style={{ color: "#2e7d32" }}>✓ existing ALLDATA customer</span>
              </>
            ) : (
              <>
                <input style={{ ...input, width: 110 }} placeholder="First name" value={review.customer.firstName} onChange={(e) => update((r) => { r.customer.firstName = e.target.value; })} />{" "}
                <input style={{ ...input, width: 130 }} placeholder="Last name (Unknown)" value={review.customer.lastName} onChange={(e) => update((r) => { r.customer.lastName = e.target.value; })} />{" "}
                · phone <input style={{ ...input, width: 130 }} value={review.customer.phone ?? ""} onChange={(e) => update((r) => { r.customer.phone = e.target.value || null; })} />{" "}
                <span style={{ color: "#b26a00" }}>new — will be created</span>
              </>
            )}
          </p>

          <p>
            <b>Vehicle:</b>{" "}
            {review.vehicle.match ? (
              <>
                {review.vehicle.match.year} {review.vehicle.match.make} {review.vehicle.match.model} {review.vehicle.match.trim} {review.vehicle.match.plate && `· ${review.vehicle.match.plate}`}{" "}
                <span style={{ color: "#2e7d32" }}>✓ on file</span>
              </>
            ) : !review.vehicle.options.length ? (
              <span style={{ color: "#6b7280" }}>none — add it on the draft</span>
            ) : (
              <>
                {review.vehicle.year} {review.vehicle.make} {review.vehicle.model} · plate{" "}
                <input style={{ ...input, width: 100 }} value={review.vehicle.plate ?? ""} onChange={(e) => update((r) => { r.vehicle.plate = e.target.value.toUpperCase() || null; })} />{" "}
                {option && <span style={{ color: "#b26a00" }}>new — will be added</span>}
                <br />
                <select style={{ ...input, marginTop: 8, maxWidth: "100%" }} value={trim} onChange={(e) => setTrim(Number(e.target.value))}>
                  <option value={-1}>No vehicle</option>
                  {review.vehicle.options.map((o, i) => <option key={i} value={i}>{o.trim} — {o.engine}</option>)}
                </select>
                {trim >= 0 && trim === review.vehicle.baseOption && <span style={{ color: "#6b7280" }}> picked automatically — change if needed</span>}
              </>
            )}
          </p>

          <p>
            <b>Mileage In:</b>{" "}
            <input style={{ ...input, width: 110 }} value={review.vehicle.mileage ?? ""} onChange={(e) => update((r) => { r.vehicle.mileage = e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null; })} />
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #d5dae3" }}>
                <th>Service</th><th>Added as</th><th style={{ textAlign: "right" }}>Price</th><th />
              </tr>
            </thead>
            <tbody>
              {review.items.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eef0f4" }}>
                  <td style={{ padding: "6px 0" }}>{item.description}</td>
                  <td>
                    {item.type === "shopJob" ? (
                      <>Shop Job <span style={{ color: "#6b7280" }}>(${item.shopJobPrice?.toFixed(2)})</span></>
                    ) : (
                      <select style={input} value={item.type} onChange={(e) => update((r) => { r.items[i].type = e.target.value as ReviewItem["type"]; })}>
                        <option value="newShopJob">New Shop Job</option>
                        <option value="part">Custom part</option>
                        <option value="labor">Custom labour</option>
                      </select>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    $<input style={{ ...input, width: 80, textAlign: "right" }} value={item.price || ""} placeholder="0" onChange={(e) => update((r) => { r.items[i].price = Number(e.target.value) || 0; })} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }} onClick={() => update((r) => { r.items.splice(i, 1); })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {[...review.problems, ...blockers].length > 0 && (
            <ul style={{ color: "#b26a00" }}>{[...new Set([...review.problems, ...blockers])].map((p) => <li key={p}>{p}</li>)}</ul>
          )}

          <button style={{ ...button, marginTop: 12, opacity: blockers.length ? 0.5 : 1 }} disabled={blockers.length > 0 || !!busy} onClick={create}>
            Create Draft in ALLDATA
          </button>
        </div>
      )}

      {result && (
        <div style={{ ...box, borderColor: result.problems.length ? "#c93636" : "#2e7d32" }}>
          <h2 style={{ marginTop: 0, color: result.problems.length ? "#c93636" : "#2e7d32" }}>
            {result.problems.length ? "Draft created, but it doesn't match" : "✓ Draft created and verified in ALLDATA"}
          </h2>
          <p>Draft #{result.documentId} · {result.customer} · {result.vehicle ?? "No vehicle"} · Mileage {result.mileage?.toLocaleString() ?? "—"}</p>
          <ul>{result.lines.map((l, i) => <li key={i}>{l.description} — ${l.total.toFixed(2)}</li>)}</ul>
          <p><b>Total (with supplies & tax): ${result.total.toFixed(2)}</b></p>
          {result.problems.length > 0 && <ul style={{ color: "#c93636" }}>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <p style={{ color: "#6b7280" }}>Left as a Draft. Review and finalize it in ALLDATA yourself.</p>
          <button style={button} onClick={() => { setResult(null); setReview(null); setText(""); }}>New invoice</button>
        </div>
      )}
    </main>
  );
}
