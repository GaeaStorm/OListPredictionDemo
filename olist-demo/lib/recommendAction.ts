import type { RiskLevel } from "@/types"

export interface ActionRecommendation {
  /** Customer-facing delivery message */
  customer: string
  /** Internal operations team action (safe language, no "drop seller") */
  ops: string
  /** Array of ops bullet points */
  opsBullets: string[]
}

/**
 * Returns recommended actions based on delivery risk level.
 * Customer-facing language is friendly. Operations language uses safe,
 * actionable business terms (not "drop seller" — use coaching/review language).
 */
export function recommendAction(risk: RiskLevel): ActionRecommendation {
  switch (risk) {
    case "Low":
      return {
        customer: "Standard delivery — on track for on-time arrival.",
        ops: "No action required",
        opsBullets: ["Order is within normal delivery window"],
      }
    case "Medium":
      return {
        customer: "Standard delivery — slight variability possible.",
        ops: "Monitor order progress",
        opsBullets: [
          "Monitor fulfillment status",
          "Flag for follow-up if no carrier scan within 48h",
        ],
      }
    case "High":
      return {
        customer: "Extended delivery window — we'll keep you updated.",
        ops: "Notify seller · Review fulfillment · Proactive customer notice",
        opsBullets: [
          "Notify seller of delivery risk",
          "Fulfillment review recommended",
          "Send proactive customer notice",
          "Monitor order tracking closely",
        ],
      }
    case "Critical":
      return {
        customer: "Premium shipping recommended for faster delivery.",
        ops: "Seller coaching · Premium shipping review · Escalation review",
        opsBullets: [
          "Seller coaching recommended",
          "Premium shipping review — consider upgrade",
          "Proactive customer communication",
          "Escalation review if fulfillment not confirmed within 24h",
        ],
      }
  }
}
