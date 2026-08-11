# data/snapshots/ — kho snapshot A1

Sinh bởi [generate_snapshots.py](../../generate_snapshots.py) tại **T0.4**. Đây là dữ liệu **synthetic lai**: cột mưa lấy từ NASA POWER 2025 (thật), mọi cột còn lại sinh tổng hợp — xem [SPEC §5.1](../../docs/SPEC-GSM14-NovaFour-Unified.md).

> `data/` nằm trong `.gitignore` — toàn bộ thư mục này **không có trong git**, kể cả file README này. Sinh lại bằng `python generate_snapshots.py --split train` / `--split test`. Việc sinh lại **phải hỏi PM trước** (CLAUDE.md §10.2 #7): nó ghi đè baseline đã khóa và buộc tính lại mọi số đã công bố (SPEC §5.14.3).

## 1. Có gì trong thư mục này

| File | Vai trò | Ai đọc |
|---|---|---|
| `snapshot_train.parquet` | **Nguồn sự thật** — 362.880 dòng (42 ngày × 288 step × 30 zone), seed 42 | Model 1 (train), baseline hist-avg |
| `snapshot_test.parquet` | **Nguồn sự thật** — 60.480 dòng (7 ngày × 288 step × 30 zone), seed 2026. Bản đóng băng ở `data/test_set/` | Model 1 (eval), Simulator, baseline no-action |
| `sample_snapshot_train.csv` | **Bản trích để người đọc** — 480 dòng | Người, không phải code |
| `sample_snapshot_test.csv` | **Bản trích để người đọc** — 480 dòng | Người, không phải code |

**Mọi module bắt buộc đọc `.parquet`.** File `sample_*.csv` là bản trích tiện xem bằng Excel/Notepad — không đầy đủ, có thêm cột không thuộc contract, và sẽ lệch nếu ai đó sửa tay. Import nó vào code là làm sai contract §4.1.

## 2. Vì sao nguồn là Parquet chứ không phải CSV

| | CSV | Parquet |
|---|---|---|
| Kích thước (bản test) | 3,20 MB | **0,49 MB** |
| `ts_bucket` | chuỗi naive, mất offset | `timestamp[us, tz=+07:00]` — CLAUDE.md §5.2 cấm naive datetime |
| `enroute_arrivals` | không biểu diễn được | `list<struct<arrival_ts, eta_steps, units, source, from_zone>>` — Simulator §5.5 đọc thẳng từ đây |
| Kiểu cột | đoán lại mỗi lần `read_csv` | khóa trong schema, `int32`/`float64` đúng như khai báo |

Cột `enroute_arrivals` là lý do bắt buộc: nó là list lồng struct, CSV không có chỗ để chứa (nợ dữ liệu **D1**, **D2** trong [DATA_CONTRACT.md §9](../../docs/design/DATA_CONTRACT.md)).

## 3. Sample chứa gì

`pick_sample_windows()` chọn **4 cửa sổ × 4 step × 30 zone = 480 dòng**, mỗi cửa sổ ứng một regime, để mở file ra là thấy đủ cả bốn:

| # | Cửa sổ | Thấy được gì |
|---|---|---|
| 1 | 00:00–00:15, khô, ngoài cao điểm | `normal` — mức nền của từng zone |
| 2 | 06:50–07:05, khô | ranh giới cao điểm nửa mở `[07:00, 09:00)` — 2 step đầu `normal`, 2 step sau `peak` |
| 3 | step mưa to nhất **ngoài** cao điểm | `rain` — mưa lệch giữa các zone (D4) mà không lẫn hiệu ứng cao điểm |
| 4 | step mưa to nhất **trong** cao điểm | `rain_peak` — cung sụt 30%, thước đo thành công chính (CLAUDE.md §3 #6) |

Chọn tất định, không seed: cửa sổ 1–2 lấy step đầu tiên thỏa điều kiện, cửa sổ 3–4 lấy step có tổng lượng mưa toàn thành phố lớn nhất. Sinh lại cùng snapshot luôn ra cùng 16 step.

Hai cột **khác** với parquet:

- `enroute_arrivals` in ra `[]` thay vì list struct. Ở dải ngày này không có chuyến điều chuyển nào (Optimizer chưa chạy), nên cột này rỗng trên **mọi** dòng của cả parquet lẫn sample — không mất thông tin.
- `regime` là cột **suy ra** từ `(rain_mm_h, peak_flag)` bằng `src/common/regime.py`, thêm vào chỉ để đọc cho nhanh. **Không có trong contract §4.1**, không có trong parquet. Đừng viết code phụ thuộc vào nó — gọi `tag_regime()` như mọi module khác.

Kiểm nhanh: cả hai sample đều ra `normal 180 · peak 60 · rain 120 · rain_peak 120`.

## 4. Mở Parquet như thế nào

```python
import pandas as pd
import pyarrow.parquet as pq

pq.read_schema("data/snapshots/snapshot_test.parquet")   # xem kiểu cột, không nạp dữ liệu

df = pd.read_parquet("data/snapshots/snapshot_test.parquet")
df.head(30)                                              # 1 step = 30 zone

# Chỉ nạp vài cột — Parquet đọc theo cột nên rẻ hơn nhiều so với nạp cả bảng
pd.read_parquet("data/snapshots/snapshot_test.parquet", columns=["ts_bucket", "zone_id", "rain_mm_h"])
```

Ngoài Python: VS Code có extension xem Parquet; DuckDB chạy được `SELECT * FROM 'data/snapshots/snapshot_test.parquet' LIMIT 30` mà không cần nạp gì.

## 5. Cột — contract §4.1

| Cột | Kiểu Parquet | Ghi chú |
|---|---|---|
| `ts_bucket` | `timestamp[us, tz=+07:00]` | bước 5 phút |
| `zone_id` | `int32` | 1–30 |
| `demand_observed` | `int32` | |
| `idle_supply` | `int32` | |
| `enroute_supply` | `int32` | **INV-3**: `== Σ enroute_arrivals[].units` ở mọi step |
| `enroute_arrivals` | `list<struct<...>>` | rỗng `[]` ở A1, Simulator ghi vào |
| `rain_mm_h` | `float64` | NASA POWER × hệ số không gian theo zone (D4) |
| `rain_forecast_15` | `float64` | có sai số nowcast, seed 13 — **không** bằng `rain_mm_h(t+15)` |
| `rain_forecast_30` | `float64` | như trên, sai số lớn hơn |
| `peak_flag` | `int32` | `[07:00, 09:00)` và `[17:00, 19:00)` |
| `holiday_flag` | `int32` | |
| `price_index` | `float64` | |

Ngưỡng regime: `rain ⇔ rain_mm_h >= 0.5`, mưa to `>= 5.0` — định nghĩa duy nhất ở `src/common/regime.py`.
