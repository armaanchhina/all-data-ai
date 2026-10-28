// ALLDATA Shop Manager client. Attaches over CDP to the Chrome started by `npm run browser`
// (logged in manually) and calls Shop Manager's own JSON API from inside that page, so every
// request uses the real session. Only ever creates Draft documents.
import { chromium, type Browser, type Page } from "playwright";

const CDP_URL = "http://localhost:9222";
const SHOP_MANAGER = "https://my.alldata.com/shop_manager/#";
const API = "/ADAG/shopmgr";
const LINE = { part: 5, labor: 6, jobGroup: 20 } as const;

export type ShopJob = { id: number; name: string; price: number };
export type Customer = { id: number; firstName: string; lastName: string; phone: string | null };
export type Vehicle = { id: number; year: string; make: string; model: string; trim: string | null; engine: string | null; plate: string | null; vin: string | null };
export type VehicleOption = { year: string; make: string; model: string; trim: string; engine: string; acesVehicleId: string; acesEngineId: string; acesVehToEngCfgId: string };

export type DraftItem = { description: string; price: number; type: "shopJob" | "newShopJob" | "part" | "labor" };
export type NewCustomer = { firstName: string; lastName: string; phone: string | null };
export type DraftRequest = {
  customer: { id: number } | NewCustomer;
  // `vin` (read from a photo) is saved on the vehicle if it has none yet.
  vehicle: ({ id: number } | { option: VehicleOption; plate: string | null }) & { vin?: string | null } | null;
  mileage: number | null;
  items: DraftItem[];
};
export type DraftResult = {
  documentId: number;
  customer: string;
  vehicle: string | null;
  mileage: number | null;
  lines: { description: string; total: number }[];
  total: number;
  problems: string[];
};

// Kept on globalThis so every API route (each its own bundle in Next) shares one connection and cache.
const shared: { browser?: Browser; page?: Page; connecting?: Promise<Page>; cache: Map<string, { at: number; value: Promise<any> }> } =
  ((globalThis as any).__alldata ??= { cache: new Map() });
const LOGGED_OUT = "Not logged in to ALLDATA. Log in in the Chrome window, then try again.";

// Requests that arrive together share one connection attempt. API calls use the page's origin, so a
// tab that was navigated away from ALLDATA is swapped for one that is on it.
async function shopPage(): Promise<Page> {
  if (shared.page && !shared.page.isClosed() && shared.browser?.isConnected() && shared.page.url().includes("my.alldata.com")) return shared.page;
  return (shared.connecting ??= connect().finally(() => (shared.connecting = undefined)));
}

async function connect(): Promise<Page> {
  const browser = await chromium.connectOverCDP(CDP_URL).catch(() => {
    throw new Error("ALLDATA browser is not running. Start it with `npm run browser` and log in.");
  });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("my.alldata.com/shop_manager")) ?? (await ctx.newPage());
  if (!page.url().includes("/shop_manager")) await page.goto(`${SHOP_MANAGER}/home`);
  Object.assign(shared, { browser, page });
  return page;
}

async function api(page: Page, method: string, path: string, body?: unknown): Promise<any> {
  const res = await page.evaluate(async ({ url, method, body }) => {
    const r = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }, { url: path.startsWith("/ADAG/") ? path : API + path, method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 || res.status === 403) throw new Error(LOGGED_OUT);
  if (!res.ok) throw new Error(`ALLDATA ${method} ${path.split("?")[0]} returned ${res.status}: ${res.text.slice(0, 200)}`);
  try {
    return res.text ? JSON.parse(res.text) : null;
  } catch {
    throw new Error(LOGGED_OUT); // a logged-out session gets the HTML login page instead of JSON
  }
}

const get = async (path: string) => api(await shopPage(), "GET", path);

// Lists that rarely change are reused for a few minutes; failures are never cached.
function cached<T>(key: string, minutes: number, load: () => Promise<T>): Promise<T> {
  const hit = shared.cache.get(key);
  if (hit && Date.now() - hit.at < minutes * 60_000) return hit.value;
  const value = load();
  shared.cache.set(key, { at: Date.now(), value });
  value.catch(() => shared.cache.delete(key));
  return value;
}

// Called when recording starts so the lists are ready by the time it stops.
export const warm = () => Promise.all([getShopJobs(), recentCustomerNames()]);

// ---------- lookups ----------

export function getShopJobs(): Promise<ShopJob[]> {
  return cached("shopJobs", 5, async () => {
    const data = await get("/shop_jobs?pageSize=200&page=0");
    return data.shopJobs.map((j: any) => ({ id: j.shopJobId, name: j.name.trim(), price: j.total }));
  });
}

// Matches names and phone numbers; most recently updated first.
export async function findCustomers(search: string): Promise<Customer[]> {
  const data = await get(`/customers?page=0&paginationType=slices&sort=update%20date%20desc&search=${encodeURIComponent(search)}`);
  return data.customers.map(toCustomer);
}

const toCustomer = (c: any): Customer => ({
  id: c.customerId,
  firstName: c.customerInfo.firstName ?? "",
  lastName: c.customerInfo.lastName ?? "",
  phone: c.customerInfo.contactMethods?.find((m: any) => m.preferred)?.value ?? null,
});

export function recentCustomerNames(): Promise<string[]> {
  return cached("customerNames", 10, async () => {
    const data = await get("/customers?page=0&pageSize=200&paginationType=slices&sort=update%20date%20desc");
    return data.customers.map((c: any) => [c.customerInfo.firstName, c.customerInfo.lastName].filter(Boolean).join(" "));
  });
}

export async function getVehicles(customerId: number): Promise<Vehicle[]> {
  return (await rawVehicles(customerId)).map((v) => ({
    id: v.vehicleId, year: v.year, make: v.make, model: v.model,
    trim: v.acesTrimDesc ?? v.nonAcesTrimDesc, engine: v.engine, plate: v.licensePlate,
    vin: v.vin?.toUpperCase() ?? null,
  }));
}

const rawVehicles = async (customerId: number): Promise<any[]> => (await get(`/customers/${customerId}/vehicles?pageSize=50&page=0`)).vehicles;

// Shop Manager's own VIN decode: the exact ALLDATA vehicle and engine IDs the VIN can be.
export async function decodeVin(vin: string): Promise<{ year: string; make: string; model: string; acesVehicleIds: string[]; acesEngineIds: string[] } | null> {
  const r = (await get(`/ADAG/car-lookup/v3/vins/${vin}`)).results?.[0];
  const ids = (names?: string[]) => (names ?? []).map((n) => n.split(":")[0].trim()); // "150128: 2003 Honda Accord EX CAN"
  return r ? { year: r.year, make: r.make, model: r.model, acesVehicleIds: ids(r.acesVehicleNames), acesEngineIds: ids(r.acesEngineConfigNames) } : null;
}

// Every customer with a vehicle carrying this VIN (a car can be on file under more than one), most relevant first.
export async function findByVin(vin: string): Promise<(Customer & { vehicleId: number })[]> {
  const data = await get(`/vehicles?page=0&pageSize=20&search=${vin}`);
  return (data.customers ?? []).flatMap((c: any) => {
    const v = c.vehicles?.find((x: any) => x.vin?.toUpperCase() === vin);
    return v ? [{ ...toCustomer(c), vehicleId: v.vehicleId }] : [];
  });
}

export async function searchVehicleOptions(query: string): Promise<VehicleOption[]> {
  const data = await get(`/aces/search/${encodeURIComponent(query.toUpperCase())}`);
  return (data.results ?? []).map((r: any) => ({
    year: r.year, make: r.make, model: r.model, trim: r.trim, engine: r.engine,
    acesVehicleId: r.acesVehicleId, acesEngineId: r.acesEngineConfigId, acesVehToEngCfgId: r.acesVehicleToEngineConfigId,
  }));
}

// ---------- draft creation ----------

export async function createDraft(req: DraftRequest): Promise<DraftResult> {
  const page = await shopPage();

  const vin = req.vehicle?.vin ?? null;
  // Customer → vehicle has to run in order; the lines don't depend on it, so both run at once.
  const party = (async () => {
    const customerId = "id" in req.customer ? req.customer.id : await createCustomer(page, req.customer);
    const vehicleId = !req.vehicle ? null : "id" in req.vehicle ? req.vehicle.id : await addVehicle(page, customerId, req.vehicle.option, req.vehicle.plate, vin);
    const [customer, vehicles] = await Promise.all([api(page, "GET", `/customers/${customerId}`), vehicleId ? rawVehicles(customerId) : []]);
    return { customer, v: vehicles.find((x) => x.vehicleId === vehicleId) ?? null };
  })();
  const built = Promise.all(req.items.map((item, i) => line(page, i + 1, item)));
  const [{ customer, v }, lines] = await Promise.all([party, built]);

  const mileage = String(req.mileage ?? 0);
  // A car on file without a VIN gets it the way Shop Manager's own "update the customer's vehicle too"
  // does: in the same request as the draft, with the rest of the vehicle sent as it is so nothing is lost.
  const storeVin = !!(v && vin && !v.vin);
  // The POST answers with the document as saved, so it is checked directly against what was sent.
  const saved = await api(page, "POST", "/documents?is_draft=true", {
    customer,
    vehicleInformation: v && {
      year: v.year, make: v.make, model: v.model, engine: v.engine, licensePlate: v.licensePlate, customerVehicleId: v.vehicleId, odometerCode: "KM",
      description: `${v.year} ${v.make} ${v.model}`, acesVehicleId: v.acesVehicleId, acesEngineId: v.acesEngineId,
      acesVehToEngCfgId: v.acesVehicleToEngineConfigId, acesTrimDesc: v.acesTrimDesc,
      vin: v.vin ?? vin, licenseState: v.licenseState, color: v.color, alldataId: v.alldataId,
      acesTransmissionId: v.acesTransmissionId, acesBodyConfigId: v.acesBodyConfigId, updateMasterRecord: storeVin,
    },
    mileageIn: mileage,
    mileageOut: mileage,
    datalines: lines.map((l) => l.dataline),
  });

  const problems = lines.flatMap((l) => l.problems);
  if (req.vehicle && !v) problems.push("The vehicle couldn't be added; add it on the draft in ALLDATA.");
  if (v && vin && v.vin && v.vin.toUpperCase() !== vin) problems.push(`The vehicle on file has a different VIN (${v.vin}); it was left as is.`);
  if (storeVin && (await rawVehicles(v.customerId)).find((x) => x.vehicleId === v.vehicleId)?.vin?.toUpperCase() !== vin)
    problems.push(`The VIN ${vin} wasn't saved on the vehicle; add it in ALLDATA.`);
  const savedLines = (saved.datalines ?? []).map((l: any) => ({ description: String(l.description).trim(), total: l.total }));
  if (saved.state !== "Draft") problems.push(`Document state is ${saved.state}, expected Draft.`);
  for (const { expected: e } of lines) {
    const line = savedLines.find((l: any) => l.description.toLowerCase() === e.description.toLowerCase());
    if (!line) problems.push(`"${e.description}" is missing from the draft.`);
    else if (Math.abs(line.total - e.total) > 0.005) problems.push(`"${e.description}" saved at $${line.total}, expected $${e.total}.`);
  }

  const info = customer.customerInfo;
  return {
    documentId: saved.documentId,
    customer: `${info.firstName ?? ""} ${info.lastName ?? ""}`.trim(),
    vehicle: v && `${v.year} ${v.make} ${v.model}${v.acesTrimDesc ? " " + v.acesTrimDesc : ""}${v.licensePlate ? " · " + v.licensePlate : ""}`,
    mileage: saved.mileageIn ?? null,
    lines: savedLines,
    total: saved.total,
    problems,
  };
}

// One document line, plus the total it should save at.
async function line(page: Page, lineNumber: number, item: DraftItem) {
  if (item.type === "part" || item.type === "labor")
    return { dataline: customLine(lineNumber, LINE[item.type], item.description, item.price), expected: { description: item.description, total: item.price }, problems: [] };

  let job = (await getShopJobs()).find((j) => j.name.toLowerCase() === item.description.toLowerCase());
  if (!job) {
    const created = await api(page, "POST", "/shop_jobs", { name: item.description, datalines: [customLine(1, LINE.part, item.description, item.price)] });
    shared.cache.delete("shopJobs");
    job = { id: created.shopJobId, name: created.name, price: created.total };
  }
  const detail = await cached(`shopJob:${job.id}`, 5, () => api(page, "GET", `/shop_jobs/${job.id}`));
  const children = detail.datalines.map((l: any, n: number) => ({ ...l, datalineId: null, lineNumber: n + 1, lineTypeId: l.datalineType.datalineTypeId }));
  const problems: string[] = [];
  let total = job.price;
  if (item.price !== job.price) {
    if (children.length === 1) Object.assign(children[0], { priceRate: item.price, manualPriceRate: true }), (total = item.price);
    else problems.push(`"${job.name}" has several lines, so it kept its Shop Job price of $${job.price}.`);
  }
  return {
    dataline: { lineNumber, lineTypeId: LINE.jobGroup, description: job.name, quantityOrHours: 0, priceRate: 0, taxable: false, children },
    expected: { description: job.name, total },
    problems,
  };
}

const customLine = (lineNumber: number, lineTypeId: number, description: string, price: number) =>
  ({ lineNumber, lineTypeId, description, priceRate: price, quantityOrHours: 1, taxable: true, children: [] });

async function createCustomer(page: Page, c: NewCustomer): Promise<number> {
  const phone = c.phone?.replace(/\D/g, "");
  const res = await api(page, "POST", "/customers", {
    customerInfo: {
      firstName: c.firstName, lastName: c.lastName || "Unknown", company: "", companyId: "",
      contactMethods: phone ? [{ name: "cell", preferred: true, value: phone }] : [],
      streetAddress1: "", streetAddress2: "", city: "", state: "BC", zipCode: "", country: "CA",
      customerTypeRef: { refCd: "INDV", refLbl: "INDIVIDUAL" }, authorizer: null, defaultLaborRate: null, doNotChargeTax: false,
    },
    vehicles: [],
  });
  return res.customerId;
}

async function addVehicle(page: Page, customerId: number, o: VehicleOption, plate: string | null, vin: string | null): Promise<number> {
  const [added] = await api(page, "POST", `/customers/${customerId}/vehicles`, [{
    acesId: null, alldataId: null, apply: true, customerVehicleId: 0, updateMasterRecord: true, color: "",
    year: o.year, make: o.make, model: o.model, engine: o.engine, description: `${o.year} ${o.make} ${o.model}`,
    licensePlate: plate, odometerCode: "KM", vin,
    acesVehicleId: o.acesVehicleId, acesEngineId: o.acesEngineId, acesVehToEngCfgId: o.acesVehToEngCfgId, acesTrimDesc: o.trim,
  }]);
  return added.customerVehicleId;
}
