import type { RiskLevel } from "@/types"

/**
 * Risk thresholds derived from final_df.csv delivery_days distribution
 * (filtered to delivery_days > 0, n ≈ 94,000 orders):
 *   p75 = 15.14 days
 *   p90 = 22.56 days
 *   p97 = 34.12 days
 *
 * NOTE: Do NOT use delivery_days_estimated as input here — that column is
 * not available at prediction time and would introduce data leakage.
 * Use only model-estimated or nearest-neighbor-estimated delivery days.
 */
const P75 = 15.14
const P90 = 22.56
const P97 = 34.12

export function assignRiskLevel(deliveryDays: number): RiskLevel {
  if (deliveryDays <= P75) return "Low"
  if (deliveryDays <= P90) return "Medium"
  if (deliveryDays <= P97) return "High"
  return "Critical"
}

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "Low":      return "green"
    case "Medium":   return "yellow"
    case "High":     return "orange"
    case "Critical": return "red"
  }
}

export function reviewRiskFromDeliveryDays(deliveryDays: number): string {
  if (deliveryDays <= P75) return "Low review risk"
  if (deliveryDays <= P90) return "Medium review risk"
  return "High review risk"
}

export const RISK_THRESHOLDS = { P75, P90, P97 }
