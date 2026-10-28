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
  - **Customer** by name, phone or licence plate (name and phone win; a plate match is confirmed on the car). Not found → a new customer is created (named "Unknown" if no name was said). A name, phone or plate typed on the review screen is looked up in ALLDATA before a new customer is made.
  - **Vehicle** by plate or year/make/model on that customer (or their only vehicle if no car was said). New year/make/model → added with the base trim. Not enough info → the draft has no vehicle.
  - **Repairs** → an existing Shop Job, a **new Shop Job** for common services, otherwise a custom part / labour line. Changeable on the review screen.
  - **Prices** → what was said, else the Shop Job price, else $0.
- `lib/alldata.ts` — calls Shop Manager's own JSON API from inside the Chrome page: creates the customer / vehicle / Shop Jobs if needed, then the whole draft in one request, and checks every line and price in ALLDATA's reply.
- `scripts/browser.ts` starts the logged-in Chrome; `scripts/api-get.ts <path>` saves any Shop Manager API response to `debug/api.json` for inspection.

## WhatsApp voice notes

Mechanics send a voice note to the shop's WhatsApp number; it lands in the **Inbox** on the web page already transcribed and reviewed. The front desk clicks **Review**, checks it as usual and creates the draft; the sender gets a "Draft #… created" reply. Nothing is sent to ALLDATA until someone clicks Create. Notes are stored in `inbox/` (ignored by git). **Upload audio** adds a note by hand, for testing without WhatsApp.

Setup (Meta's free test number allows up to 5 recipient phones):

1. developers.facebook.com → Create App → Business → add **WhatsApp**. Under *API Setup*, add the phones that will send notes.
2. Expose the app: `cloudflared tunnel --url http://localhost:3000` and copy the https URL.
3. *WhatsApp → Configuration → Webhook*: URL `https://…/api/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`; subscribe to **messages** and turn on **Subscribe webhooks** for the account.
4. **Publish** the app (needs a privacy policy URL). Unpublished apps only receive the dashboard's test webhooks, not real messages.
5. Add to `.env.local` (the dev server reloads it):

```
WHATSAPP_TOKEN=...            # API Setup → access token (use a System User token for anything long-lived)
WHATSAPP_PHONE_NUMBER_ID=...  # API Setup → phone number ID
WHATSAPP_VERIFY_TOKEN=...     # any string you choose; same as in step 3
WHATSAPP_APP_SECRET=...       # App settings → Basic → App secret (requests without a valid signature are rejected)
WHATSAPP_ALLOWED=16045551234,16045550000   # who may send notes, digits only
```

## Limits

- A Shop Job with several lines (e.g. BATTERY) keeps its Shop Job price; the result screen says so.
- If no trim is said, a base trim is picked (Canadian, non-hybrid unless mentioned); change it on the review screen.

Optional env: `OPENAI_MODEL` (default `gpt-4.1-mini`), `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-mini-transcribe`).
