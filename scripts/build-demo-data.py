"""
build-demo-data.py
------------------
Reads final_df.csv and generates lightweight JSON files for the Olist demo website.

Run from the project root:
    python scripts/build-demo-data.py

Outputs (written to olist-demo/public/data/):
    demo_catalog.json   — 10 products + 5 gift baskets with synthetic names
    demo_orders.json    — 3,000 sampled historical orders for nearest-neighbor estimation
    date_range.json     — min/max purchase dates
    location_lookup.json — demo CEP → city/state mappings

NOTE: The final_df.csv is order-level and does NOT include product titles.
Product names in the demo are synthetic labels mapped to real historical order profiles.

NOTE: CEP mappings in location_lookup.json are demo mappings only. The source CSV
only contains customer_city and customer_state; no real CEP data is available.
"""

import pandas as pd
import numpy as np
import json
import os
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CSV_PATH = PROJECT_ROOT / "final_df.csv"
OUTPUT_DIR = PROJECT_ROOT / "olist-demo" / "public" / "data"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Loading {CSV_PATH} ...")
df = pd.read_csv(CSV_PATH, parse_dates=["order_purchase_timestamp"])
print(f"Loaded {len(df):,} rows, {len(df.columns)} columns.")

# ── date_range.json ──────────────────────────────────────────────────────────
min_date = df["order_purchase_timestamp"].min().strftime("%Y-%m-%d")
max_date = df["order_purchase_timestamp"].max().strftime("%Y-%m-%d")
date_range = {"min": min_date, "max": max_date}
with open(OUTPUT_DIR / "date_range.json", "w") as f:
    json.dump(date_range, f, indent=2)
print(f"date_range.json: {min_date} → {max_date}")

# ── demo_catalog.json ────────────────────────────────────────────────────────
# Synthetic product names mapped to real order rows.
# Products use num_items == 1 rows; baskets use num_items >= 3 rows.

SINGLE_PRODUCTS = [
    ("home-essentials",    "Home Essentials Kit",       "🏠", "Everyday home and living essentials to keep your space running smoothly."),
    ("kitchen-starter",    "Kitchen Starter Pack",      "🍳", "A curated set of kitchen tools and accessories for home cooks."),
    ("beauty-care",        "Beauty Care Box",           "💄", "Premium beauty and personal care products, carefully selected."),
    ("office-setup",       "Office Setup Bundle",       "💼", "Everything you need to set up a productive home or office workspace."),
    ("electronics-kit",    "Electronics Accessory Kit", "🔌", "Essential electronics accessories and gadgets for everyday use."),
    ("fitness-pack",       "Fitness Accessories Pack",  "🏋️", "High-quality fitness gear to support your workout routine."),
    ("garden-tool",        "Home & Garden Tool Set",    "🌱", "Durable tools and accessories for home maintenance and gardening."),
    ("phone-accessories",  "Phone Accessories Bundle",  "📱", "Must-have phone accessories to keep you connected and protected."),
    ("childrens-kit",      "Children's Learning Kit",   "🎒", "Educational toys and supplies to inspire curious young minds."),
    ("sports-gear",        "Sports & Outdoors Gear",    "⚽", "Quality sports equipment and outdoor gear for active lifestyles."),
]

GIFT_BASKETS = [
    ("pet-care-basket",    "Pet Care Gift Basket",      "🐾", "A thoughtful bundle of pet supplies and treats for your furry friend."),
    ("baby-essentials",    "Baby Essentials Basket",    "👶", "Everything new parents need — soft, safe, and lovingly chosen."),
    ("weekend-gift",       "Weekend Gift Basket",       "🎁", "A delightful weekend treat: relaxation and lifestyle items bundled together."),
    ("housewarming",       "Housewarming Bundle",       "🏡", "The perfect gift for new homeowners — practical and charming."),
    ("beauty-wellness",    "Beauty & Wellness Set",     "✨", "A luxurious wellness collection to pamper and rejuvenate."),
]

# Risk thresholds (from dataset percentiles)
P75 = 15.14  # Low/Medium boundary
P90 = 22.56  # Medium/High boundary

np.random.seed(42)

# Select representative single-item orders with risk-level variety:
#   4 Low (≤ P75 days, nearby states)   3 Medium (P75–P90)   3 High (> P90)
single_pool = df[
    (df["num_items"] == 1) &
    (df["order_price"].between(15, 500)) &
    (df["order_weight"].between(100, 20000)) &
    (df["delivery_days"] > 0)
].copy()

NEARBY_STATES = ["SP", "RJ", "MG", "PR", "SC", "ES", "GO"]
low_products = single_pool[
    (single_pool["delivery_days"] <= P75) &
    (single_pool["customer_state"].isin(NEARBY_STATES))
].sample(n=4, random_state=42)
medium_products = single_pool[
    (single_pool["delivery_days"] > P75) &
    (single_pool["delivery_days"] <= P90)
].sample(n=3, random_state=42)
high_products = single_pool[
    (single_pool["delivery_days"] > P90) &
    (single_pool["delivery_days"] <= 45)  # exclude extreme outliers for demo clarity
].sample(n=3, random_state=42)
single_sample = pd.concat([low_products, medium_products, high_products]).sample(frac=1, random_state=42).reset_index(drop=True)

# Select gift basket orders (num_items >= 3) with risk variety:
#   1 Low   2 Medium   2 High/Critical
basket_pool = df[
    (df["num_items"] >= 3) &
    (df["num_items"] <= 15) &
    (df["order_price"].between(30, 800)) &
    (df["delivery_days"] > 0)
].copy()

low_baskets = basket_pool[basket_pool["delivery_days"] <= P75].sample(n=1, random_state=42)
medium_baskets = basket_pool[
    (basket_pool["delivery_days"] > P75) &
    (basket_pool["delivery_days"] <= P90)
].sample(n=2, random_state=42)
high_baskets = basket_pool[
    (basket_pool["delivery_days"] > P90) &
    (basket_pool["delivery_days"] <= 45)
].sample(n=2, random_state=42)
basket_sample = pd.concat([low_baskets, medium_baskets, high_baskets]).sample(frac=1, random_state=42).reset_index(drop=True)

CATALOG_COLS = [
    "order_id", "num_items", "order_price", "order_weight", "order_volume",
    "customer_city", "customer_state", "order_purchase_timestamp",
    "delivery_days", "max_distance", "purchase_hour",
    "purchase_dayofweek", "avg_delay_sellers", "avg_cancel_sellers",
    "avg_delay_product", "avg_cancel_product"
]

def to_native(val):
    """Convert numpy/pandas scalar types to Python-native for JSON serialization."""
    if hasattr(val, "strftime"):
        # pandas Timestamp → ISO string
        return val.strftime("%Y-%m-%dT%H:%M:%S")
    if hasattr(val, "item"):
        return val.item()
    return val

catalog = []
for i, (pid, name, emoji, desc) in enumerate(SINGLE_PRODUCTS):
    if i >= len(single_sample):
        break
    row = single_sample.iloc[i]
    entry = {"id": pid, "name": name, "type": "product", "emoji": emoji, "description": desc}
    for col in CATALOG_COLS:
        val = to_native(row[col])
        entry[col] = round(float(val), 4) if isinstance(val, float) else val
    catalog.append(entry)

for i, (pid, name, emoji, desc) in enumerate(GIFT_BASKETS):
    if i >= len(basket_sample):
        break
    row = basket_sample.iloc[i]
    entry = {"id": pid, "name": name, "type": "basket", "emoji": emoji, "description": desc}
    for col in CATALOG_COLS:
        val = to_native(row[col])
        entry[col] = round(float(val), 4) if isinstance(val, float) else val
    catalog.append(entry)

with open(OUTPUT_DIR / "demo_catalog.json", "w") as f:
    json.dump(catalog, f, indent=2)
print(f"demo_catalog.json: {len(catalog)} items ({len(SINGLE_PRODUCTS)} products + {len(GIFT_BASKETS)} baskets)")

# ── demo_orders.json ─────────────────────────────────────────────────────────
# 3,000 rows stratified by customer_state. No customer_unique_id exposed.
KEEP_COLS = [
    "order_id", "customer_city", "customer_state",
    "order_purchase_timestamp", "delivery_days",
    "num_items", "order_price", "order_weight", "order_volume",
    "max_distance", "purchase_hour", "purchase_dayofweek",
    "approval_delay_hours", "avg_delay_sellers", "avg_cancel_sellers",
    "avg_delay_product", "avg_cancel_product"
]
TARGET_ROWS = 3000
valid_orders = df[df["delivery_days"] > 0][KEEP_COLS].copy()
# Stratified sample by state
state_counts = valid_orders["customer_state"].value_counts()
state_proportions = (state_counts / len(valid_orders) * TARGET_ROWS).round().astype(int)
state_proportions = state_proportions.clip(lower=5)  # at least 5 per state

sampled_parts = []
for state, count in state_proportions.items():
    state_df = valid_orders[valid_orders["customer_state"] == state]
    n = min(count, len(state_df))
    sampled_parts.append(state_df.sample(n=n, random_state=42))

demo_orders = pd.concat(sampled_parts).sample(frac=1, random_state=42).reset_index(drop=True)
demo_orders["order_purchase_timestamp"] = demo_orders["order_purchase_timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S")

# Round floats to 4 decimal places
float_cols = demo_orders.select_dtypes(include=[float]).columns
demo_orders[float_cols] = demo_orders[float_cols].round(4)

orders_list = demo_orders.to_dict(orient="records")
with open(OUTPUT_DIR / "demo_orders.json", "w") as f:
    json.dump(orders_list, f, separators=(",", ":"))  # compact for smaller file size
print(f"demo_orders.json: {len(orders_list):,} rows")

# ── location_lookup.json ─────────────────────────────────────────────────────
# Demo CEP → city/state mappings. CEPs are illustrative only.
# Source CSV only has city/state; no real CEP data is available.
#
# max_distance_approx: rough distance to São Paulo (km) as a fallback.
# For production, replace with a real CEP API or database.

LOCATION_LOOKUP = [
    # SP
    {"cep": "01310-100", "city": "São Paulo",        "state": "SP", "max_distance_approx": 0},
    {"cep": "01001-000", "city": "São Paulo",        "state": "SP", "max_distance_approx": 0},
    {"cep": "13013-001", "city": "Campinas",         "state": "SP", "max_distance_approx": 95},
    {"cep": "12220-000", "city": "São José dos Campos","state":"SP","max_distance_approx": 83},
    # RJ
    {"cep": "20040-020", "city": "Rio de Janeiro",   "state": "RJ", "max_distance_approx": 430},
    {"cep": "24020-054", "city": "Niterói",          "state": "RJ", "max_distance_approx": 445},
    # MG
    {"cep": "30112-000", "city": "Belo Horizonte",   "state": "MG", "max_distance_approx": 590},
    {"cep": "36010-000", "city": "Juiz de Fora",     "state": "MG", "max_distance_approx": 505},
    # DF
    {"cep": "70040-010", "city": "Brasília",         "state": "DF", "max_distance_approx": 1015},
    # PR
    {"cep": "80010-010", "city": "Curitiba",         "state": "PR", "max_distance_approx": 408},
    {"cep": "86010-040", "city": "Londrina",         "state": "PR", "max_distance_approx": 522},
    # RS
    {"cep": "90010-150", "city": "Porto Alegre",     "state": "RS", "max_distance_approx": 1108},
    {"cep": "95010-001", "city": "Caxias do Sul",    "state": "RS", "max_distance_approx": 1168},
    # BA
    {"cep": "40020-010", "city": "Salvador",         "state": "BA", "max_distance_approx": 1960},
    # CE
    {"cep": "60010-000", "city": "Fortaleza",        "state": "CE", "max_distance_approx": 2350},
    # AM
    {"cep": "69010-010", "city": "Manaus",           "state": "AM", "max_distance_approx": 2930},
    # PE
    {"cep": "50010-010", "city": "Recife",           "state": "PE", "max_distance_approx": 2660},
    # PA
    {"cep": "66010-000", "city": "Belém",            "state": "PA", "max_distance_approx": 2480},
    # GO
    {"cep": "74010-010", "city": "Goiânia",          "state": "GO", "max_distance_approx": 907},
    # SC
    {"cep": "88010-000", "city": "Florianópolis",    "state": "SC", "max_distance_approx": 694},
    # RN
    {"cep": "59010-000", "city": "Natal",            "state": "RN", "max_distance_approx": 2720},
    # AL
    {"cep": "57010-000", "city": "Maceió",           "state": "AL", "max_distance_approx": 2270},
    # PI
    {"cep": "64000-010", "city": "Teresina",         "state": "PI", "max_distance_approx": 2210},
    # MS
    {"cep": "79010-010", "city": "Campo Grande",     "state": "MS", "max_distance_approx": 1014},
    # PB
    {"cep": "58010-000", "city": "João Pessoa",      "state": "PB", "max_distance_approx": 2700},
    # SE
    {"cep": "49010-000", "city": "Aracaju",          "state": "SE", "max_distance_approx": 2050},
    # AP
    {"cep": "68900-000", "city": "Macapá",           "state": "AP", "max_distance_approx": 2775},
    # RO
    {"cep": "76801-000", "city": "Porto Velho",      "state": "RO", "max_distance_approx": 2975},
    # MT
    {"cep": "78005-000", "city": "Cuiabá",           "state": "MT", "max_distance_approx": 1615},
    # TO
    {"cep": "77001-002", "city": "Palmas",           "state": "TO", "max_distance_approx": 1840},
    # AC
    {"cep": "69900-000", "city": "Rio Branco",       "state": "AC", "max_distance_approx": 3350},
    # RR
    {"cep": "69300-000", "city": "Boa Vista",        "state": "RR", "max_distance_approx": 3535},
    # MA
    {"cep": "65010-000", "city": "São Luís",         "state": "MA", "max_distance_approx": 2310},
    # ES
    {"cep": "29010-000", "city": "Vitória",          "state": "ES", "max_distance_approx": 875},
]

with open(OUTPUT_DIR / "location_lookup.json", "w") as f:
    json.dump(LOCATION_LOOKUP, f, indent=2)
print(f"location_lookup.json: {len(LOCATION_LOOKUP)} locations")

# ── Delivery day percentiles (embedded in output for reference) ───────────────
p75 = float(np.percentile(df[df["delivery_days"] > 0]["delivery_days"], 75))
p90 = float(np.percentile(df[df["delivery_days"] > 0]["delivery_days"], 90))
p97 = float(np.percentile(df[df["delivery_days"] > 0]["delivery_days"], 97))
print(f"\nDelivery day percentiles (for risk thresholds):")
print(f"  p75 = {p75:.2f}  p90 = {p90:.2f}  p97 = {p97:.2f}")
print(f"\nAll JSON files written to {OUTPUT_DIR}")
