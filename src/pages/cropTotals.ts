import type { DB, ID } from '../lib/store'

/** Summary numbers for one crop, used on the crop card and overview. */
export function cropTotals(db: DB, cropId: ID) {
  const plantings = db.plantings.filter((r) => r.cropId === cropId)
  const nutrition = db.nutrition.filter((r) => r.cropId === cropId)
  const harvests = db.harvests.filter((r) => r.cropId === cropId)
  const shipments = db.shipments.filter((r) => r.cropId === cropId)

  const sum = <T,>(list: T[], f: (r: T) => number | null) => list.reduce((a, r) => a + (f(r) ?? 0), 0)

  const seedlings = sum(plantings, (r) => r.quantity)
  const plantingCost = sum(plantings, (r) => r.totalCost)
  const nutritionCost = sum(nutrition, (r) => r.totalCost)
  const boxesHarvested = sum(harvests, (r) => r.boxes)
  const kgHarvested = sum(harvests, (r) => r.totalKg)
  const boxesExported = sum(shipments, (r) => r.boxes)
  const deliveryCost = sum(shipments, (r) => r.deliveryPrice)

  return {
    seedlings,
    plantingCost,
    nutritionCost,
    boxesHarvested,
    kgHarvested,
    boxesExported,
    boxesInStock: boxesHarvested - boxesExported,
    deliveryCost,
    trucks: shipments.length,
    totalCost: plantingCost + nutritionCost + deliveryCost,
  }
}
