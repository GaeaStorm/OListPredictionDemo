"use client"

import { useState, useEffect } from "react"
import { validateBrazilCEP, normalizeCEP } from "@/lib/validateBrazilCEP"
import type { LocationEntry } from "@/types"

const BRAZIL_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]

interface Props {
  cep: string
  city: string
  state: string
  locations: LocationEntry[]
  onChange: (values: { cep: string; city: string; state: string }) => void
}

export default function AddressForm({ cep, city, state, locations, onChange }: Props) {
  const [cepInput, setCepInput] = useState(cep)
  const [cepError, setCepError] = useState("")

  // Sync cepInput when the parent drives a location change (e.g., auto-fill from catalog item)
  useEffect(() => {
    if (cep !== cepInput) {
      setCepInput(cep)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep])

  // Auto-fill city/state from CEP lookup
  useEffect(() => {
    const digits = cepInput.replace(/\D/g, "")
    if (digits.length === 8) {
      const normalized = normalizeCEP(cepInput)
      const match = locations.find((l) => l.cep.replace(/\D/g, "") === digits)
      if (match) {
        setCepError("")
        onChange({ cep: normalized, city: match.city, state: match.state })
      } else {
        // Unknown CEP — keep city/state editable but show hint
        setCepError("CEP not in demo database — please select state manually.")
        onChange({ cep: normalized, city, state })
      }
    } else if (digits.length > 0 && digits.length < 8) {
      setCepError("")
      onChange({ cep: cepInput, city, state })
    } else {
      setCepError("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepInput])

  function handleCepChange(value: string) {
    // Auto-insert hyphen after 5 digits
    const digits = value.replace(/\D/g, "").slice(0, 8)
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
    setCepInput(formatted)
  }

  function handleCepBlur() {
    const digits = cepInput.replace(/\D/g, "")
    if (digits.length > 0 && !validateBrazilCEP(cepInput)) {
      setCepError("Please enter a valid Brazil CEP (e.g. 01310-100).")
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-900">Delivery Address</h3>

      {/* CEP */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Brazil CEP
        </label>
        <input
          type="text"
          value={cepInput}
          onChange={(e) => handleCepChange(e.target.value)}
          onBlur={handleCepBlur}
          placeholder="00000-000"
          maxLength={9}
          className={`
            w-full rounded-xl border px-4 py-2.5 text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-green-400
            ${cepError ? "border-red-300 bg-red-50" : "border-gray-200"}
          `}
        />
        {cepError && <p className="mt-1 text-xs text-amber-600">{cepError}</p>}
        <p className="mt-1 text-xs text-gray-400">
          Demo CEPs: 01310-100 (São Paulo), 20040-020 (Rio de Janeiro), 30112-000 (BH)
        </p>
      </div>

      {/* City */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
        <input
          type="text"
          value={city}
          onChange={(e) => onChange({ cep, city: e.target.value, state })}
          placeholder="e.g. São Paulo"
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm
            focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
        />
      </div>

      {/* State */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
        <select
          value={state}
          onChange={(e) => onChange({ cep, city, state: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm
            focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors bg-white"
        >
          <option value="">Select state…</option>
          {BRAZIL_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
