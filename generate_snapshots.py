"""
T-008 / T0.4: Bộ sinh dữ liệu synthetic — A1 (Snapshot thô)

Đọc config từ: config/zone_registry.json, config/generator.yaml
Ngưỡng mưa lấy qua src/common/regime.py (nguồn duy nhất), KHÔNG viết cứng ở đây.
Output: data/snapshots/snapshot_{split}.parquet (split = train | test)
        data/test_set/ (bản đóng băng của split test + manifest SHA-256)

Chạy: python generate_snapshots.py --split train
      python generate_snapshots.py --split test

⚠️ Ghi đè dữ liệu đã khóa. §5.14.3 buộc tính lại TOÀN BỘ số đã công bố sau mỗi lần chạy.

Những gì T0.4 thay đổi so với bản trước (nợ dữ liệu D1–D5, D7, D11, D12):
  D1  xuất Parquet (bản cũ trên đĩa là CSV)
  D2  thêm cột enroute_arrivals, kiểu list<struct>, khởi tạo [] — không bao giờ null
  D4  mưa biến thiên theo zone (dải mưa quét qua thành phố) thay vì broadcast một chuỗi
  D7  đường cong 24 giờ cho cả cầu lẫn cung, thay cho hai hệ số nhân theo peak_flag
  D11 dải cường độ mưa khai trong config khớp nguồn thật
  A-05 ngưỡng mưa >= 0.5 mm/h dùng chung qua tag_regime()
  A-06 rain_forecast_15/30 có sai số nowcast + p_miss, hết "dự báo hoàn hảo"
"""

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from src.common.regime import rain_threshold, tag_regime

TZ_ICT = timezone(timedelta(hours=7))

# Kiểu của enroute_arrivals theo DATA_CONTRACT §2.1 (EnrouteArrival). Khai báo tường minh
# vì cột toàn list rỗng: để pyarrow tự suy sẽ ra list<null> và đọc lại mất cấu trúc.
ARRIVAL_STRUCT = pa.struct(
    [
        pa.field("arrival_ts", pa.timestamp("us", tz="+07:00")),
        pa.field("eta_steps", pa.int32()),
        pa.field("units", pa.int32()),
        pa.field("source", pa.string()),
        pa.field("from_zone", pa.int32()),
    ]
)

SNAPSHOT_SCHEMA = pa.schema(
    [
        pa.field("ts_bucket", pa.timestamp("us", tz="+07:00")),
        pa.field("zone_id", pa.int32()),
        pa.field("demand_observed", pa.int32()),
        pa.field("idle_supply", pa.int32()),
        pa.field("enroute_supply", pa.int32()),
        pa.field("enroute_arrivals", pa.list_(ARRIVAL_STRUCT)),
        pa.field("rain_mm_h", pa.float64()),
        pa.field("rain_forecast_15", pa.float64()),
        pa.field("rain_forecast_30", pa.float64()),
        pa.field("peak_flag", pa.int32()),
        pa.field("holiday_flag", pa.int32()),
        pa.field("price_index", pa.float64()),
    ]
)


def load_config(base_dir="."):
    """Đọc zone registry + tham số generator.

    KHÔNG đọc config/policy.yaml: generator không dùng ngưỡng vận hành nào, và §3 #2
    chỉ cho src/common/policy.py chạm file đó. Ngưỡng mưa vào đây qua rain_threshold().
    """
    with open(f"{base_dir}/config/zone_registry.json", encoding="utf-8") as f:
        zones = json.load(f)
    with open(f"{base_dir}/config/generator.yaml", encoding="utf-8") as f:
        gen_cfg = yaml.safe_load(f)
    return zones, gen_cfg


def is_peak(dt, peak_hours):
    hm = dt.strftime("%H:%M")
    for start, end in peak_hours:
        if start <= hm < end:
            return 1
    return 0


def normalized_curve(values):
    """Chuẩn hóa đường cong 24 giờ về trung bình = 1.

    Nhờ vậy sửa hình dạng một giờ không kéo theo trôi tổng lượng cả ngày — nếu không,
    mỗi lần tinh chỉnh đường cong lại làm lệch mức nền và mọi số baseline phải tính lại.
    """
    arr = np.asarray(values, dtype=float)
    if arr.shape != (24,):
        raise ValueError(f"Đường cong phải có đúng 24 giá trị, đang có {arr.shape}")
    return arr / arr.mean()


def load_real_rain_series(rain_csv_path, start_month, start_day, n_steps, step_minutes=5):
    """
    Đọc dữ liệu mưa THẬT từ NASA POWER (hourly, đơn vị gốc mm/ngày -> quy đổi mm/giờ),
    cắt đúng đoạn thời gian cần dùng, upsample từ hourly -> 5 phút (lặp giá trị trong giờ).
    """
    df = pd.read_csv(rain_csv_path, skiprows=9)
    df["rain_mm_h"] = df["PRECTOTCORR"] / 24  # NASA POWER hourly: mm/ngày -> mm/giờ thật

    # Tìm vị trí bắt đầu (tháng/ngày trong năm 2025 - năm duy nhất có data thật)
    df["day_idx"] = (
        pd.to_datetime(dict(year=df["YEAR"], month=df["MO"], day=df["DY"])) - pd.Timestamp("2025-01-01")
    ).dt.days
    start_offset_days = (pd.Timestamp(f"2025-{start_month:02d}-{start_day:02d}") - pd.Timestamp("2025-01-01")).days
    start_hour_idx = start_offset_days * 24

    n_hours_needed = -(-n_steps // (60 // step_minutes))  # ceil
    hourly_slice = df["rain_mm_h"].values[start_hour_idx : start_hour_idx + n_hours_needed]
    if len(hourly_slice) < n_hours_needed:
        raise ValueError(
            f"Nguồn mưa không đủ dài: cần {n_hours_needed} giờ từ {start_month:02d}-{start_day:02d}, "
            f"chỉ có {len(hourly_slice)}"
        )

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
        ramp = np.concatenate([np.linspace(0, intensity, length // 2), np.linspace(intensity, 0, length - length // 2)])
        rain[start:end] = np.maximum(rain[start:end], ramp)
    return rain


def spatial_rain_factors(zones, n_steps, step_minutes, spatial_cfg):
    """Hệ số mưa theo (zone, step) — mô hình dải mưa quét qua thành phố [D4].

    Trả ma trận [n_zones, n_steps]. Trung bình theo zone tại mọi step = 1 (trước khi kẹp),
    nên tổng lượng mưa toàn thành phố vẫn đúng bằng chuỗi NASA; chỉ phân bố không gian đổi.

    Vì sao không dùng hệ số tĩnh mỗi zone: hệ số tĩnh chỉ làm vài zone mưa nhiều kinh niên,
    vẫn không tạo ra cảnh "nửa thành phố mưa, nửa kia khô" tại cùng một thời điểm — mà đó
    mới là điều kiện để Optimizer có zone dư xe để rút (hệ quả nêu ở D4).
    """
    n_zones = len(zones)
    if not spatial_cfg.get("enabled", False):
        return np.ones((n_zones, n_steps))

    lat = np.array([z["lat"] for z in zones], dtype=float)
    lng = np.array([z["lng"] for z in zones], dtype=float)

    # Toạ độ chuẩn hóa, căn tâm để tổng theo zone bằng 0 -> trung bình hệ số bằng 1.
    x = 2 * (lng - lng.min()) / (lng.max() - lng.min()) - 1
    y = 2 * (lat - lat.min()) / (lat.max() - lat.min()) - 1
    x -= x.mean()
    y -= y.mean()
    scale = float(np.sqrt(x**2 + y**2).max())
    x, y = x / scale, y / scale

    minutes = np.arange(n_steps, dtype=float) * step_minutes
    theta = 2 * np.pi * minutes / (spatial_cfg["rotation_period_hours"] * 60.0)

    u = np.outer(x, np.cos(theta)) + np.outer(y, np.sin(theta))  # [n_zones, n_steps], |u| <= 1
    lo, hi = spatial_cfg["factor_range"]
    return np.clip(1.0 + spatial_cfg["amplitude"] * u, lo, hi)


def find_rain_events(is_rain):
    """Chuỗi step mưa liên tiếp -> danh sách (start, end) nửa mở. Dùng cho p_miss [D12]."""
    events = []
    start = None
    for i, flag in enumerate(is_rain):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            events.append((start, i))
            start = None
    if start is not None:
        events.append((start, len(is_rain)))
    return events


def apply_nowcast(rain_true, rng, threshold, horizon_steps, sigma_rel, sigma_abs, p_miss):
    """Sinh rain_forecast của MỘT zone từ chuỗi mưa thật của zone đó [A-06, DATA_CONTRACT §7].

        forecast(t) = max(0, rain_true(t + h) × (1 + ε_rel) + ε_abs)

    Số hạng CỘNG là bắt buộc: chỉ có nhiễu nhân thì rain_true = 0 ⇒ forecast = 0, và model
    vẫn học được luật hoàn hảo "forecast > 0 ⟺ sắp mưa" — dự báo hoàn hảo trá hình.

    p_miss bỏ sót TRỌN một sự kiện mưa chứ không phải một step lẻ: sai số Gaussian không
    mô phỏng được kiểu hỏng nguy hiểm nhất của nowcasting là mất hẳn tín hiệu.

    Trả (forecast, số sự kiện bị bỏ sót).
    """
    n = len(rain_true)
    idx = np.minimum(np.arange(n) + horizon_steps, n - 1)
    target = rain_true[idx]

    forecast = np.maximum(0.0, target * (1.0 + rng.normal(0.0, sigma_rel, n)) + rng.normal(0.0, sigma_abs, n))

    missed = 0
    for start, end in find_rain_events(rain_true >= threshold):
        if rng.random() >= p_miss:
            continue
        # Mọi step i có đích i+h rơi vào sự kiện -> i ∈ [start-h, end-h)
        lo = max(0, start - horizon_steps)
        hi = max(0, end - horizon_steps)
        forecast[lo:hi] = 0.0
        missed += 1
    return forecast, missed


def build_snapshot(zones, gen_cfg, split="train", base_dir="."):
    seed = gen_cfg["seed"]["train"] if split == "train" else gen_cfg["seed"]["test"]
    rng = np.random.default_rng(seed)
    # Seed nowcast độc lập seed split: đổi độ nhiễu dự báo không được làm xáo trộn
    # chuỗi nhiễu demand/supply, nếu không mọi số đã công bố lệch theo mà không rõ vì sao.
    rng_nowcast = np.random.default_rng(gen_cfg["rain"]["nowcast"]["seed"])

    n_days = gen_cfg["time"]["days_train"] if split == "train" else gen_cfg["time"]["days_test"]
    steps_per_day = gen_cfg["time"]["steps_per_day"]
    n_steps = n_days * steps_per_day
    step_min = gen_cfg["time"]["step_minutes"]

    rain_cfg = gen_cfg["rain"]
    window = rain_cfg["source_window"][split]
    # Timestamp 2026 dùng CÙNG ngày/tháng với cửa sổ mưa 2025 để mùa vụ khớp nhau.
    start_dt = datetime(2026, window["start_month"], window["start_day"], 0, 0, 0, tzinfo=TZ_ICT)
    timestamps = [start_dt + timedelta(minutes=step_min * i) for i in range(n_steps)]

    peak_hours = gen_cfg["peak_hours"]
    holiday_cfg = gen_cfg["holiday_injection"]
    baseline = gen_cfg["demand_supply_baseline"]
    nowcast_cfg = rain_cfg["nowcast"]
    threshold = rain_threshold()

    curve_d = normalized_curve(baseline["hourly_curve_demand"])
    curve_s = normalized_curve(baseline["hourly_curve_supply"])

    hours = np.array([ts.hour for ts in timestamps])
    peak_flags = np.array([is_peak(ts, peak_hours) for ts in timestamps], dtype=int)
    # ngày lễ giả: inject 1 ngày cố định (ngày thứ 10 trong timeline, tránh ngày đầu/cuối)
    holiday_day_idx = min(10, n_days - 2) if holiday_cfg["enabled"] else -1
    holiday_flags = (np.arange(n_steps) // steps_per_day == holiday_day_idx).astype(int)

    rain_csv = f"{base_dir}/data/external/rain_hanoi_2025.csv"
    city_rain = load_real_rain_series(rain_csv, window["start_month"], window["start_day"], n_steps, step_min)
    factors = spatial_rain_factors(zones, n_steps, step_min, rain_cfg["spatial"])

    # Chuẩn hóa hai điểm số nền về 0-1 (building_density trong zone_registry đã sẵn 0-1)
    pop = np.array([z["population_density"] for z in zones], dtype=float)
    build = np.array([z["building_density"] for z in zones], dtype=float)
    pop_norm = (pop - pop.min()) / (pop.max() - pop.min())
    w_d = baseline["demand_score_weights"]
    w_s = baseline["supply_score_weights"]
    score_d = w_d["population"] * pop_norm + w_d["building"] * build
    score_s = w_s["population"] * pop_norm + w_s["building"] * build

    d_lo, d_hi = baseline["base_demand_range"]
    s_lo, s_hi = baseline["base_supply_range"]
    noise_pct = baseline["noise_std_pct"]

    frames = []
    missed_15 = missed_30 = 0

    for zi, zone in enumerate(zones):
        zone_rain = np.round(city_rain * factors[zi], 3)

        fc15, m15 = apply_nowcast(
            zone_rain,
            rng_nowcast,
            threshold,
            horizon_steps=3,  # +15 phút = 3 step
            sigma_rel=nowcast_cfg["sigma_rel_15"],
            sigma_abs=nowcast_cfg["sigma_abs_15"],
            p_miss=nowcast_cfg["p_miss_15"],
        )
        fc30, m30 = apply_nowcast(
            zone_rain,
            rng_nowcast,
            threshold,
            horizon_steps=6,  # +30 phút = 6 step
            sigma_rel=nowcast_cfg["sigma_rel_30"],
            sigma_abs=nowcast_cfg["sigma_abs_30"],
            p_miss=nowcast_cfg["p_miss_30"],
        )
        missed_15 += m15
        missed_30 += m30

        base_d = d_lo + score_d[zi] * (d_hi - d_lo)
        base_s = s_lo + score_s[zi] * (s_hi - s_lo)

        demand = base_d * curve_d[hours]
        supply = base_s * curve_s[hours]

        demand = demand * (1 + holiday_flags * (holiday_cfg["holiday_demand_multiplier"] - 1))
        demand = demand * (1 + rain_cfg["demand_elasticity_per_mm"] * zone_rain)

        # Cung sụt khi zone ở regime rain_peak. Dùng tag_regime để chỉ có MỘT định nghĩa
        # "mưa" trong toàn hệ thống (§3 #6) — bản cũ dùng rain_mm_h > 0 ở ngay đây.
        is_rain_peak = np.array(
            [tag_regime(r, p, threshold) == "rain_peak" for r, p in zip(zone_rain, peak_flags, strict=True)]
        )
        supply = np.where(is_rain_peak, supply * (1 - rain_cfg["supply_drop_at_peak_rain_pct"]), supply)

        demand = np.maximum(0, demand * (1 + rng.normal(0, noise_pct, n_steps)))
        supply = np.maximum(0, supply * (1 + rng.normal(0, noise_pct, n_steps)))

        frames.append(
            pd.DataFrame(
                {
                    "ts_bucket": timestamps,
                    "zone_id": np.int32(zone["zone_id"]),
                    "demand_observed": np.round(demand).astype(np.int32),
                    "idle_supply": np.round(supply).astype(np.int32),
                    # Generator nền không mô phỏng plan chạy thật: chưa có xe nào đang đến.
                    # INV-3 (enroute_supply == Σ enroute_arrivals[].units) thỏa ở dạng 0 == 0.
                    "enroute_supply": np.int32(0),
                    "enroute_arrivals": [[] for _ in range(n_steps)],
                    "rain_mm_h": zone_rain,
                    "rain_forecast_15": np.round(fc15, 3),
                    "rain_forecast_30": np.round(fc30, 3),
                    "peak_flag": peak_flags.astype(np.int32),
                    "holiday_flag": holiday_flags.astype(np.int32),
                    "price_index": float(gen_cfg["price_index"]["fallback_value"]),
                }
            )
        )

    df = pd.concat(frames, ignore_index=True)
    return df, {"missed_events_15": missed_15, "missed_events_30": missed_30}


def count_rain_peak_events(df, threshold):
    """[D12] Định nghĩa chốt: MỘT sự kiện rain_peak = một chuỗi ts_bucket LIÊN TIẾP mà
    có ít nhất một zone ở regime rain_peak. Chuỗi đứt khi có step không zone nào rain_peak.

    Bản cũ ghi `rain_peak_events_verified: 41` — đó là số STEP, không phải số sự kiện,
    nên acceptance "≥ 2 sự kiện" của §5.14.1 không kiểm được.
    """
    flags = (
        df.assign(is_rp=(df["rain_mm_h"] >= threshold) & (df["peak_flag"] == 1))
        .groupby("ts_bucket")["is_rp"]
        .any()
        .sort_index()
        .values
    )
    return len(find_rain_events(flags)), int(flags.sum())


def pick_sample_windows(df, threshold, window_steps=4):
    """Chọn 4 cửa sổ thời gian đại diện cho sample — tất định, không seed.

    Bốn cửa sổ thay vì cắt `head()`: 30 dòng đầu của snapshot luôn rơi vào 00:00 khô ráo,
    nhìn vào đó không thấy được thứ cần kiểm (mưa lệch giữa zone, nhiễu nowcast, sụt cung
    khi rain_peak). Mỗi cửa sổ ứng một regime, nên mở sample ra là thấy đủ cả 4.

    Trả danh sách ts_bucket đã sắp xếp.
    """
    steps = df.groupby("ts_bucket").agg(
        rain_max=("rain_mm_h", "max"),
        rain_sum=("rain_mm_h", "sum"),
        peak=("peak_flag", "max"),
    )
    steps = steps.sort_index()
    index = steps.index

    def window_from(pos):
        start = max(0, min(pos - window_steps // 2, len(index) - window_steps))
        return list(index[start : start + window_steps])

    picked = []

    # 1) normal — khô, ngoài cao điểm: lấy step khô đầu tiên tìm được.
    quiet = steps[(steps["rain_max"] < threshold) & (steps["peak"] == 0)]
    if len(quiet):
        picked += window_from(index.get_loc(quiet.index[0]))

    # 2) peak khô — cho thấy đường cong 24h đẩy cầu lên mà không có mưa.
    dry_peak = steps[(steps["rain_max"] < threshold) & (steps["peak"] == 1)]
    if len(dry_peak):
        picked += window_from(index.get_loc(dry_peak.index[0]))

    # 3) rain ngoài cao điểm — mưa to nhất trong nhóm này, để thấy mưa lệch giữa zone
    #    mà không lẫn với hiệu ứng cao điểm.
    rain_off_peak = steps[(steps["rain_max"] >= threshold) & (steps["peak"] == 0)]
    if len(rain_off_peak):
        picked += window_from(index.get_loc(rain_off_peak["rain_sum"].idxmax()))

    # 4) rain_peak nặng nhất — chỗ duy nhất thấy được cung sụt 30% và mưa lệch giữa zone.
    rain_peak = steps[(steps["rain_max"] >= threshold) & (steps["peak"] == 1)]
    if len(rain_peak):
        picked += window_from(index.get_loc(rain_peak["rain_sum"].idxmax()))

    return sorted(set(picked))


def write_sample(df, out_path, threshold):
    """Ghi bản xem nhanh dạng CSV — Parquet không mở được bằng Notepad/Excel.

    Sample là **bản trích**, không phải nguồn dữ liệu: mọi module phải đọc .parquet.
    Cột `regime` ở cuối là cột SUY RA từ (rain_mm_h, peak_flag) để dễ đọc, KHÔNG có
    trong contract §4.1 — xem data/snapshots/README.md.
    """
    windows = pick_sample_windows(df, threshold)
    sample = df[df["ts_bucket"].isin(windows)].copy()
    sample = sample.sort_values(["ts_bucket", "zone_id"])
    sample["enroute_arrivals"] = "[]"  # list rỗng -> ký hiệu đọc được trong CSV
    sample["regime"] = [
        tag_regime(r, p, threshold) for r, p in zip(sample["rain_mm_h"], sample["peak_flag"], strict=True)
    ]
    sample.to_csv(out_path, index=False, encoding="utf-8-sig")  # BOM để Excel đọc đúng tiếng Việt
    return len(sample), len(windows)


def validate(df, zones, n_steps, threshold):
    """Kiểm tra quality requirements trong A1 + các bất biến contract §4.1."""
    errors = []
    if df.drop(columns=["enroute_arrivals"]).isnull().any().any():
        errors.append("Có giá trị null trong dataframe")
    expected_rows = len(zones) * n_steps
    if len(df) != expected_rows:
        errors.append(f"Số dòng không khớp: {len(df)} != {expected_rows}")
    for zid in df["zone_id"].unique():
        n = len(df[df["zone_id"] == zid])
        if n != n_steps:
            errors.append(f"Zone {zid} thiếu step: {n} != {n_steps}")
    for col in ("rain_mm_h", "rain_forecast_15", "rain_forecast_30", "demand_observed", "idle_supply"):
        if (df[col] < 0).any():
            errors.append(f"{col} có giá trị âm — vi phạm validation §4.1")
    if df["enroute_arrivals"].isnull().any():
        errors.append("enroute_arrivals có null — contract §4.1 cấm null, phải là []")
    # INV-3 ở mức generator: chưa có xe đang đến thì enroute_supply phải bằng 0
    bad_inv3 = df[df["enroute_supply"] != df["enroute_arrivals"].apply(len)]
    if len(bad_inv3):
        errors.append(f"INV-3 vỡ ở {len(bad_inv3)} dòng: enroute_supply != Σ enroute_arrivals[].units")
    if errors:
        raise ValueError("VALIDATION FAILED:\n" + "\n".join(errors))

    n_events, n_rp_steps = count_rain_peak_events(df, threshold)
    print(f"✅ Validation passed: {len(df)} dòng, {df['zone_id'].nunique()} zone, không null, đủ step.")
    return n_events, n_rp_steps


def write_parquet(df, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    table = pa.Table.from_pandas(df, schema=SNAPSHOT_SCHEMA, preserve_index=False)
    pq.write_table(table, out_path)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def report(df, threshold, n_events, n_rp_steps, nowcast_stats):
    """In các số mà Acceptance Criteria T0.4 đòi — để chạy xong là đọc được ngay."""
    labels = [tag_regime(r, p, threshold) for r, p in zip(df["rain_mm_h"], df["peak_flag"], strict=True)]
    dist = pd.Series(labels).value_counts()
    print(f"\nPhân bố regime (ngưỡng mưa >= {threshold:.2f} mm/h):")
    for name in ("normal", "peak", "rain", "rain_peak"):
        n = int(dist.get(name, 0))
        print(f"  {name:<10} {n:>8} step  ({n / len(df) * 100:5.2f}%)")

    print(f"\nSự kiện rain_peak: {n_events} (số step có ít nhất 1 zone rain_peak: {n_rp_steps})")

    rainy = df[df["rain_mm_h"] >= threshold]
    if len(rainy):
        differ = (rainy["rain_forecast_15"] != rainy["rain_mm_h"]).mean()
        print(f"Nowcast: rain_forecast_15 != rain_mm_h ở {differ * 100:.2f}% dòng có mưa ({len(rainy)} dòng)")
    print(
        f"Sự kiện mưa bị p_miss bỏ sót trọn vẹn: {nowcast_stats['missed_events_15']} (15') / "
        f"{nowcast_stats['missed_events_30']} (30')"
    )
    print(f"Mưa: max={df['rain_mm_h'].max():.3f} mm/h, số zone khác nhau tại 1 step = biến thiên không gian đã bật")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["train", "test"], default="train")
    parser.add_argument("--base_dir", default=".")
    args = parser.parse_args()

    zones, gen_cfg = load_config(args.base_dir)
    df, nowcast_stats = build_snapshot(zones, gen_cfg, split=args.split, base_dir=args.base_dir)

    n_days = gen_cfg["time"]["days_train"] if args.split == "train" else gen_cfg["time"]["days_test"]
    n_steps = n_days * gen_cfg["time"]["steps_per_day"]
    threshold = rain_threshold()
    n_events, n_rp_steps = validate(df, zones, n_steps, threshold)

    out_path = f"{args.base_dir}/data/snapshots/snapshot_{args.split}.parquet"
    write_parquet(df, out_path)
    print(f"Đã lưu: {out_path} ({len(df)} dòng)")

    sample_path = f"{args.base_dir}/data/snapshots/sample_snapshot_{args.split}.csv"
    n_rows, n_windows = write_sample(df, sample_path, threshold)
    print(f"Đã lưu: {sample_path} ({n_rows} dòng = {n_windows} step × {df['zone_id'].nunique()} zone)")

    report(df, threshold, n_events, n_rp_steps, nowcast_stats)

    if args.split == "test":
        # [D5] data/test_set/ là bản ĐÓNG BĂNG, tách khỏi thư mục làm việc data/snapshots/.
        frozen_dir = f"{args.base_dir}/data/test_set"
        os.makedirs(frozen_dir, exist_ok=True)
        frozen_path = f"{frozen_dir}/snapshot_test.parquet"
        shutil.copyfile(out_path, frozen_path)
        manifest = {
            "source": "generate_snapshots.py --split test",
            "seed": gen_cfg["seed"]["test"],
            "seed_nowcast": gen_cfg["rain"]["nowcast"]["seed"],
            "rows": int(len(df)),
            "zones": int(df["zone_id"].nunique()),
            "ts_start": df["ts_bucket"].min().isoformat(),
            "ts_end": df["ts_bucket"].max().isoformat(),
            "rain_threshold_mm_h": threshold,
            "rain_peak_events": int(n_events),
            "rain_peak_steps": int(n_rp_steps),
            "sha256": sha256_of(frozen_path),
        }
        with open(f"{frozen_dir}/manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"Đã đóng băng: {frozen_path}\nSHA-256: {manifest['sha256']}")
