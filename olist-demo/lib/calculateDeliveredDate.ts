const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * Calculates the actual delivered date from purchase date + delivery days.
 *
 * For historical dataset matches: use actual delivery_days from the matched row.
 * For model estimates: use the estimated delivery_days.
 */
export function calculateDeliveredDate(purchaseDateStr: string, deliveryDays: number): string {
  const date = new Date(purchaseDateStr + "T12:00:00")
  date.setDate(date.getDate() + Math.round(deliveryDays))
  return formatDate(date)
}

export function formatDate(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** Parses a YYYY-MM-DD string to a Date object (noon UTC to avoid timezone shifts) */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00")
}

/** Formats a date as "Mon DD, YYYY" */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00")
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
