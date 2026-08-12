"""
T0.6: Bộ sinh đội tài xế demo — config/driver_registry.json + dataset A6.

Đọc config từ: config/zone_registry.json, data/snapshots/snapshot_{split}.parquet
Output: config/driver_registry.json                          (600 tài xế, sinh 1 lần)
        data/driver_states/driver_states_{split}.parquet     (A6, theo từng split)

Chạy: python generate_drivers.py --registry            # chỉ sinh lại registry
      python generate_drivers.py --split test          # sinh A6 cho split test
      python generate_drivers.py --split train

⚠️ Ghi đè config/driver_registry.json và A6. Registry đổi -> A6 của CẢ HAI split phải sinh lại,
   vì `home_zone` quyết định tài xế nào đứng ở zone nào.

Ràng buộc cứng (DATA_CONTRACT §2.7, §6.1 · C-03 · C-08):
  A6   COUNT(status == "online_idle" AND current_zone == z) == snapshot[ts, z].idle_supply
       đúng 100% mọi ts_bucket × mọi zone. Lệch một dòng là hỏng — script thoát mã 1.
  C-03 is_demo_account == true cho 100% bản ghi, display_name là nhãn giả "Tài xế {n}".
  C-08 KHÔNG có trường chấm điểm/xếp hạng tài xế ở bất kỳ đâu trong hai file này.
"""

import argparse
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

TZ_ICT = timezone(timedelta(hours=7))

# Số tài xế và tỷ lệ offline là giá trị đã ghi trong ASSUMPTION register, KHÔNG tự nghĩ số mới
# (CLAUDE.md §4 #6). Xem DATA_CONTRACT §6.1.
N_DRIVERS = 600  # ASSUMPTION-20
OFFLINE_RATIO = 0.25  # ASSUMPTION-21 — tỷ lệ offline ở giờ cao điểm mưa

# Seed dùng lại seed synthetic của từng split thay vì thêm seed mới: A6 là một phần của cùng
# bộ dữ liệu với A1, tái lập chung một mốc (CLAUDE.md §3 #4).
SEED_BY_SPLIT = {"train": 42, "test": 2026}
SEED_REGISTRY = 42  # registry là tài sản tĩnh, sinh một lần theo mốc train

# Mã trạng thái — lưu dạng int8 trong lúc tính cho nhẹ, đổi lại thành chuỗi khi ghi Parquet.
STATUS_LABELS = ["online_idle", "online_busy", "offline"]
IDLE, BUSY, OFFLINE = 0, 1, 2

STATE_SCHEMA = pa.schema(
    [
        pa.field("ts_bucket", pa.timestamp("us", tz="+07:00")),
        pa.field("driver_id", pa.string()),
        pa.field("current_zone", pa.int32()),
        pa.field("status", pa.string()),
        pa.field("shift_end_ts", pa.timestamp("us", tz="+07:00")),
    ]
)


def load_zones(base_dir: str = ".") -> list[dict]:
    """zone_registry.json là mảng JSON phẳng (khác generator.yaml) — giữ nguyên hình dạng file thật."""
    with open(f"{base_dir}/config/zone_registry.json", encoding="utf-8") as f:
        zones = json.load(f)
    if len(zones) != 30:
        raise ValueError(f"zone_registry phải có 30 zone, đang có {len(zones)}")
    return zones


def largest_remainder(weights: np.ndarray, total: int) -> np.ndarray:
    """Chia `total` suất theo tỷ lệ `weights`, tổng đúng bằng `total`.

    Dùng Hare quota thay vì `round()` từng phần: làm tròn độc lập cho tổng lệch vài suất,
    mà tổng lệch nghĩa là số tài xế khác 600 — vỡ AC #1.
    """
    share = weights / weights.sum() * total
    base = np.floor(share).astype(int)
    remainder = total - int(base.sum())
    if remainder:
        # Ưu tiên phần dư lớn nhất; hòa thì lấy index nhỏ trước để tất định.
        order = np.lexsort((np.arange(len(share)), -(share - base)))
        base[order[:remainder]] += 1
    return base


def build_registry(zones: list[dict], n_drivers: int = N_DRIVERS, seed: int = SEED_REGISTRY) -> list[dict]:
    """Sinh 600 tài xế demo, `home_zone` phân bố tỷ lệ thuận population_density (§6.1).

    `status`/`current_zone` trong registry là TRẠNG THÁI KHỞI TẠO trước khi replay chạy;
    giá trị theo thời gian nằm ở A6. `shift_end_ts` để null — xem ghi chú ở module docstring
    của hàm build_states().
    """
    density = np.array([z["population_density"] for z in zones], dtype=float)
    counts = largest_remainder(density, n_drivers)

    home_zones = np.repeat([z["zone_id"] for z in zones], counts)
    # Trộn để driver_id không tương quan với zone: DRV-0001..0050 dồn hết vào Ba Đình sẽ khiến
    # mọi bộ lọc "N tài xế đầu tiên" vô tình chỉ lấy một góc thành phố.
    np.random.default_rng(seed).shuffle(home_zones)

    return [
        {
            "driver_id": f"DRV-{i + 1:04d}",
            "display_name": f"Tài xế {i + 1}",  # C-03: nhãn giả, cấm tên người thật
            "home_zone": int(home_zones[i]),
            "current_zone": int(home_zones[i]),
            "status": "offline",
            "shift_end_ts": None,
            "is_demo_account": True,  # C-03: không có ngoại lệ
        }
        for i in range(n_drivers)
    ]


def zone_candidate_orders(zones: list[dict], drivers: list[dict], seed: int) -> dict[int, np.ndarray]:
    """Thứ tự ưu tiên chọn tài xế cho từng zone: người có home_zone ở đó trước, rồi tới phần còn lại.

    Cần một thứ tự CỐ ĐỊNH cho cả run: nếu mỗi step bốc lại ngẫu nhiên thì cùng một tài xế nhảy
    khắp thành phố sau mỗi 5 phút, và `max_offers_per_driver_per_hour` ở Khối C mất ý nghĩa.

    Chưa xếp theo khoảng cách địa lý: haversine thuộc T3/T7 (`src/common/haversine.py` chưa có),
    và A6 chỉ ràng buộc SỐ LƯỢNG. Khoảng cách thật được tính lúc phát hành offer.
    """
    home = np.array([d["home_zone"] for d in drivers])
    fallback = np.random.default_rng(seed).permutation(len(drivers))
    orders: dict[int, np.ndarray] = {}
    for z in (zone["zone_id"] for zone in zones):
        local = np.flatnonzero(home == z)
        rest = fallback[~np.isin(fallback, local)]
        orders[z] = np.concatenate([local, rest])
    return orders


def assign_step(
    idle_by_zone: np.ndarray,
    zone_ids: np.ndarray,
    orders: dict[int, np.ndarray],
    offline_order: np.ndarray,
    n_offline: int,
    n_drivers: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Gán trạng thái + vị trí cho toàn đội ở MỘT step. Trả (zone_of_driver, status_of_driver).

    Thứ tự bắt buộc: chốt `online_idle` trước theo đúng hạn ngạch A6, phần còn lại mới chia
    offline/online_busy. Làm ngược lại thì offline có thể ăn mất người cần cho hạn ngạch.
    """
    status = np.full(n_drivers, BUSY, dtype=np.int8)
    zone_of = np.zeros(n_drivers, dtype=np.int32)
    used = np.zeros(n_drivers, dtype=bool)

    for z, k in zip(zone_ids, idle_by_zone, strict=True):
        if k <= 0:
            continue
        cand = orders[int(z)]
        free = cand[~used[cand]]
        if len(free) < k:
            raise ValueError(f"Zone {z} cần {k} tài xế idle nhưng chỉ còn {len(free)} người rảnh")
        picked = free[:k]
        used[picked] = True
        status[picked] = IDLE
        zone_of[picked] = z

    if n_offline > 0:
        free = offline_order[~used[offline_order]]
        picked = free[:n_offline]
        status[picked] = OFFLINE

    return zone_of, status


def build_states(snapshot: pd.DataFrame, drivers: list[dict], zones: list[dict], seed: int) -> pd.DataFrame:
    """Sinh A6 cho toàn bộ snapshot.

    `current_zone` của tài xế KHÔNG idle đặt bằng `home_zone`:
      - `offline` — hệ thống không biết vị trí, §4.8 đã chốt lấy `home_zone` làm `from_zone`;
      - `online_busy` — đang chở khách, không bao giờ nhận offer (§4.8), nên vị trí không
        tham gia bất kỳ phép tính nào; bịa ra một zone khác chỉ tạo dữ liệu trông-như-thật.

    `shift_end_ts` để null toàn bộ: chưa có lịch ca nào trong tài liệu, và §4 #6 cấm tự nghĩ số.
    Hệ quả: `is_near_shift_end` luôn false nên `w_shift_end` chưa có tác dụng ở MVP — đã ghi
    trong config/driver_response.yaml để không ai tưởng nhầm là đã mô phỏng.
    """
    zone_ids = np.array([z["zone_id"] for z in zones], dtype=np.int32)
    orders = zone_candidate_orders(zones, drivers, seed)
    n_drivers = len(drivers)
    home = np.array([d["home_zone"] for d in drivers], dtype=np.int32)

    pivot = snapshot.pivot_table(index="ts_bucket", columns="zone_id", values="idle_supply", aggfunc="sum")
    pivot = pivot.reindex(columns=zone_ids).sort_index()
    idle_matrix = pivot.to_numpy(dtype=np.int64)
    timestamps = pivot.index  # giữ DatetimeIndex để không rụng offset +07:00
    n_steps = len(timestamps)

    # Hoán vị cố định + dịch vòng theo step: đội offline đổi người theo thời gian (không phải
    # 150 người cố định suốt 42 ngày) mà vẫn tất định, không cần bốc RNG ở mỗi step.
    offline_perm = np.random.default_rng(seed + 1).permutation(n_drivers)
    stride = 97  # nguyên tố cùng nhau với 600 -> quét hết đội trước khi lặp lại
    n_offline = int(round(OFFLINE_RATIO * n_drivers))

    zone_out = np.empty((n_steps, n_drivers), dtype=np.int32)
    status_out = np.empty((n_steps, n_drivers), dtype=np.int8)

    for i in range(n_steps):
        rotated = np.roll(offline_perm, -(i * stride) % n_drivers)
        zone_of, status = assign_step(idle_matrix[i], zone_ids, orders, rotated, n_offline, n_drivers)
        zone_out[i] = np.where(status == IDLE, zone_of, home)
        status_out[i] = status

    return pd.DataFrame(
        {
            "ts_bucket": timestamps.repeat(n_drivers),
            "driver_id": pd.Categorical.from_codes(
                np.tile(np.arange(n_drivers, dtype=np.int32), n_steps),
                categories=[d["driver_id"] for d in drivers],
            ),
            "current_zone": zone_out.reshape(-1),
            "status": pd.Categorical.from_codes(status_out.reshape(-1).astype(np.int32), categories=STATUS_LABELS),
        }
    )


def to_arrow(states: pd.DataFrame) -> pa.Table:
    """Ghép cột `shift_end_ts` toàn null rồi ép về STATE_SCHEMA.

    Cột này dựng ở tầng Arrow chứ không ở pandas: một Series 7,2 triệu NaT tốn 58 MB RAM cho
    thứ không mang một bit thông tin nào, trong khi `pa.nulls` chỉ giữ bitmap.
    """
    table = pa.Table.from_pandas(states, preserve_index=False)
    field = STATE_SCHEMA.field("shift_end_ts")
    table = table.append_column(field, pa.nulls(len(states), type=field.type))
    return table.cast(STATE_SCHEMA)


def write_states_sample(states: pd.DataFrame, snapshot: pd.DataFrame, out_path: str) -> tuple[int, list]:
    """Ghi bản xem nhanh dạng CSV — Parquet không mở được bằng Notepad/Excel.

    Lấy 2 step: step đầu tiên và step có tổng `idle_supply` lớn nhất (lúc đội căng nhất). Xếp
    theo (thời gian, trạng thái, zone) để người đọc tự đếm `online_idle` từng zone rồi đối chiếu
    với `idle_supply` trong snapshot — tức là kiểm A6 bằng tay, không phải tin lời script.

    Sample là **bản trích**, không phải nguồn dữ liệu: mọi module phải đọc .parquet.
    """
    per_step = snapshot.groupby("ts_bucket")["idle_supply"].sum()
    picked = sorted({per_step.index[0], per_step.idxmax()})
    sample = states[states["ts_bucket"].isin(picked)].copy()
    sample = sample.sort_values(["ts_bucket", "status", "current_zone", "driver_id"])
    sample.to_csv(out_path, index=False, encoding="utf-8-sig")  # BOM để Excel đọc đúng tiếng Việt
    return len(sample), picked


def validate_a6(states: pd.DataFrame, snapshot: pd.DataFrame) -> pd.DataFrame:
    """Đối chiếu A6 với A1. Trả về CÁC DÒNG LỆCH — rỗng nghĩa là đạt AC #4."""
    counted = (
        states[states["status"] == "online_idle"]
        .groupby(["ts_bucket", "current_zone"], observed=True)
        .size()
        .rename("counted")
        .reset_index()
        .rename(columns={"current_zone": "zone_id"})
    )
    expected = snapshot[["ts_bucket", "zone_id", "idle_supply"]]
    merged = expected.merge(counted, on=["ts_bucket", "zone_id"], how="outer")
    merged[["idle_supply", "counted"]] = merged[["idle_supply", "counted"]].fillna(0).astype(int)
    return merged[merged["idle_supply"] != merged["counted"]]


def validate_registry(drivers: list[dict]) -> None:
    """Chốt chặn C-03/C-08 ngay tại chỗ sinh, không đợi test bắt."""
    ids = [d["driver_id"] for d in drivers]
    if len(set(ids)) != len(ids):
        raise ValueError("driver_id bị trùng")
    if not all(d["is_demo_account"] for d in drivers):
        raise ValueError("C-03: is_demo_account phải true cho 100% bản ghi")
    banned = {"accept_rate_of_driver", "driver_rank", "driver_score", "driver_tier", "reliability"}
    leaked = banned & set().union(*(d.keys() for d in drivers))
    if leaked:
        raise ValueError(f"C-08: cấm trường chấm điểm tài xế: {sorted(leaked)}")
    if not all(1 <= d["home_zone"] <= 30 for d in drivers):
        raise ValueError("home_zone ngoài dải 1–30")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sinh driver_registry.json và dataset A6")
    parser.add_argument("--split", choices=["train", "test"], help="sinh A6 cho split này")
    parser.add_argument("--registry", action="store_true", help="sinh lại config/driver_registry.json")
    parser.add_argument("--base-dir", default=".")
    args = parser.parse_args()

    if not args.split and not args.registry:
        parser.error("cần ít nhất một trong --registry / --split")

    zones = load_zones(args.base_dir)
    registry_path = f"{args.base_dir}/config/driver_registry.json"

    if args.registry:
        drivers = build_registry(zones)
        validate_registry(drivers)
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(drivers, f, ensure_ascii=False, indent=2)
            f.write("\n")
        by_zone = pd.Series([d["home_zone"] for d in drivers]).value_counts()
        print(f"Đã lưu: {registry_path} ({len(drivers)} tài xế, seed {SEED_REGISTRY})")
        print(f"  home_zone: min {by_zone.min()} / max {by_zone.max()} tài xế mỗi zone")

    if args.split:
        with open(registry_path, encoding="utf-8") as f:
            drivers = json.load(f)
        validate_registry(drivers)

        snapshot = pd.read_parquet(f"{args.base_dir}/data/snapshots/snapshot_{args.split}.parquet")
        started = datetime.now(TZ_ICT)
        states = build_states(snapshot, drivers, zones, SEED_BY_SPLIT[args.split])

        mismatch = validate_a6(states, snapshot)
        if len(mismatch):
            print(f"❌ A6 LỆCH ở {len(mismatch)} dòng (ts_bucket × zone). 5 dòng đầu:")
            print(mismatch.head().to_string(index=False))
            raise SystemExit(1)

        out = f"{args.base_dir}/data/driver_states/driver_states_{args.split}.parquet"
        pq.write_table(to_arrow(states), out, compression="snappy")

        sample_path = f"{args.base_dir}/data/driver_states/sample_driver_states_{args.split}.csv"
        n_sample, picked = write_states_sample(states, snapshot, sample_path)

        counts = states["status"].value_counts()
        elapsed = (datetime.now(TZ_ICT) - started).total_seconds()
        print(f"Đã lưu: {out} ({len(states):,} dòng, {elapsed:.1f}s)")
        print(f"Đã lưu: {sample_path} ({n_sample} dòng = {len(picked)} step × {len(drivers)} tài xế)")
        print(f"  A6 khớp idle_supply: {len(mismatch)} dòng lệch trên {snapshot.shape[0]:,} cặp (ts × zone)")
        print("  trạng thái: " + " · ".join(f"{k} {counts[k]:,}" for k in STATUS_LABELS))
