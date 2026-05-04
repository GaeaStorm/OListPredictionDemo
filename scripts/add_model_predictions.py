"""
Add LightGBM model predictions to demo_catalog.json, demo_orders.json,
and generate model_performance.json for the UI.
"""
import json, os
import numpy as np
import pandas as pd
import joblib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "olist-demo", "public", "data")
FINAL_DF = os.path.join(ROOT, "final_df.csv")
PREDS_CSV = os.path.join(ROOT, "best_model_test_predictions.csv")
REVIEWS_CSV = os.path.join(ROOT, "content", "brazilian-ecommerce", "olist_order_reviews_dataset.csv")
MODEL_PATH = os.path.join(ROOT, "best_delivery_model.joblib")

# ── Load model ────────────────────────────────────────────────────────────────
bundle = joblib.load(MODEL_PATH)
model       = bundle["model"]
offset_days = bundle["offset_days"]   # 2.95
features    = bundle["features"]

# ── Load final_df (only the columns we need) ─────────────────────────────────
print("Loading final_df…")
df = pd.read_csv(FINAL_DF, usecols=["order_id"] + features + ["delivery_days", "delivery_days_estimated"])
df = df.set_index("order_id")

def predict_for_ids(order_ids):
    """Return dict order_id → predicted_delivery_days for ids present in final_df."""
    sub = df.loc[df.index.intersection(order_ids), features].copy()
    if sub.empty:
        return {}
    preds_raw = model.predict(sub)
    preds = np.maximum(preds_raw + offset_days, 1.0)
    return dict(zip(sub.index.tolist(), preds.tolist()))

# ── 1. demo_catalog.json ──────────────────────────────────────────────────────
print("Updating demo_catalog.json…")
cat_path = os.path.join(DATA_DIR, "demo_catalog.json")
with open(cat_path) as f:
    catalog = json.load(f)

cat_ids = [item["order_id"] for item in catalog]
cat_preds = predict_for_ids(cat_ids)

for item in catalog:
    oid = item["order_id"]
    if oid in cat_preds:
        item["predicted_delivery_days"] = round(cat_preds[oid], 2)
    # Also freshen delivery_days_estimated from final_df if missing
    if oid in df.index and ("delivery_days_estimated" not in item or item["delivery_days_estimated"] is None):
        item["delivery_days_estimated"] = round(float(df.loc[oid, "delivery_days_estimated"]), 2)

with open(cat_path, "w") as f:
    json.dump(catalog, f, separators=(",", ":"))
print(f"  Wrote {len(catalog)} catalog items, {len(cat_preds)} with predictions.")

# ── 2. demo_orders.json ───────────────────────────────────────────────────────
print("Updating demo_orders.json…")
orders_path = os.path.join(DATA_DIR, "demo_orders.json")
with open(orders_path) as f:
    orders = json.load(f)

order_ids = [o["order_id"] for o in orders]
order_preds = predict_for_ids(order_ids)

updated = 0
for o in orders:
    oid = o["order_id"]
    if oid in order_preds:
        o["predicted_delivery_days"] = round(order_preds[oid], 2)
        updated += 1

with open(orders_path, "w") as f:
    json.dump(orders, f, separators=(",", ":"))
print(f"  Wrote {len(orders)} demo orders, {updated} with predictions.")

# ── 3. model_performance.json ─────────────────────────────────────────────────
print("Building model_performance.json…")

preds_df = pd.read_csv(PREDS_CSV)
# Load reviews
reviews = pd.read_csv(REVIEWS_CSV, usecols=["order_id", "review_score"])
# Use median review per order (some orders have multiple)
reviews = reviews.groupby("order_id")["review_score"].median().reset_index()

preds_df = preds_df.merge(reviews, on="order_id", how="left")

P75, P90, P97 = 15.14, 22.56, 34.12

def assign_risk(days):
    if days <= P75: return "Low"
    if days <= P90: return "Medium"
    if days <= P97: return "High"
    return "Critical"

preds_df["risk_actual"] = preds_df["delivery_days"].apply(assign_risk)

def metrics(sub):
    n = len(sub)
    actual  = sub["delivery_days"].values
    olist   = sub["delivery_days_estimated"].values
    model_p = sub["predicted_delivery_days"].values

    def mae(pred): return float(np.mean(np.abs(pred - actual)))
    def pct_late(pred): return float(np.mean(pred < actual) * 100)  # predicted earlier than actual = late surprise
    def pct_within3(pred): return float(np.mean(np.abs(pred - actual) <= 3) * 100)

    avg_score = float(sub["review_score"].mean()) if sub["review_score"].notna().sum() > 0 else None

    return {
        "n": n,
        "olist_mae": round(mae(olist), 2),
        "model_mae": round(mae(model_p), 2),
        "olist_pct_late_surprise": round(pct_late(olist), 1),
        "model_pct_late_surprise": round(pct_late(model_p), 1),
        "olist_pct_within3": round(pct_within3(olist), 1),
        "model_pct_within3": round(pct_within3(model_p), 1),
        "avg_review_score": round(avg_score, 2) if avg_score else None,
    }

overall = metrics(preds_df)
by_risk = {tier: metrics(preds_df[preds_df["risk_actual"] == tier]) for tier in ["Low","Medium","High","Critical"]}

# Review score vs late delivery
preds_df["olist_late"] = preds_df["delivery_days_estimated"] < preds_df["delivery_days"]
preds_df["model_late"] = preds_df["predicted_delivery_days"] < preds_df["delivery_days"]

if preds_df["review_score"].notna().any():
    olist_late_score = float(preds_df[preds_df["olist_late"]]["review_score"].mean())
    olist_ontime_score = float(preds_df[~preds_df["olist_late"]]["review_score"].mean())
    model_late_score = float(preds_df[preds_df["model_late"]]["review_score"].mean())
    model_ontime_score = float(preds_df[~preds_df["model_late"]]["review_score"].mean())
else:
    olist_late_score = olist_ontime_score = model_late_score = model_ontime_score = None

perf = {
    "overall": overall,
    "by_risk": by_risk,
    "review_impact": {
        "olist_late_avg_score": round(olist_late_score, 2) if olist_late_score else None,
        "olist_ontime_avg_score": round(olist_ontime_score, 2) if olist_ontime_score else None,
        "model_late_avg_score": round(model_late_score, 2) if model_late_score else None,
        "model_ontime_avg_score": round(model_ontime_score, 2) if model_ontime_score else None,
        "olist_pct_late": round(float(preds_df["olist_late"].mean() * 100), 1),
        "model_pct_late": round(float(preds_df["model_late"].mean() * 100), 1),
    }
}

out_path = os.path.join(DATA_DIR, "model_performance.json")
with open(out_path, "w") as f:
    json.dump(perf, f, indent=2)

print(f"  Saved model_performance.json")
print(f"  Overall MAE — Olist: {overall['olist_mae']:.2f}d, Model: {overall['model_mae']:.2f}d")
print(f"  Late surprise % — Olist: {overall['olist_pct_late_surprise']:.1f}%, Model: {overall['model_pct_late_surprise']:.1f}%")
if olist_late_score:
    print(f"  Avg review when late — Olist: {olist_late_score:.2f}, Model: {model_late_score:.2f}")
print("Done.")
