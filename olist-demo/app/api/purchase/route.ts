import { NextRequest, NextResponse } from "next/server"
import type { CartItem } from "@/types"
import { estimateDeliveryDays } from "@/lib/estimateDeliveryDays"
import { getAggregatedOrders, getMaxDistance } from "@/lib/orderDataset"

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cartItems, customerState, customerCity, purchaseDate, estimatedDays } = body as {
      cartItems: CartItem[]
      customerState: string
      customerCity: string
      cep: string
      purchaseDate: string
      estimatedDays: number
    }

    if (!cartItems?.length || !customerState || !purchaseDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const orders = getAggregatedOrders()

    // Check if any cart item maps to a historical order row
    const catalogOrderIds = new Set(cartItems.map((c) => c.catalogItem.order_id))
    const matchedOrder = orders.find((o) => catalogOrderIds.has(o.order_id))

    let actualDays: number
    let source: "historical_match" | "nearest_neighbor"

    if (matchedOrder) {
      // Use actual delivery days from the matched historical row
      actualDays = matchedOrder.delivery_days
      source = "historical_match"
    } else {
      // Use nearest-neighbor estimate
      const numItems = cartItems.reduce((s, c) => s + c.catalogItem.num_items * c.quantity, 0)
      const orderPrice = cartItems.reduce((s, c) => s + c.catalogItem.order_price * c.quantity, 0)
      const orderWeight = cartItems.reduce((s, c) => s + c.catalogItem.order_weight * c.quantity, 0)
      const orderVolume = cartItems.reduce((s, c) => s + c.catalogItem.order_volume * c.quantity, 0)
      const maxDistance = getMaxDistance(customerState, customerCity, orders)

      const { deliveryDays } = estimateDeliveryDays(
        { customerState, numItems, orderPrice, orderWeight, orderVolume, maxDistance, purchaseDate },
        orders
      )
      actualDays = deliveryDays
      source = "nearest_neighbor"
    }

    // Calculate dates
    const purchaseDateObj = new Date(purchaseDate + "T12:00:00")

    const deliveredDateObj = new Date(purchaseDateObj)
    deliveredDateObj.setDate(deliveredDateObj.getDate() + Math.round(actualDays))

    const estimatedDateObj = new Date(purchaseDateObj)
    estimatedDateObj.setDate(estimatedDateObj.getDate() + Math.round(estimatedDays || actualDays))

    const difference = Math.round(actualDays) - Math.round(estimatedDays || actualDays)

    return NextResponse.json({
      deliveredDate: formatDate(deliveredDateObj),
      estimatedDate: formatDate(estimatedDateObj),
      actualDays: Math.round(actualDays * 10) / 10,
      estimatedDays: Math.round((estimatedDays || actualDays) * 10) / 10,
      difference,
      source,
    })
  } catch (err) {
    console.error("Purchase error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
