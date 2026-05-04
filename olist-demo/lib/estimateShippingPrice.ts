/**
 * Estimates shipping price based on order characteristics.
 *
 * NOTE: This is a transparent demo formula — replace this function with a
 * real freight pricing model when available. The source CSV (final_df.csv)
 * does not include a freight_price column at the order level.
 *
 * Formula:
 *   base_shipping + distance_factor + weight_factor + volume_factor + items_factor
 */
export function estimateShippingPrice(params: {
  maxDistance: number  // km
  orderWeight: number  // grams
  orderVolume: number  // cm³
  numItems: number
}): number {
  const BASE_SHIPPING = 8.0
  const DISTANCE_FACTOR = params.maxDistance * 0.012         // R$ 1.20 per 100km
  const WEIGHT_FACTOR = (params.orderWeight / 1000) * 1.5    // R$ 1.50 per kg
  const VOLUME_FACTOR = (params.orderVolume / 10000) * 0.5   // R$ 0.50 per 10 liters
  const ITEMS_FACTOR = Math.max(0, params.numItems - 1) * 2.0 // R$ 2.00 per extra item

  const total = BASE_SHIPPING + DISTANCE_FACTOR + WEIGHT_FACTOR + VOLUME_FACTOR + ITEMS_FACTOR
  return Math.round(total * 100) / 100
}
