"""
Add model predictions and comparison fields to demo_catalog.json and
 demo_orders.json, then generate model_performance.json for the UI.

This version evaluates the same chronological validation + test window used by
build-demo-data.py instead of mixing in the full historical dataset.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "olist-demo" / "public" / "data"

FINAL_DF_CANDIDATES = [ROOT / "final_df_20260503.csv", ROOT / "final_df.csv"]
FINAL_DF = next((p for p in FINAL_DF_CANDIDATES if p.exists()), FINAL_DF_CANDIDATES[-1])
REVIEWS_CSV = ROOT / "content" / "brazilian-ecommerce" / "olist_order_reviews_dataset.csv"
MODEL_PATH = ROOT / "best_delivery_model.joblib"

TIME_COL = "order_purchase_timestamp"
TARGET_COL = "delivery_days"
BASELINE_COL = "delivery_days_estimated"
ORDER_ID_COL = "order_id"

TRAIN_FRAC = 0.60
VAL_FRAC = 0.20
EVAL_SPLITS = {"validation", "test"}
MIN_MODEL_IMPROVEMENT_DAYS = 2.0

EXTRA_COLS = [
    ORDER_ID_COL, TIME_COL, TARGET_COL, BASELINE_COL,
    "customer_city", "customer_state", "num_items", "order_price", "order_weight", "order_volume",
    "max_distance", "purchase_hour", "purchase_dayofweek", "approval_delay_hours",
    "avg_delay_sellers", "avg_cancel_sellers", "avg_delay_product", "avg_cancel_product",
]

ENRICH_COLS = [
    "split", "risk_actual", TARGET_COL, BASELINE_COL, "predicted_delivery_days",
    "olist_abs_error_days", "model_abs_error_days", "model_improvement_days",
    "olist_late_surprise", "model_late_surprise", "model_better_than_olist",
    "model_prevents_late_surprise",
]


def to_native(val):
    if pd.isna(val):
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, np.integer):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return round(float(val), 4)
    if hasattr(val, "item"):
        return val.item()
    return val


def add_chronological_split(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(TIME_COL).reset_index(drop=True).copy()
    n = len(df)
    train_end = int(n * TRAIN_FRAC)
    val_end = int(n * (TRAIN_FRAC + VAL_FRAC))

    split = np.full(n, "test", dtype=object)
    split[:train_end] = "train"
    split[train_end:val_end] = "validation"
    df["split"] = split
    return df


def available_cols(df: pd.DataFrame, cols: Iterable[str]) -> list[str]:
    return [c for c in cols if c in df.columns]


def load_scored_df() -> tuple[pd.DataFrame, dict]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing model artifact: {MODEL_PATH}")

    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"]
    offset_days = float(bundle.get("offset_days", 0.0))
    features = list(bundle["features"])

    header = pd.read_csv(FINAL_DF, nrows=0).columns.tolist()
    usecols = [c for c in dict.fromkeys(EXTRA_COLS + features) if c in header]
    missing_features = [c for c in features if c not in header]
    if missing_features:
        raise ValueError(f"Model artifact expects features missing from final_df: {missing_features}")

    print(f"Loading {FINAL_DF}...")
    df = pd.read_csv(FINAL_DF, usecols=usecols, parse_dates=[TIME_COL])
    df = add_chronological_split(df)

    print(f"Scoring {len(df):,} rows with offset {offset_days:.3f} days...")
    raw_pred = model.predict(df[features])
    df["predicted_delivery_days"] = np.maximum(raw_pred + offset_days, 1.0)

    actual = pd.to_numeric(df[TARGET_COL], errors="coerce")
    baseline = pd.to_numeric(df[BASELINE_COL], errors="coerce")
    pred = pd.to_numeric(df["predicted_delivery_days"], errors="coerce")

    df["olist_abs_error_days"] = (baseline - actual).abs()
    df["model_abs_error_days"] = (pred - actual).abs()
    df["model_improvement_days"] = df["olist_abs_error_days"] - df["model_abs_error_days"]
    df["olist_late_surprise"] = baseline < actual
    df["model_late_surprise"] = pred < actual
    df["model_better_than_olist"] = df["model_improvement_days"] >= MIN_MODEL_IMPROVEMENT_DAYS
    df["model_prevents_late_surprise"] = df["olist_late_surprise"] & ~df["model_late_surprise"]

    valid_delivery = df.loc[df[TARGET_COL] > 0, TARGET_COL]
    p75, p90, p97 = np.percentile(valid_delivery, [75, 90, 97])
    df["risk_actual"] = pd.cut(
        df[TARGET_COL],
        bins=[-np.inf, p75, p90, p97, np.inf],
        labels=["Low", "Medium", "High", "Critical"],
    ).astype(str)

    return df, bundle


def enrich_json_file(path: Path, df_by_id: pd.DataFrame) -> tuple[int, int]:
    if not path.exists():
        print(f"Skipping missing file: {path}")
        return 0, 0

    with open(path) as f:
        rows = json.load(f)

    updated = 0
    for row in rows:
        oid = row.get(ORDER_ID_COL)
        if oid not in df_by_id.index:
            continue
        source = df_by_id.loc[oid]
        if isinstance(source, pd.DataFrame):
            source = source.iloc[0]
        for col in ENRICH_COLS:
            if col in source.index:
                row[col] = to_native(source[col])
        updated += 1

    with open(path, "w") as f:
        json.dump(rows, f, separators=(",", ":"), ensure_ascii=False)

    return len(rows), updated


def asymmetric_mse(y_true, y_pred, late_penalty=5.0, early_penalty=1.0) -> float | None:
    if len(y_true) == 0:
        return None
    error = np.asarray(y_true) - np.asarray(y_pred)
    weights = np.where(error > 0, late_penalty, early_penalty)
    return float(np.mean(weights * error ** 2))


def risk_counts(sub: pd.DataFrame) -> dict:
    if "risk_actual" not in sub.columns or len(sub) == 0:
        return {"Low": 0, "Medium": 0, "High": 0, "Critical": 0, "High/Critical": 0}
    counts = sub["risk_actual"].value_counts()
    high = int(counts.get("High", 0))
    critical = int(counts.get("Critical", 0))
    return {
        "Low": int(counts.get("Low", 0)),
        "Medium": int(counts.get("Medium", 0)),
        "High": high,
        "Critical": critical,
        "High/Critical": high + critical,
    }


def metrics(sub: pd.DataFrame, late_penalty=5.0, early_penalty=1.0) -> dict:
    sub = sub.dropna(subset=[TARGET_COL, BASELINE_COL, "predicted_delivery_days"])
    n = len(sub)
    if n == 0:
        return {
            "n": 0,
            "olist_mae": None,
            "model_mae": None,
            "olist_asymmetric_mse": None,
            "model_asymmetric_mse": None,
            "olist_pct_late_surprise": None,
            "model_pct_late_surprise": None,
            "olist_pct_within3": None,
            "model_pct_within3": None,
            "pct_model_better_abs_error": None,
            "avg_abs_error_improvement_days": None,
            "model_prevents_late_surprise_count": 0,
            "pct_model_prevents_late_surprise": None,
            "avg_review_score": None,
            "risk_counts": risk_counts(sub),
        }

    actual = sub[TARGET_COL].to_numpy(dtype=float)
    olist = sub[BASELINE_COL].to_numpy(dtype=float)
    model_p = sub["predicted_delivery_days"].to_numpy(dtype=float)

    def mae(pred):
        return float(np.mean(np.abs(pred - actual)))

    def pct_late(pred):
        return float(np.mean(pred < actual) * 100)

    def pct_within3(pred):
        return float(np.mean(np.abs(pred - actual) <= 3) * 100)

    avg_score = None
    if "review_score" in sub.columns and sub["review_score"].notna().any():
        avg_score = float(sub["review_score"].mean())

    return {
        "n": int(n),
        "olist_mae": round(mae(olist), 2),
        "model_mae": round(mae(model_p), 2),
        "olist_asymmetric_mse": round(asymmetric_mse(actual, olist, late_penalty, early_penalty), 2),
        "model_asymmetric_mse": round(asymmetric_mse(actual, model_p, late_penalty, early_penalty), 2),
        "olist_pct_late_surprise": round(pct_late(olist), 1),
        "model_pct_late_surprise": round(pct_late(model_p), 1),
        "olist_pct_within3": round(pct_within3(olist), 1),
        "model_pct_within3": round(pct_within3(model_p), 1),
        "pct_model_better_abs_error": round(float((sub["model_abs_error_days"] < sub["olist_abs_error_days"]).mean() * 100), 1),
        "avg_abs_error_improvement_days": round(float(sub["model_improvement_days"].mean()), 2),
        "model_prevents_late_surprise_count": int(sub["model_prevents_late_surprise"].sum()),
        "pct_model_prevents_late_surprise": round(float(sub["model_prevents_late_surprise"].mean() * 100), 1),
        "avg_review_score": round(avg_score, 2) if avg_score is not None else None,
        "risk_counts": risk_counts(sub),
    }


def add_reviews(df: pd.DataFrame) -> pd.DataFrame:
    if not REVIEWS_CSV.exists():
        print(f"Reviews file not found at {REVIEWS_CSV}; review metrics will be null.")
        df = df.copy()
        df["review_score"] = np.nan
        return df

    reviews = pd.read_csv(REVIEWS_CSV, usecols=[ORDER_ID_COL, "review_score"])
    reviews = reviews.groupby(ORDER_ID_COL)["review_score"].median().reset_index()
    return df.merge(reviews, on=ORDER_ID_COL, how="left")


# ── Main ─────────────────────────────────────────────────────────────────────
df, bundle = load_scored_df()
df_by_id = df.drop_duplicates(ORDER_ID_COL).set_index(ORDER_ID_COL)

print("Updating demo_catalog.json...")
cat_total, cat_updated = enrich_json_file(DATA_DIR / "demo_catalog.json", df_by_id)
print(f"  Wrote {cat_total} catalog items, {cat_updated} with predictions/comparison fields.")

print("Updating demo_orders.json...")
orders_total, orders_updated = enrich_json_file(DATA_DIR / "demo_orders.json", df_by_id)
print(f"  Wrote {orders_total} demo orders, {orders_updated} with predictions/comparison fields.")

print("Building model_performance.json from validation + test window...")
perf_df = df[df["split"].isin(EVAL_SPLITS) & (df[TARGET_COL] > 0)].copy()
perf_df = add_reviews(perf_df)

loss_info = bundle.get("loss", {}) if isinstance(bundle, dict) else {}
late_penalty = float(loss_info.get("late_penalty", 5.0))
early_penalty = float(loss_info.get("early_penalty", 1.0))

by_split = {
    split: metrics(perf_df[perf_df["split"] == split], late_penalty, early_penalty)
    for split in ["validation", "test"]
}
by_risk = {
    tier: metrics(perf_df[perf_df["risk_actual"] == tier], late_penalty, early_penalty)
    for tier in ["Low", "Medium", "High", "Critical"]
}

demo_order_ids = []
orders_path = DATA_DIR / "demo_orders.json"
if orders_path.exists():
    with open(orders_path) as f:
        demo_order_ids = [row.get(ORDER_ID_COL) for row in json.load(f)]

demo_orders_perf = perf_df[perf_df[ORDER_ID_COL].isin(demo_order_ids)]

review_impact = {}
for label, flag in [("olist", "olist_late_surprise"), ("model", "model_late_surprise")]:
    late_scores = perf_df.loc[perf_df[flag], "review_score"] if "review_score" in perf_df else pd.Series(dtype=float)
    ontime_scores = perf_df.loc[~perf_df[flag], "review_score"] if "review_score" in perf_df else pd.Series(dtype=float)
    review_impact[f"{label}_late_avg_score"] = round(float(late_scores.mean()), 2) if late_scores.notna().any() else None
    review_impact[f"{label}_ontime_avg_score"] = round(float(ontime_scores.mean()), 2) if ontime_scores.notna().any() else None
    review_impact[f"{label}_pct_late"] = round(float(perf_df[flag].mean() * 100), 1)

perf = {
    "comparison_basis": "chronological_validation_and_test",
    "date_range": {
        "min": perf_df[TIME_COL].min().strftime("%Y-%m-%d"),
        "max": perf_df[TIME_COL].max().strftime("%Y-%m-%d"),
    },
    "model": {
        "name": bundle.get("best_model_name"),
        "offset_days": round(float(bundle.get("offset_days", 0.0)), 3),
        "late_penalty": late_penalty,
        "early_penalty": early_penalty,
    },
    "overall": metrics(perf_df, late_penalty, early_penalty),
    "by_split": by_split,
    "by_risk": by_risk,
    "demo_orders": metrics(demo_orders_perf, late_penalty, early_penalty),
    "review_impact": review_impact,
}

out_path = DATA_DIR / "model_performance.json"
with open(out_path, "w") as f:
    json.dump(perf, f, indent=2, ensure_ascii=False)

print("  Saved model_performance.json")
print(f"  Basis: {perf['comparison_basis']} ({perf['date_range']['min']} → {perf['date_range']['max']})")
print(f"  Overall MAE — Olist: {perf['overall']['olist_mae']}d, Model: {perf['overall']['model_mae']}d")
print(f"  Late surprise % — Olist: {perf['overall']['olist_pct_late_surprise']}%, Model: {perf['overall']['model_pct_late_surprise']}%")
print(f"  Demo orders model-better %: {perf['demo_orders']['pct_model_better_abs_error']}%")
print(
    "  Demo orders Olist-late/model-not-late count: "
    f"{perf['demo_orders']['model_prevents_late_surprise_count']}"
)
print(f"  Demo orders risk counts: {perf['demo_orders']['risk_counts']}")
print("Done.")
