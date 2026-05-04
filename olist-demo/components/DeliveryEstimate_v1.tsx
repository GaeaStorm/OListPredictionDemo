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

function computeDate(purchaseDate: string, days: number): string {
  const d = new Date(purchaseDate + "T12:00:00")
  d.setDate(d.getDate() + Math.round(days))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function DeliveryEstimatePanel({
  estimate,
  loading,
  purchaseDate,
  onPurchase,
  purchasing,
  cartEmpty,
  historicalDays,
  historicalDeliveryDate,
  historicalDaysEstimated,
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

  // Show 3-way comparison when we have all three values
  const showComparison =
    historicalDays != null &&
    historicalDaysEstimated != null &&
    estimate.source === "model_prediction"

  const olistDate = historicalDaysEstimated != null ? computeDate(purchaseDate, historicalDaysEstimated) : null
  const actualDate = historicalDays != null ? computeDate(purchaseDate, historicalDays) : null

  // For the comparison: did Olist underestimate? Did our model do better?
  const olistError = historicalDays != null && historicalDaysEstimated != null
    ? historicalDaysEstimated - historicalDays  // negative = under-estimated (promised too early)
    : null
  const modelError = historicalDays != null
    ? estimate.deliveryDays - historicalDays
    : null

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

      {/* 3-way comparison: Our Model vs Olist vs Actual */}
      {showComparison ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Model vs Olist vs Actual
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Our model */}
            <div className="rounded-lg bg-green-50 border border-green-200 p-2">
              <p className="text-[10px] text-green-600 font-semibold uppercase">Our Model</p>
              <p className="text-lg font-bold text-green-700">{estimate.deliveryDays.toFixed(1)}d</p>
              <p className="text-[10px] text-green-500">{estimate.deliveryDate}</p>
              {modelError != null && (
                <p className={`text-[10px] font-medium mt-0.5 ${modelError >= 0 ? "text-amber-600" : "text-red-500"}`}>
                  {modelError >= 0
                    ? `+${modelError.toFixed(1)}d buffer`
                    : `${Math.abs(modelError).toFixed(1)}d under`}
                </p>
              )}
            </div>
            {/* Olist estimate */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Olist&apos;s Est.</p>
              <p className="text-lg font-bold text-slate-700">{historicalDaysEstimated!.toFixed(1)}d</p>
              <p className="text-[10px] text-slate-400">{olistDate}</p>
              {olistError != null && (
                <p className={`text-[10px] font-medium mt-0.5 ${olistError >= 0 ? "text-amber-600" : "text-red-500"}`}>
                  {olistError >= 0
                    ? `+${olistError.toFixed(1)}d buffer`
                    : `${Math.abs(olistError).toFixed(1)}d under`}
                </p>
              )}
            </div>
            {/* Actual */}
            <div className="rounded-lg bg-white border border-gray-300 p-2">
              <p className="text-[10px] text-gray-500 font-semibold uppercase">Actual</p>
              <p className="text-lg font-bold text-gray-800">{historicalDays!.toFixed(1)}d</p>
              <p className="text-[10px] text-gray-400">{actualDate}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">from dataset</p>
            </div>
          </div>
          {/* Insight line */}
          {olistError != null && modelError != null && (
            <p className="text-xs text-gray-500 leading-relaxed">
              {olistError < 0 && modelError >= 0
                ? `Olist underestimated by ${Math.abs(olistError).toFixed(1)}d — our model adds a conservative buffer, protecting the customer promise.`
                : olistError < 0 && modelError < 0
                ? `Both models underestimated. Our model was ${(Math.abs(olistError) - Math.abs(modelError)).toFixed(1)}d closer to actual.`
                : Math.abs(modelError) < Math.abs(olistError)
                ? `Our model is ${(Math.abs(olistError) - Math.abs(modelError)).toFixed(1)}d closer to actual than Olist's estimate.`
                : `Model leans conservative — asymmetric loss penalizes underestimation 5×.`}
            </p>
          )}
        </div>
      ) : (
        /* Simple historical baseline when Olist estimate not available */
        historicalDays != null && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <p className="text-xs text-gray-500 font-medium">Dataset actual</p>
                <p className="text-xl font-bold text-gray-800">{historicalDays.toFixed(1)}</p>
                <p className="text-xs text-gray-400">days</p>
                {historicalDeliveryDate && (
                  <p className="text-xs text-gray-400 mt-0.5">{historicalDeliveryDate}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed self-center">
                {estimate.deliveryDays > historicalDays
                  ? `Model estimates ${(estimate.deliveryDays - historicalDays).toFixed(1)}d later — conservative bias from asymmetric loss.`
                  : estimate.deliveryDays < historicalDays
                  ? `Model estimates ${(historicalDays - estimate.deliveryDays).toFixed(1)}d earlier than actual.`
                  : "Model estimate matches historical delivery exactly."}
              </p>
            </div>
          </div>
        )
      )}

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
