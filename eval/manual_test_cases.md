# Bằng chứng kiểm thử thủ công luồng ra quyết định

## 1. Mục tiêu

Tài liệu này ghi nhận năm test case chấp nhận cho luồng ra quyết định của hệ
thống NovaFour. Mỗi test case sử dụng một mốc replay và horizon dự báo cụ thể,
sau đó kiểm tra toàn bộ chuỗi xử lý:

```text
Snapshot replay → Dự báo → Phát hiện vùng rủi ro → Điều chuyển trực tiếp
→ Đề xuất huy động bằng offer → Kiểm tra ràng buộc vận hành
```

Các số liệu trong tài liệu là **output thực tế** thu được từ API quyết định,
không phải dữ liệu kỳ vọng viết tay hoặc response giả lập. Các input được lựa
chọn và kết quả được đối chiếu thủ công; script được dùng để gọi cùng một API
cho cả năm case nhằm bảo đảm kết quả có thể tái lập chính xác.

## 2. Phạm vi và môi trường kiểm thử

| Thuộc tính | Giá trị |
|---|---|
| Ngày chạy | 16/08/2026 |
| Môi trường | Local acceptance test |
| Runtime | FastAPI `TestClient` |
| API snapshot | `POST /api/v1/datasets/snapshots/at` |
| API quyết định | `POST /api/v1/decisions` |
| Bộ dữ liệu replay | `apps/ai/data/snapshots/snapshot_test.parquet` |
| Phiên bản model | `lgbm_quantile_v1` |
| Model bundle | `lgbm_quantile_v1-20260816_130655` |
| Training run | `20260816_130655` |
| Script tái lập | `apps/ai/eval_decision_flow.py` |
| Tổng số test case | 5 |
| Kết quả HTTP | 5/5 request quyết định trả về `200 OK` |

### Tiền điều kiện

- Đã cài các dependency trong `apps/ai/requirements.txt`.
- Bộ snapshot test và 18 model artifact tồn tại đúng đường dẫn trong manifest.
- Policy vận hành được nạp thành công từ `apps/ai/config/policy.yaml`.
- Không chỉnh sửa, retrain hoặc thay thế model trong quá trình kiểm thử.
- Không sử dụng mock response.

## 3. Tiêu chí đánh giá

Một test case chỉ được đánh dấu **PASS** khi thỏa mãn đồng thời:

1. Hai API trả về thành công và API quyết định có HTTP status `200 OK`.
2. Hệ thống sử dụng cơ sở thận trọng `p90_p50` khi lập phương án cho vùng rủi ro.
3. Gap sau điều chuyển nhỏ hơn gap trước điều chuyển.
4. Gap kỳ vọng sau activation nhỏ hơn gap sau điều chuyển.
5. Khoảng cách của mọi tuyến không vượt quá policy `7 km`.
6. Số xe rút từ mỗi vùng nguồn không vượt `movable_units`.
7. Chi phí điều chuyển không vượt ngân sách `500.000 VND`.

## 4. Quy trình thực hiện thủ công

Thực hiện lần lượt cho từng dòng trong bảng test case:

1. Chọn mốc thời gian replay và horizon tương ứng.
2. Gọi `POST /api/v1/datasets/snapshots/at` để lấy dữ liệu 30 zone tại mốc đó.
3. Dùng danh sách `zones` nhận được làm input cho `POST /api/v1/decisions`.
4. Kiểm tra HTTP status và ghi lại các trường output:
   `forecast.regime`, `hotspots.conservative_gap_mode`, `plan.moves`,
   `simulation.metrics_before`, `simulation.metrics_after_relocation` và
   `activation_recommendation`.
5. Đối chiếu ba constraint: khoảng cách, sức chứa vùng nguồn và ngân sách.
6. Đánh dấu PASS/FAIL theo các tiêu chí ở Mục 3.

## 5. Danh sách test case và output thực tế

### EVAL-01 — Mưa giờ cao điểm, horizon 5 phút

| Nội dung | Giá trị |
|---|---|
| Input replay | `2026-09-25T08:30:00+07:00` |
| Horizon | 5 phút |
| Mục tiêu | Kiểm tra quyết định ngắn hạn trong chế độ `rain_peak` |
| Output chế độ dự báo | `rain_peak` |
| Cơ sở lập phương án | `p90_p50` |
| Số vùng mục tiêu rủi ro | 13 |
| Gap trước xử lý | 43,564 |
| Điều chuyển trực tiếp | 1 tuyến / 2 xe |
| Gap sau điều chuyển | 42,081 |
| Huy động bổ sung | 50 offer / kỳ vọng 29,451 xe |
| Gap kỳ vọng cuối | 12,112 |
| Kết quả | **PASS** |

### EVAL-02 — Mưa giờ cao điểm, horizon 10 phút

| Nội dung | Giá trị |
|---|---|
| Input replay | `2026-09-25T08:30:00+07:00` |
| Horizon | 10 phút |
| Mục tiêu | Kiểm tra cùng snapshot khi mở rộng horizon dự báo |
| Output chế độ dự báo | `rain_peak` |
| Cơ sở lập phương án | `p90_p50` |
| Số vùng mục tiêu rủi ro | 13 |
| Gap trước xử lý | 42,556 |
| Điều chuyển trực tiếp | 1 tuyến / 2 xe |
| Gap sau điều chuyển | 41,158 |
| Huy động bổ sung | 50 offer / kỳ vọng 29,088 xe |
| Gap kỳ vọng cuối | 11,366 |
| Kết quả | **PASS** |

### EVAL-03 — Giờ cao điểm có mưa cục bộ, horizon 5 phút

| Nội dung | Giá trị |
|---|---|
| Input replay | `2026-09-25T08:35:00+07:00` |
| Horizon | 5 phút |
| Mục tiêu | Kiểm tra hệ thống vẫn dùng P90 khi regime tổng thể là `peak` nhưng có mưa cục bộ |
| Output chế độ dự báo | `peak` |
| Cơ sở lập phương án | `p90_p50` |
| Số vùng mục tiêu rủi ro | 13 |
| Gap trước xử lý | 42,023 |
| Điều chuyển trực tiếp | 1 tuyến / 2 xe |
| Gap sau điều chuyển | 40,852 |
| Huy động bổ sung | 50 offer / kỳ vọng 29,518 xe |
| Gap kỳ vọng cuối | 10,506 |
| Kết quả | **PASS** |

### EVAL-04 — Giờ cao điểm có mưa cục bộ, horizon 15 phút

| Nội dung | Giá trị |
|---|---|
| Input replay | `2026-09-25T08:35:00+07:00` |
| Horizon | 15 phút |
| Mục tiêu | Kiểm tra phương án dài hơn vẫn tuân thủ policy và ngân sách |
| Output chế độ dự báo | `peak` |
| Cơ sở lập phương án | `p90_p50` |
| Số vùng mục tiêu rủi ro | 13 |
| Gap trước xử lý | 44,529 |
| Điều chuyển trực tiếp | 1 tuyến / 2 xe |
| Gap sau điều chuyển | 43,252 |
| Huy động bổ sung | 50 offer / kỳ vọng 29,448 xe |
| Gap kỳ vọng cuối | 13,080 |
| Kết quả | **PASS** |

### EVAL-05 — Chuyển tiếp snapshot, horizon 15 phút

| Nội dung | Giá trị |
|---|---|
| Input replay | `2026-09-25T08:40:00+07:00` |
| Horizon | 15 phút |
| Mục tiêu | Kiểm tra quyết định ổn định khi chuyển sang snapshot kế tiếp |
| Output chế độ dự báo | `peak` |
| Cơ sở lập phương án | `p90_p50` |
| Số vùng mục tiêu rủi ro | 13 |
| Gap trước xử lý | 43,402 |
| Điều chuyển trực tiếp | 1 tuyến / 2 xe |
| Gap sau điều chuyển | 42,024 |
| Huy động bổ sung | 50 offer / kỳ vọng 29,536 xe |
| Gap kỳ vọng cuối | 11,896 |
| Kết quả | **PASS** |

## 6. Bảng tổng hợp

| Case | Replay (+07) | Horizon | Regime | Gap trước | Gap sau điều chuyển | Gap kỳ vọng cuối | Kết quả |
|---|---|---:|---|---:|---:|---:|---|
| EVAL-01 | 25/09/2026 08:30 | 5 phút | `rain_peak` | 43,564 | 42,081 | 12,112 | PASS |
| EVAL-02 | 25/09/2026 08:30 | 10 phút | `rain_peak` | 42,556 | 41,158 | 11,366 | PASS |
| EVAL-03 | 25/09/2026 08:35 | 5 phút | `peak` | 42,023 | 40,852 | 10,506 | PASS |
| EVAL-04 | 25/09/2026 08:35 | 15 phút | `peak` | 44,529 | 43,252 | 13,080 | PASS |
| EVAL-05 | 25/09/2026 08:40 | 15 phút | `peak` | 43,402 | 42,024 | 11,896 | PASS |

**Kết luận tổng hợp: 5/5 test case PASS.**

## 7. Bằng chứng ràng buộc vận hành

Cả năm response đều trả về ba kiểm tra sau với giá trị `true`:

| Ràng buộc | Output thực tế | Giới hạn |
|---|---|---|
| `distance_within_policy` | `true`; tuyến dài nhất 5,057 km | Tối đa 7 km |
| `source_capacity_respected` | `true` | Không vượt `movable_units` của vùng nguồn |
| `relocation_budget_respected` | `true`; chi phí 40.456 VND | Tối đa 500.000 VND |

Kết quả cũng xác nhận hành vi `HYBRID`: hệ thống chỉ điều chuyển trực tiếp hai
xe còn dư an toàn, sau đó đề xuất 50 offer để bù phần thiếu hụt còn lại. Không
ép điều chuyển thêm xe từ nguồn đang có rủi ro hoặc nằm ngoài bán kính policy.

## 8. Cách tái lập kết quả

Từ thư mục gốc của repository, chạy:

```powershell
Set-Location apps/ai
$env:PYTHONPATH='.'
..\..\.venv\Scripts\python.exe eval_decision_flow.py
```

Script phải trả về đúng năm object JSON từ `EVAL-01` đến `EVAL-05`. Với cùng
model, policy và frozen replay dataset, các giá trị output phải khớp tài liệu
này; mọi sai lệch cần được xem là thay đổi cần điều tra.

## 9. Giới hạn diễn giải

- Số xe activation là **giá trị kỳ vọng của model**, chưa phải số tài xế đã
  chấp nhận offer ngoài thực tế.
- Bộ dữ liệu là replay đã đóng băng, không phải dữ liệu vận hành production.
- Test này xác nhận chất lượng luồng quyết định AI; lifecycle campaign, phản hồi
  offer và GPS được kiểm thử ở các bộ integration/smoke test riêng.

## 10. Nguồn truy vết

- Bằng chứng chi tiết ban đầu: [`decision_flow_evidence.md`](decision_flow_evidence.md)
- Script tái lập: [`apps/ai/eval_decision_flow.py`](../apps/ai/eval_decision_flow.py)
- Dataset: [`apps/ai/data/snapshots/snapshot_test.parquet`](../apps/ai/data/snapshots/snapshot_test.parquet)
- Model manifest: [`apps/ai/data/models/model_manifest.json`](../apps/ai/data/models/model_manifest.json)
