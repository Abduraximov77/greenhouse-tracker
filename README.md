# AgroLedger

A website for tracking everything that happens in our family greenhouse.
Built as a website first, designed so it can become a phone app later.

## What's here so far
- **Seasons**: 2026–2027, 2027–2028, and add more
- **Crops**: search and add crops to a season (or add your own)
- For each crop (tabs):
  - **Workers**: each day worked/day off, daily salary + boxes prepared × pay per box, paid / partly / not paid, pay summary with amounts still owed.
    The worker list is shared by all seasons and crops. Each worker is a man or a woman, and men and women are shown
    separately (daily list, pay summary with subtotals, worker list).
- **Income (Kirim)**: money that came in, by day, with what it's from and who paid. Overview shows income, all costs and profit (or loss).
- **Give & take (Oldi-berdi)**: money or products given to or taken from other people. Each entry can be given back in full or partly; when all is back it is done. Balance per person (money and each product separately). Shown separately on the Overview and not counted in profit.
- **Logo**: A | L mark — serif initials split by a gold ledger column line, underlined (header, loading screen, tab icon, phone icon).
- **Look**: "Ixcham" design — IBM Plex Sans, compact, teal top bar, sharp corners (day and night).
- **Currencies**: USD, UZS and RUB always available in entries, exchange rates and the converter.
- **Exchange rates**: official rates of the Central Bank of Uzbekistan (cbu.uz). The bank's feed can't be read from a browser, so `scripts/fetch-cbu-rates.mjs` fetches it while the site is built and publishes it as `rates.json`; the deploy workflow also runs on a schedule (5 times a day) to keep it current. If it is missing, the app falls back to open.er-api.com. Rates typed in by hand in Settings are kept until "Get Central Bank rate" is pressed.
- **Day / night screen** (Settings): light, dark, or automatic (follows the device).
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

## Tech
React + TypeScript + Vite.
