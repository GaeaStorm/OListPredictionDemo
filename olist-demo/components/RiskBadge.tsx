import type { RiskLevel } from "@/types"

const RISK_STYLES: Record<RiskLevel, string> = {
  Low:      "bg-green-100 text-green-800 border-green-200",
  Medium:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  High:     "bg-orange-100 text-orange-800 border-orange-200",
  Critical: "bg-red-100 text-red-800 border-red-200",
}

const RISK_DOTS: Record<RiskLevel, string> = {
  Low:      "bg-green-500",
  Medium:   "bg-yellow-500",
  High:     "bg-orange-500",
  Critical: "bg-red-500",
}

interface Props {
  level: RiskLevel
  size?: "sm" | "md" | "lg"
}

export default function RiskBadge({ level, size = "md" }: Props) {
  const sizeClass = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5 font-semibold",
  }[size]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${RISK_STYLES[level]} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOTS[level]}`} />
      {level} Risk
    </span>
  )
}
