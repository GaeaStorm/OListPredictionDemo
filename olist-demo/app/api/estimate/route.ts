import { NextRequest, NextResponse } from "next/server"
import { readFileSync } from "fs"
import path from "path"
import type { CartItem, LocationEntry } from "@/types"
import { estimateDeliveryDays } from "@/lib/estimateDeliveryDays"
import { estimateShippingPrice } from "@/lib/estimateShippingPrice"
import { assignRiskLevel, reviewRiskFromDeliveryDays } from "@/lib/assignRiskLevel"
import { recommendAction } from "@/lib/recommendAction"
import { getAggregatedOrders, getMaxDistance } from "@/lib/orderDataset"

let _locations: LocationEntry[] | null = null

function loadLocations(): LocationEntry[] {
  if (!_locations) {
    const filePath = path.join(process.cwd(), "public", "data", "location_lookup.json")
    _locations = JSON.parse(readFileSync(filePath, "utf-8")) as LocationEntry[]
  }
  return _locations
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cartItems, customerState, customerCity, purchaseDate } = body as {
      cartItems: CartItem[]
      customerState: string
      customerCity: string
      cep: string
      purchaseDate: string
    }

    if (!cartItems?.length || !customerState || !purchaseDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const orders = getAggregatedOrders()
    loadLocations()

    // Aggregate cart
    const numItems = cartItems.reduce((s, c) => s + c.catalogItem.num_items * c.quantity, 0)
    const orderPrice = cartItems.reduce((s, c) => s + c.catalogItem.order_price * c.quantity, 0)
    const orderWeight = cartItems.reduce((s, c) => s + c.catalogItem.order_weight * c.quantity, 0)
    const orderVolume = cartItems.reduce((s, c) => s + c.catalogItem.order_volume * c.quantity, 0)
    const maxDistance = getMaxDistance(customerState, customerCity, orders)

    // Use pre-computed model prediction when a single catalog item has one saved
    const singleItem = cartItems.length === 1 && cartItems[0].quantity === 1
      ? cartItems[0].catalogItem
      : null
    const precomputedDays = singleItem?.predicted_delivery_days ?? null

    const { deliveryDays: nnDays, similarOrders, avgDelayScore, modelExplanation } = estimateDeliveryDays(
      { customerState, numItems, orderPrice, orderWeight, orderVolume, maxDistance, purchaseDate },
      orders
    )

    const deliveryDays = precomputedDays ?? nnDays
    const source = precomputedDays != null ? ("model_prediction" as const) : ("nearest_neighbor" as const)

    const shippingPrice = estimateShippingPrice({ maxDistance, orderWeight, orderVolume, numItems })
    const riskLevel = assignRiskLevel(deliveryDays)
    const { customer: recommendedAction, ops: opsAction, opsBullets } = recommendAction(riskLevel)
    const reviewRisk = reviewRiskFromDeliveryDays(deliveryDays)

    // Calculate estimated delivery date
    const purchaseDateObj = new Date(purchaseDate + "T12:00:00")
    purchaseDateObj.setDate(purchaseDateObj.getDate() + Math.round(deliveryDays))
    const deliveryDate = purchaseDateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })

    return NextResponse.json({
      deliveryDays: Math.round(deliveryDays * 10) / 10,
      deliveryDate,
      shippingPrice: Math.round(shippingPrice * 100) / 100,
      riskLevel,
      recommendedAction,
      opsAction,
      opsBullets,
      reviewRisk,
      source,
      isHistoricalMatch: false,
      similarOrders,
      avgDelayScore: Math.round(avgDelayScore * 1000) / 1000,
      modelExplanation,
    })
  } catch (err) {
    console.error("Estimate error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
