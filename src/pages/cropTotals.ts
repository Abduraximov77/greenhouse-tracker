import { cropDays, dayPay, payment, type DB, type ID } from '../lib/store'
import { sumIn } from '../lib/money'

/** Summary numbers for one crop. Money totals are converted into the display currency. */
export function cropTotals(db: DB, cropId: ID) {
  const { currency: to, rates } = db.settings
  const plantings = db.plantings.filter((r) => r.cropId === cropId)
  const nutrition = db.nutrition.filter((r) => r.cropId === cropId)
  const harvests = db.harvests.filter((r) => r.cropId === cropId)
  const shipments = db.shipments.filter((r) => r.cropId === cropId)
  const days = cropDays(db, cropId).filter((d) => d.status === 'on')
  const expenses = db.expenses.filter((r) => r.cropId === cropId)

  const sum = <T,>(list: T[], f: (r: T) => number | null) => list.reduce((a, r) => a + (f(r) ?? 0), 0)

  const planting = sumIn(plantings.map((r) => ({ amount: r.totalCost, currency: r.currency })), to, rates)
  const feed = sumIn(nutrition.map((r) => ({ amount: r.totalCost, currency: r.currency })), to, rates)
  const delivery = sumIn(shipments.map((r) => ({ amount: r.deliveryPrice, currency: r.currency })), to, rates)
  const pay = sumIn(days.map((r) => ({ amount: dayPay(r), currency: r.currency })), to, rates)
  const spent = sumIn(expenses.map((r) => ({ amount: r.amount, currency: r.currency })), to, rates)
  // Money actually paid out for worker days and expenses (the rest is still owed).
  const paidOut = sumIn(
    [
      ...days.map((r) => ({ amount: payment(dayPay(r), r.payStatus, r.paidAmount).paid, currency: r.currency })),
      ...expenses.map((r) => ({ amount: payment(r.amount, r.payStatus, r.paidAmount).paid, currency: r.currency })),
    ],
    to,
    rates,
  )

  const boxesByWorkers = sum(days, (r) => r.boxes)
  const boxesOther = sum(harvests, (r) => r.boxes)
  const boxesHarvested = boxesByWorkers + boxesOther
  const boxesExported = sum(shipments, (r) => r.boxes)

  return {
    seedlings: sum(plantings, (r) => r.quantity),
    plantingCost: planting.total,
    nutritionCost: feed.total,
    deliveryCost: delivery.total,
    workerPay: pay.total,
    expensesCost: spent.total,
    totalCost: planting.total + feed.total + delivery.total + pay.total + spent.total,
    paid: paidOut.total,
    owed: pay.total + spent.total - paidOut.total,
    rateMissing: planting.missing || feed.missing || delivery.missing || pay.missing || spent.missing,
    boxesByWorkers,
    boxesOther,
    boxesHarvested,
    kgHarvested: sum(harvests, (r) => r.totalKg),
    boxesExported,
    boxesInStock: boxesHarvested - boxesExported,
    trucks: shipments.length,
  }
}
