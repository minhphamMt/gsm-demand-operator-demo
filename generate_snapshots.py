"""
T-008: Bộ sinh dữ liệu synthetic — A1 (Snapshot thô)
Đọc config từ: config/zone_registry.json, config/generator.yaml, config/policy.yaml
Output: data/snapshots/snapshot_{split}.parquet (split = train | test)

Chạy: python generate_snapshots.py --split train
      python generate_snapshots.py --split test
"""
import json
import math
import argparse
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yaml


def load_config(base_dir="."):
    with open(f"{base_dir}/config/zone_registry.json", encoding="utf-8") as f:
        zones = json.load(f)
    with open(f"{base_dir}/config/generator.yaml", encoding="utf-8") as f:
        gen_cfg = yaml.safe_load(f)
    with open(f"{base_dir}/config/policy.yaml", encoding="utf-8") as f:
        policy = yaml.safe_load(f)
    return zones, gen_cfg, policy


def is_peak(dt, peak_hours):
    hm = dt.strftime("%H:%M")
    for start, end in peak_hours:
        if start <= hm < end:
            return 1
    return 0


def load_real_rain_series(rain_csv_path, start_month, start_day, n_steps, step_minutes=5):
    """
    Đọc dữ liệu mưa THẬT từ NASA POWER (hourly, đơn vị gốc mm/ngày -> quy đổi mm/giờ),
    cắt đúng đoạn thời gian cần dùng, upsample từ hourly -> 5 phút (lặp giá trị trong giờ).
    """
    df = pd.read_csv(rain_csv_path, skiprows=9)
    df["rain_mm_h"] = df["PRECTOTCORR"] / 24  # NASA POWER hourly: mm/ngày -> mm/giờ thật

    # Tìm vị trí bắt đầu (tháng/ngày trong năm 2025 - năm duy nhất có data thật)
    df["day_idx"] = (pd.to_datetime(dict(year=df["YEAR"], month=df["MO"], day=df["DY"]))
                      - pd.Timestamp("2025-01-01")).dt.days
    start_offset_days = (pd.Timestamp(f"2025-{start_month:02d}-{start_day:02d}") - pd.Timestamp("2025-01-01")).days
    start_hour_idx = start_offset_days * 24

    n_hours_needed = -(-n_steps // (60 // step_minutes))  # ceil
    hourly_slice = df["rain_mm_h"].values[start_hour_idx: start_hour_idx + n_hours_needed]

    # upsample: mỗi giờ lặp lại (60/step_minutes) lần, ví dụ 5 phút -> lặp 12 lần
    steps_per_hour = 60 // step_minutes
    rain_5min = np.repeat(hourly_slice, steps_per_hour)[:n_steps]
    return rain_5min


def generate_rain_series(n_steps, rng, cfg):
    """[Deprecated - giữ lại phòng khi cần fallback synthetic thuần]"""
    rain = np.zeros(n_steps)
    target_pct = cfg["rain"]["target_rain_peak_pct"]
    dur_lo, dur_hi = cfg["rain"]["rain_event_duration_steps_range"]
    int_lo, int_hi = cfg["rain"]["rain_intensity_mm_h_range"]

    n_days = n_steps // 288
    n_events = max(1, int(n_days * target_pct))
    for _ in range(n_events):
        start = rng.integers(0, max(1, n_steps - dur_hi))
        dur = rng.integers(dur_lo, dur_hi + 1)
        intensity = rng.uniform(int_lo, int_hi)
        end = min(n_steps, start + dur)
        length = end - start
        ramp = np.concatenate([
            np.linspace(0, intensity, length // 2),
            np.linspace(intensity, 0, length - length // 2)
        ])
        rain[start:end] = np.maximum(rain[start:end], ramp)
    return rain


def build_snapshot(zones, gen_cfg, policy, split="train"):
    seed = gen_cfg["seed"]["train"] if split == "train" else gen_cfg["seed"]["test"]
    rng = np.random.default_rng(seed)

    n_days = gen_cfg["time"]["days_train"] if split == "train" else gen_cfg["time"]["days_test"]
    steps_per_day = gen_cfg["time"]["steps_per_day"]
    n_steps = n_days * steps_per_day
    step_min = gen_cfg["time"]["step_minutes"]

    if split == "train":
        start_dt = datetime(2026, 6, 1, 0, 0, 0)
    else:
        start_dt = datetime(2026, 7, 13, 0, 0, 0)
    timestamps = [start_dt + timedelta(minutes=step_min * i) for i in range(n_steps)]

    peak_hours = gen_cfg["peak_hours"]
    holiday_cfg = gen_cfg["holiday_injection"]
    baseline = gen_cfg["demand_supply_baseline"]
    rain_cfg = gen_cfg["rain"]

    # ngày lễ giả: inject 1 ngày cố định (ngày thứ 10 trong timeline, tránh ngày đầu/cuối)
    holiday_day_idx = min(10, n_days - 2) if holiday_cfg["enabled"] else -1

    # Dùng data mưa THẬT (NASA POWER 2025) - chọn mùa mưa để đảm bảo đủ sự kiện rain_peak
    # Train: 01/06 - 12/07 (42 ngày, giữa mùa mưa) | Test: 13/07 - 19/07 (7 ngày, nối tiếp ngay sau, không overlap)
    rain_csv = f"{gen_cfg.get('_base_dir', '.')}/data/external/rain_hanoi_2025.csv"
    if split == "train":
        rain_start_month, rain_start_day = 6, 1
    else:
        rain_start_month, rain_start_day = 7, 13
    real_rain = load_real_rain_series(rain_csv, rain_start_month, rain_start_day, n_steps, step_min)
    rain_by_zone = {z["zone_id"]: real_rain for z in zones}
    rows = []

    # Chuẩn hóa population_density về 0-1 (building_density trong zone_registry đã có sẵn thang 0-1)
    pop_densities = [z["population_density"] for z in zones]
    pop_min, pop_max = min(pop_densities), max(pop_densities)

    for zone in zones:
        zid = zone["zone_id"]
        # Kết hợp mật độ dân số (60%) + mật độ tòa nhà (40%) — cả 2 đều chuẩn hóa 0-1
        # Trọng số dân số cao hơn vì đây là driver chính của demand đi lại (khách hàng),
        # building_density bổ sung tín hiệu về khu vực nhiều tòa nhà/văn phòng (điểm đến/đi làm)
        pop_norm = (zone["population_density"] - pop_min) / (pop_max - pop_min)
        build_norm = zone["building_density"]  # đã có sẵn 0-1 trong zone_registry
        combined_score = 0.6 * pop_norm + 0.4 * build_norm

        # Map combined_score (0-1) sang baseline demand/supply hợp lý
        base_d = max(2, 2 + combined_score * 18)   # 2 (thấp nhất) -> 20 (cao nhất)
        base_s = max(2, 2 + combined_score * 14)   # 2 (thấp nhất) -> 16 (cao nhất)
        rain_series = rain_by_zone[zid]

        for i, ts in enumerate(timestamps):
            day_idx = i // steps_per_day
            peak_flag = is_peak(ts, peak_hours)
            holiday_flag = 1 if day_idx == holiday_day_idx else 0

            rain_mm_h = float(rain_series[i])
            rain_fc15 = float(rain_series[min(i + 3, n_steps - 1)])  # +15' = +3 step
            rain_fc30 = float(rain_series[min(i + 6, n_steps - 1)])  # +30' = +6 step

            demand = base_d
            supply = base_s
            if peak_flag:
                demand *= baseline["peak_multiplier_demand"]
                supply *= baseline["peak_multiplier_supply"]
            if holiday_flag:
                demand *= holiday_cfg["holiday_demand_multiplier"]

            # rain injection theo hệ số đã chốt trong contract
            demand *= (1 + rain_cfg["demand_elasticity_per_mm"] * rain_mm_h)
            if peak_flag and rain_mm_h > 0:
                supply *= (1 - rain_cfg["supply_drop_at_peak_rain_pct"])

            noise_pct = baseline["noise_std_pct"]
            demand = max(0, demand * (1 + rng.normal(0, noise_pct)))
            supply = max(0, supply * (1 + rng.normal(0, noise_pct)))

            rows.append({
                "ts_bucket": ts,
                "zone_id": zid,
                "demand_observed": int(round(demand)),
                "idle_supply": int(round(supply)),
                "enroute_supply": 0,  # synthetic thuần: không mô phỏng plan chạy thật trong generator nền
                "rain_mm_h": round(rain_mm_h, 3),
                "rain_forecast_15": round(rain_fc15, 3),
                "rain_forecast_30": round(rain_fc30, 3),
                "peak_flag": peak_flag,
                "holiday_flag": holiday_flag,
                "price_index": gen_cfg["price_index"]["fallback_value"],  # placeholder — chưa có spec pricing
            })

    df = pd.DataFrame(rows)
    return df


def validate(df, zones, n_steps):
    """Kiểm tra quality requirements trong A1."""
    errors = []
    if df.isnull().any().any():
        errors.append("Có giá trị null trong dataframe")
    expected_rows = len(zones) * n_steps
    if len(df) != expected_rows:
        errors.append(f"Số dòng không khớp: {len(df)} != {expected_rows}")
    for zid in df["zone_id"].unique():
        n = len(df[df["zone_id"] == zid])
        if n != n_steps:
            errors.append(f"Zone {zid} thiếu step: {n} != {n_steps}")
    if errors:
        raise ValueError("VALIDATION FAILED:\n" + "\n".join(errors))
    print(f"✅ Validation passed: {len(df)} dòng, {df['zone_id'].nunique()} zone, không null, đủ step.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["train", "test"], default="train")
    parser.add_argument("--base_dir", default=".")
    args = parser.parse_args()

    zones, gen_cfg, policy = load_config(args.base_dir)
    df = build_snapshot(zones, gen_cfg, policy, split=args.split)

    n_days = gen_cfg["time"]["days_train"] if args.split == "train" else gen_cfg["time"]["days_test"]
    n_steps = n_days * gen_cfg["time"]["steps_per_day"]
    validate(df, zones, n_steps)

    out_path = f"{args.base_dir}/data/snapshots/snapshot_{args.split}.parquet"
    import os
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.to_parquet(out_path, index=False)
    print(f"Đã lưu: {out_path} ({len(df)} dòng)")
