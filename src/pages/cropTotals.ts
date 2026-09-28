import { cropDays, dayPay, payment, type DB, type Deal, type ID, type PayStatus, type Settings } from '../lib/store'
import { sumIn } from '../lib/money'

/** Summary numbers for one crop. Money totals are converted into the display currency. */
export function cropTotals(db: DB, cropId: ID) {
  const { currency: to, rates } = db.settings
  const harvests = db.harvests.filter((r) => r.cropId === cropId)
  const shipments = db.shipments.filter((r) => r.cropId === cropId)
  const days = cropDays(db, cropId).filter((d) => d.status === 'on')
  const expenses = db.expenses.filter((r) => r.cropId === cropId)
  const incomes = db.incomes.filter((r) => r.cropId === cropId)
  const deals = db.deals.filter((r) => r.cropId === cropId)

  const sum = <T,>(list: T[], f: (r: T) => number | null) => list.reduce((a, r) => a + (f(r) ?? 0), 0)

  const delivery = sumIn(shipments.map((r) => ({ amount: r.deliveryPrice, currency: r.currency })), to, rates)
  const pay = sumIn(days.map((r) => ({ amount: dayPay(r), currency: r.currency })), to, rates)
  const spent = sumIn(expenses.map((r) => ({ amount: r.amount, currency: r.currency })), to, rates)
  // Money actually paid out, for every kind of cost (the rest is still owed).
  const paidOf = (due: number | null, r: { payStatus: PayStatus; paidAmount: number | null; currency: string }) => ({
    amount: payment(due ?? 0, r.payStatus, r.paidAmount).paid,
    currency: r.currency,
  })
  const paidOut = sumIn(
    [
      ...shipments.map((r) => paidOf(r.deliveryPrice, r)),
      ...days.map((r) => paidOf(dayPay(r), r)),
      ...expenses.map((r) => paidOf(r.amount, r)),
    ],
    to,
    rates,
  )

  const income = sumIn(incomes.map((r) => ({ amount: r.amount, currency: r.currency })), to, rates)
  const totalCost = delivery.total + pay.total + spent.total
  const people = dealBalances(deals, to, rates)

  const boxesByWorkers = sum(days, (r) => r.boxes)
  const boxesOther = sum(harvests, (r) => r.boxes)
  const boxesHarvested = boxesByWorkers + boxesOther
  const boxesExported = sum(shipments, (r) => r.boxes)

  return {
    deliveryCost: delivery.total,
    workerPay: pay.total,
    expensesCost: spent.total,
    totalCost,
    income: income.total,
    profit: income.total - totalCost,
    incomeMissing: income.missing,
    dealsGiven: people.reduce((a, p) => a + p.given, 0),
    dealsGot: people.reduce((a, p) => a + p.got, 0),
    owedToUs: people.reduce((a, p) => a + Math.max(0, p.balance), 0),
    weOwe: people.reduce((a, p) => a + Math.max(0, -p.balance), 0),
    dealPeople: people.length,
    dealsMissing: people.some((p) => p.missing),
    paid: paidOut.total,
    owed: delivery.total + pay.total + spent.total - paidOut.total,
    rateMissing: delivery.missing || pay.missing || spent.missing,
    boxesByWorkers,
    boxesOther,
    boxesHarvested,
    kgHarvested: sum(harvests, (r) => r.totalKg),
    boxesExported,
    boxesInStock: boxesHarvested - boxesExported,
    trucks: shipments.length,
  }
}

/**
 * Oldi-berdi, person by person. `balance` > 0: they owe us (we gave more), < 0: we owe them.
 * Money and product values count in the balance; products also keep a quantity balance per item.
 */
export function dealBalances(deals: Deal[], to: string, rates: Settings['rates']) {
  const byPerson = new Map<string, { person: string; rows: Deal[] }>()
  for (const d of deals) {
    const key = d.person.trim().toLowerCase()
    if (!byPerson.has(key)) byPerson.set(key, { person: d.person.trim(), rows: [] })
    byPerson.get(key)!.rows.push(d)
  }
  return [...byPerson.values()]
    .map(({ person, rows }) => {
      const valued = (dir: Deal['direction']) =>
        sumIn(rows.filter((r) => r.direction === dir).map((r) => ({ amount: r.amount, currency: r.currency })), to, rates)
      const given = valued('gave')
      const got = valued('got')
      const products = new Map<string, { item: string; unit: string; net: number }>()
      for (const r of rows) {
        if (r.kind !== 'product' || r.quantity === null) continue
        const k = `${r.item.trim().toLowerCase()}|${r.unit.trim().toLowerCase()}`
        if (!products.has(k)) products.set(k, { item: r.item.trim(), unit: r.unit.trim(), net: 0 })
        products.get(k)!.net += r.direction === 'gave' ? r.quantity : -r.quantity
      }
      return {
        person,
        count: rows.length,
        last: rows.map((r) => r.date).sort().at(-1)!,
        given: given.total,
        got: got.total,
        balance: given.total - got.total,
        products: [...products.values()].filter((p) => Math.abs(p.net) > 1e-9),
        missing: given.missing || got.missing,
      }
    })
    .sort((a, b) => b.last.localeCompare(a.last))
}
