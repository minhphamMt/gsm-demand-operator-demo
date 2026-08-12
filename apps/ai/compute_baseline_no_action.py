"""
T-012 / T0.4: Baseline "no-action" — I-08

Đo hệ thống khi KHÔNG có bất kỳ can thiệp nào (không relocation, không activation).
Đây là mốc so của kịch bản `plan_only` và `plan_activation` (§5.14) và là vế phải của
INV-1: `simulate(moves=[], include_activation=False)` phải khớp file này, sai số ≤ 1e-6.

Chạy: python compute_baseline_no_action.py

Output:
  data/baseline/no_action_metrics.parquet   (zone_id, ts_bucket, unmet, ratio,
                                             avg_wait_proxy, est_cancel_rate, regime)
  data/baseline/no_action_summary.json      (tổng hợp theo 4 regime)

⚠️ Công thức metric KHÔNG được viết ở file này. Mọi số lấy từ src/simulation/metrics.py —
cài lại lần thứ hai làm mọi so sánh KPI mất hiệu lực (§5.14.1, có test tĩnh chặn trong CI).
"""

import hashlib
import json
import subprocess
from datetime import UTC, datetime

import pandas as pd

from src.common.policy import DEFAULT_POLICY_PATH, get_policy
from src.common.regime import REGIMES, rain_threshold, tag_regime
from src.simulation.metrics import avg_wait_proxy, est_cancel_rate, ratio, system_metrics, unmet

SNAPSHOT_PATH = "data/snapshots/snapshot_test.parquet"
BASELINE_DIR = "data/baseline"

# Ngưỡng tỷ lệ gap của luật hotspot §5.3. CHƯA có key trong policy.yaml (19 key hiện tại
# không có gap_ratio_threshold) — đã báo user, chờ quyết định trước khi thêm key.
GAP_RATIO_THRESHOLD = 0.3


def compute_baseline(df, min_supply_per_zone, gap_ratio_threshold=GAP_RATIO_THRESHOLD):
    """Gắn metric no-action cho từng (zone, ts_bucket).

    `supply` ở đây = idle_supply + enroute_supply: xe đang trên đường vẫn là cung của zone
    đích trong kỳ tới. Ở snapshot nền enroute_supply = 0 nên hai cách viết trùng nhau,
    nhưng viết đúng ngay từ baseline thì Simulator không phải lệch định nghĩa về sau.
    """
    df = df.copy()
    supply = df["idle_supply"] + df["enroute_supply"]

    df["gap"] = df["demand_observed"] - supply
    df["unmet"] = [unmet(d, s) for d, s in zip(df["demand_observed"], supply, strict=True)]
    df["ratio"] = [ratio(d, s) for d, s in zip(df["demand_observed"], supply, strict=True)]
    # avg_wait_proxy gọi qua metrics; không viết lại 3.0 × ratio^1.5 ở đây.
    df["avg_wait_proxy"] = [avg_wait_proxy(r) for r in df["ratio"]]
    df["est_cancel_rate"] = [est_cancel_rate(w) for w in df["avg_wait_proxy"]]

    df["is_hotspot_baseline"] = (supply < min_supply_per_zone) | (
        df["gap"] / df["demand_observed"].replace(0, 1) >= gap_ratio_threshold
    )
    threshold = rain_threshold()
    df["regime"] = [tag_regime(r, p, threshold) for r, p in zip(df["rain_mm_h"], df["peak_flag"], strict=True)]
    return df


def summarize(df):
    """Tổng hợp theo 4 regime — `rain_peak` không được giấu trong số tổng (§3 #6)."""
    overall = system_metrics(zip(df["demand_observed"], df["idle_supply"] + df["enroute_supply"], strict=True))

    by_regime = []
    for name in REGIMES:
        sub = df[df["regime"] == name]
        if sub.empty:
            # Vẫn xuất dòng: regime vắng mặt là thông tin, không phải lý do bỏ khỏi bảng.
            by_regime.append(
                {
                    "regime": name,
                    "n_steps": 0,
                    "unmet_demand": 0.0,
                    "avg_wait_proxy": 0.0,
                    "est_cancel_rate": 0.0,
                    "avg_gap": 0.0,
                    "hotspot_rate": 0.0,
                }
            )
            continue
        m = system_metrics(zip(sub["demand_observed"], sub["idle_supply"] + sub["enroute_supply"], strict=True))
        by_regime.append(
            {
                "regime": name,
                "n_steps": int(len(sub)),
                "unmet_demand": round(float(m.unmet_demand), 6),
                "avg_wait_proxy": round(float(m.avg_wait_proxy), 6),
                "est_cancel_rate": round(float(m.est_cancel_rate), 6),
                "avg_gap": round(float(sub["gap"].mean()), 6),
                "hotspot_rate": round(float(sub["is_hotspot_baseline"].mean()), 6),
            }
        )

    return {
        "scenario": "no_action",
        "source_snapshot": SNAPSHOT_PATH,
        "rain_threshold_mm_h": rain_threshold(),
        "total_steps": int(len(df)),
        "overall": {
            "unmet_demand": round(float(overall.unmet_demand), 6),
            "avg_wait_proxy": round(float(overall.avg_wait_proxy), 6),
            "est_cancel_rate": round(float(overall.est_cancel_rate), 6),
            "total_demand": round(float(overall.total_demand), 6),
            "hotspot_rate": round(float(df["is_hotspot_baseline"].mean()), 6),
        },
        "by_regime": by_regime,
    }


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha1(path):
    """SHA-1 blob của file theo cách git tính — định danh nội dung metrics.py khi chưa commit."""
    try:
        out = subprocess.run(["git", "hash-object", path], capture_output=True, text=True, check=True, encoding="utf-8")
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


if __name__ == "__main__":
    policy = get_policy(DEFAULT_POLICY_PATH)
    min_supply = policy.rules.min_supply_per_zone

    df_test = pd.read_parquet(SNAPSHOT_PATH)
    df_baseline = compute_baseline(df_test, min_supply)
    result = summarize(df_baseline)

    metrics_path = f"{BASELINE_DIR}/no_action_metrics.parquet"
    cols = ["zone_id", "ts_bucket", "unmet", "ratio", "avg_wait_proxy", "est_cancel_rate", "regime"]
    df_baseline[cols].to_parquet(metrics_path, index=False)

    result["artifacts"] = {
        "no_action_metrics.parquet": {"rows": int(len(df_baseline)), "sha256": sha256_of(metrics_path)},
        "snapshot_test.parquet": {"sha256": sha256_of(SNAPSHOT_PATH)},
        "src/simulation/metrics.py": {"git_blob_sha1": git_blob_sha1("src/simulation/metrics.py")},
    }
    result["computed_at"] = datetime.now(UTC).astimezone().isoformat(timespec="seconds")

    print(json.dumps(result, ensure_ascii=False, indent=2))

    with open(f"{BASELINE_DIR}/no_action_summary.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nĐã lưu: {metrics_path}\nĐã lưu: {BASELINE_DIR}/no_action_summary.json")
