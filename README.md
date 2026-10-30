# A.S Auto — AI Invoice Assistant

Speak or type invoice details → review → creates a **draft** in ALLDATA Shop Manager and verifies it. Never finalizes or sends anything.

## Run

1. `npm install` (uses your installed Google Chrome — no Playwright browser download needed)
2. Put `OPENAI_API_KEY=...` in `.env.local`
3. `npm run browser` — opens Chrome with a local profile (`.browser-profile/`). Log in to ALLDATA there once.
4. `npm run build && npm start` — open http://localhost:3000 (`npm run dev` while developing)

Or `npm run shop` does steps 3–4 and the WhatsApp tunnel (`npm run tunnel`) in one terminal: it builds, then starts Chrome, the app and the tunnel. Ctrl+C (or launchd's stop) stops all three. If the app or the tunnel stops, everything stops with a non-zero exit, so launchd's `KeepAlive` starts it all again. Chrome is looked after instead: if it is closed, crashes or stops responding for 30 seconds, it is reopened (checked every 10 seconds, at most once every 30), and the app reconnects to it by itself. Close the ALLDATA Chrome before starting, or it is used as is and not restarted if it freezes.

Keep the Chrome window open while using the app; requests go through its logged-in session. To have it log back in by itself when ALLDATA's session expires (about once a day), add `ALL_DATA_USER=...` and `ALL_DATA_PASSWORD=...` to `.env.local`; it fills in the login in that same Chrome window.

## How it works

Say the customer name and/or phone, car, plate, mileage and repairs. Anything can be left out — the goal is a quick draft the owner finishes in ALLDATA.

- `lib/extract.ts` — OpenAI turns the text into customer / vehicle / repairs, then matches them against live ALLDATA data:
  - **Customer** by name, phone or licence plate (name and phone win; a plate match is confirmed on the car). Not found → a new customer is created; if no name, phone or plate match was said, the draft has no customer. A name, phone or plate typed on the review screen is looked up in ALLDATA before a new customer is made.
  - **Vehicle** by plate or year/make/model on that customer (or their only vehicle if no car was said). New year/make/model → added with the base trim. Not enough info → the draft has no vehicle.
  - **Repairs** → an existing Shop Job, a **new Shop Job** for common services, otherwise a custom part / labour line. Changeable on the review screen.
  - **Prices** → what was said, else the Shop Job price, else $0.
- `lib/alldata.ts` — calls Shop Manager's own JSON API from inside the Chrome page: creates the customer / vehicle / Shop Jobs if needed, then the whole draft in one request, and checks every line and price in ALLDATA's reply.
- `scripts/browser.ts` starts the logged-in Chrome; `scripts/api-get.ts <path>` saves any Shop Manager API response to `debug/api.json` for inspection.

## WhatsApp voice notes

Mechanics send a voice note to the shop's WhatsApp number; it lands in the **Inbox** on the web page already transcribed and reviewed. The front desk clicks **Review**, checks it as usual and creates the draft; the sender gets a "Draft #… created" reply. Nothing is sent to ALLDATA until someone clicks Create. Notes are stored in `inbox/` (ignored by git); finished ones are deleted after 30 days. **Upload** adds a voice note or photo by hand, for testing without WhatsApp.

**Review first / Create automatically** (top of the sidebar) picks what happens to a WhatsApp note; *Create automatically* is the default. Any approved number can also text **enable** (review first) or **disable** (create automatically). With *Create automatically*, a clear note becomes a draft straight away and the sender gets "Draft #… created" with the customer, car and services (never prices). A note stays in the inbox for review, and the sender is told why, when there are no services, neither a customer nor a car (with only a car, the draft has no customer), or anything on the review screen's warning list (several customers with that name, a phone number that belongs to someone else, a car ALLDATA doesn't know, a VIN that doesn't match the car that was said). A new Shop Job is added as a custom part instead, because only a person adds to the Shop Job list. Auto-create waits 20 seconds after a note with no photo arrives, in case a photo follows.

**VIN photo (optional):** send a photo of the door-jamb sticker before or after the voice note (within 3 minutes) and the two become one note. The VIN is read while the voice note is transcribed, so it adds little or no wait, then decoded by ALLDATA's VIN lookup (exact vehicle and engine, so only the matching trims are offered) and NHTSA's vPIC (trim hint), both at once. One search finds the car anywhere in the shop. When the draft is created, the VIN is saved on the vehicle if it has none: on a new vehicle as it's added, on one already on file the way Shop Manager's own "update the customer's vehicle too" does, in the draft request itself. A VIN that fails its check digit is shown but never saved, and one that differs from the VIN on file is never overwritten.

Setup (Meta's free test number allows up to 5 recipient phones):

1. developers.facebook.com → Create App → Business → add **WhatsApp**. Under *API Setup*, add the phones that will send notes.
2. Expose the app: `npm run tunnel` (the Cloudflare tunnel in `cloudflared.yml`, a fixed address that survives restarts; on a new computer run `cloudflared tunnel login` and copy `~/.cloudflared/<tunnel id>.json` over first).
3. *WhatsApp → Configuration → Webhook*: URL `https://whatsapp.trydoorstep.ca/api/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`; subscribe to **messages** and turn on **Subscribe webhooks** for the account.
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
