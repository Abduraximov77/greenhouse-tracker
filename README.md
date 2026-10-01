# AgroLedger

A website for tracking everything that happens in our family greenhouse.
Built as a website first, designed so it can become a phone app later.

## What's here so far
- **Seasons**: 2026, 2027, and add more
- **Crops**: search and add crops to a season (or add your own)
- For each crop (tabs):
  - **Workers**: each day worked/day off, daily salary + boxes prepared × pay per box, paid / partly / not paid, pay summary with amounts still owed.
    The worker list is shared by all seasons and crops. Each worker is a man or a woman, and men and women are shown
    separately (daily list, pay summary with subtotals, worker list).
- **Expenses "for workers"**: an expense can be marked "Ishchilar uchun" (suggested automatically for names like "Ayollar", "ishchi", "oylik"). It is then counted with the workers' pay (Workers section and overview), not with other expenses.
- **Truck weight**: optional total weight of the load in kg (shown in tons, with kg per box); total weight sent on the Export page.
- **Sales per truck**: under each truck, add sales later (date, boxes sold, weight in kg typed from the scale (the box average is shown only as a grey guide), price per kg, optional buyer and note). Total = kg × price per kg (no paid/unpaid step). Shows boxes and kg sold / left and the sales total. Sales are NOT added to income; the total is shown on the Export page and in the Overview harvest block.
- **Harvest chart**: line chart of boxes packed per day (last 30 days or whole season), days with nothing packed shown as 0.
- **Income (Kirim)**: money that came in, by day, with what it's from and who paid. Overview shows income, all costs and profit (or loss).
- **Give & take (Oldi-berdi)**: money or products given to or taken from other people. Each entry can be given back in full or partly; when all is back it is done. Balance per person (money and each product separately). Shown separately on the Overview and not counted in profit.
- **Logo**: A | L mark — serif initials split by a gold ledger column line, underlined (header, loading screen, tab icon, phone icon).
- **Look**: "Ixcham" design — IBM Plex Sans, compact, teal top bar, sharp corners (day and night).
- **Currencies**: USD, UZS and RUB always available in entries, exchange rates and the converter.
- **Exchange rates**: official rates of the Central Bank of Uzbekistan (cbu.uz). The bank's feed can't be read from a browser, so `scripts/fetch-cbu-rates.mjs` fetches it while the site is built and publishes it as `rates.json`; the deploy workflow also runs on a schedule (5 times a day) to keep it current. If it is missing, the app falls back to open.er-api.com. Rates typed in by hand in Settings are kept until "Get Central Bank rate" is pressed.
- **Day / night screen** (Settings): light, dark, or automatic (follows the device).
- **Farm location** (Settings): from the phone's GPS (the browser asks permission; precise mode, shows the accuracy in metres; the town name, e.g. "Kunshan", is looked up with BigDataCloud's free client-side service) by searching a town/district name, or by **pinning the exact spot on a map** (OpenStreetMap, via Leaflet; loaded only when opened). Only the place is saved.
- **Places per crop**: when adding a crop (or later in its side panel) choose where it is — the farm's main place, another saved place, or a new one (GPS or search). E.g. Tomato 5 ha in Kunshan, Cucumber 10 ha in Chirchiq. The first place set becomes the main place (Settings → Farm location, which also lists the other places and their crops).
- **Weather** (first page): one tab per place (with a ⚠ count), each showing its crops, the weather now and the next 7 days (max/min °C, rain mm). Links to the same spot on weather.com (today, and hour by hour) to compare. Data from Open-Meteo (no key; free plan is for non-commercial use), cached for an hour.
- **Weather alerts — rules, no AI** (`src/lib/alertRules.ts`, guide page `#/alerts`): 18 rules for film greenhouses — frost, freezing rain, cold night, sharp cooling, heat, hot inside the greenhouse, hot dry wind (garmsel), very dry air, strong wind, thunderstorm, hail, snow, heavy rain, rain, several rainy days, fog, fungal disease risk (humidity ≥90% for ≥6 h at 10–25 °C), big day–night difference. Each alert says what is coming, the hours, and what to do. Checked for today (hours still ahead) and tomorrow, so it comes a day before. The same rules will run on the server for Telegram, so app and Telegram match. Limits are the app's general settings, not official norms.
- **Planting date (Ekilgan sana)**: optional, when adding a crop or later in its side panel; shows "Day N" since planting. The AI assistant will use it as context.
- **AI assistant (Yordamchi)** — a tab on each crop: ask a question with up to 4 photos. It runs through **Claude Code on the owner's own computer** with the owner's Claude account (for personal use only):
  - `public/helper/agroledger-helper.mjs` (served at `/helper/agroledger-helper.mjs`) is a no-dependency Node script for macOS/Windows/Linux. It listens on `127.0.0.1:4555`, checks a secret key (kept in `~/.agroledger-helper.json`) and the page origin, queues questions, and runs **one separate `claude -p` per question** (no chat history, `--no-session-persistence`), with only `Read`, `WebSearch` and `WebFetch` tools; pages can be opened only from trusted organizations (FAO, EPPO, CABI, WorldVeg, university extension services, WUR, AHDB, gov.uz…). Photos are written to a temp folder and deleted after the answer.
  - The helper keeps itself up to date: a small supervisor process (tunnel, keep-awake on macOS, update check every hour) runs the question-answering worker; a newer file on the site is downloaded, syntax-checked and swapped in, and only the worker restarts (after any running question), so the secure address stays the same.
  - If `cloudflared` is installed it opens a free quick tunnel, so the owner's phone and other devices can reach the helper.  After a restart the quick-tunnel address changes: the helper posts the new address, AES-GCM encrypted with a key derived from the secret key, to a private-named ntfy.sh topic; linked devices read and decrypt it and switch automatically, so each device is linked only once. The helper prints a link `#/connect/<code>`; opening it saves the address and key **on that device only** (not in the farm data), then goes to `#/linked`.
  - The app sends a short crop summary with each question (crop, variety, hectares, place, days since planting, weather and alerts, last 30 days of purchases, harvest) — visible under "What is sent". Answers are saved per crop; "Continue" sends only that one earlier answer.
  - Answers come only while that computer is on and the helper is running.
- **Hour by hour**: tap a day in the weather card to see it by the hour (time, sky, °C, rain mm or chance %, wind gusts; today starts from now). Night hours show a moon.
- **Place names**: two levels so same-named places differ — "Suzhou, Kunshan", "Baliqchi, Chinobod" (from GPS and from search). A name typed by hand is kept.
  - **Expenses**: everything bought or paid for (you type what it was: seedlings, fertilizer, fuel…),
    with quantity, amount and paid / partly / not paid
  - **Harvest**: boxes per day, including the boxes entered for workers, plus any other boxes
  - **Export**: trucks with truck number, driver, boxes and delivery price; boxes in stock
- Records are grouped under bold date headings
- Every entry saves its date and time automatically
- **Languages**: English, Русский, O'zbekcha
- **Currencies**: each amount has its own currency (e.g. delivery in USD, wages in UZS);
  totals are converted with the exchange rate in Settings, which also has a currency converter
  and a button to fetch today's rate online (works when hosted on its own address)

## Accounts and family sharing
- Sign in with Telegram (Settings → Account). One person creates the farm and gets a farm code
  (`AL-1234`) plus a password; family members enter both and an owner allows them, in the app
  or with the buttons the bot sends.
- Records are shared between all phones of the farm and saved on the server; each entry shows who
  saved it. The app keeps working offline and sends the changes when the internet is back.
- Owners can remove people, change roles and the password, sign out every device, and bring back
  deleted records (30 days). Members cannot delete seasons, crops or workers.
- **Telegram weather alerts** from the same fixed rules as the app: an evening message at the hour
  each person picks, and urgent danger alerts straight away (06:00–23:00).
- **Backups**: the database keeps 30 days of point-in-time history (Cloudflare D1), and every
  Sunday each owner gets a copy of the whole farm as a file in Telegram.

The server is in `worker/` (Cloudflare Worker + D1). GitHub Actions deploys it together with the
website (`scripts/deploy-api.mjs`) when these repository secrets exist:
`TELEGRAM_BOT_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Run it on your computer
Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```
Then open the address it prints (usually http://localhost:5173).

## Tech
React + TypeScript + Vite; server: Cloudflare Workers + D1.
