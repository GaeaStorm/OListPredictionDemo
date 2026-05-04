"use client"

import type { CartItem } from "@/types"

interface Props {
  cartItems: CartItem[]
  onRemove: (itemId: string) => void
  onClear: () => void
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2)}`
}

export default function CartSummary({ cartItems, onRemove, onClear }: Props) {
  const subtotal = cartItems.reduce(
    (s, c) => s + c.catalogItem.order_price * c.quantity,
    0
  )
  const totalItems = cartItems.reduce((s, c) => s + c.quantity, 0)

  if (cartItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-400">Your cart is empty.</p>
        <p className="mt-1 text-xs text-gray-300">Add a product or gift basket above.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Cart{" "}
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </h3>
        <button
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Clear all
        </button>
      </div>

      <ul className="space-y-3">
        {cartItems.map(({ catalogItem, quantity }) => (
          <li key={catalogItem.id} className="flex items-center gap-3">
            <span className="text-2xl">{catalogItem.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{catalogItem.name}</p>
              <p className="text-xs text-gray-400">
                {formatBRL(catalogItem.order_price)} × {quantity}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-gray-900">
                {formatBRL(catalogItem.order_price * quantity)}
              </span>
              <button
                onClick={() => onRemove(catalogItem.id)}
                className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                aria-label="Remove item"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-gray-100 pt-3 flex justify-between">
        <span className="text-sm text-gray-500">Subtotal</span>
        <span className="font-bold text-gray-900">{formatBRL(subtotal)}</span>
      </div>
    </div>
  )
}
