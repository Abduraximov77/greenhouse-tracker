# AgroLedger

A website for tracking everything that happens in our family greenhouse.
Built as a website first, designed so it can become a phone app later.

## What's here so far
- **Seasons**: 2026–2027, 2027–2028, and add more
- **Crops**: search and add crops to a season (or add your own)
- For each crop (tabs):
  - **Planting**: seedlings arrived and planted, quantity, price and automatic total cost
  - **Nutrition**: fertilizer given, quantity per hectare, automatic total amount and cost
  - **Workers**: each day worked/day off, daily salary + boxes prepared × pay per box, paid / partly / not paid, pay summary with amounts still owed.
    The worker list is shared by all seasons and crops.
  - **Expenses**: anything bought or paid for on a day (name, quantity, amount), with paid / partly / not paid
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
