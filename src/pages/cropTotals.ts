import { cropDays, dayPay, type DB, type ID } from '../lib/store'
import { sumIn } from '../lib/money'

/** Summary numbers for one crop. Money totals are converted into the display currency. */
export function cropTotals(db: DB, cropId: ID) {
  const { currency: to, rates } = db.settings
  const plantings = db.plantings.filter((r) => r.cropId === cropId)
  const nutrition = db.nutrition.filter((r) => r.cropId === cropId)
  const harvests = db.harvests.filter((r) => r.cropId === cropId)
  const shipments = db.shipments.filter((r) => r.cropId === cropId)
  const days = cropDays(db, cropId).filter((d) => d.status === 'on')

  const sum = <T,>(list: T[], f: (r: T) => number | null) => list.reduce((a, r) => a + (f(r) ?? 0), 0)

  const planting = sumIn(plantings.map((r) => ({ amount: r.totalCost, currency: r.currency })), to, rates)
  const feed = sumIn(nutrition.map((r) => ({ amount: r.totalCost, currency: r.currency })), to, rates)
  const delivery = sumIn(shipments.map((r) => ({ amount: r.deliveryPrice, currency: r.currency })), to, rates)
  const pay = sumIn(days.map((r) => ({ amount: dayPay(r), currency: r.currency })), to, rates)

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
    totalCost: planting.total + feed.total + delivery.total + pay.total,
    rateMissing: planting.missing || feed.missing || delivery.missing || pay.missing,
    boxesByWorkers,
    boxesOther,
    boxesHarvested,
    kgHarvested: sum(harvests, (r) => r.totalKg),
    boxesExported,
    boxesInStock: boxesHarvested - boxesExported,
    trucks: shipments.length,
  }
}
