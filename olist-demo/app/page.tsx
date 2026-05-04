"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { CatalogItem, CartItem, DeliveryEstimate, LocationEntry, PurchaseResult } from "@/types"
import ProductCard from "@/components/ProductCard"
import CartSummary from "@/components/CartSummary"
import AddressForm from "@/components/AddressForm"
import DateSelector from "@/components/DateSelector"
import DeliveryEstimatePanel from "@/components/DeliveryEstimate"
import OperationsPanel from "@/components/OperationsPanel"

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2)}`
}

export default function Home() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [locations, setLocations] = useState<LocationEntry[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cep, setCep] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [purchaseDate, setPurchaseDate] = useState("2017-06-15")
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load catalog and locations on mount
  useEffect(() => {
    Promise.all([
      fetch("/data/demo_catalog.json").then((r) => r.json()),
      fetch("/data/location_lookup.json").then((r) => r.json()),
    ]).then(([cat, locs]) => {
      setCatalog(cat)
      setLocations(locs)
    })
  }, [])

  // Fetch estimate whenever cart/address/date changes
  const fetchEstimate = useCallback(async () => {
    if (!cartItems.length || !state || !purchaseDate) {
      setEstimate(null)
      return
    }
    setEstimateLoading(true)
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItems, customerState: state, customerCity: city, cep, purchaseDate }),
      })
      if (res.ok) {
        const data = await res.json()
        setEstimate(data)
      }
    } catch {
      // silent fail — estimate panel shows empty state
    } finally {
      setEstimateLoading(false)
    }
  }, [cartItems, state, city, cep, purchaseDate])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchEstimate, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchEstimate])

  // Reset purchase result when anything changes
  useEffect(() => {
    setPurchaseResult(null)
  }, [cartItems, state, city, purchaseDate])

  function addToCart(item: CatalogItem) {
    const isFirstItem = cartItems.length === 0

    setCartItems((prev) => {
      const existing = prev.find((c) => c.catalogItem.id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.catalogItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, { catalogItem: item, quantity: 1 }]
    })

    // When adding the first item, auto-populate date and location from the
    // historical order so the user can see a direct dataset comparison.
    if (isFirstItem) {
      const date = item.order_purchase_timestamp.split("T")[0]
      setPurchaseDate(date)

      const locMatch =
        locations.find(
          (l) =>
            l.state === item.customer_state &&
            l.city.toLowerCase() === item.customer_city.toLowerCase()
        ) ?? locations.find((l) => l.state === item.customer_state)

      if (locMatch) {
        setCep(locMatch.cep)
        setCity(locMatch.city)
        setState(locMatch.state)
      } else {
        setCep("")
        setCity(item.customer_city)
        setState(item.customer_state)
      }
    }
  }

  function removeFromCart(itemId: string) {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.catalogItem.id === itemId)
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.catalogItem.id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      }
      return prev.filter((c) => c.catalogItem.id !== itemId)
    })
  }

  function handleAddressChange({ cep: c, city: ci, state: s }: { cep: string; city: string; state: string }) {
    setCep(c)
    setCity(ci)
    setState(s)
  }

  async function handlePurchase() {
    if (!estimate || !cartItems.length || !state || !purchaseDate) return
    setPurchasing(true)
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems,
          customerState: state,
          customerCity: city,
          cep,
          purchaseDate,
          estimatedDays: estimate.deliveryDays,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setPurchaseResult(data)
        // Scroll to confirmation
        setTimeout(() => {
          document.getElementById("confirmation")?.scrollIntoView({ behavior: "smooth" })
        }, 100)
      }
    } catch {
      // silent fail
    } finally {
      setPurchasing(false)
    }
  }

  const products = catalog.filter((c) => c.type === "product")
  const baskets = catalog.filter((c) => c.type === "basket")
  const cartEmpty = cartItems.length === 0

  // For single-item carts show a historical baseline (actual days from the dataset)
  const historicalDays = cartItems.length === 1 ? cartItems[0].catalogItem.delivery_days : null
  const historicalDaysEstimated =
    cartItems.length === 1 ? (cartItems[0].catalogItem.delivery_days_estimated ?? null) : null
  const historicalDeliveryDate =
    historicalDays !== null && purchaseDate
      ? (() => {
          const d = new Date(purchaseDate + "T12:00:00")
          d.setDate(d.getDate() + Math.round(historicalDays))
          return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        })()
      : null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">O</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">Olist</span>
              <span className="text-gray-400 text-sm ml-2">Delivery Promise Demo</span>
            </div>
          </div>
          {!cartEmpty && (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
                🛒 {cartItems.reduce((s, c) => s + c.quantity, 0)} item{cartItems.reduce((s, c) => s + c.quantity, 0) !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Hero */}
        <section className="text-center py-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Olist Delivery Promise Demo
          </h1>
          <p className="mt-3 text-lg text-gray-500 max-w-2xl mx-auto">
            Shop sample orders and see how delivery estimates change by destination and purchase date.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Asymmetric ML model — late delivery penalized 5× more than early
          </div>
        </section>

        {/* Products */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Products</h2>
          <p className="text-sm text-gray-400 mb-4">
            Synthetic names mapped to real order profiles from the Olist dataset.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {products.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                cartItems={cartItems}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}
          </div>
        </section>

        {/* Gift Baskets */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Gift Baskets</h2>
          <p className="text-sm text-gray-400 mb-4">
            Multi-item bundles — based on real orders with {">"}1 item.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {baskets.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                cartItems={cartItems}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}
          </div>
        </section>

        {/* Order details + estimate */}
        <section id="checkout" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <CartSummary
              cartItems={cartItems}
              onRemove={removeFromCart}
              onClear={() => setCartItems([])}
            />
            <AddressForm
              cep={cep}
              city={city}
              state={state}
              locations={locations}
              onChange={handleAddressChange}
            />
            <DateSelector value={purchaseDate} onChange={setPurchaseDate} />
          </div>

          <div className="space-y-4">
            <DeliveryEstimatePanel
              estimate={estimate}
              loading={estimateLoading}
              purchaseDate={purchaseDate}
              onPurchase={handlePurchase}
              purchasing={purchasing}
              cartEmpty={cartEmpty}
              historicalDays={historicalDays}
              historicalDeliveryDate={historicalDeliveryDate}
              historicalDaysEstimated={historicalDaysEstimated}
            />
            {estimate && <OperationsPanel
              estimate={estimate}
              purchaseDate={purchaseDate}
              historicalDays={historicalDays}
              historicalDeliveryDate={historicalDeliveryDate}
              historicalDaysEstimated={historicalDaysEstimated}
            />}
          </div>
        </section>

        {/* Purchase confirmation */}
        {purchaseResult && (
          <section id="confirmation" className="py-4">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-8 text-center shadow-sm">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-green-800">
                Your order was delivered on
              </h2>
              <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-green-700">
                {purchaseResult.deliveredDate}
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
                <div className="rounded-xl bg-white border border-green-100 p-3">
                  <p className="text-xs text-gray-400 font-medium">Model estimate</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{purchaseResult.estimatedDate}</p>
                  <p className="text-xs text-gray-400">{purchaseResult.estimatedDays.toFixed(1)} days</p>
                </div>
                <div className="rounded-xl bg-white border border-green-100 p-3">
                  <p className="text-xs text-gray-400 font-medium">Actual delivery</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{purchaseResult.deliveredDate}</p>
                  <p className="text-xs text-gray-400">{purchaseResult.actualDays.toFixed(1)} days</p>
                </div>
                <div className="rounded-xl bg-white border border-green-100 p-3">
                  <p className="text-xs text-gray-400 font-medium">Difference</p>
                  <p
                    className={`text-sm font-bold mt-0.5 ${
                      purchaseResult.difference > 0
                        ? "text-red-600"
                        : purchaseResult.difference < 0
                        ? "text-green-600"
                        : "text-gray-800"
                    }`}
                  >
                    {purchaseResult.difference > 0 ? "+" : ""}
                    {purchaseResult.difference} day{Math.abs(purchaseResult.difference) !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-gray-400">
                    {purchaseResult.difference > 0
                      ? "later than estimated"
                      : purchaseResult.difference < 0
                      ? "earlier than estimated"
                      : "on time"}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                Source:{" "}
                {purchaseResult.source === "historical_match"
                  ? "Historical dataset match — using actual delivery days from the Olist dataset."
                  : "Nearest-neighbor model estimate — no exact dataset match for this order."}
              </p>

              <button
                onClick={() => {
                  setPurchaseResult(null)
                  setCartItems([])
                  setEstimate(null)
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
                className="mt-6 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white
                  hover:bg-green-700 transition-colors"
              >
                Start a new order
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Demo only. Trained on ~95,000 Olist orders (2016–2018). Synthetic product names.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>LightGBM · Asymmetric MSE (5× underestimation penalty)</span>
            <span>·</span>
            <span>Pre-computed model predictions · Nearest-neighbor fallback</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
