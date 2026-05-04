import type { DemoOrder, SimilarOrder } from "@/types"

interface MatchInput {
  customerState: string
  numItems: number
  orderPrice: number
  orderWeight: number
  orderVolume: number
  maxDistance: number
  purchaseMonth: number      // 1–12
  purchaseDayofweek: number  // 0–6
}

interface NeighborResult {
  order: DemoOrder
  distance: number
}

/** Cyclic distance between two values in range [0, period) */
function cyclicDist(a: number, b: number, period: number): number {
  const diff = Math.abs(a - b)
  return Math.min(diff, period - diff) / (period / 2)
}

/** Log-transform for heavy-tailed features */
function logNorm(value: number, max: number): number {
  return Math.log1p(value) / Math.log1p(max)
}

/**
 * Finds the k nearest historical orders using normalized Euclidean distance.
 * Features:
 *   - state match (binary, weight 2.0)
 *   - num_items (log-normalized)
 *   - order_price (log-normalized)
 *   - order_weight (log-normalized)
 *   - order_volume (log-normalized)
 *   - max_distance (normalized)
 *   - purchase_month (cyclic)
 *   - purchase_dayofweek (cyclic)
 *
 * Replace this function with a real model endpoint when available.
 */
export function findSimilarHistoricalOrders(
  input: MatchInput,
  orders: DemoOrder[],
  k = 10
): NeighborResult[] {
  // Pre-compute feature ranges (use fixed reasonable maxes for consistency)
  const MAX_PRICE = 1500
  const MAX_WEIGHT = 50000
  const MAX_VOLUME = 500000
  const MAX_DISTANCE = 4000
  const MAX_ITEMS = 20

  const scored: NeighborResult[] = orders.map((order) => {
    const purchaseDate = new Date(order.order_purchase_timestamp)
    const orderMonth = purchaseDate.getMonth() + 1

    const stateDist = order.customer_state === input.customerState ? 0 : 1
    const itemsDist = Math.abs(logNorm(order.num_items, MAX_ITEMS) - logNorm(input.numItems, MAX_ITEMS))
    const priceDist = Math.abs(logNorm(order.order_price, MAX_PRICE) - logNorm(input.orderPrice, MAX_PRICE))
    const weightDist = Math.abs(logNorm(order.order_weight, MAX_WEIGHT) - logNorm(input.orderWeight, MAX_WEIGHT))
    const volumeDist = Math.abs(logNorm(order.order_volume, MAX_VOLUME) - logNorm(input.orderVolume, MAX_VOLUME))
    const distDist = Math.abs(order.max_distance / MAX_DISTANCE - input.maxDistance / MAX_DISTANCE)
    const monthDist = cyclicDist(orderMonth, input.purchaseMonth, 12)
    const dowDist = cyclicDist(order.purchase_dayofweek, input.purchaseDayofweek, 7)

    const distance =
      2.0 * stateDist +
      1.0 * itemsDist +
      1.0 * priceDist +
      0.8 * weightDist +
      0.8 * volumeDist +
      1.2 * distDist +
      0.5 * monthDist +
      0.3 * dowDist

    return { order, distance }
  })

  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, k)
}

/**
 * Estimates delivery days using weighted median of k nearest neighbors.
 * Weight = 1 / (distance + 0.01) to avoid division by zero.
 */
export function estimateFromNeighbors(neighbors: NeighborResult[]): number {
  if (neighbors.length === 0) return 12 // fallback: dataset mean

  const weighted = neighbors.map(({ order, distance }) => ({
    days: order.delivery_days,
    weight: 1 / (distance + 0.01),
  }))

  // Use p60 weighted percentile instead of median (p50).
  // Reflects the asymmetric loss function (5× penalty for underestimating):
  // the model is expected to predict conservatively — later than the actual delivery.
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0)
  weighted.sort((a, b) => a.days - b.days)

  let cumWeight = 0
  for (const { days, weight } of weighted) {
    cumWeight += weight
    if (cumWeight >= totalWeight * 0.60) return Math.round(days * 10) / 10
  }

  return weighted[weighted.length - 1].days
}

/** Converts NeighborResult[] to anonymized SimilarOrder[] for display */
export function toSimilarOrders(neighbors: NeighborResult[]): SimilarOrder[] {
  return neighbors.slice(0, 5).map(({ order }) => {
    const date = new Date(order.order_purchase_timestamp)
    return {
      state: order.customer_state,
      price: order.order_price,
      weight: order.order_weight,
      deliveryDays: order.delivery_days,
      purchaseMonth: date.getMonth() + 1,
    }
  })
}
