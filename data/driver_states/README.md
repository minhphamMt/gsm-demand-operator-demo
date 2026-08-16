# data/driver_states/ — dataset A6

Sinh bởi [generate_drivers.py](../../generate_drivers.py) tại **T0.6**. Đây là trạng thái của 600 tài xế demo theo từng `ts_bucket`, khớp cứng với `idle_supply` của A1.

> `data/` nằm trong `.gitignore` — thư mục này không có trong git. Sinh lại:
> ```powershell
> python generate_drivers.py --registry        # config/driver_registry.json (600 tài xế)
> python generate_drivers.py --split test      # -> driver_states_test.parquet  + sample
> python generate_drivers.py --split train     # -> driver_states_train.parquet + sample
> ```
> Đổi `driver_registry.json` thì **phải sinh lại A6 của cả hai split** — `home_zone` quyết định tài xế nào đứng ở zone nào.

## 1. Có gì trong thư mục này

| File | Dòng | Vai trò |
|---|---|---|
| `driver_states_train.parquet` | 7.257.600 = 12.096 step × 600 tài xế | **Nguồn sự thật** |
| `driver_states_test.parquet` | 1.209.600 = 2.016 step × 600 tài xế | **Nguồn sự thật** — Khối C chạy trên split này |
| `sample_driver_states_*.csv` | 1.200 = 2 step × 600 tài xế | **Bản trích để người đọc**, không phải nguồn |

## 2. Ràng buộc A6 — thứ file này tồn tại để bảo đảm

```
∀ (ts_bucket, zone):
    COUNT(driver_states WHERE status == "online_idle" AND current_zone == zone)
    == snapshot_A1[ts_bucket, zone].idle_supply
```

Khớp **100%**, không xấp xỉ. `online_busy` **không** cộng vào phép khớp này. `generate_drivers.py` tự đối chiếu sau khi sinh và **thoát mã 1** nếu lệch dù một dòng — file trên đĩa chỉ tồn tại khi đã khớp.

Kiểm lại bằng tay từ sample: mở `sample_driver_states_test.csv`, lọc `status == "online_idle"`, đếm theo `current_zone`, so với `idle_supply` cùng `ts_bucket` trong [../snapshots/](../snapshots/). Sample được xếp sẵn theo `(ts_bucket, status, current_zone, driver_id)` cho việc đó.

## 3. Cột

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `ts_bucket` | `timestamp[us, tz=+07:00]` | bước 5 phút, khớp A1 |
| `driver_id` | `string` | `DRV-nnnn`, khóa vào `config/driver_registry.json` |
| `current_zone` | `int32` | 1–30 |
| `status` | `string` | `online_idle` \| `online_busy` \| `offline` |
| `shift_end_ts` | `timestamp[us, tz=+07:00]` | **toàn null** — xem §5 |

Sample CSV **không có** cột `shift_end_ts` (toàn null thì in ra cũng không đọc được gì); mọi cột còn lại giống hệt parquet, không thêm cột suy ra nào.

## 4. Vì sao tài xế không rảnh lại đứng ở `home_zone`

- `offline` — hệ thống không biết vị trí. §4.8 đã chốt lấy `home_zone` làm `from_zone` khi phát offer cho tài xế offline.
- `online_busy` — đang chở khách, **không bao giờ** nhận offer (§4.8), nên vị trí của họ không tham gia bất kỳ phép tính nào. Bịa một zone khác chỉ tạo dữ liệu trông-như-thật.

Tỷ lệ `offline` cố định **25%** đội (150 người mỗi step, ASSUMPTION-21) — đây là nguồn ứng viên của Khối C. Nhóm 150 người này **đổi theo thời gian** (dịch vòng trên một hoán vị cố định), không phải cùng 150 người suốt cả run.

Tài xế `online_idle` được chọn theo thứ tự cố định: người có `home_zone` ở zone đó trước, rồi mới mượn từ nơi khác. Chưa xếp theo khoảng cách địa lý — `src/common/haversine.py` thuộc T3/T7, và A6 chỉ ràng buộc **số lượng**. Khoảng cách thật được tính lúc phát hành offer.

## 5. Nợ chưa trả

`shift_end_ts` để **null toàn bộ**: chưa có lịch ca nào trong tài liệu và CLAUDE.md §4 #6 cấm tự nghĩ số. Hệ quả: `is_near_shift_end` luôn false, nên `w_shift_end = 0.20` trong [config/driver_response.yaml](../../config/driver_response.yaml) **chưa có tác dụng**. Cần Data/BA cấp lịch ca trước khi dùng bất kỳ số activation nào phụ thuộc yếu tố "sắp hết ca".
