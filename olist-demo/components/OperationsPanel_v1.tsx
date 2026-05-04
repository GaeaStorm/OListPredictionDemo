"use client"

import { useState, useEffect } from "react"
import type { DeliveryEstimate, RiskLevel } from "@/types"
import RiskBadge from "./RiskBadge"
import { features, PREMIUM_SHIPPING_REDUCTION_DAYS, PREMIUM_SHIPPING_SURCHARGE } from "@/config/features"

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

interface RiskStats {
  n: number
  olist_mae: number
  model_mae: number
  olist_pct_late_surprise: number
  model_pct_late_surprise: number
  olist_pct_within3: number
  model_pct_within3: number
  avg_review_score: number | null
}

interface ModelPerf {
  overall: RiskStats
  by_risk: Record<string, RiskStats>
  review_impact: {
    olist_late_avg_score: number | null
    olist_ontime_avg_score: number | null
    model_late_avg_score: number | null
    model_ontime_avg_score: number | null
    olist_pct_late: number
    model_pct_late: number
  }
}

interface Props {
  estimate: DeliveryEstimate
  purchaseDate?: string
}

const RISK_ORDER: RiskLevel[] = ["Low", "Medium", "High", "Critical"]

export default function OperationsPanel({ estimate, purchaseDate }: Props) {
  const [open, setOpen] = useState(false)
  const [modelPerf, setModelPerf] = useState<ModelPerf | null>(null)

  useEffect(() => {
    if (open && !modelPerf) {
      fetch("/data/model_performance.json").then(r => r.json()).then(setModelPerf).catch(() => {})
    }
  }, [open, modelPerf])

  const premiumDays = Math.max(1, estimate.deliveryDays - PREMIUM_SHIPPING_REDUCTION_DAYS)
  const premiumDate = purchaseDate
    ? (() => {
        const d = new Date(purchaseDate + "T12:00:00")
        d.setDate(d.getDate() + Math.round(premiumDays))
        return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      })()
    : null

  if (!features.SHOW_OPERATIONS_VIEW) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">⚙️ Operations View</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
            Internal
          </span>
        </div>
        <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 pb-5 pt-4 space-y-5">
          {/* Risk summary */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Risk Assessment
            </h4>
            <div className="flex items-center gap-3">
              <RiskBadge level={estimate.riskLevel} size="lg" />
              <span className="text-sm text-slate-600">{estimate.deliveryDays.toFixed(1)} days estimated</span>
            </div>
          </div>

          {/* Ops recommended actions */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Recommended Actions
            </h4>
            <ul className="space-y-1.5">
              {estimate.opsBullets?.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Seller reliability */}
          {estimate.avgDelayScore !== undefined && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Seller Reliability Signal
              </h4>
              <div className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-400">Avg delay score</p>
                  <p
                    className={`text-lg font-bold ${
                      estimate.avgDelayScore > 0.05
                        ? "text-orange-600"
                        : "text-green-600"
                    }`}
                  >
                    {(estimate.avgDelayScore * 100).toFixed(1)}%
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Based on historical seller delay rates for similar product categories.
                  Higher values indicate sellers with more frequent fulfillment delays.
                  <em className="block mt-1 text-slate-400">
                    Note: seller_id not available in this dataset; this uses aggregated product-category signals.
                  </em>
                </p>
              </div>
            </div>
          )}

          {/* Review risk */}
          {features.SHOW_REVIEW_RISK && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Customer Review Risk
              </h4>
              <div className="rounded-xl bg-white border border-slate-200 p-3 text-sm text-slate-600">
                <span className="font-semibold">{estimate.reviewRisk}</span> — Olist data shows
                late deliveries correlate strongly with 1–3 star reviews. The asymmetric loss model
                (5× penalty for underestimation) is designed to reduce this risk.
              </div>
            </div>
          )}

          {/* Model vs Olist Performance */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Model vs Olist — Test Set Performance
            </h4>
            {!modelPerf ? (
              <div className="rounded-xl bg-white border border-slate-200 p-3 animate-pulse">
                <div className="h-3 w-32 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-48 bg-slate-100 rounded" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Overall stats */}
                <div className="rounded-xl bg-white border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Overall (n={modelPerf.overall.n.toLocaleString()} test orders)</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400">MAE</p>
                      <p className="text-xs font-bold text-green-700">{modelPerf.overall.model_mae}d</p>
                      <p className="text-[10px] text-slate-400 line-through">{modelPerf.overall.olist_mae}d</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Late surprise %</p>
                      <p className="text-xs font-bold text-green-700">{modelPerf.overall.model_pct_late_surprise}%</p>
                      <p className="text-[10px] text-slate-400 line-through">{modelPerf.overall.olist_pct_late_surprise}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Within 3d</p>
                      <p className="text-xs font-bold text-green-700">{modelPerf.overall.model_pct_within3}%</p>
                      <p className="text-[10px] text-slate-400 line-through">{modelPerf.overall.olist_pct_within3}%</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">Our model (green) vs Olist baseline (strikethrough)</p>
                </div>

                {/* By risk tier */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">Risk tier</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-500">n</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-500">MAE (model/Olist)</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-500">Late% (model/Olist)</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-500">Avg ⭐</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {RISK_ORDER.map((tier) => {
                        const s = modelPerf.by_risk[tier]
                        if (!s) return null
                        const maeBetter = s.model_mae < s.olist_mae
                        const lateBetter = s.model_pct_late_surprise <= s.olist_pct_late_surprise
                        return (
                          <tr key={tier} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <RiskBadge level={tier} size="sm" />
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">{s.n}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={maeBetter ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                                {s.model_mae}d
                              </span>
                              <span className="text-slate-400"> / {s.olist_mae}d</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={lateBetter ? "text-green-700 font-bold" : "text-amber-600 font-bold"}>
                                {s.model_pct_late_surprise}%
                              </span>
                              <span className="text-slate-400"> / {s.olist_pct_late_surprise}%</span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {s.avg_review_score?.toFixed(2) ?? "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400">Late surprise = delivery arrived after promised date. Lower is better.</p>

                {/* Review impact */}
                {modelPerf.review_impact.olist_late_avg_score != null && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1.5">⭐ Review Score Impact</p>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg bg-white border border-amber-100 p-2">
                        <p className="text-[10px] text-slate-400">On-time delivery</p>
                        <p className="text-base font-bold text-green-700">
                          {modelPerf.review_impact.olist_ontime_avg_score?.toFixed(2)} ⭐
                        </p>
                        <p className="text-[10px] text-slate-400">avg review score</p>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-100 p-2">
                        <p className="text-[10px] text-slate-400">Late delivery</p>
                        <p className="text-base font-bold text-red-600">
                          {modelPerf.review_impact.olist_late_avg_score?.toFixed(2)} ⭐
                        </p>
                        <p className="text-[10px] text-slate-400">avg review score</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      Our model reduces late surprises from{" "}
                      <strong>{modelPerf.review_impact.olist_pct_late}%</strong> (Olist) to{" "}
                      <strong>{modelPerf.review_impact.model_pct_late}%</strong> — protecting customer satisfaction.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Similar historical orders */}
          {features.SHOW_SIMILAR_ORDERS && estimate.similarOrders.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Similar Historical Orders
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {["State", "Price", "Weight", "Delivery days", "Month"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {estimate.similarOrders.map((o, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-700">{o.state}</td>
                        <td className="px-3 py-2 text-slate-600">R$ {o.price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-slate-600">{(o.weight / 1000).toFixed(1)} kg</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{o.deliveryDays.toFixed(1)}</td>
                        <td className="px-3 py-2 text-slate-600">{MONTH_NAMES[o.purchaseMonth]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Order IDs and customer data are not shown. Showing anonymized delivery profiles only.
              </p>
            </div>
          )}

          {/* Model explanation */}
          {features.SHOW_MODEL_EXPLANATION && estimate.modelExplanation && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Model Explanation
              </h4>
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800 leading-relaxed">
                {estimate.modelExplanation}
              </div>
            </div>
          )}

          {/* Premium shipping lever */}
          {features.SHOW_PREMIUM_SHIPPING_SIMULATOR && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Premium Shipping Lever
              </h4>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-sm font-semibold text-amber-800">✨ Expedited Shipping Option</p>
                <p className="text-xs text-amber-700">
                  Offering premium shipping would reduce estimated delivery to{" "}
                  <strong>{premiumDays.toFixed(1)} days</strong>
                  {premiumDate && ` (${premiumDate})`} for a{" "}
                  <strong>+R$ {PREMIUM_SHIPPING_SURCHARGE.toFixed(2)}</strong> surcharge.
                </p>
                <p className="text-xs text-amber-600 italic">
                  {estimate.riskLevel === "High" || estimate.riskLevel === "Critical"
                    ? "Recommended for high-risk orders — reduces churn risk from late delivery."
                    : estimate.riskLevel === "Medium"
                    ? "Consider offering for medium-risk orders as a proactive retention lever."
                    : "Low-risk order — premium shipping not needed."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
