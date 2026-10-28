// Reads the VIN from a photo (door-jamb sticker, windshield plate, registration) and decodes it with
// ALLDATA's VIN lookup (exact vehicle and engine) and NHTSA's free vPIC service (trim) at once.
// Runs alongside transcription, so a photo adds little or no wait.
import OpenAI from "openai";
import { decodeVin } from "./alldata";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const openai = new OpenAI();

export type Vin = {
  vin: string; valid: boolean; year: string | null; make: string | null; model: string | null; trim: string | null;
  acesVehicleIds: string[]; acesEngineIds: string[]; // what ALLDATA says the VIN can be; empty if it doesn't know it
};

export async function readVin(image: Buffer, mimeType: string): Promise<Vin | null> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "vin", strict: true, schema: { type: "object", additionalProperties: false, required: ["vin"], properties: { vin: { type: ["string", "null"] } } } },
    },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Read the 17-character vehicle VIN in this photo, exactly as printed. Return null if no VIN is clearly visible." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}`, detail: "high" } },
      ],
    }],
  });
  const raw: string | null = JSON.parse(res.choices[0].message.content!).vin;
  // VINs never use I, O or Q, so those are misreads of 1 and 0.
  const vin = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/I/g, "1").replace(/[OQ]/g, "0");
  if (vin.length !== 17) return null;
  const [nhtsa, alldata] = await Promise.all([decode(vin), decodeVin(vin).catch(() => null)]);
  return {
    vin, valid: checkDigit(vin), trim: nhtsa.trim,
    year: alldata?.year ?? nhtsa.year, make: alldata?.make ?? nhtsa.make, model: alldata?.model ?? nhtsa.model,
    acesVehicleIds: alldata?.acesVehicleIds ?? [], acesEngineIds: alldata?.acesEngineIds ?? [],
  };
}

// North American VINs carry a check digit in position 9, which catches most misreads.
function checkDigit(vin: string): boolean {
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const value = (ch: string) => (/\d/.test(ch) ? Number(ch) : ("ABCDEFGH.JKLMN.P.R..STUVWXYZ".indexOf(ch) % 9) + 1);
  const sum = [...vin].reduce((s, ch, i) => s + value(ch) * weights[i], 0) % 11;
  return vin[8] === (sum === 10 ? "X" : String(sum));
}

// Best effort: if vPIC is slow or down, the VIN is still used to find the car on file.
async function decode(vin: string): Promise<{ year: string | null; make: string | null; model: string | null; trim: string | null }> {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: AbortSignal.timeout(4000) });
    const r = (await res.json()).Results?.[0] ?? {};
    const s = (x: unknown) => String(x ?? "").trim() || null;
    const make = s(r.Make)?.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()) ?? null; // "HONDA" → "Honda"
    return { year: s(r.ModelYear), make, model: s(r.Model), trim: s(r.Trim) };
  } catch {
    return { year: null, make: null, model: null, trim: null };
  }
}
