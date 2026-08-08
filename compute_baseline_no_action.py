"""
T-012 (phần baseline): Baseline "no-action" — I-08
Đo gap (demand - supply) khi KHÔNG có bất kỳ can thiệp/relocation nào.
Đây là mốc so sánh (uplift) cho optimizer ở Sprint 5+.

Chạy: python compute_baseline_no_action.py
"""
import pandas as pd
import yaml
import json


def load_policy(base_dir="."):
    with open(f"{base_dir}/config/policy.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def compute_baseline(df, min_supply_per_zone, gap_ratio_threshold=0.3):
    """
    Baseline no-action: gap thực tế mỗi (zone, ts) khi không điều chỉnh gì.
    Dùng đúng công thức hotspot đã chốt để xác định zone nào là hotspot
    ngay cả khi không can thiệp -> đây là con số optimizer PHẢI cải thiện được.
    """
    df = df.copy()
    df["gap"] = df["demand_observed"] - df["idle_supply"]
    df["is_hotspot_baseline"] = (
        (df["idle_supply"] < min_supply_per_zone)
        | (df["gap"] / df["demand_observed"].replace(0, 1) >= gap_ratio_threshold)
    )
    return df


def summarize(df):
    total_steps = len(df)
    hotspot_steps = df["is_hotspot_baseline"].sum()
    hotspot_rate = hotspot_steps / total_steps

    # regime tag đơn giản dùng peak_flag + rain_mm_h > 0 (khớp quy ước A3: normal/peak/rain/rain_peak)
    def regime(row):
        p = row["peak_flag"] == 1
        r = row["rain_mm_h"] > 0
        if p and r:
            return "rain_peak"
        if p:
            return "peak"
        if r:
            return "rain"
        return "normal"

    df["regime"] = df.apply(regime, axis=1)
    by_regime = df.groupby("regime").agg(
        avg_gap=("gap", "mean"),
        hotspot_rate=("is_hotspot_baseline", "mean"),
        n_steps=("gap", "count"),
    ).reset_index()

    return {
        "overall_hotspot_rate_no_action": round(float(hotspot_rate), 4),
        "total_steps": int(total_steps),
        "by_regime": by_regime.to_dict(orient="records"),
    }


if __name__ == "__main__":
    policy = load_policy()
    min_supply = policy["rules"]["min_supply_per_zone"]["value"]

    df_test = pd.read_parquet("data/snapshots/snapshot_test.parquet")
    df_baseline = compute_baseline(df_test, min_supply)
    result = summarize(df_baseline)

    print(json.dumps(result, ensure_ascii=False, indent=2))

    with open("data/baseline/no_action_summary.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\nĐã lưu: data/baseline/no_action_summary.json")
