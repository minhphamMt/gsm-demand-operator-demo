# Issue #16 — README thiếu `libomp` cho macOS; rate limit in-process khi chạy nhiều replica

Trạng thái: **Đã xử lý** · Repo: `AI20K-Build-Phase-Cohort-3/P-042`

## Nguyên nhân

1. **Thiếu `libomp` trên macOS**: `apps/ai` dùng LightGBM (`requirements.txt`), và bản LightGBM cho macOS không đóng gói sẵn OpenMP runtime (`libomp`) — khác Linux/Windows. README chỉ liệt kê Python 3.11 + Node 22 + Supabase ở mục "Yêu cầu hệ thống" (`Cách 2 — Chạy trực tiếp từng service`), không có bước riêng cho macOS, nên `import lightgbm` (chạy ngay ở bước `pytest --collect-only` vì test import module) crash trước khi bất kỳ ai kịp chạy được gì.
2. **Rate limit dùng bộ nhớ trong tiến trình**: đây không phải lỗi mới — README dòng 548–549 (trước khi sửa) đã tự ghi nhận đúng vấn đề này ("Rate limit hiện dùng storage trong process; chỉ chạy một backend replica..."). Nợ kỹ thuật đã được biết và đã được tài liệu hoá từ trước, đúng như issue mô tả.
3. **Không có gì cần "chữa"** — mục 3 của issue là ghi nhận một điểm làm tốt (`config/driver_registry.json` ẩn danh 100%, `generate_drivers.py::validate_registry()` hard-fail nếu lộ tên thật hoặc trường chấm điểm tài xế), đề nghị viết lại thành tài liệu để không ai vô tình gỡ khi sửa script sau này.

## Hậu quả

- Dev macOS làm theo README, cài Python + Node đúng hướng dẫn, chạy `pytest` vẫn crash ngay bước collect vì thiếu `libomp` — không có gợi ý trong tài liệu để tự sửa, phải tự tìm trên mạng.
- Vấn đề 2 không gây hậu quả mới (đã được ghi nhận và giới hạn vận hành ở 1 replica); rủi ro chỉ phát sinh nếu sau này có người mở rộng lên nhiều replica mà quên đọc đúng dòng ghi chú này.
- Vấn đề 3 không phải rủi ro hiện tại, nhưng nếu không viết thành dòng riêng trong tài liệu vận hành, người sửa `generate_drivers.py` sau này (không biết bối cảnh C-03/C-08) có thể coi `validate_registry()` là code thừa và xoá nhầm.

## Cách chữa

1. **README §Yêu cầu hệ thống → Cách 2**: thêm dòng riêng cho macOS — `brew install libomp` trước `pip install -r apps/ai/requirements.txt`, kèm giải thích ngắn vì sao (LightGBM cần OpenMP) và phạm vi áp dụng (không cần trên Linux/Windows hoặc khi chạy qua Docker Compose, vì image Docker đã cài sẵn).
2. **Rate limit**: không sửa gì — dòng ghi chú tại README §Bảo mật và vận hành đã đúng và đủ theo đánh giá của chính issue ("nợ đã biết, chỉ cần theo dõi"). Không tự ý đổi sang Redis vì đó là thêm dependency mới, CLAUDE.md §6 #1 bắt buộc phải hỏi user trước — không nằm trong yêu cầu của issue này.
3. **README §Bảo mật và vận hành**: thêm một dòng ghi nhận cơ chế ẩn danh dữ liệu tài xế — `apps/ai/config/driver_registry.json` dùng `display_name` dạng `"Tài xế {n}"`, `is_demo_account: true` 100% bản ghi, không có trường chấm điểm/xếp hạng (C-08), và `apps/ai/generate_drivers.py::validate_registry()` hard-fail nếu vi phạm — kèm cảnh báo rõ "đừng gỡ hàm này".

## Đã kiểm chứng

| Việc | Kết quả |
|---|---|
| Đối chiếu `apps/ai/generate_drivers.py:264-276` | Xác nhận đúng như issue mô tả: `validate_registry()` kiểm `driver_id` trùng, `is_demo_account`, trường chấm điểm bị cấm (C-08), `home_zone` hợp lệ — `raise ValueError` chứ không log rồi bỏ qua |
| Đối chiếu README dòng rate limit trước khi sửa | Đúng là đã có sẵn, không cần thêm |
| `git diff README.md` | Chỉ 2 khối thêm dòng, không sửa nội dung cũ nào khác (đúng phạm vi issue, không refactor cơ hội) |

## Rút kinh nghiệm

- Yêu cầu hệ thống khác nhau theo OS (đặc biệt với thư viện native như LightGBM/OpenMP) nên tách rõ theo OS trong README ngay từ đầu, không gộp chung một danh sách — macOS luôn là trường hợp lệch nhiều nhất với các thư viện khoa học dữ liệu.
- Một dòng ghi chú nợ kỹ thuật đã có sẵn trong tài liệu (rate limit) thì không cần "sửa" gì thêm — việc của issue report chỉ là xác nhận nó còn đúng, tránh sửa lại những gì đã đúng ("không refactor cơ hội", CLAUDE.md §4.1 #4).
- Cơ chế phòng thủ chủ động trong code (hard-fail validator) chỉ có giá trị lâu dài nếu người đọc sau biết nó tồn tại — nên luôn có một dòng tương ứng trong tài liệu vận hành, không chỉ dựa vào comment tiếng Việt trong code mà hy vọng ai đó đọc tới.
