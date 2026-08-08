# frontend — SPA vận hành + Driver App

Chưa scaffold. Đây là việc của **task T8** ([IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)).

Cố ý để trống ở bước skeleton: chạy `npm create vite` bây giờ sẽ kéo `node_modules`
và một `package-lock.json` vào repo trước khi có ai dùng đến nó.

## Đã chốt

- **Stack:** Vite + React + TypeScript. Không thêm UI framework nặng, không thêm
  state manager nếu chưa hỏi (CLAUDE.md §6 #6).
- **Một SPA duy nhất**, build ra `frontend/dist/`, do chính FastAPI phục vụ qua
  `StaticFiles` — một container, cùng origin, **không cấu hình CORS**
  (quyết định A-01, [ARCHITECTURE.md §9](../ARCHITECTURE.md#9-quyết-định-kiến-trúc-spec-để-trống--chốt-ở-đây)).
  Dev server dùng `server.proxy` của Vite trỏ về `http://localhost:8000`.
- **Route** ([ARCHITECTURE.md §4.5](../ARCHITECTURE.md#45-frontend)):

| Route | Màn hình |
|---|---|
| `/` | Bảng điều khiển: heatmap 30 zone, badge stale, điều khiển tua |
| `/plan/:planId` | Chi tiết plan + nút Revise / Approve / Reject |
| `/plan/:planId/activation` | Huy động thêm — **nút Phát hành offer là xác nhận riêng** |
| `/plan/:planId/scenarios` | 3 kịch bản cạnh nhau, có nhãn "mô phỏng" / "người thật" |
| `/history` | Tra cứu audit trail |
| `/driver` | Driver App — thẻ offer, Nhận/Từ chối, đếm ngược, **polling 2 giây** |

Không dùng WebSocket (§7.1 #3) và không có auth thật — chọn `driver_id` từ dropdown demo (§7.1 #4).
