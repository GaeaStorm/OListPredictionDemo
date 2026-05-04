"use client"

import type { CatalogItem, CartItem } from "@/types"

interface Props {
  item: CatalogItem
  cartItems: CartItem[]
  onAdd: (item: CatalogItem) => void
  onRemove: (itemId: string) => void
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2)}`
}

export default function ProductCard({ item, cartItems, onAdd, onRemove }: Props) {
  const cartEntry = cartItems.find((c) => c.catalogItem.id === item.id)
  const quantity = cartEntry?.quantity ?? 0

  return (
    <div
      className={`
        relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm
        transition-all duration-200 hover:shadow-md
        ${quantity > 0 ? "border-green-400 ring-1 ring-green-300" : "border-gray-200"}
      `}
    >
      {item.type === "basket" && (
        <span className="absolute top-3 right-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Gift Basket
        </span>
      )}

      <div className="mb-3 text-4xl">{item.emoji}</div>

      <h3 className="font-semibold text-gray-900 leading-tight">{item.name}</h3>
      <p className="mt-1 text-sm text-gray-500 leading-snug line-clamp-2">{item.description}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
        {item.num_items > 1 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">{item.num_items} items</span>
        )}
        <span className="rounded-full bg-gray-100 px-2 py-0.5">
          {(item.order_weight / 1000).toFixed(1)} kg
        </span>
        {/* <span className="rounded-full bg-gray-100 px-2 py-0.5">{item.customer_state}</span> */}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900">{formatBRL(item.order_price)}</span>

        {quantity === 0 ? (
          <button
            onClick={() => onAdd(item)}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white
              hover:bg-green-700 active:bg-green-800 transition-colors"
          >
            Add to cart
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRemove(item.id)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300
                text-gray-600 hover:bg-gray-100 transition-colors text-lg font-bold"
            >
              −
            </button>
            <span className="w-5 text-center font-semibold text-gray-900">{quantity}</span>
            <button
              onClick={() => onAdd(item)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600
                text-white hover:bg-green-700 transition-colors text-lg font-bold"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
