# A.S Auto — AI Invoice Assistant

Speak or type invoice details → review → creates a **draft** in ALLDATA Shop Manager and verifies it. Never finalizes or sends anything.

## Run

1. `npm install` (uses your installed Google Chrome — no Playwright browser download needed)
2. Put `OPENAI_API_KEY=...` in `.env.local`
3. `npm run browser` — opens Chrome with a local profile (`.browser-profile/`). Log in to ALLDATA there once.
4. `npm run dev` — open http://localhost:3000

Keep the Chrome window open while using the app; requests go through its logged-in session.

## How it works

Say the customer name and/or phone, car, plate, mileage and repairs. Anything can be left out — the goal is a quick draft the owner finishes in ALLDATA.

- `lib/extract.ts` — OpenAI turns the text into customer / vehicle / repairs, then matches them against live ALLDATA data:
  - **Customer** by name, phone, or both. Not found → a new customer is created (named "Unknown" if no name was said).
  - **Vehicle** by plate or year/make/model on that customer (or their only vehicle if no car was said). New year/make/model → added with the base trim. Not enough info → the draft has no vehicle.
  - **Repairs** → an existing Shop Job, a **new Shop Job** for common services, otherwise a custom part / labour line. Changeable on the review screen.
  - **Prices** → what was said, else the Shop Job price, else $0.
- `lib/alldata.ts` — calls Shop Manager's own JSON API from inside the Chrome page: creates the customer / vehicle / Shop Jobs if needed, then the whole draft in one request, then re-reads it to verify every line and price.
- `scripts/` — small dev helpers used to inspect the ALLDATA UI.

## Limits

- A Shop Job with several lines (e.g. BATTERY) keeps its Shop Job price; the result screen says so.
- If no trim is said, a base trim is picked (Canadian, non-hybrid unless mentioned); change it on the review screen.

Optional env: `OPENAI_MODEL` (default `gpt-4.1-mini`), `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-mini-transcribe`).
