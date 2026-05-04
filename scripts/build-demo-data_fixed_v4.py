"""
build-demo-data.py
------------------
Reads final_df.csv / final_df_20260503.csv and generates lightweight JSON files
for the Olist demo website.

The demo sample is intentionally drawn from the chronological validation + test
period, not the whole dataset, so the demo matches the model evaluation window.
When best_delivery_model.joblib is available, the script also computes model
predictions before sampling and prioritizes examples where the model beats the
Olist baseline.

Run from the project root:
    python scripts/build-demo-data.py

Outputs (written to olist-demo/public/data/):
    demo_catalog.json
    demo_orders.json
    date_range.json
    location_lookup.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd

# ── Paths / controls ─────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

CSV_CANDIDATES = [
    PROJECT_ROOT / "final_df_20260503.csv",
    PROJECT_ROOT / "final_df.csv",
]
CSV_PATH = next((p for p in CSV_CANDIDATES if p.exists()), CSV_CANDIDATES[-1])

MODEL_PATH = PROJECT_ROOT / "best_delivery_model.joblib"
OUTPUT_DIR = PROJECT_ROOT / "olist-demo" / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TIME_COL = "order_purchase_timestamp"
TARGET_COL = "delivery_days"
BASELINE_COL = "delivery_days_estimated"
ORDER_ID_COL = "order_id"

RANDOM_STATE = 42
TARGET_ROWS = 3000
TRAIN_FRAC = 0.60
VAL_FRAC = 0.20
DEMO_SPLITS = {"validation", "test"}

# Minimum absolute-error improvement needed for a row to count as a clear demo win.
MIN_MODEL_IMPROVEMENT_DAYS = 2.0

# Ensure the demo visibly includes cases where Olist promised too early but the
# model did not. These are the clearest customer-facing examples.
MIN_CATALOG_LATE_PREVENTION_SINGLE = 3
MIN_CATALOG_LATE_PREVENTION_BASKET = 1
MIN_DEMO_ORDER_LATE_PREVENTIONS = 250

# Also force the large nearest-neighbor order sample to include a visible risk mix.
# Risk group uses actual delivery percentiles: Low <= p75, Medium p75-p90,
# High > p90. Critical is folded into High for demo coverage.
MIN_DEMO_ORDER_RISK_COUNTS = {"Low": 750, "Medium": 450, "High": 300}

# ── Synthetic catalog labels ─────────────────────────────────────────────────
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

BASE_CATALOG_COLS = [
    ORDER_ID_COL, "split", "risk_actual", "num_items", "order_price", "order_weight", "order_volume",
    "customer_city", "customer_state", TIME_COL,
    TARGET_COL, BASELINE_COL, "predicted_delivery_days",
    "olist_abs_error_days", "model_abs_error_days", "model_improvement_days",
    "olist_late_surprise", "model_late_surprise", "model_better_than_olist",
    "model_prevents_late_surprise",
    "max_distance", "purchase_hour", "purchase_dayofweek",
    "avg_delay_sellers", "avg_cancel_sellers", "avg_delay_product", "avg_cancel_product",
]

BASE_ORDER_COLS = [
    ORDER_ID_COL, "split", "risk_actual", "customer_city", "customer_state", TIME_COL,
    TARGET_COL, BASELINE_COL, "predicted_delivery_days",
    "olist_abs_error_days", "model_abs_error_days", "model_improvement_days",
    "olist_late_surprise", "model_late_surprise", "model_better_than_olist",
    "model_prevents_late_surprise",
    "num_items", "order_price", "order_weight", "order_volume",
    "max_distance", "purchase_hour", "purchase_dayofweek",
    "approval_delay_hours", "avg_delay_sellers", "avg_cancel_sellers",
    "avg_delay_product", "avg_cancel_product",
]


def read_final_df(path: Path) -> pd.DataFrame:
    print(f"Loading {path} ...")
    df = pd.read_csv(path, parse_dates=[TIME_COL])
    missing = [c for c in [ORDER_ID_COL, TIME_COL, TARGET_COL, BASELINE_COL] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in {path}: {missing}")
    df = df.sort_values(TIME_COL).reset_index(drop=True)
    print(f"Loaded {len(df):,} rows, {len(df.columns)} columns.")
    return df


def add_chronological_split(df: pd.DataFrame) -> pd.DataFrame:
    n = len(df)
    train_end = int(n * TRAIN_FRAC)
    val_end = int(n * (TRAIN_FRAC + VAL_FRAC))

    split = np.full(n, "test", dtype=object)
    split[:train_end] = "train"
    split[train_end:val_end] = "validation"

    out = df.copy()
    out["split"] = split
    return out


def add_model_predictions(df: pd.DataFrame) -> tuple[pd.DataFrame, bool]:
    out = df.copy()
    if not MODEL_PATH.exists():
        print(f"Model artifact not found at {MODEL_PATH}; demo sampling will not be model-aware.")
        out["predicted_delivery_days"] = np.nan
        return out, False

    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"]
    features = bundle["features"]
    offset_days = float(bundle.get("offset_days", 0.0))

    missing_features = [c for c in features if c not in out.columns]
    if missing_features:
        raise ValueError(f"Model artifact expects features missing from final_df: {missing_features}")

    print(f"Adding model predictions with offset {offset_days:.3f} days...")
    raw_pred = model.predict(out[features])
    out["predicted_delivery_days"] = np.maximum(raw_pred + offset_days, 1.0)
    return out, True


def add_demo_diagnostics(df: pd.DataFrame, has_model: bool) -> pd.DataFrame:
    out = df.copy()
    actual = pd.to_numeric(out[TARGET_COL], errors="coerce")
    baseline = pd.to_numeric(out[BASELINE_COL], errors="coerce")

    out["olist_abs_error_days"] = (baseline - actual).abs()
    out["olist_late_surprise"] = baseline < actual

    if has_model:
        pred = pd.to_numeric(out["predicted_delivery_days"], errors="coerce")
        out["model_abs_error_days"] = (pred - actual).abs()
        out["model_improvement_days"] = out["olist_abs_error_days"] - out["model_abs_error_days"]
        out["model_late_surprise"] = pred < actual
        out["model_better_than_olist"] = out["model_improvement_days"] >= MIN_MODEL_IMPROVEMENT_DAYS
        out["model_prevents_late_surprise"] = out["olist_late_surprise"] & ~out["model_late_surprise"]
        out["demo_priority_score"] = (
            out["model_improvement_days"].fillna(-999)
            + 8.0 * out["model_prevents_late_surprise"].astype(float)
            + 3.0 * out["model_better_than_olist"].astype(float)
        )
    else:
        out["model_abs_error_days"] = np.nan
        out["model_improvement_days"] = np.nan
        out["model_late_surprise"] = False
        out["model_better_than_olist"] = False
        out["model_prevents_late_surprise"] = False
        out["demo_priority_score"] = 0.0

    valid_delivery = out.loc[out[TARGET_COL] > 0, TARGET_COL]
    p75, p90, p97 = np.percentile(valid_delivery, [75, 90, 97])
    out["risk_actual"] = pd.cut(
        out[TARGET_COL],
        bins=[-np.inf, p75, p90, p97, np.inf],
        labels=["Low", "Medium", "High", "Critical"],
    ).astype(str)
    out["risk_group"] = out["risk_actual"].replace({"Critical": "High"})

    print(f"Risk thresholds from full valid dataset: p75={p75:.2f}, p90={p90:.2f}, p97={p97:.2f}")
    return out


def to_native(val):
    if pd.isna(val):
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return round(float(val), 4)
    if hasattr(val, "item"):
        return val.item()
    return val


def available_cols(df: pd.DataFrame, cols: Iterable[str]) -> list[str]:
    return [c for c in cols if c in df.columns]


def take_best(pool: pd.DataFrame, n: int, used_ids: set[str]) -> pd.DataFrame:
    pool = pool[~pool[ORDER_ID_COL].isin(used_ids)].copy()
    if pool.empty or n <= 0:
        return pool.head(0)
    sort_cols = ["demo_priority_score", "model_improvement_days", TARGET_COL]
    sort_cols = [c for c in sort_cols if c in pool.columns]
    return pool.sort_values(sort_cols, ascending=[False] * len(sort_cols)).head(n)


def choose_by_risk(
    primary_pool: pd.DataFrame,
    fallback_pool: pd.DataFrame,
    specs: list[tuple[str, int]],
    used_ids: set[str] | None = None,
) -> pd.DataFrame:
    selected = []
    used_ids = set() if used_ids is None else set(used_ids)

    for risk_group, n in specs:
        if n <= 0:
            continue

        primary = primary_pool[primary_pool["risk_group"] == risk_group]
        chosen = take_best(primary, n, used_ids)

        if len(chosen) < n:
            fallback = fallback_pool[fallback_pool["risk_group"] == risk_group]
            fill = take_best(fallback, n - len(chosen), used_ids | set(chosen[ORDER_ID_COL]))
            chosen = pd.concat([chosen, fill], ignore_index=True)

        if len(chosen) < n:
            fill = take_best(fallback_pool, n - len(chosen), used_ids | set(chosen[ORDER_ID_COL]))
            chosen = pd.concat([chosen, fill], ignore_index=True)

        selected.append(chosen)
        used_ids.update(chosen[ORDER_ID_COL].tolist())

    if not selected:
        return fallback_pool.head(0).copy()

    return pd.concat(selected, ignore_index=True).sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)


def reserve_late_prevention_examples(
    primary_pool: pd.DataFrame,
    fallback_pool: pd.DataFrame,
    specs: list[tuple[str, int]],
    min_preventions: int,
) -> pd.DataFrame:
    """Select catalog rows while guaranteeing several late-surprise prevention examples.

    A prevention example means Olist underpredicts actual delivery time but the
    model does not: delivery_days_estimated < delivery_days <= predicted_delivery_days.
    """
    target_total = sum(n for _, n in specs)
    selected = []
    used_ids: set[str] = set()

    if min_preventions > 0 and "model_prevents_late_surprise" in primary_pool.columns:
        prevention_pool = primary_pool[primary_pool["model_prevents_late_surprise"]].copy()
        reserved = take_best(prevention_pool, min(min_preventions, target_total), used_ids)
        if len(reserved) > 0:
            selected.append(reserved)
            used_ids.update(reserved[ORDER_ID_COL].tolist())

    reserved_df = pd.concat(selected, ignore_index=True) if selected else fallback_pool.head(0).copy()
    reserved_counts = reserved_df["risk_group"].value_counts().to_dict() if len(reserved_df) else {}
    remaining_specs = [(risk, max(0, n - int(reserved_counts.get(risk, 0)))) for risk, n in specs]

    fill = choose_by_risk(primary_pool, fallback_pool, remaining_specs, used_ids=used_ids)
    chosen = pd.concat([reserved_df, fill], ignore_index=True)

    if len(chosen) < target_total:
        used_ids = set(chosen[ORDER_ID_COL])
        extra = take_best(primary_pool, target_total - len(chosen), used_ids)
        chosen = pd.concat([chosen, extra], ignore_index=True)

    if len(chosen) < target_total:
        used_ids = set(chosen[ORDER_ID_COL])
        extra = take_best(fallback_pool, target_total - len(chosen), used_ids)
        chosen = pd.concat([chosen, extra], ignore_index=True)

    return chosen.head(target_total).sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)


def sample_rows(pool: pd.DataFrame, n: int, used_ids: set[str]) -> pd.DataFrame:
    """Pick up to n rows, preserving state diversity and demo usefulness."""
    if n <= 0 or pool.empty:
        return pool.head(0).copy()

    pool = pool[~pool[ORDER_ID_COL].isin(used_ids)].copy()
    if pool.empty:
        return pool.head(0).copy()
    return stratified_sample(pool, min(n, len(pool)))


def sample_demo_orders_with_reserved_preventions(
    valid_orders: pd.DataFrame,
    target_rows: int,
    has_model_predictions: bool,
) -> pd.DataFrame:
    """Sample demo orders while reserving late-prevention and risk-mix cases.

    Guarantees, when rows are available:
      1. Olist-late/model-not-late examples.
      2. A visible Low/Medium/High risk mix.
      3. Remaining rows prioritize model wins/de-risked orders.
    """
    if has_model_predictions:
        priority_mask = valid_orders["model_better_than_olist"] | valid_orders["model_prevents_late_surprise"]
        priority_orders = valid_orders[priority_mask].copy()
        prevention_orders = valid_orders[valid_orders["model_prevents_late_surprise"]].copy()
    else:
        priority_orders = valid_orders.copy()
        prevention_orders = valid_orders.head(0).copy()

    selected_parts: list[pd.DataFrame] = []
    used_ids: set[str] = set()

    # 1) Reserve the strongest customer-facing examples first.
    reserve_n = min(MIN_DEMO_ORDER_LATE_PREVENTIONS, target_rows, len(prevention_orders))
    reserved_preventions = sample_rows(prevention_orders, reserve_n, used_ids)
    if len(reserved_preventions):
        selected_parts.append(reserved_preventions)
        used_ids.update(reserved_preventions[ORDER_ID_COL].tolist())

    # 2) Guarantee a visible risk mix. Prefer rows where the model wins, then fall
    # back to any validation/test row in that risk group if needed.
    for risk_group, min_count in MIN_DEMO_ORDER_RISK_COUNTS.items():
        already_have = sum(
            int((part.get("risk_group") == risk_group).sum())
            for part in selected_parts
            if "risk_group" in part
        )
        need = max(0, min_count - already_have)
        remaining_slots = target_rows - sum(len(part) for part in selected_parts)
        need = min(need, remaining_slots)
        if need <= 0:
            continue

        primary = priority_orders[priority_orders["risk_group"] == risk_group]
        chosen = sample_rows(primary, need, used_ids)
        used_ids.update(chosen[ORDER_ID_COL].tolist())

        if len(chosen) < need:
            fallback = valid_orders[valid_orders["risk_group"] == risk_group]
            fill = sample_rows(fallback, need - len(chosen), used_ids)
            chosen = pd.concat([chosen, fill], ignore_index=True)
            used_ids.update(fill[ORDER_ID_COL].tolist())

        if len(chosen):
            selected_parts.append(chosen)

    # 3) Fill the rest with model wins/de-risked orders first, then any eligible row.
    current_n = sum(len(part) for part in selected_parts)
    remaining = target_rows - current_n
    if remaining > 0:
        fill = sample_rows(priority_orders, remaining, used_ids)
        selected_parts.append(fill)
        used_ids.update(fill[ORDER_ID_COL].tolist())

    current_n = sum(len(part) for part in selected_parts)
    remaining = target_rows - current_n
    if remaining > 0:
        fill = sample_rows(valid_orders, remaining, used_ids)
        selected_parts.append(fill)
        used_ids.update(fill[ORDER_ID_COL].tolist())

    out = pd.concat(selected_parts, ignore_index=True) if selected_parts else valid_orders.head(0).copy()
    out = out.head(target_rows).sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)

    risk_counts = out["risk_group"].value_counts().reindex(["Low", "Medium", "High"], fill_value=0)
    print(
        f"Sampling demo_orders from validation/test with {len(priority_orders):,} model-win/de-risk rows; "
        f"reserved {len(reserved_preventions):,} Olist-late/model-not-late examples "
        f"out of {len(prevention_orders):,} available; "
        f"risk mix Low/Medium/High = {int(risk_counts['Low']):,}/"
        f"{int(risk_counts['Medium']):,}/{int(risk_counts['High']):,}."
    )
    return out


def stratified_sample(pool: pd.DataFrame, target_rows: int) -> pd.DataFrame:
    if len(pool) <= target_rows:
        return pool.copy()

    # Stratify on state but rank within state by demo usefulness first.
    state_counts = pool["customer_state"].value_counts()
    state_targets = (state_counts / len(pool) * target_rows).round().astype(int).clip(lower=1)

    sampled_parts = []
    remaining = target_rows
    for state, count in state_targets.items():
        if remaining <= 0:
            break
        state_df = pool[pool["customer_state"] == state]
        n = min(int(count), len(state_df), remaining)
        if n <= 0:
            continue
        sort_cols = ["demo_priority_score", "model_improvement_days", TARGET_COL]
        sort_cols = [c for c in sort_cols if c in state_df.columns]
        sampled_parts.append(state_df.sort_values(sort_cols, ascending=[False] * len(sort_cols)).head(n))
        remaining -= n

    sampled = pd.concat(sampled_parts, ignore_index=True) if sampled_parts else pool.head(0)
    if len(sampled) < target_rows:
        used = set(sampled[ORDER_ID_COL])
        fill = pool[~pool[ORDER_ID_COL].isin(used)].sort_values(
            ["demo_priority_score", "model_improvement_days"], ascending=[False, False]
        ).head(target_rows - len(sampled))
        sampled = pd.concat([sampled, fill], ignore_index=True)

    return sampled.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)


# ── Load / annotate data ─────────────────────────────────────────────────────
df = read_final_df(CSV_PATH)
df = add_chronological_split(df)
df, has_model_predictions = add_model_predictions(df)
df = add_demo_diagnostics(df, has_model_predictions)

full_min_date = df[TIME_COL].min().strftime("%Y-%m-%d")
full_max_date = df[TIME_COL].max().strftime("%Y-%m-%d")

demo_df = df[df["split"].isin(DEMO_SPLITS)].copy()
demo_min_date = demo_df[TIME_COL].min().strftime("%Y-%m-%d")
demo_max_date = demo_df[TIME_COL].max().strftime("%Y-%m-%d")

# The UI should default to the same window used for demo examples.
date_range = {
    "min": demo_min_date,
    "max": demo_max_date,
    "basis": "chronological_validation_and_test",
    "full_min": full_min_date,
    "full_max": full_max_date,
}
with open(OUTPUT_DIR / "date_range.json", "w") as f:
    json.dump(date_range, f, indent=2)
print(f"date_range.json: {demo_min_date} → {demo_max_date} ({date_range['basis']})")

# ── demo_catalog.json ────────────────────────────────────────────────────────
# Products use num_items == 1 rows; baskets use num_items >= 3 rows.
base_single_pool = demo_df[
    (demo_df["num_items"] == 1)
    & (demo_df["order_price"].between(15, 500))
    & (demo_df["order_weight"].between(100, 20000))
    & (demo_df[TARGET_COL] > 0)
    & (demo_df[TARGET_COL] <= 45)
].copy()

base_basket_pool = demo_df[
    (demo_df["num_items"] >= 3)
    & (demo_df["num_items"] <= 15)
    & (demo_df["order_price"].between(30, 800))
    & (demo_df[TARGET_COL] > 0)
    & (demo_df[TARGET_COL] <= 45)
].copy()

if has_model_predictions:
    primary_single_pool = base_single_pool[
        base_single_pool["model_better_than_olist"] | base_single_pool["model_prevents_late_surprise"]
    ].copy()
    primary_basket_pool = base_basket_pool[
        base_basket_pool["model_better_than_olist"] | base_basket_pool["model_prevents_late_surprise"]
    ].copy()
else:
    primary_single_pool = base_single_pool
    primary_basket_pool = base_basket_pool

single_sample = reserve_late_prevention_examples(
    primary_single_pool,
    base_single_pool,
    [("Low", 4), ("Medium", 3), ("High", 3)],
    MIN_CATALOG_LATE_PREVENTION_SINGLE if has_model_predictions else 0,
)
basket_sample = reserve_late_prevention_examples(
    primary_basket_pool,
    base_basket_pool,
    [("Low", 1), ("Medium", 2), ("High", 2)],
    MIN_CATALOG_LATE_PREVENTION_BASKET if has_model_predictions else 0,
)

catalog_cols = available_cols(df, BASE_CATALOG_COLS)
catalog = []
for i, (pid, name, emoji, desc) in enumerate(SINGLE_PRODUCTS):
    if i >= len(single_sample):
        break
    row = single_sample.iloc[i]
    entry = {"id": pid, "name": name, "type": "product", "emoji": emoji, "description": desc}
    for col in catalog_cols:
        entry[col] = to_native(row[col])
    catalog.append(entry)

for i, (pid, name, emoji, desc) in enumerate(GIFT_BASKETS):
    if i >= len(basket_sample):
        break
    row = basket_sample.iloc[i]
    entry = {"id": pid, "name": name, "type": "basket", "emoji": emoji, "description": desc}
    for col in catalog_cols:
        entry[col] = to_native(row[col])
    catalog.append(entry)

with open(OUTPUT_DIR / "demo_catalog.json", "w") as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)

catalog_wins = sum(bool(item.get("model_better_than_olist") or item.get("model_prevents_late_surprise")) for item in catalog)
catalog_prevents = sum(bool(item.get("model_prevents_late_surprise")) for item in catalog)
print(
    f"demo_catalog.json: {len(catalog)} items; {catalog_wins} curated model-win examples; "
    f"{catalog_prevents} Olist-late/model-not-late examples"
)

# ── demo_orders.json ─────────────────────────────────────────────────────────
valid_orders = demo_df[(demo_df[TARGET_COL] > 0) & demo_df["customer_state"].notna()].copy()

order_cols = available_cols(df, BASE_ORDER_COLS)

# Keep internal ranking columns, such as demo_priority_score, available during
# sampling. Trim to public JSON columns only after the sample is selected.
demo_orders_sampled = sample_demo_orders_with_reserved_preventions(
    valid_orders,
    TARGET_ROWS,
    has_model_predictions,
)
risk_counts = demo_orders_sampled["risk_group"].value_counts().reindex(["Low", "Medium", "High"], fill_value=0)

demo_orders = demo_orders_sampled[order_cols].copy()
demo_orders[TIME_COL] = pd.to_datetime(demo_orders[TIME_COL]).dt.strftime("%Y-%m-%dT%H:%M:%S")

orders_list = [{k: to_native(v) for k, v in row.items()} for row in demo_orders.to_dict(orient="records")]
with open(OUTPUT_DIR / "demo_orders.json", "w") as f:
    json.dump(orders_list, f, separators=(",", ":"), ensure_ascii=False)

order_wins = demo_orders["model_better_than_olist"].sum() if "model_better_than_olist" in demo_orders else 0
order_prevents = demo_orders["model_prevents_late_surprise"].sum() if "model_prevents_late_surprise" in demo_orders else 0
print(f"demo_orders.json: {len(orders_list):,} rows from {demo_min_date} → {demo_max_date}")
print(f"  model_better_than_olist: {int(order_wins):,}; model_prevents_late_surprise: {int(order_prevents):,}")
print(
    f"  risk mix: Low={int(risk_counts['Low']):,}; "
    f"Medium={int(risk_counts['Medium']):,}; High/Critical={int(risk_counts['High']):,}"
)


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


print(f"\nAll JSON files written to {OUTPUT_DIR}")
