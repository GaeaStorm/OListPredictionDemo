import type { DemoOrder } from "@/types"
import { loadWorkingDataOrders } from "@/lib/loadWorkingDataOrders"

let _orders: DemoOrder[] | null = null

/**
 * Cached reference orders for nearest-neighbor estimation (from working_data CSV).
 */
export function getAggregatedOrders(): DemoOrder[] {
  if (!_orders) {
    _orders = loadWorkingDataOrders()
  }
  return _orders
}

export function getMaxDistance(state: string, city: string, orders: DemoOrder[]): number {
  const cityOrders = orders.filter(
    (o) => o.customer_city.toLowerCase() === city.toLowerCase() && o.customer_state === state
  )
  if (cityOrders.length > 0) {
    const distances = cityOrders.map((o) => o.max_distance)
    return distances.reduce((a, b) => a + b, 0) / distances.length
  }
  const stateOrders = orders.filter((o) => o.customer_state === state)
  if (stateOrders.length > 0) {
    const distances = stateOrders.map((o) => o.max_distance)
    return distances.reduce((a, b) => a + b, 0) / distances.length
  }
  return 800
}
