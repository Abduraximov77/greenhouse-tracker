import { cropDays, dayPay, payment, type DB, type ID, type PayStatus } from '../lib/store'
import { sumIn } from '../lib/money'

/** Summary numbers for one crop. Money totals are converted into the display currency. */
export function cropTotals(db: DB, cropId: ID) {
  const { currency: to, rates } = db.settings
  const harvests = db.harvests.filter((r) => r.cropId === cropId)
  const shipments = db.shipments.filter((r) => r.cropId === cropId)
  const days = cropDays(db, cropId).filter((d) => d.status === 'on')
  const expenses = db.expenses.filter((r) => r.cropId === cropId)

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

  const boxesByWorkers = sum(days, (r) => r.boxes)
  const boxesOther = sum(harvests, (r) => r.boxes)
  const boxesHarvested = boxesByWorkers + boxesOther
  const boxesExported = sum(shipments, (r) => r.boxes)

  return {
    deliveryCost: delivery.total,
    workerPay: pay.total,
    expensesCost: spent.total,
    totalCost: delivery.total + pay.total + spent.total,
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
