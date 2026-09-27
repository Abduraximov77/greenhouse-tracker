# AgroLedger

A website for tracking everything that happens in our family greenhouse.
Built as a website first, designed so it can become a phone app later.

## What's here so far
- **Seasons**: 2026–2027, 2027–2028, and add more
- **Crops**: search and add crops to a season (or add your own)
- For each crop:
  - **Planting**: seedlings arrived and planted, quantity, price and automatic total cost
  - **Nutrition**: fertilizer given, quantity per hectare, automatic total amount and cost
  - **Harvest**: boxes packed each day, automatic total weight
  - **Export**: trucks with truck number, driver, boxes and delivery price; boxes in stock
- **Workers** (per season): daily salary, days on and off, salary totals by month
- Every entry saves its date and time automatically
- Currency can be changed in the top right

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
