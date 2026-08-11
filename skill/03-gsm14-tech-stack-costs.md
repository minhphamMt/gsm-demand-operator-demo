---
project: GSM-14
document_language: vi
source_file: GSM14_Cong_nghe_va_Chi_phi_MVP.xlsx
status: Technology and cost baseline dated 2026-08-04
converted_for: Codex project setup
---

# GSM-14 — Công nghệ sử dụng và chi phí MVP

> **Mục đích sử dụng với Codex:** Đọc file này trước khi lựa chọn dependency, cấu hình hạ tầng, bản đồ, GPS, deploy hoặc ước tính ngân sách. Không tự thay framework/ORM/dịch vụ nếu chưa có quyết định cập nhật.
>
> Nội dung nghiệp vụ và quyết định kỹ thuật trong file này được giữ theo tài liệu nguồn. Khi triển khai, Codex không được tự thêm chức năng ngoài phạm vi hoặc tự sửa các quyết định đã chốt.

## 1. Tổng quan

| Thông số | Giá trị |
| --- | --- |
| Ngày lập | 2026-08-04 |
| Tỷ giá USD/VND | 26490 |
| Phạm vi | MVP mô phỏng Agent bằng rule-based |

### Kiến trúc công nghệ chính

| Lớp | Công nghệ chính | Vai trò | Gói đề xuất | Chi phí MVP |
| --- | --- | --- | --- | --- |
| Frontend | React + TypeScript + Vite | Dashboard vận hành và giao diện tài xế | Vercel Hobby | 0 USD |
| Backend | NestJS + TypeScript | API, WebSocket, mô phỏng, nghiệp vụ | Railway Hobby | 5 USD |
| Database | Supabase PostgreSQL + PostGIS | Dữ liệu quan hệ và không gian | Supabase Free | 0 USD |
| Bản đồ | Mapbox GL JS + H3 + Turf.js | Heatmap, vùng, tuyến mô phỏng | Free tier | 0 USD |
| Route/ETA | Mapbox Directions API | Tạo tuyến di chuyển mô phỏng | Free tier | 0 USD |

### Khuyến nghị triển khai theo tài liệu nguồn

- Giai đoạn phát triển có thể dùng hoàn toàn các gói miễn phí.
- Trước buổi demo nên chuyển backend sang Railway Hobby để giảm nguy cơ cold start.
- Chi phí và giới hạn dịch vụ là dữ liệu tại thời điểm lập bảng; cần kiểm tra lại trước khi mua hoặc nâng gói.

## 2. Danh sách công nghệ

| Nhóm | Công nghệ | Vai trò trong dự án | Mức độ | Chi phí license | Giai đoạn dùng | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend | React | Xây giao diện Người vận hành và Tài xế | Bắt buộc | Miễn phí | MVP | Dùng chung một web responsive/PWA |
| Frontend | TypeScript | Kiểu dữ liệu thống nhất giữa frontend và backend | Bắt buộc | Miễn phí | MVP |  |
| Frontend | Vite | Build và chạy dự án frontend | Bắt buộc | Miễn phí | MVP |  |
| Frontend | Tailwind CSS | Tạo giao diện nhanh | Bắt buộc | Miễn phí | MVP |  |
| Frontend | shadcn/ui | Component giao diện | Nên dùng | Miễn phí | MVP |  |
| Frontend | React Router | Điều hướng theo vai trò | Bắt buộc | Miễn phí | MVP | /operator và /driver |
| Frontend | TanStack Query | Gọi API, cache và đồng bộ server state | Bắt buộc | Miễn phí | MVP |  |
| Frontend | Zustand | Quản lý state cục bộ | Nên dùng | Miễn phí | MVP |  |
| Frontend | React Hook Form + Zod | Form và validation | Nên dùng | Miễn phí | MVP |  |
| Frontend | Recharts | Biểu đồ funnel và chi phí | Nên dùng | Miễn phí | MVP |  |
| Backend | NestJS | Backend chính, module nghiệp vụ | Bắt buộc | Miễn phí | MVP |  |
| Backend | TypeScript | Đồng bộ kiểu dữ liệu | Bắt buộc | Miễn phí | MVP |  |
| Backend | REST API + Swagger | API nghiệp vụ và tài liệu API | Bắt buộc | Miễn phí | MVP |  |
| Backend | WebSocket + Socket.IO | Realtime vị trí xe, offer và campaign | Bắt buộc | Miễn phí | MVP |  |
| Backend | TypeORM | ORM cho PostgreSQL | Nên dùng | Miễn phí | MVP | Spatial query phức tạp dùng raw SQL |
| Backend | @nestjs/schedule | Job định kỳ: simulator, hết hạn offer, no-show | Bắt buộc | Miễn phí | MVP |  |
| Backend | Pino | Logging | Nên dùng | Miễn phí | MVP |  |
| Backend | Jest + Supertest | Unit test và API test | Nên dùng | Miễn phí | MVP |  |
| Database | Supabase PostgreSQL | Database quan hệ | Bắt buộc | Free/Pro | MVP | Chọn Supabase thay Firestore |
| Database | PostGIS | Geofence, khoảng cách, point-in-polygon | Bắt buộc | Miễn phí | MVP | Bật extension trong Supabase |
| Database | Supabase Auth | Đăng nhập và phân quyền | Nên dùng | Free/Pro | MVP |  |
| Database | Row Level Security | Bảo vệ dữ liệu theo vai trò | Nên dùng | Miễn phí | MVP |  |
| Map | Mapbox GL JS | Hiển thị bản đồ, H3, polygon, marker và route | Bắt buộc | Theo usage | MVP | Free tier đủ cho MVP |
| Map | Mapbox Directions API | Tạo tuyến đường, khoảng cách và ETA mô phỏng | Bắt buộc | Theo request | MVP | Không cần Search/Places |
| Map | h3-js | Tạo lưới lục giác heatmap | Bắt buộc | Miễn phí | MVP |  |
| Map | Turf.js | Nội suy và animate xe theo tuyến | Bắt buộc | Miễn phí | MVP |  |
| GPS | Browser Geolocation API | Lấy GPS thật từ thiết bị khi test | Nên dùng | Miễn phí | MVP | Song song chế độ SIMULATED |
| Deploy | Vercel Hobby | Deploy frontend | Bắt buộc | 0 USD | MVP |  |
| Deploy | Railway Hobby | Deploy backend ổn định | Khuyến nghị | Từ 5 USD/tháng | Demo | Có thể dùng Render Free lúc phát triển |
| Mô phỏng | RuleBasedProposalGenerator | Thay Agent thật trong MVP | Bắt buộc | Miễn phí | MVP | Sau này thay bằng AgentProposalGenerator |

## 3. API bản đồ, GPS và dữ liệu không gian

| Thành phần | Có dùng trong MVP? | Mục đích | Khi nào gọi | Free tier/chi phí | Dữ liệu đầu vào | Dữ liệu đầu ra | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mapbox GL JS | Có | Hiển thị bản đồ, heatmap, polygon, xe và route | Khi mở màn hình bản đồ | 50.000 map loads/tháng miễn phí | GeoJSON, H3, tọa độ | Bản đồ tương tác | Tính theo map load |
| Mapbox Directions API | Có | Tính route, khoảng cách và ETA | Khi tài xế chấp nhận offer hoặc tạo lại tuyến | 100.000 request/tháng miễn phí | Điểm đầu và điểm đích | Geometry, distance, duration | Không gọi theo từng frame |
| h3-js | Có | Chia Hà Nội thành cell lục giác | Khi tạo heatmap và phân vùng | Miễn phí | Latitude, longitude | H3 index và boundary | Chạy trong ứng dụng |
| Turf.js | Có | Chia route thành điểm và animate marker | Trong mô phỏng di chuyển | Miễn phí | Route GeoJSON | Các điểm trên tuyến | Chạy trong frontend/backend |
| PostGIS | Có | Xác minh GPS nằm trong campaign zone | Mỗi lần kiểm tra vị trí hợp lệ | Đi kèm PostgreSQL | Point và Polygon | Kết quả ST_Covers/ST_DWithin | Nguồn quyết định nghiệp vụ |
| Browser Geolocation API | Có thể dùng | Lấy GPS thật từ điện thoại | Khi test chế độ DEVICE_GPS | Miễn phí | Quyền vị trí của trình duyệt | Lat, lng, accuracy, timestamp | Không phải API Mapbox |
| Mapbox Search/Geocoding | Không | Tìm địa chỉ, đổi tọa độ sang địa chỉ | Chưa cần trong MVP | Không phát sinh | Text hoặc tọa độ | Địa chỉ/địa điểm | Bổ sung khi có khách đặt xe |
| Google Places/Routes | Không | Tìm địa điểm và route thay thế | Chưa cần | Không phát sinh | - | - | Không dùng song song để tránh phức tạp |

## 4. Chi phí dịch vụ và API theo tháng

| Dịch vụ | Gói sử dụng | Giới hạn miễn phí | Lượng dùng giả định/tháng | Đơn vị | Đơn giá vượt ngưỡng (USD) | Số lượng tính phí | Chi phí USD/tháng | Chi phí VND/tháng | Nguồn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vercel | Hobby | Đủ cho frontend MVP | 1 | project | 0 | 0 | 0 | 0 | https://vercel.com/pricing |
| Railway | Hobby | Không miễn phí cố định | 1 | backend | 5 | 1 | 5 | 132450 | https://docs.railway.com/pricing |
| Supabase | Free | 500 MB database; 2 project hoạt động | 1 | project | 0 | 0 | 0 | 0 | https://supabase.com/pricing |
| Mapbox GL JS | Free tier | 50.000 map loads | 15000 | map loads | 0.005 | 0 | 0 | 0 | https://www.mapbox.com/pricing |
| Mapbox Directions API | Free tier | 100.000 requests | 5000 | requests | 0.002 | 0 | 0 | 0 | https://www.mapbox.com/pricing |
| H3 / Turf.js / PostGIS | Open source / extension | Không giới hạn license | 1 | stack | 0 | 0 | 0 | 0 | https://h3geo.org/ |
| TỔNG CHI PHÍ DEMO ỔN ĐỊNH |  |  |  |  |  |  | 5 | 132450 |  |
| Giả định: 15.000 map loads/tháng và 5.000 Directions requests/tháng — đều nằm trong free tier của Mapbox. |  |  |  |  |  |  |  |  |  |

## 5. Kịch bản ngân sách

| Kịch bản | Frontend | Backend | Database | Map/API | Tổng USD/tháng | Tổng VND/tháng |
| --- | --- | --- | --- | --- | --- | --- |
| Phát triển miễn phí | 0 | 0 | 0 | 0 | 0 | 0 |
| Demo ổn định | 0 | 5 | 0 | 0 | 5 | 132450 |
| Pilot nhỏ | 0 | 5 | 25 | 0 | 30 | 794700 |
| Nhóm dùng gói Pro | 20 | 5 | 25 | 0 | 50 | 1324500 |

## 6. Quy tắc triển khai dành cho Codex

- Frontend sử dụng React, TypeScript và Vite; không tự chuyển sang Next.js.
- Backend sử dụng NestJS và TypeScript.
- ORM trong tài liệu nguồn là TypeORM; truy vấn không gian phức tạp có thể dùng raw SQL có kiểm soát.
- Database sử dụng Supabase PostgreSQL và PostGIS.
- H3 dùng cho heatmap và lọc nhanh; PostGIS là nguồn xác minh geofence cuối cùng.
- Frontend bản đồ sử dụng Mapbox GL JS, `h3-js` và Turf.js.
- Route/ETA mô phỏng sử dụng Mapbox Directions API; không gọi API theo từng frame animation.
- MVP dùng `RuleBasedProposalGenerator`; `AgentProposalGenerator` chỉ thay thế bộ sinh proposal về sau.
- Không đưa secret, service-role key hoặc access token vào source code.
