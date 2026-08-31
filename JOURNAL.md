# Weekly Journal — GSM-14 · NovaFour

> **Ghi chú:** nội dung dưới đây được tái dựng ngày 2026-08-28 từ lịch sử commit (`git log`) trên `main`, vì JOURNAL không được cập nhật theo thời gian thực trong quá trình làm (xem [issue #15](../../issues/15)). Từ tuần hiện tại trở đi, cập nhật file này trực tiếp mỗi cuối tuần thay vì dồn lại.

---

## Week 1: 2026-08-08 – 2026-08-13 (Khởi tạo & baseline pipeline)

### Mục tiêu tuần này
- [x] Viết SPEC dự án, dựng skeleton T0
- [x] Xây bản v1 của detection + relocation
- [x] Dựng AI operations dashboard đầu tiên và tích hợp backend

### Đã hoàn thành
- SPEC dự án, khởi tạo repo, skeleton project + plan module (T0) — Nguyen Thanh Duy
- `feature detection + relocation.v1`, thêm model forecast, merge PR #1 nhánh `AI` — Nguyen Thanh Duy
- AI operations dashboard, live decision service, refactor sang canonical 30-zone pipeline, handoff checklist/runbook cho operator — Minh Phạm
- Refactor lại cấu trúc thư mục project — Nguyen Thanh Duy

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Nhiều bản vá liên tiếp cùng ngày cho "operator console model workflow" | Harden lại operator workflow + trained replay integration | Ổn định trước khi sang tuần tích hợp demo |
| Cấu trúc project ban đầu không nhất quán giữa các nhánh | Refactor cấu trúc + merge riêng một PR | Base thư mục thống nhất cho các nhánh sau |

### Bài học
- Nên canonical hoá pipeline 30-zone ngay từ đầu để tránh mỗi module tự tính lại.
- Refactor cấu trúc thư mục càng sớm càng rẻ — để trễ sẽ dồn xung đột sang các nhánh feature đang chạy song song.

### Kế hoạch tuần sau
- [x] Hoàn thiện operator workflow cross-role
- [x] Chuẩn bị và deploy bản demo công khai

---

## Week 2: 2026-08-15 – 2026-08-17 (Demo công khai & hybrid planning)

### Mục tiêu tuần này
- [x] Hoàn thiện operator workflow, analytics, driver sign-out
- [x] Deploy demo công khai (Cloud Run + Vercel)
- [x] Đóng loạt PR risk-aware / hybrid planning

### Đã hoàn thành
- Operator analytics, driver sign-out, cross-role operations — Minh Phạm
- Deploy Cloud Run + Vercel SPA routing, healthcheck, CI chạy trên package đang active — Minh Phạm
- 8 PR merge trong ngày 2026-08-16 (#4–#11): sync production baseline, risk-aware AI theo p90, persist hybrid plan, giải thích hybrid coverage trên UI, test khoá hybrid regression, docs setup + sample queries, 5 ca decision-flow thật, tính lại hybrid maximum commitment
- Redesign lớn cho operator console ngày 2026-08-17: execution control tower, notification center, map view transitions/camera preset, execution log trên bản đồ, offer activity trong execution rail
- Fix relocation — Nguyen Thanh Duy

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Merge "combine main relocation with public operator UI" gây lỗi ngay sau khi merge | Revert trong cùng ngày, merge lại có kiểm soát hơn (`sync replay fix into leader/private branches`) | Operator UI ổn định trở lại cùng ngày |
| 8 PR được merge dồn trong một ngày (2026-08-16) | Không có bước xử lý tại thời điểm đó | Đây là nguyên nhân trực tiếp của phát hiện "0/11 PR có review người thật" ở issue #15 |

### Bài học
- Merge dồn nhiều PR lớn trong một ngày làm mất khả năng review thực tế, kể cả khi CI xanh.
- Thay đổi UI lớn (execution control tower, notification) nên tách nhỏ theo từng PR thay vì gộp thành một đợt redesign.

### Kế hoạch tuần sau
- [x] Ổn định replay/execution pipeline
- [x] Giảm tải polling production

---

## Week 3: 2026-08-24 – 2026-08-25 (Ổn định replay/execution & moderator workspace)

### Mục tiêu tuần này
- [x] Ổn định replay/execution pipeline, atomic snapshot ingestion
- [x] Giảm tải polling production
- [x] Thử nghiệm moderator operations workspace mới

### Đã hoàn thành
- Auto-login demo operator, atomic snapshot ingestion, anchor replay validity theo operation time, so khớp current bucket theo instant
- Validate approval theo snapshot clock, preserve route metrics khi approve
- Giảm số lượt đọc DB và egress khi polling, poll đúng execution đang active, hiện đúng polling interval
- Calibrate full replay timeline, pace relocation theo ETA, animate relocation vehicle theo route
- Launch moderator operations workspace (route/prototype riêng), hiện chi tiết trạng thái tài xế mô phỏng

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Moderator operations workspace mới gây regression trên console đang chạy | Revert về classic operator console, giữ operations-v2 chạy song song ở route riêng thay vì ghi đè | Console production không bị ảnh hưởng, vẫn giữ được prototype để phát triển tiếp |

### Bài học
- Thay đổi UI lớn nên đi qua route/prototype tách biệt (`operations-v2`) thay vì ghi đè trực tiếp lên console đang chạy production — dễ revert, không chặn demo.

### Kế hoạch tuần sau
- [x] Rà soát quy trình PR/CI/hồ sơ AI usage (issue #15)
- [x] Vá các lỗ hổng bảo mật đang mở (issue #12, #13)

---

## Week 4: 2026-08-26 – 2026-08-28 (Bảo mật, dọn nợ quy trình)

### Mục tiêu tuần này
- [x] Vá lỗ hổng auth/inference (issue #12, #13)
- [x] Dọn dead code, cô lập legacy khỏi pytest (issue #14)
- [x] Bổ sung docs còn thiếu, rà quy trình PR/CI/AI-log (issue #15, #16)

### Đã hoàn thành
- Wire route riêng cho `operations-v2` prototype, không đụng console cũ — Huy Copper
- PR #17: yêu cầu API key chung cho `apps/ai` inference routes (issue #12)
- PR #18: chặn `demo-session` endpoint khi `NODE_ENV=production` (issue #13)
- PR #19: gỡ pipeline gốc trùng lặp ở root, cô lập `legacy/` khỏi pytest (issue #14)
- Bổ sung libomp prereq cho macOS, ghi chú driver anonymization guard trong README (issue #16)
- Rà issue #15, điền lại `JOURNAL.md`/`WORKLOG.md` từ lịch sử commit

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| CI hỏng 55/56 lượt từ 2026-07-23, job dừng ở bước 0 | Xác định nguyên nhân là khoá thanh toán GitHub Actions cấp tổ chức, không phải lỗi cấu hình CI — cần báo owner mở lại billing | Chưa tự sửa được; cần chạy lại toàn bộ CI và dọn job đỏ sau khi billing mở |
| 0/11 PR trong lịch sử có review của người thật; `main` không bật branch protection | Ghi nhận trong issue #15, đề xuất bật branch protection (1 approval) + PR nhỏ hơn + PR template | Chưa bật — cần quyết định của người có quyền admin repo |
| `JOURNAL.md`/`WORKLOG.md` là template rỗng dù CLAUDE.md ghi là deliverable bắt buộc | Tái dựng nội dung từ `git log` thay vì để trống | Hồ sơ giải trình có nội dung thật, có ghi chú minh bạch là tái dựng |

### Bài học
- JOURNAL/WORKLOG phải cập nhật theo thời gian thực; dồn lại cuối kỳ chỉ tái tạo được "cái gì" từ commit message, không tái tạo được "khó khăn thật sự lúc đó" hay số giờ làm.
- PR càng lớn (190k–295k dòng ở một số PR) càng không ai review nổi — cần chốt quy ước PR nhỏ, một PR một mục đích, ngay từ đầu dự án chứ không phải sau khi bị phát hiện.

### Kế hoạch tuần sau
- [ ] Bật branch protection cho `main` (yêu cầu 1 approval)
- [ ] Thêm PR template (thay đổi gì / kiểm thế nào / phần AI sinh)
- [ ] Khi billing GitHub Actions được mở lại: chạy toàn bộ CI, dọn các job đỏ
