import { routes } from '@/shared/config/routes'

// Một nguồn sự thật cho điều hướng operator. Thanh sáng của shell và đầu trang tối của trang
// Điều hành cùng đọc bảng này — hai bản sao sẽ sớm lệch nhau ở chỗ khó thấy nhất: quy tắc
// đánh dấu mục đang mở khi đứng ở trang chi tiết.
export const operatorNavItems = [
  { label: 'Điều hành', path: routes.operator.root, matches: (path: string) => path === routes.operator.root || path.startsWith(routes.operator.plans) || path.startsWith(routes.operator.campaigns) },
  { label: 'Đang vận hành', path: routes.operator.execution, matches: (path: string) => path.startsWith(routes.operator.execution) },
  { label: 'So sánh kịch bản', path: routes.operator.reports, matches: (path: string) => path.startsWith(routes.operator.reports) },
  { label: 'Nhật ký', path: routes.operator.history, matches: (path: string) => path.startsWith(routes.operator.history) },
] as const
