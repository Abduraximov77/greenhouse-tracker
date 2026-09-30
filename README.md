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
- **AI assistant (AI yordamchi)** — answered by Claude through the Claude Code CLI on your own computer (see *Run the AI helper* below):
  - **Today's jobs** at the top of each crop's Overview: 3–6 jobs with a tick box, made by itself once a day when the crop is opened (can be turned off).
  - **AI yordamchi** section in the crop menu: the full plan (growth stage, why, feeding doses per 1 ha and for the crop's area, water in m³, sources, a safety note), **Ask** (chat in any language with a photo of a leaf or fruit; an answer can be added to today's jobs) and **Weather** for that crop's place.
  - Claude gets every record of that crop (area, planting date and day, place, forecast and rule alerts, expenses, harvest per day, worker days as counts, trucks, sales, income, give & take). Worker names, drivers and phone numbers are not sent.
  - Settings → AI assistant: pairing code, helper address, auto plan on/off, internet search on/off. Plans and chats are kept in the browser (`agroledger:ai1`), separate from the records.
- **Planting date (Ekilgan sana)**: optional, when adding a crop or later in its side panel; shows "Day N" since planting. The AI assistant will use it as context.
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

> Data is currently saved in the browser on each device. A shared online database
> and user accounts are the next step.

## Run it on your computer
Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```
Then open the address it prints (usually http://localhost:5173).

## Run the AI helper
The AI helper connects the website to Claude on your computer. It uses your own Claude Code login (no API key) and shows every question and answer in its window.

1. Install [Claude Code](https://claude.com/claude-code) and sign in once by running `claude`.
2. Download `ai-helper.mjs` (Settings → AI assistant → *Download the AI helper*, or `public/ai-helper.mjs` in this repo) and start it:
   ```bash
   node ai-helper.mjs
   ```
3. Type the pairing code it prints into Settings → AI assistant and press **Connect**. Keep the window open while you use the AI.

It listens only on this computer (`127.0.0.1:8787`) and only answers the AgroLedger site (and `localhost` for `npm run dev`) with the right pairing code. Claude runs in `~/.agroledger/work` with no tools except reading an attached photo (and web search if turned on). The last question and answer are saved in `~/.agroledger` (`last-prompt.txt`, `last-answer.json`) so you can check them.
Options: `AGRO_AI_MODEL=sonnet`, `AGRO_AI_PORT=8788`, `AGRO_AI_LOG=0`. Works in Chrome, Edge and Firefox (Safari blocks an https site from talking to a helper on your computer).

## Tech
React + TypeScript + Vite.
