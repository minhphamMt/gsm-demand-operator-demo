# AI Dashboard Redesign Checklist

- [x] Phân tích giao diện mẫu NovaFour Ops trên Chrome
- [x] Phân tích luồng AI và luồng thao tác operator hiện tại
- [x] Chốt cấu trúc thông tin trực quan, giảm chữ và nhiễu
- [x] Tạo dự án Stitch mới "NovaFour AI Zone Control" và sinh dashboard 30 zone
- [x] Áp dụng thiết kế mới vào dashboard hệ thống
- [x] Kiểm tra dữ liệu 30 AI zone trên bản đồ và các panel
- [x] Kiểm tra responsive, trạng thái loading/empty/error
- [x] Chạy lint, 86 test và production build
- [x] Kiểm thử trực quan dashboard trên Chrome
- [x] Commit và push code sản phẩm, không gồm checklist/docs/skill

## Full functional screen suite

- [x] Bổ sung phân tích UX từ ảnh NovaFour Ops đầy đủ
- [x] Gửi đặc tả 8 artboard riêng vào dự án Stitch mới
- [x] Hoàn thiện artboard Đăng nhập
- [x] Hoàn thiện artboard Điều hành / Quan sát
- [x] Hoàn thiện artboard So sánh phương án
- [x] Hoàn thiện artboard Phê duyệt phương án
- [x] Hoàn thiện artboard Chiến dịch & Offer
- [x] Hoàn thiện artboard Báo cáo vận hành
- [x] Hoàn thiện artboard Lịch sử & Audit
- [x] Hoàn thiện artboard Driver Offer mobile
- [x] Áp dụng từng artboard vào route tương ứng
- [x] Kiểm thử trực quan toàn bộ route trên Chrome
- [x] Chạy lint, test và production build
- [x] Push bản hoàn chỉnh (`5f2daf5`)

## Nâng cấp từ bản NovaFour Ops offline

- [x] Đọc và phân tích state machine trong file HTML offline
- [x] Đối chiếu luồng quan sát → dự báo → đề xuất → phê duyệt → thực thi → activation
- [x] Không đưa H3 hoặc dữ liệu mô phỏng của bản mẫu vào dữ liệu production
- [x] Hiển thị rõ LIVE API và DỮ LIỆU MÔ PHỎNG trên dashboard
- [x] Khóa thao tác gọi model production khi frontend chạy mock mode
- [x] Bổ sung tín hiệu kiểm chứng từ response: zone live, zone có forecast và policy check
- [x] Đồng bộ thanh tiến trình với trạng thái dữ liệu/đề xuất thực tế
- [x] Chạy lint, 89 test và production build
- [x] QA trực quan dashboard, không có lỗi console
