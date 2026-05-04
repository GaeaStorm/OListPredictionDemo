"use client"

import type { DeliveryEstimate } from "@/types"
import RiskBadge from "./RiskBadge"
import { features } from "@/config/features"

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2)}`
}

interface Props {
  estimate: DeliveryEstimate | null
  loading: boolean
  purchaseDate: string
  onPurchase: () => void
  purchasing: boolean
  cartEmpty: boolean
  historicalDays?: number | null
  historicalDeliveryDate?: string | null
  historicalDaysEstimated?: number | null
}


export default function DeliveryEstimatePanel({
  estimate,
  loading,
  purchaseDate,
  onPurchase,
  purchasing,
  cartEmpty,
}: Props) {
  const canPurchase = !!estimate && !!purchaseDate && !cartEmpty && !loading

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-400">
          {cartEmpty
            ? "Add a product to see your delivery estimate."
            : "Enter address and date to get your estimate."}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-900">Delivery Estimate</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-green-50 p-3">
          <p className="text-xs text-green-600 font-medium">
            {estimate.source === "model_prediction" ? "Model prediction" : "Model estimate"}
          </p>
          <p className="text-2xl font-bold text-green-700">{estimate.deliveryDays.toFixed(1)}</p>
          <p className="text-xs text-green-500">business days</p>
        </div>

        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500 font-medium">Estimated delivery</p>
          <p className="text-sm font-bold text-gray-800 mt-1 leading-tight">{estimate.deliveryDate}</p>
        </div>

        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500 font-medium">Shipping price</p>
          <p className="text-xl font-bold text-gray-800">{formatBRL(estimate.shippingPrice)}</p>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 flex flex-col justify-between">
          <p className="text-xs text-gray-500 font-medium mb-1">Risk level</p>
          <RiskBadge level={estimate.riskLevel} size="sm" />
        </div>
      </div>

      {/* Customer recommendation */}
      <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
        {estimate.recommendedAction}
      </div>

      {/* Review risk */}
      {features.SHOW_REVIEW_RISK && (
        <div className="text-xs text-gray-500 flex items-center gap-1.5">
          <span>📝</span>
          <span>
            <strong>{estimate.reviewRisk}</strong> — longer deliveries are associated with
            lower customer review scores on Olist.
          </span>
        </div>
      )}

      {/* Purchase button */}
      <button
        onClick={onPurchase}
        disabled={!canPurchase || purchasing}
        className={`
          w-full rounded-xl py-3 font-semibold text-white transition-all text-sm
          ${canPurchase && !purchasing
            ? "bg-green-600 hover:bg-green-700 active:bg-green-800 shadow-sm"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }
        `}
      >
        {purchasing ? "Processing…" : "Purchase →"}
      </button>
    </div>
  )
}
