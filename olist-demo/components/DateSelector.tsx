"use client"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const MIN_DATE = "2016-09-15"
const MAX_DATE = "2018-08-29"

interface Props {
  value: string
  onChange: (date: string) => void
}

export default function DateSelector({ value, onChange }: Props) {
  const dayName = value
    ? DAY_NAMES[new Date(value + "T12:00:00").getDay()]
    : null

  const monthName = value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">Purchase Date</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select date
        </label>
        <input
          type="date"
          value={value}
          min={MIN_DATE}
          max={MAX_DATE}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm
            focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
        />
      </div>

      {value && (
        <div className="mt-3 flex gap-3">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
            {dayName}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {monthName}
          </span>
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400">
        Dataset range: Sep 15, 2016 – Aug 29, 2018
      </p>
    </div>
  )
}
