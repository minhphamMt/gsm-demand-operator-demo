# BASELINE_FREEZE — baseline `no_action`, mốc I-08

> **File này bị khóa kể từ lúc ký.** Sửa nó sau khi đã biết kết quả của Khối B/C là làm mất
> hiệu lực mọi so sánh KPI (SPEC §5.14.3, CLAUDE.md §13.1). Nếu buộc phải tính lại baseline,
> **không sửa file này** — tạo bản mới `BASELINE_FREEZE_v2.md`, ghi lý do, và **tính lại toàn bộ
> số đã công bố**, kể cả số đã đưa vào slide.

## 1. Chữ ký khóa

| Mục | Giá trị |
|---|---|
| Ngày khóa | **2026-08-08** (cuối W2, đúng mốc I-08) |
| Người khóa | **Nguyen Thanh Duy** (`sonle.25.lsts@gmail.com`) |
| Task | T0.4 — `docs/design/IMPLEMENTATION_PLAN.md` |
| Kịch bản | `no_action` — không relocation, không activation |
| Nguồn | `data/snapshots/snapshot_test.parquet` (= `data/test_set/snapshot_test.parquet`) |

## 2. Seed — điều kiện tái lập

| Seed | Giá trị | Nơi khai |
|---|---|---|
| Sinh snapshot train | **42** | `config/generator.yaml → seed.train` |
| Sinh snapshot test (bộ đóng băng) | **2026** | `config/generator.yaml → seed.test` |
| Sai số nowcast `rain_forecast_15/30` | **13** | `config/generator.yaml → rain.nowcast.seed` |
| Phản hồi tài xế (chưa dùng ở baseline) | 7 | SPEC §5.13 — Khối C, task T7 |

Biến thiên mưa theo zone (`rain.spatial`) **không dùng seed**: hệ số suy tất định từ toạ độ
zone và thời điểm, nên tái lập được mà không phụ thuộc trạng thái RNG.

## 3. Định danh nội dung — SHA-256

| File | SHA-256 | Bytes |
|---|---|---|
| `data/snapshots/snapshot_train.parquet` | `07590049bd086959a59ee146dce9ac5cb3ced11af2ea53d72ff7f30e287dcbaa` | 2.800.913 |
| `data/snapshots/snapshot_test.parquet` | `e84208dc6294e90ada05ca1b1143e1638dbedae8ccad29ebea03dbfd11cbcf45` | 487.576 |
| `data/test_set/snapshot_test.parquet` | `e84208dc6294e90ada05ca1b1143e1638dbedae8ccad29ebea03dbfd11cbcf45` | 487.576 |
| `data/baseline/no_action_metrics.parquet` | `1efdbb0b226cdcb7a55209ec5d9f3c80c87fa87c309d88319fe3c34e4a83b363` | 243.754 |

Kiểm lại: `Get-FileHash <path> -Algorithm SHA256` (Windows) hoặc `sha256sum <path>` (POSIX).

`data/snapshots/sample_snapshot_*.csv` **không** nằm trong danh sách khóa: đó là bản trích 480
dòng để người đọc bằng mắt, sinh lại được từ parquet và có thêm cột suy ra `regime` không thuộc
contract §4.1. Không module nào đọc nó — xem [data/snapshots/README.md](../snapshots/README.md).

## 4. Mã sinh ra baseline

| File | git blob SHA-1 | Commit |
|---|---|---|
| `src/simulation/metrics.py` | `82f41b85e10ec55f1938716140ec46430fca70d0` | ⚠️ **PENDING** — file chưa được commit |
| `src/common/regime.py` | `fcc62fe488100d27cde633d5bc2b832bb18731d3` | ⚠️ PENDING |
| `src/common/policy.py` | `0db3704d5defc5271433972ec6556961107c8001` | ⚠️ PENDING |
| `config/policy.yaml` | `43c7769bfaea6076abb4612cca6a255d8d4caa4c` | ⚠️ PENDING |
| `config/generator.yaml` | `d7040fb8a352c72902f6d3a2dfbffd025c253974` | ⚠️ PENDING |
| `generate_snapshots.py` | `3227cef50629f4d3c4ef3b45cf20f7c0d481ffe2` | ⚠️ PENDING |
| `compute_baseline_no_action.py` | `8bf80653b13d4e04515d25305c812edd667bc276` | ⚠️ PENDING |

> **Nợ chưa trả:** AC #5 của T0.4 đòi **commit hash** của `metrics.py`. Tại thời điểm khóa,
> `src/` chưa được commit lần nào (`git log -- src/simulation/metrics.py` rỗng), nên chỗ đó
> chưa điền được. `git blob SHA-1` ở trên định danh **nội dung** chính xác như git tính, nên
> khi commit xong chỉ cần đối chiếu: `git hash-object src/simulation/metrics.py` phải ra đúng
> chuỗi trên thì baseline này vẫn có hiệu lực. **Điền cột Commit ngay sau commit đầu tiên
> chạm các file này** — đó là thao tác bổ sung, không phải sửa số đã khóa.
> HEAD lúc khóa: `846b7359f76ce41fe3eedf8352fc80b5801d5ac8` (chưa chứa `src/`).

## 5. Ngưỡng dùng khi tính

| Ngưỡng | Giá trị | Nguồn |
|---|---|---|
| `rain_threshold_mm_h` | **0.5** | `config/policy.yaml → derived` (quyết định A-05) |
| `heavy_rain_mm_h` | 5.0 | `config/policy.yaml → derived` |
| `min_supply_per_zone` | **3** | `config/policy.yaml → rules` (ASSUMPTION-01) |
| `gap_ratio_threshold` | **0.3** | ⚠️ **chưa có key trong policy.yaml** — xem §8 |

## 6. Số đã khóa

Nguồn số: `data/baseline/no_action_summary.json`. Metric tính **duy nhất** bằng
`src/simulation/metrics.py`; Simulator bắt buộc import cùng module đó (§5.14.1, có test tĩnh).

**Toàn hệ thống** — 60.480 dòng (30 zone × 2.016 step), tổng cầu 352.978:

| Metric | Giá trị |
|---|---|
| `unmet_demand` | **65 027,0** |
| `avg_wait_proxy` (phút, trọng số theo cầu) | **4,833950** |
| `est_cancel_rate` | **0,249867** |
| `hotspot_rate` | 0,340245 |

**Theo 4 regime** — `rain_peak` là thước đo thành công chính, không được gộp vào số tổng (§3 #6):

| regime | n_steps | `unmet_demand` | `avg_wait_proxy` | `est_cancel_rate` | `avg_gap` | `hotspot_rate` |
|---|---:|---:|---:|---:|---:|---:|
| `normal` | 19 488 | 11 995,0 | 3,873713 | 0,198611 | −0,271449 | 0,375975 |
| `peak` | 3 344 | 8 451,0 | 5,382745 | 0,286383 | 1,933313 | 0,269737 |
| `rain` | 30 912 | 17 352,0 | 3,542100 | 0,179952 | −0,761290 | 0,265334 |
| `rain_peak` | **6 736** | **27 229,0** | **8,595921** | **0,448878** | **3,831651** | **0,615647** |

Đọc bảng: `rain_peak` chỉ chiếm 11,1% số dòng nhưng gánh **41,9%** tổng `unmet_demand`, và
thời gian chờ proxy gấp 2,2 lần `normal`. Đây chính là khoảng trống mà Khối B/C phải thu hẹp.

## 7. Bộ test đóng băng

| Mục | Giá trị |
|---|---|
| Dải thời gian | `2026-09-25T00:00:00+07:00` → `2026-10-01T23:55:00+07:00` |
| Số dòng | 60 480 (30 zone × 7 ngày × 288 step) |
| **Sự kiện `rain_peak`** | **13** (yêu cầu §5.14.1: ≥ 2) |
| Số step có ≥1 zone `rain_peak` | 256 |
| Mưa lớn nhất | 14,251 mm/h (> `heavy_rain_mm_h` = 5,0 → ngưỡng mưa to có được kích hoạt thật) |

Định nghĩa **sự kiện `rain_peak`** (chốt tại T0.4, [D12]): một chuỗi `ts_bucket` **liên tiếp**
trong đó có **ít nhất một zone** ở regime `rain_peak`; chuỗi đứt khi không zone nào `rain_peak`.
Con số cũ trong `data/splits.yaml` (`41`) là **số step**, không phải số sự kiện.

Chi tiết + SHA-256 trong `data/test_set/manifest.json`.

## 8. Điểm còn treo tại thời điểm khóa

| # | Nội dung | Ảnh hưởng tới baseline |
|---|---|---|
| 1 | `gap_ratio_threshold = 0.3` chưa có key trong 19 key của `policy.yaml` | Chỉ ảnh hưởng cột `hotspot_rate`. **Không** ảnh hưởng `unmet_demand` / `avg_wait_proxy` / `est_cancel_rate` — tức không ảnh hưởng INV-1 |
| 2 | Commit hash của `metrics.py` chưa tồn tại (xem §4) | Không ảnh hưởng số; ảnh hưởng khả năng truy vết cho tới khi commit |
| 3 | `ASSUMPTION-35..43` (sinh ra ở T0.4, khai trong `config/generator.yaml`) chưa có dòng trong ASSUMPTION register `docs/design/DATA_CONTRACT.md §8` | Không ảnh hưởng số; là nợ tài liệu |
| 4 | Nợ dữ liệu D6, D8, D9, D10 chưa xử lý (`tier_base_*` chết, nhiễu Gaussian thay Poisson, tổng đội xe không bảo toàn, đặt tên `lat/lng`) | Đã ghi nhận ở `docs/design/DATA_CONTRACT.md §9`, **không** thuộc phạm vi T0.4 |

## 9. Cách tái lập

```powershell
.\.venv\Scripts\Activate.ps1
python generate_snapshots.py --split train      # -> snapshot_train.parquet + sample_snapshot_train.csv
python generate_snapshots.py --split test       # -> snapshot_test.parquet + sample + data/test_set/
python compute_baseline_no_action.py            # -> no_action_metrics.parquet + summary.json
```

Chạy lại trên cùng mã + cùng config phải cho **đúng các SHA-256 ở §3**. Lệch một byte nghĩa là
có thứ gì đó đã đổi — tìm ra thứ đó **trước khi** dùng bất kỳ số nào ở §6.
