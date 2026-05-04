# Olist Delivery Promise Demo

A polished demo web app that makes an ML delivery-time prediction model feel like a business product. Built with Next.js, TypeScript, and Tailwind CSS. Deployable to Vercel with zero configuration.

## What This Is

This demo lets users:
1. Pick products or gift baskets from a simulated Olist storefront
2. Enter a Brazilian CEP/address
3. Select a purchase date (within the dataset range: Sep 15, 2016 – Aug 29, 2018)
4. See an estimated delivery date, shipping price, and risk level
5. Click "Purchase" to see the simulated delivery confirmation

**Business framing:** This is an Olist-style delivery promise and risk demo. Late delivery hurts customer reviews more than early delivery, so the underlying model uses an asymmetric loss (5× penalty for underestimating delivery time). The app surfaces this risk to both customers and an internal "Operations View."

## Data Notes

> **Synthetic product names:** The final modeling dataframe (`final_df.csv`) is order-level and does not include product titles. Product names in the demo are synthetic labels mapped to real historical order profiles.

> **Demo CEP mappings:** The source CSV only contains `customer_city` and `customer_state`; no real CEP data is present. CEPs in `location_lookup.json` are illustrative demo mappings to representative Brazilian cities. See comments in `scripts/build-demo-data.py`.

> **No delivery_days_estimated as input:** `delivery_days_estimated` is kept strictly for offline baseline comparisons and is never used as a model input. This prevents data leakage.

## Model / Estimation

Since no Python runtime is deployed on Vercel, delivery estimation uses a **nearest-neighbor approach** in TypeScript:

1. The 3,000-row `demo_orders.json` acts as a reference dataset
2. For each request, the app finds the 15 most similar historical orders using normalized Euclidean distance across: customer state, num_items, order_price, order_weight, order_volume, max_distance, purchase month, purchase day-of-week
3. Weighted median of those neighbors' `delivery_days` becomes the estimate

The code is modular — replace `estimateDeliveryDays()` in `lib/estimateDeliveryDays.ts` with a real model endpoint when ready.

**Risk thresholds** (from `final_df.csv`, delivery_days > 0):
- Low: ≤ 15.14 days (p75)
- Medium: ≤ 22.56 days (p90)
- High: ≤ 34.12 days (p97)
- Critical: > 34.12 days

## Local Development

**Prerequisites:** Node.js 18+, Python 3.9+ with pandas and numpy

### 1. Generate demo data

From the project root (where `final_df.csv` lives):

```bash
python scripts/build-demo-data.py
```

This creates four JSON files in `olist-demo/public/data/`:
- `demo_catalog.json` — 10 products + 5 gift baskets
- `demo_orders.json` — 3,000 sampled historical orders
- `date_range.json` — dataset min/max dates
- `location_lookup.json` — demo CEP → city/state mappings

### 2. Start the app

```bash
cd olist-demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push the `olist-demo/` folder to a GitHub repository (or the whole project)
2. Import the repo in [vercel.com](https://vercel.com/new)
3. Set the **Root Directory** to `olist-demo` (if deploying the subfolder)
4. Click Deploy — no environment variables required

> Make sure to run `scripts/build-demo-data.py` and commit the generated `public/data/*.json` files before deploying, since Vercel does not run Python.

## Feature Flags

Edit `config/features.ts` to toggle optional sections:

| Flag | Default | Description |
|------|---------|-------------|
| `SHOW_OPERATIONS_VIEW` | `true` | Internal ops dashboard panel |
| `SHOW_SIMILAR_ORDERS` | `true` | Similar historical orders table |
| `SHOW_REVIEW_RISK` | `true` | Customer review risk estimate |
| `SHOW_PREMIUM_SHIPPING_SIMULATOR` | `true` | Simulated premium shipping option |
| `SHOW_SEASONALITY_CHART` | `false` | Delivery days by month chart |
| `SHOW_MODEL_EXPLANATION` | `true` | Plain-English model explanation |
| `SHOW_DATASET_DEBUG_INFO` | `false` | Raw dataset debug info |

## Project Structure

```
olist-demo/
├── app/
│   ├── page.tsx              # Main storefront (client component)
│   ├── layout.tsx
│   └── api/
│       ├── estimate/         # POST → delivery estimate
│       └── purchase/         # POST → purchase confirmation
├── components/               # React UI components
├── lib/                      # Business logic utilities
│   ├── estimateDeliveryDays.ts
│   ├── estimateShippingPrice.ts
│   ├── assignRiskLevel.ts
│   ├── recommendAction.ts
│   ├── findSimilarHistoricalOrders.ts
│   ├── calculateDeliveredDate.ts
│   └── validateBrazilCEP.ts
├── config/features.ts        # Feature flags
├── types/index.ts            # Shared TypeScript types
└── public/data/              # Generated JSON files (from build-demo-data.py)
```

## Dataset

Trained on ~95,000 Olist Brazilian e-commerce orders (Sep 2016 – Aug 2018). Best model: XGBoost with asymmetric MSE loss (5× penalty on underestimation). Test RMSE: ~11.86 days.
