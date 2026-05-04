/**
 * Feature flags for the Olist Delivery Promise Demo.
 * Toggle these to enable/disable optional UI sections.
 */
export const features = {
  /** Show the internal "Operations View" dashboard panel */
  SHOW_OPERATIONS_VIEW: true,

  /** Show similar historical orders in the ops panel */
  SHOW_SIMILAR_ORDERS: true,

  /** Show review risk estimate (based on delivery days) */
  SHOW_REVIEW_RISK: true,

  /** Show the premium shipping simulator button */
  SHOW_PREMIUM_SHIPPING_SIMULATOR: true,

  /** Show the seasonality delivery chart (delivery days by month) */
  SHOW_SEASONALITY_CHART: false,

  /** Show plain-English model explanation in ops panel */
  SHOW_MODEL_EXPLANATION: true,

  /** Show raw dataset debug info (for development) */
  SHOW_DATASET_DEBUG_INFO: false,
} as const

/** Premium shipping reduces delivery days by this amount (simulation only) */
export const PREMIUM_SHIPPING_REDUCTION_DAYS = 3

/** Premium shipping surcharge added to base shipping price */
export const PREMIUM_SHIPPING_SURCHARGE = 25.0
