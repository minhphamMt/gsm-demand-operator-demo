# Bộ tài liệu đặc tả — Hệ thống AI Agent dự báo & điều phối xe

Dựng từ **11 video concept** (`1.mp4` … `11.mp4`), ngày 20/08/2026.

## Các file

| File | Nội dung | Đọc khi nào |
|---|---|---|
| `00-video-evidence-map.md` | Bản đồ bằng chứng: video → màn hình → tài liệu. Toàn bộ chữ đọc rõ được từ video, chép nguyên văn | Đọc **trước tiên**. Đây là nguồn sự thật; ba file sau đều truy vết về đây |
| `01-functional-spec.md` | Actor, 9 use case, quy tắc nghiệp vụ, tiêu chí chấp nhận | Khi viết user story, làm test case |
| `02-technical-spec.md` | 9 JSON contract, kiến trúc 5 agent, bộ tool, luồng dữ liệu đầu-cuối | Khi chia việc BE/FE, thống nhất interface |
| `03-uiux-spec.md` | Design token, sitemap 7 màn hình, 17 component, quy tắc biểu đồ, tiếp cận | Khi dựng design system và code UI |
| `04-agent-architecture.md` | Kiến trúc runtime nâng cấp: LangGraph, fan-out/join, HITL, automation grant, migration bằng adapter/feature flag | Khi thiết kế orchestration và triển khai agent |
| `05-business-logic.md` | State machine, trigger, re-plan, scoring 3 plan, quyền tự động, audit và rollback | Khi chốt nghiệp vụ và viết acceptance test |
| `06-delivery-pipeline.md` | Runtime deployment, adapter, môi trường, CI/CD, shadow/canary, promotion và rollback | Khi xây dựng và phát hành hệ thống |
| `07-Design.md` | Đặc tả panel "Autonomous Resolution Pipeline": cấu trúc tab, thẻ agent, sơ đồ Connect | Khi dựng hoặc sửa panel luồng agent |
| `08-interaction-log-plan.md` | **Không phải spec.** Kế hoạch triển khai nhật ký hội thoại agent trực tiếp (MA-6.x), kèm các đánh đổi đã cân nhắc | Khi làm Phase 6, hoặc khi cần biết vì sao không dùng `astream_events` |
| `04-wireframe.html` | Prototype click được, mô phỏng S0–S6 | Mở bằng trình duyệt để cảm nhận luồng |
| `frames/` | 43 keyframe trích từ video | Đối chiếu khi review spec |
| `IMPLEMENTATION_STATUS.md` | **Không phải spec.** Trạng thái triển khai thực tế: phase nào xong, kiểm chứng bằng gì, lệch chỗ nào so với bộ tài liệu này | Khi muốn biết code đang ở đâu so với thiết kế |
| `TASKS.md` | **Không phải spec.** Bảng công việc theo phase, mã `MA-nn`, có phần hướng dẫn cho người vừa pull về | Khi bắt đầu làm, hoặc khi cần biết việc tiếp theo |

> `04-wireframe.html` và `frames/` được liệt kê ở trên nhưng **hiện không có trong thư mục**.

## Cách đọc ký hiệu

Mỗi khẳng định trong tài liệu mang một trong ba nhãn:

- **`[V-n]`** — có bằng chứng trực tiếp trong video n (chữ đọc được hoặc yếu tố đồ hoạ rõ).
- **`[Chuẩn hoá]`** — video có gợi ý nhưng không đủ rõ; tài liệu đề xuất một phương án nhất quán.
- **`[Cần xác nhận]`** — **không có trong video**; là khoảng trống nhóm cần quyết định.

Ngoài ra `02-technical-spec.md` dùng thêm **`[Đề xuất]`** cho phần kỹ thuật thuần (model, hạ tầng) mà video hoàn toàn không nói tới.

## Cảnh báo về nguồn

Đây là **video concept do AI sinh**, không phải bản ghi màn hình sản phẩm thật. Phần lớn nhãn phụ là chữ nhiễu; số liệu không nhất quán giữa các frame; video còn tự mâu thuẫn ở vài chỗ (hai danh sách agent khác nhau, hai nút cùng ghi `CANCEL`). Tài liệu chỉ đưa vào những chuỗi thực sự đọc rõ và coi mọi con số là **minh hoạ**. Các giá trị trong khối JSON và trong wireframe phần lớn là dữ liệu bịa để ví dụ chạy được — chỉ những con số có trích dẫn nguyên văn mới đến từ video. Chi tiết ở `00-video-evidence-map.md §1` và `§4.7`.

## 10 câu hỏi cần chốt trước khi code

Xếp theo mức chặn tiến độ. Bảng đầy đủ ở `01-functional-spec.md §6`.

| # | Câu hỏi |
|---|---|
| Q1 | Chân trời dự báo: **+10/+20/+30 phút** (video) hay **5/10/15 phút** (kế hoạch nhóm)? |
| Q2 | Danh sách agent chính thức: 5 agent, hay có thêm Weather/Fee? |
| Q3 | Ngưỡng chuyển trạng thái zone (BALANCED → WATCH → ABNORMAL → SHORTAGE) |
| Q4 | Công thức xếp hạng để chọn phương án `Recommended` |
| Q5 | `MODIFY` mở màn hình gì? `REJECT` dẫn tới đâu? |
| Q6 | Phân biệt `RECALL` và `CANCEL` |
| Q7 | Điều gì kích hoạt `NEW DATA INGESTED` |
| Q8 | Zone là hexagon (H3) hay đa giác hành chính? Video có cả hai kiểu |
| Q9 | Định giá động & gói huy động — có trong sản phẩm này không? Không clip nào có |
| Q10 | Theme mặc định: video 100% dark, ghi chú design system trước đó là light |

## Ba điểm đáng chú ý nhất từ video

**1. Video cho biết có những agent nào — nhưng không cho biết tool nào.** Chuỗi `Forecast → Traffic → Supply → Dispatch → Optimization` với sơ đồ hội tụ về Optimization Agent là phần kiến trúc rõ ràng nhất video cung cấp. Bộ tool ở `02-technical-spec.md §3.2` là **`[Đề xuất]`**, suy ra từ những con số mà UI buộc phải có — không phải thứ đọc được từ video.

**2. Có một hướng khoanh vùng lỗi điều xe hiện tại — nhưng cần chốt ngữ nghĩa trước.** `02-technical-spec.md §4.3` đề xuất một assertion ở biên contract để tách lỗi tầng sinh action khỏi lỗi tầng model. Lưu ý: **chính video cũng vi phạm assertion đó** (`Re-route 50 Vehicles to Zone B` trong khi Zone B là vùng dư), và `from_zone` là `[Cần xác nhận]`. Phải chốt ngữ nghĩa `to_zone` trước khi bật kiểm tra.

**3. Bốn màu trạng thái không đứng một mình được.** Chạy validator trên bộ xanh/vàng/cam/đỏ (dark, `--pairs all`) cho **FAIL**: cặp đỏ↔xanh lá ΔE 4.1 (deutan), cặp cam↔vàng ΔE 13.6 (thị lực bình thường). Mọi chỗ dùng màu trạng thái **bắt buộc** kèm icon hoặc nhãn chữ. Video đã làm đúng ở phần cảnh báo; cần áp dụng nhất quán. Chi tiết ở `03-uiux-spec.md §2.2` và `§8`.
