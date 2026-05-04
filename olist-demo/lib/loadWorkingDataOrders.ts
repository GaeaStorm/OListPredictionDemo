import { existsSync, readFileSync } from "fs"
import path from "path"
import { parse } from "csv-parse/sync"
import type { DemoOrder } from "@/types"

function resolveWorkingDataPath(): string {
  const candidates = [
    process.env.WORKING_DATA_CSV,
    path.join(process.cwd(), "working_data_20260503.csv"),
    path.join(process.cwd(), "..", "working_data_20260503.csv"),
    path.join(process.cwd(), "data", "working_data_20260503.csv"),
  ].filter((p): p is string => Boolean(p))

  for (const p of candidates) {
    if (existsSync(p)) return path.resolve(p)
  }

  throw new Error(
    "Working data CSV not found. Place working_data_20260503.csv in the Olist project root " +
      "(parent of olist-demo), copy it into olist-demo/, or set WORKING_DATA_CSV to the file path."
  )
}

function num(value: string | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

type RawRow = Record<string, string>

function aggregateOrderLevel(rows: RawRow[]): DemoOrder[] {
  const byOrder = new Map<string, RawRow[]>()
  for (const row of rows) {
    const oid = row.order_id
    if (!oid) continue
    const list = byOrder.get(oid)
    if (list) list.push(row)
    else byOrder.set(oid, [row])
  }

  const orders: DemoOrder[] = []

  for (const [order_id, orderRows] of byOrder) {
    const byItem = new Map<string, RawRow>()
    for (const r of orderRows) {
      const iid = r.order_item_id ?? "0"
      if (!byItem.has(iid)) byItem.set(iid, r)
    }
    const lines = [...byItem.values()]
    const head = lines[0]
    const n = lines.length

    const avgField = (field: string) =>
      lines.reduce((s, r) => s + num(r[field]), 0) / Math.max(n, 1)

    const ts = (head.order_purchase_timestamp ?? "").trim()
    const order_purchase_timestamp = ts.includes("T") ? ts : ts.replace(" ", "T")

    orders.push({
      order_id,
      customer_city: head.customer_city ?? "",
      customer_state: head.customer_state ?? "",
      order_purchase_timestamp,
      delivery_days: num(head.delivery_days),
      num_items: n,
      order_price: lines.reduce((s, r) => s + num(r.price), 0),
      order_weight: lines.reduce((s, r) => s + num(r.product_weight_g), 0),
      order_volume: lines.reduce((s, r) => s + num(r.product_volume), 0),
      max_distance: Math.max(...lines.map((r) => num(r.distance)), 0),
      purchase_hour: Math.round(num(head.purchase_hour)),
      purchase_dayofweek: Math.round(num(head.purchase_dayofweek)) % 7,
      approval_delay_hours: num(head.approval_delay_hours),
      avg_delay_sellers: avgField("delay_rate"),
      avg_cancel_sellers: avgField("cancel_rate"),
      avg_delay_product: avgField("product_delay_rate"),
      avg_cancel_product: avgField("product_cancel_rate"),
    })
  }

  return orders
}

/**
 * Loads order-level rows from working_data CSV (item/payment grain aggregated by order_id + order_item_id).
 */
export function loadWorkingDataOrders(): DemoOrder[] {
  const filePath = resolveWorkingDataPath()
  const raw = readFileSync(filePath, "utf-8")
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    cast: false,
  }) as RawRow[]

  return aggregateOrderLevel(records)
}
