import type { DemoOrder, SimilarOrder } from "@/types"
import {
  findSimilarHistoricalOrders,
  estimateFromNeighbors,
  toSimilarOrders,
} from "./findSimilarHistoricalOrders"

interface EstimateInput {
  customerState: string
  numItems: number
  orderPrice: number
  orderWeight: number
  orderVolume: number
  maxDistance: number
  purchaseDate: string  // ISO date string
}

interface EstimateOutput {
  deliveryDays: number
  similarOrders: SimilarOrder[]
  avgDelayScore: number
  modelExplanation: string
}

/**
 * Main delivery days estimation function.
 * Uses nearest-neighbor matching against aggregated working_data (CSV).
 * Replace this function's internals with a real model endpoint when available.
 */
export function estimateDeliveryDays(
  input: EstimateInput,
  orders: DemoOrder[]
): EstimateOutput {
  const date = new Date(input.purchaseDate)
  const purchaseMonth = date.getMonth() + 1
  const purchaseDayofweek = date.getDay() // 0=Sun, 6=Sat

  const neighbors = findSimilarHistoricalOrders(
    {
      customerState: input.customerState,
      numItems: input.numItems,
      orderPrice: input.orderPrice,
      orderWeight: input.orderWeight,
      orderVolume: input.orderVolume,
      maxDistance: input.maxDistance,
      purchaseMonth,
      purchaseDayofweek,
    },
    orders,
    15
  )

  const deliveryDays = estimateFromNeighbors(neighbors)
  const similarOrders = toSimilarOrders(neighbors)

  // Compute average delay score from matched neighbors (for ops panel)
  const avgDelayScore =
    neighbors.reduce((s, { order }) => s + order.avg_delay_sellers, 0) /
    Math.max(neighbors.length, 1)

  const explanation = buildModelExplanation(input, deliveryDays, avgDelayScore, purchaseMonth)

  return { deliveryDays, similarOrders, avgDelayScore, modelExplanation: explanation }
}

function buildModelExplanation(
  input: EstimateInput,
  deliveryDays: number,
  avgDelayScore: number,
  purchaseMonth: number
): string {
  const parts: string[] = []

  parts.push(
    `Estimated ${deliveryDays.toFixed(1)} days based on ${input.numItems} item(s) ` +
    `shipping to ${input.customerState}.`
  )

  if (input.maxDistance > 2000) {
    parts.push("Long distance to destination increases expected delivery time.")
  } else if (input.maxDistance < 200) {
    parts.push("Short distance to destination supports faster delivery.")
  }

  if (input.orderWeight > 5000) {
    parts.push("Heavy order may require additional handling time.")
  }

  const seasonalMonths: Record<number, string> = {
    11: "November orders often see delays near Brazil's holiday season.",
    12: "December peak season may increase carrier volume and delivery times.",
    1:  "January post-holiday demand can extend processing times.",
  }
  if (seasonalMonths[purchaseMonth]) {
    parts.push(seasonalMonths[purchaseMonth])
  }

  if (avgDelayScore > 0.05) {
    parts.push("Sellers for similar products have historically shown some delivery delays.")
  }

  parts.push(
    "This estimate uses asymmetric loss weighting: underestimating delivery time " +
    "is penalized 5× more than overestimating, so predictions lean conservative."
  )

  return parts.join(" ")
}
