export interface DemoOrder {
  order_id: string
  customer_city: string
  customer_state: string
  order_purchase_timestamp: string
  delivery_days: number
  predicted_delivery_days?: number
  num_items: number
  order_price: number
  order_weight: number
  order_volume: number
  max_distance: number
  purchase_hour: number
  purchase_dayofweek: number
  approval_delay_hours: number
  avg_delay_sellers: number
  avg_cancel_sellers: number
  avg_delay_product: number
  avg_cancel_product: number
}

export interface CatalogItem {
  id: string
  name: string
  type: "product" | "basket"
  emoji: string
  description: string
  order_id: string
  num_items: number
  order_price: number
  order_weight: number
  order_volume: number
  customer_city: string
  customer_state: string
  order_purchase_timestamp: string
  delivery_days: number
  delivery_days_estimated?: number
  predicted_delivery_days?: number
  max_distance: number
  purchase_hour: number
  purchase_dayofweek: number
  avg_delay_sellers: number
  avg_cancel_sellers: number
  avg_delay_product: number
  avg_cancel_product: number
}

export interface LocationEntry {
  cep: string
  city: string
  state: string
  max_distance_approx: number
}

export type RiskLevel = "Low" | "Medium" | "High" | "Critical"

export interface SimilarOrder {
  state: string
  price: number
  weight: number
  deliveryDays: number
  purchaseMonth: number
}

export interface DeliveryEstimate {
  deliveryDays: number
  deliveryDate: string
  shippingPrice: number
  riskLevel: RiskLevel
  recommendedAction: string
  opsAction: string
  opsBullets: string[]
  reviewRisk: string
  source: "historical_match" | "nearest_neighbor" | "model_prediction"
  isHistoricalMatch: boolean
  similarOrders: SimilarOrder[]
  avgDelayScore: number
  modelExplanation: string
}

export interface CartItem {
  catalogItem: CatalogItem
  quantity: number
}

export interface EstimateRequest {
  cartItems: CartItem[]
  customerState: string
  customerCity: string
  cep: string
  purchaseDate: string
}

export interface PurchaseResult {
  deliveredDate: string
  estimatedDate: string
  actualDays: number
  estimatedDays: number
  difference: number
  source: "historical_match" | "nearest_neighbor"
}
