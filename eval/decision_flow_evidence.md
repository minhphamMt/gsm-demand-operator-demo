# Decision-flow acceptance evidence

Ngày chạy: 2026-08-16. Runtime: FastAPI `TestClient`, model bundle `lgbm_quantile_v1`, frozen replay dataset `snapshot_test.parquet`. Không mock output và không sửa/retrain model.

Mục tiêu kiểm tra: dữ liệu mưa cục bộ ở giờ cao điểm phải dùng thiếu hụt thận trọng `p90 demand - p50 supply`; optimizer chỉ rút nguồn còn an toàn, sau đó activation bù phần không thể điều chuyển trực tiếp.

| Case | Replay source | Horizon | Zone mưa | Regime model | Cơ sở plan | Zone rủi ro | Gap trước | Điều chuyển trực tiếp | Gap sau điều chuyển | Activation | Gap kỳ vọng cuối |
|---|---|---:|---:|---|---|---:|---:|---|---:|---|---:|
| EVAL-01 | 2026-09-25 08:30 +07 | 5m | 11 | rain_peak | p90_p50 | 13 | 43.564 | 1 tuyến / 2 xe | 42.081 | 50 offer / +29.451 xe kỳ vọng | 12.112 |
| EVAL-02 | 2026-09-25 08:30 +07 | 10m | 11 | rain_peak | p90_p50 | 13 | 42.556 | 1 tuyến / 2 xe | 41.158 | 50 offer / +29.088 xe kỳ vọng | 11.366 |
| EVAL-03 | 2026-09-25 08:35 +07 | 5m | 11 | peak | p90_p50 | 13 | 42.023 | 1 tuyến / 2 xe | 40.852 | 50 offer / +29.518 xe kỳ vọng | 10.506 |
| EVAL-04 | 2026-09-25 08:35 +07 | 15m | 11 | peak | p90_p50 | 13 | 44.529 | 1 tuyến / 2 xe | 43.252 | 50 offer / +29.448 xe kỳ vọng | 13.080 |
| EVAL-05 | 2026-09-25 08:40 +07 | 15m | 10 | peak | p90_p50 | 13 | 43.402 | 1 tuyến / 2 xe | 42.024 | 50 offer / +29.536 xe kỳ vọng | 11.896 |

## Ràng buộc đã xác nhận

Cả năm case đều đạt:

- Khoảng cách tuyến điều chuyển tối đa `5.057 km`, không vượt policy `7 km`.
- Tổng số xe rút từ mỗi nguồn không vượt `movable_units` sau khi giữ dự trữ tối thiểu và giới hạn tỷ lệ rút.
- Chi phí điều chuyển `40,456 VND`, không vượt budget `500,000 VND`.
- 100% relocation target dùng cùng cơ sở `p90_p50` với vùng đỏ trên bản đồ.
- Khi regime toàn thành phố là `peak` nhưng có 10–11 zone mưa, plan vẫn giữ P90 thay vì rơi về P50.

## Diễn giải kết quả

Một tuyến không có nghĩa là phương án chỉ xử lý một xe. Trong replay này chỉ zone 14 có `2` xe vừa dư an toàn vừa nằm trong bán kính `7 km` của một vùng thiếu; ép điều chuyển nhiều hơn sẽ rút xe từ nguồn đang có rủi ro hoặc vi phạm khoảng cách. Vì vậy lời giải vận hành đúng là `HYBRID`: điều chuyển trực tiếp 2 xe, đồng thời phát tối đa 50 offer activation theo budget 1,000,000 VND để kỳ vọng bổ sung khoảng 29 xe. Giao diện phải trình bày cả hai phần và ghi rõ activation là kỳ vọng, chưa phải kết quả thực tế.

## Tái tạo

Từ `apps/ai`, sau khi cài dependency:

```powershell
$env:PYTHONPATH='.'
./.venv/Scripts/python.exe eval_decision_flow.py
```

Script trả JSON cho đúng năm case trên và tự tính ba kiểm tra constraint (`distance_within_policy`, `source_capacity_respected`, `relocation_budget_respected`).
