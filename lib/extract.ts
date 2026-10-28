// Turns spoken/typed invoice details into a review: AI pulls out the fields, then the customer,
// vehicle and Shop Jobs are matched against real ALLDATA data. Anything not said is left out
// (no customer name, no vehicle, $0 price) so the owner can fill it in on the draft.
import OpenAI from "openai";
import { findCustomers, getShopJobs, recentCustomerNames, getVehicles, searchVehicleOptions, type Customer, type DraftItem, type Vehicle, type VehicleOption } from "./alldata";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const openai = new OpenAI();

type Extracted = {
  customer: { firstName: string | null; lastName: string | null; phone: string | null };
  vehicle: { year: string | null; make: string | null; model: string | null; plate: string | null; mileage: number | null };
  items: { description: string; shopJob: string | null; newShopJob: boolean; price: number | null; kind: "part" | "labor" }[];
};

export type ReviewItem = DraftItem & { shopJobPrice: number | null };
export type Review = {
  customer: { firstName: string; lastName: string; phone: string | null; match: Customer | null };
  vehicle: { year: string; make: string; model: string; plate: string | null; mileage: number | null; match: Vehicle | null; options: VehicleOption[]; baseOption: number };
  items: ReviewItem[];
  problems: string[];
};

const nullable = (type: string) => ({ type: [type, "null"] });
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["customer", "vehicle", "items"],
  properties: {
    customer: {
      type: "object", additionalProperties: false, required: ["firstName", "lastName", "phone"],
      properties: { firstName: nullable("string"), lastName: nullable("string"), phone: nullable("string") },
    },
    vehicle: {
      type: "object", additionalProperties: false, required: ["year", "make", "model", "plate", "mileage"],
      properties: { year: nullable("string"), make: nullable("string"), model: nullable("string"), plate: nullable("string"), mileage: nullable("number") },
    },
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["description", "shopJob", "newShopJob", "price", "kind"],
        properties: {
          description: { type: "string" }, shopJob: nullable("string"), newShopJob: { type: "boolean" },
          price: nullable("number"), kind: { type: "string", enum: ["part", "labor"] },
        },
      },
    },
  },
};

export async function extract(text: string): Promise<Review> {
  const shopJobs = await getShopJobs();
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name: "invoice", strict: true, schema } },
    messages: [
      {
        role: "system",
        content: [
          "You extract auto-repair invoice details for an ALLDATA Shop Manager draft.",
          "Only use information stated in the input. Use null for anything not stated. Never guess prices, phone numbers, names or vehicle details.",
          "price: the dollar amount stated for that item, otherwise null.",
          "shopJob: the exact name from the Shop Jobs list below when the item is clearly that job (e.g. 'front brake pads' -> 'Front Brake Pad + Labour'). Otherwise null. Don't match front to rear or similar-but-different jobs. A specific repair (e.g. 'fixed rattle in dash') is not a generic job like diagnosis or labour.",
          "newShopJob: only when shopJob is null. true if the item is a common, repeatable service a shop would reuse (e.g. 'Brake Fluid Flush', 'Serpentine Belt + Labour', 'Coolant Flush'); false for one-off, vague or vehicle-specific work. When true, write description as a short job name in the style of the list below.",
          "kind: 'labor' for labour/diagnosis/time-only work, otherwise 'part'.",
          "phone: digits as spoken, otherwise null. If only one customer name is given, put it in lastName.",
          "make: if not stated but the model makes it obvious (Civic -> Honda, Camry -> Toyota, F-150 -> Ford), fill it in.",
          "plate: licence plate in upper case. mileage: odometer reading as a number.",
          "",
          "Shop Jobs:",
          ...shopJobs.map((j) => `- ${j.name}`),
        ].join("\n"),
      },
      { role: "user", content: text },
    ],
  });
  const data: Extracted = JSON.parse(res.choices[0].message.content!);
  return resolve(data, shopJobs, text);
}

async function resolve(data: Extracted, shopJobs: { name: string; price: number }[], text: string): Promise<Review> {
  const { customer, vehicle, problems } = await matchParty(data.customer, data.vehicle, text);

  const items: ReviewItem[] = data.items.map((i) => {
    const name = i.shopJob ?? (i.newShopJob ? i.description : null);
    const job = name ? shopJobs.find((j) => j.name.toLowerCase() === name.toLowerCase()) : undefined;
    if (job) return { description: job.name, type: "shopJob", shopJobPrice: job.price, price: i.price ?? job.price };
    const description = i.newShopJob ? i.description.replace(/\b\w/g, (ch) => ch.toUpperCase()) : i.description;
    return { description, type: i.newShopJob ? "newShopJob" : i.kind, shopJobPrice: null, price: i.price ?? 0 };
  });
  return { customer, vehicle, items, problems };
}

export type Party = Pick<Review, "customer" | "vehicle"> & { problems: string[] };

// Finds the customer and their vehicle in ALLDATA. Also re-run from the review screen when the
// front desk types a name or phone that wasn't in the voice note.
export async function matchParty(c: Partial<Extracted["customer"]>, v: Partial<Extracted["vehicle"]>, text: string): Promise<Party> {
  const problems: string[] = [];
  const fullName = [c.firstName, c.lastName].map((x) => x?.trim()).filter(Boolean).join(" ");
  const phone = c.phone?.replace(/\D/g, "") || null;

  const carSaid = !!(v.year || v.make || v.model || v.plate);
  const ymm = v.year && v.make && v.model ? `${v.year} ${v.make} ${v.model}` : null;
  // Started now so it runs alongside the customer lookups; only used if the car isn't on file.
  const optionSearch = ymm ? searchVehicleOptions(ymm) : Promise.resolve([]);
  optionSearch.catch(() => {});

  // Name and phone both narrow it down; phone alone is enough. Results are most recent first.
  const nameSearch = async (): Promise<Customer[]> => {
    if (!fullName) return [];
    const exact = (await findCustomers(fullName)).filter((x) => `${x.firstName} ${x.lastName}`.trim().toLowerCase() === fullName.toLowerCase());
    if (exact.length || !c.lastName) return exact;
    // Speech often drops or doubles letters ("Arman" vs "Armaan"); compare with repeated letters collapsed.
    const loose = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
    return (await findCustomers(c.lastName)).filter((x) => loose(`${x.firstName}${x.lastName}`) === loose(fullName));
  };
  // Only a full number counts, compared on its last 10 digits so "+1 778…" and "778…" are the same.
  const last10 = (s: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
  const phoneSearch = async () => (phone && phone.length >= 10 ? (await findCustomers(last10(phone))).filter((x) => last10(x.phone) === last10(phone)) : []);
  // A plate belongs to one car, so it finds the customer when name and phone don't. ALLDATA's search
  // only matches the spacing it has stored, so try the common spellings, then confirm on the vehicle.
  const norm = (s?: string | null) => (s ?? "").replace(/\s/g, "").toUpperCase();
  const plateSearch = async (): Promise<Customer[]> => {
    const p = norm(v.plate);
    if (p.length < 4) return [];
    const spellings = [...new Set([v.plate!.trim().toUpperCase(), p, `${p.slice(0, 3)} ${p.slice(3)}`, `${p.slice(0, 4)} ${p.slice(4)}`])];
    const found = (await Promise.all(spellings.map(findCustomers))).flat();
    const unique = found.filter((x, i) => found.findIndex((y) => y.id === x.id) === i);
    // Placeholder "Unknown" customers (made when no name was given) only win if nobody else has the plate.
    unique.sort((a, b) => Number(a.lastName === "Unknown") - Number(b.lastName === "Unknown"));
    for (const c of unique)
      if ((await getVehicles(c.id)).some((x) => norm(x.plate) === p)) return [c];
    return [];
  };
  const [byName, byPhone, byPlate] = await Promise.all([nameSearch(), phoneSearch(), plateSearch()]);
  const customerMatch = byName.find((x) => byPhone.some((p) => p.id === x.id)) ?? byName[0] ?? byPhone[0] ?? byPlate[0] ?? null;
  if (byName.length > 1 && !byPhone.length) problems.push(`Several customers are named ${fullName}; picked the most recent.`);

  let vehicleMatch: Vehicle | null = null;
  if (customerMatch) {
    const vehicles = await getVehicles(customerMatch.id);
    vehicleMatch =
      (v.plate && vehicles.find((x) => norm(x.plate) === norm(v.plate))) ||
      vehicles.find((x) => x.year === v.year && x.make.toLowerCase() === (v.make ?? "").toLowerCase() && x.model.toLowerCase() === (v.model ?? "").toLowerCase()) ||
      (!carSaid && vehicles.length === 1 ? vehicles[0] : null);
  }
  let options: VehicleOption[] = [];
  let baseOption = -1;
  if (!vehicleMatch && carSaid) {
    if (ymm) {
      options = await optionSearch;
      if (!options.length) problems.push(`ALLDATA has no vehicle matching ${ymm}; the draft will have no vehicle.`);
      baseOption = pickBaseTrim(options, text);
    } else problems.push("Year, make and model weren't all given, so the draft will have no vehicle.");
  }

  return {
    customer: { firstName: customerMatch?.firstName ?? c.firstName ?? "", lastName: customerMatch?.lastName ?? c.lastName ?? "", phone, match: customerMatch },
    vehicle: { year: v.year || "", make: v.make || "", model: v.model || "", plate: v.plate || null, mileage: v.mileage ?? null, match: vehicleMatch, options, baseOption },
    problems,
  };
}

// When no trim was said, default to the base one: Canadian market (the shop is in BC), not hybrid/EV
// unless mentioned, then ALLDATA's first listed trim. The user can change it on the review screen.
function pickBaseTrim(options: VehicleOption[], text: string): number {
  const said = options.findIndex((o) => o.trim.endsWith(" CAN") &&
    new RegExp(`\\b${o.trim.replace(/ CAN$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  if (said >= 0) return said;
  const electrified = /hybrid|electric|\bev\b|phev|plug-in/i.test(text);
  const ok = (o: VehicleOption) => electrified || !/hybrid|electric|\bEV\b|PHEV|BATTERY/i.test(`${o.trim} ${o.engine}`);
  const order = [(o: VehicleOption) => o.trim.endsWith(" CAN") && ok(o), ok, () => true];
  for (const test of order) {
    const i = options.findIndex(test);
    if (i >= 0) return i;
  }
  return -1;
}

// Customer and Shop Job names are passed as spelling hints so names like "Chhina" come out right.
export async function transcribe(audio: File): Promise<string> {
  const [names, jobs] = await Promise.all([recentCustomerNames().catch(() => []), getShopJobs().catch(() => [])]);
  const prompt = `Auto repair invoice. Customers: ${[...new Set(names)].join(", ")}. Services: ${jobs.map((j) => j.name).join(", ")}.`;
  const res = await openai.audio.transcriptions.create({ file: audio, model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe", prompt });
  return res.text;
}
