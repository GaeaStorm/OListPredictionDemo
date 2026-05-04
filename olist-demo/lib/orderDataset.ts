import { readFileSync } from "fs"
import path from "path"
import type { DemoOrder } from "@/types"

let _orders: DemoOrder[] | null = null

export function getAggregatedOrders(): DemoOrder[] {
  if (!_orders) {
    const filePath = path.join(process.cwd(), "public", "data", "demo_orders.json")
    _orders = JSON.parse(readFileSync(filePath, "utf-8")) as DemoOrder[]
  }

  return _orders
}

export function getMaxDistance(
  state: string,
  city: string,
  orders: DemoOrder[]
): number {
  const normalizedCity = city?.toLowerCase?.() ?? ""

  const cityOrders = orders.filter(
    (o) =>
      o.customer_city.toLowerCase() === normalizedCity &&
      o.customer_state === state
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