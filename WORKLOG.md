# Worklog — GSM-14 · NovaFour

> **Ghi chú:** bảng dưới đây được tái dựng ngày 2026-08-28 từ `git log` (nhánh `main` + các nhánh `fix/issue-*`), vì worklog không được ghi theo thời gian thực (xem [issue #15](../../issues/15)). Không có dữ liệu giờ làm thật ở thời điểm đó nên cột **Time** để `—`; từ nay ghi trực tiếp mỗi ngày làm việc, kèm giờ thật.

---

## 2026-08-08

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Viết SPEC dự án | ✅ Done | commit "SPEC dự án" | — |
| Nguyen Thanh Duy | Khởi tạo repo | ✅ Done | commit "init" | — |

**Tổng kết ngày:** Khởi động dự án, chốt SPEC.

---

## 2026-08-09

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Dựng skeleton project, plan module, hoàn thành T0 | ✅ Done | commit "tao skeleton project, plan module, done T0" | — |

**Tổng kết ngày:** Xong T0 (skeleton).

---

## 2026-08-10

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Xây detection + relocation v1 | ✅ Done | commit "feature detection + relocation.v1" | — |

**Tổng kết ngày:** Bản v1 của detection + relocation.

---

## 2026-08-11

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Minh Phạm | Dựng AI operations dashboard + tích hợp backend | ✅ Done | feat(operator): add AI operations dashboard and backend integration | — |
| Minh Phạm | Tích hợp live decision service | ✅ Done | feat(ai): integrate live decision service | — |
| Minh Phạm | Refactor sang canonical 30-zone pipeline | ✅ Done | refactor(ai): use canonical 30-zone pipeline | — |
| Minh Phạm | Align dashboard với AI zones, redesign AI control dashboard, áp full AI operations screen suite, expose verified AI data state | ✅ Done | 4 commit feat(operator/ui) | — |

**Tổng kết ngày:** Dashboard AI operations đầu tiên, pipeline 30-zone canonical hoá.

---

## 2026-08-12

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Thêm model forecast | ✅ Done | commit "add model forecast" | — |
| Nguyen Thanh Duy | Merge PR #1 (nhánh `AI`) vào main | ✅ Done | PR #1 | — |
| Minh Phạm | Viết handoff checklist & runbook cho operator | ✅ Done | docs(operator) | — |
| Minh Phạm | Tích hợp AI data vào operator experience | ✅ Done | feat: integrate AI data and operator experience | — |
| Minh Phạm | Fix operator console model workflow | ✅ Done | commit "fix operator console model workflow" | — |
| Minh Phạm | Harden operator workflow & trained replay integration | ✅ Done | fix: harden operator workflow and trained replay integration | — |

**Tổng kết ngày:** Model forecast lên main qua PR #1; operator workflow được harden.

---

## 2026-08-13

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Refactor lại cấu trúc project | ✅ Done | refactor structure project + merge | — |

**Tổng kết ngày:** Cấu trúc thư mục thống nhất lại.

---

## 2026-08-15

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Minh Phạm | Hoàn thiện operator workflow, cross-role operations | ✅ Done | feat: complete operator workflow and cross-role operations | — |
| Minh Phạm | Hoàn thiện operator analytics, driver sign-out | ✅ Done | Complete operator analytics and driver sign-out | — |

**Tổng kết ngày:** Operator workflow xong cross-role, chuẩn bị cho demo.

---

## 2026-08-16

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Minh Phạm | Chuẩn bị operator workflow cho demo cloud, phát hành bản demo công khai | ✅ Done | prepare operator workflow for cloud demo; Initial public demo release | — |
| Minh Phạm | Fix backend healthcheck Cloud Run, cấu hình Vercel SPA routing, tự động deploy Cloud Run | ✅ Done | 3 commit | — |
| Minh Phạm | Fix realtime replay & explicit forecast workflow, fix CI import formatting, chặn replay cache timestamp tương lai | ✅ Done | 4 commit | — |
| Minh Phạm | Chạy CI trên package ứng dụng đang active, fix realistic replay planning & forecast evaluation, làm rõ optimizer coverage metrics | ✅ Done | 3 commit | — |
| Minh Phạm | Sync production baseline đã verify, align risk planning với hybrid operations | ✅ Done | PR #4 sync/private-production-baseline | — |
| Minh Phạm | Align red-zone planning theo p90 risk | ✅ Done | PR #5 fix/private-risk-aware-ai | — |
| Minh Phạm | Persist complete hybrid plan | ✅ Done | PR #6 fix/private-hybrid-persistence | — |
| Minh Phạm | Giải thích hybrid plan coverage trên UI | ✅ Done | PR #7 fix/private-hybrid-operator-ui | — |
| Minh Phạm | Khoá hybrid planning regression bằng test | ✅ Done | PR #8 test/private-hybrid-regressions | — |
| Minh Phạm | Viết setup env + sample queries | ✅ Done | PR #9 docs/private-setup-and-sample-queries | — |
| Minh Phạm | Thêm 5 ca decision-flow thật vào eval | ✅ Done | PR #10 eval/private-decision-flow-evidence | — |
| Minh Phạm | Tính lại hybrid maximum commitment | ✅ Done | PR #11 fix/private-hybrid-cost-display | — |
| Nguyen Thanh Duy | Merge nhánh `agent/complete-operator-workflow`, commit feature train | ✅ Done | 2 commit | — |
| Minh Phạm | Cho phép release approved offer trong window, cập nhật kiến trúc hệ thống hiện tại, hoàn thiện setup + manual eval evidence | ✅ Done | 4 commit | — |

**Tổng kết ngày:** Ngày deploy demo công khai đầu tiên (Cloud Run + Vercel) và merge dồn 8 PR liên tiếp — đây là tiền đề trực tiếp của phát hiện "0/11 PR có review" ở issue #15.

---

## 2026-08-17

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyen Thanh Duy | Fix relocation | ✅ Done | commit "fix relocation" | — |
| Minh Phạm | Đồng bộ leader workflow từ `bb8f1f5`, gộp relocation prerequisites từ private main | ✅ Done | sync commit | — |
| Minh Phạm | Merge "combine main relocation with public operator UI", revert cùng ngày do lỗi, merge lại có kiểm soát | 🔄 WIP → ✅ Done | merge + revert + sync replay fix | — |
| Minh Phạm | Redesign execution control tower, thêm tab execution plan/offer | ✅ Done | feat(operator) | — |
| Minh Phạm | Áp camera preset cho map, smooth map view transition, ổn định viewport transition | ✅ Done | 3 commit | — |
| Minh Phạm | Hiện execution log trên bản đồ operations, đặt execution log cạnh command rail | ✅ Done | 2 commit | — |
| Minh Phạm | Hiện offer activity trong execution rail | ✅ Done | feat(operator) | — |
| Minh Phạm | Giữ active execution trong command rail, chặn forecast khi đang execute | ✅ Done | 2 commit | — |
| Minh Phạm | Hết hạn approved proposal chưa dùng, giữ server clock chạy tiếp, khôi phục approved proposal sau khi navigate | ✅ Done | 3 commit | — |
| Minh Phạm | Redesign notification center, bulk acknowledge notification, cache replay history cho autoplay | ✅ Done | 3 commit | — |
| Minh Phạm | Chặn approve proposal conflict khi stale, ổn định refresh UI, redesign offers | ✅ Done | 2 commit | — |
| Minh Phạm | Hiện cảnh báo execution quá hạn | ✅ Done | fix(operator) | — |

**Tổng kết ngày:** Ngày redesign lớn nhất cho operator console (execution control tower, notification, map) — một merge bị lỗi và phải revert ngay trong ngày.

---

## 2026-08-24

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Minh Phạm | Demo operator auto-login | ✅ Done | feat(auth) | — |
| Minh Phạm | Atomic snapshot ingestion, refresh replay snapshot đúng, so khớp current bucket theo instant | ✅ Done | 3 commit fix(replay/console) | — |
| Minh Phạm | Neo replay validity theo operation time | ✅ Done | fix(proposals) | — |
| Minh Phạm | Validate approval theo snapshot clock, giữ nguyên route metrics đã approve | ✅ Done | 2 commit | — |
| Minh Phạm | Giảm số lượt đọc DB khi polling, giảm egress polling production, poll đúng execution đang active, hiện đúng polling interval | ✅ Done | 4 commit perf/fix(operator) | — |
| Minh Phạm | Giữ trạng thái planning qua snapshot refresh | ✅ Done | fix(operator) | — |
| Minh Phạm | Refresh comparison khi chọn plan, dùng layout full-width cho comparison | ✅ Done | 2 commit fix(reports) | — |

**Tổng kết ngày:** Tập trung ổn định replay/execution pipeline và giảm tải polling production.

---

## 2026-08-25

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Minh Phạm | Calibrate full replay timeline | ✅ Done | data(ai) | — |
| Minh Phạm | Refresh forecast/execution snapshot sau khi stop | ✅ Done | 2 commit fix(forecast/execution) | — |
| Minh Phạm | Pace relocation mô phỏng theo ETA, animate relocation vehicle theo route, hiện xe khi active dispatch | ✅ Done | 3 commit fix/feat(map, dispatch) | — |
| Minh Phạm | Launch moderator operations workspace mới, kèm demo data | ✅ Done | 2 commit feat/fix(frontend) | — |
| Minh Phạm | Revert về classic operator console do regression, giữ operations-v2 prototype song song thay vì ghi đè | ✅ Done | revert + chore commit | — |
| Minh Phạm | Hiện chi tiết trạng thái tài xế mô phỏng | ✅ Done | feat(operator) | — |

**Tổng kết ngày:** UI mới (moderator workspace) gây regression, xử lý bằng revert + giữ song song thay vì đè lên console production.

---

## 2026-08-26

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Huy Copper | Wire route riêng cho `operations-v2` prototype để dev UI v2 không đụng console cũ | ✅ Done | feat(frontend) | — |

**Tổng kết ngày:** Bắt đầu tách UI v2 khỏi console production qua route riêng.

---

## 2026-08-28

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Huy Copper | Yêu cầu API key chung cho `apps/ai` inference routes (issue #12) | ✅ Done | PR #17 | — |
| Huy Copper | Chặn `demo-session` endpoint khi `NODE_ENV=production` (issue #13) | ✅ Done | PR #18 | — |
| Huy Copper | Gỡ pipeline gốc trùng lặp ở root, cô lập `legacy/` khỏi pytest (issue #14) | ✅ Done | PR #19 | — |
| Huy Copper | Bổ sung libomp prereq macOS, ghi chú driver anonymization guard trong README (issue #16) | ✅ Done | branch `fix/issue-16-readme-libomp-rate-limit` | — |
| Huy Copper | Rà quy trình theo issue #15 (PR review, branch protection, CI, hồ sơ AI usage), điền lại `JOURNAL.md`/`WORKLOG.md` từ lịch sử commit | ✅ Done | JOURNAL.md, WORKLOG.md | — |

**Tổng kết ngày:** Vá 3 lỗ hổng bảo mật/vệ sinh code theo issue #12–14, bổ sung docs theo issue #16, và dọn hồ sơ quy trình theo issue #15.

<!-- Format: copy block trên cho mỗi ngày làm việc -->
