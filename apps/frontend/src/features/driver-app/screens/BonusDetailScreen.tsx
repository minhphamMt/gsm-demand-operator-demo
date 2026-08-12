import type { CSSProperties } from 'react';
import { HomeIndicator } from '../components/HomeIndicator';
import {
  BackChevronIcon,
  CalendarIcon,
  CategoryVehicleIcon,
  CheckCircleFilledIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  GiftIcon,
  LeafIcon,
} from '../components/icons';
import { useDriverApp } from '../state/DriverAppContext';

function ProgressRow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
      <span style={{ font: "700 15px/1 'Be Vietnam Pro',sans-serif", color: '#e2603c' }}>3.000đ/lượt</span>
      <span style={{ font: "700 14px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>00:20:32</span>
    </div>
  );
}

function ProgressBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 9, borderRadius: 5, background: '#f1f3f3', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%', borderRadius: 5, background: 'linear-gradient(90deg,#f7c26a,#e2603c)' }} />
        <div
          style={{
            position: 'absolute',
            left: '62%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 19,
            height: 19,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LeafIcon size={10} />
        </div>
      </div>
      <span style={{ font: "400 12px/1 'Be Vietnam Pro',sans-serif", color: '#8b9296', flex: 'none' }}>Còn 20 lượt</span>
    </div>
  );
}

const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, padding: '13px 15px', marginTop: 11, boxShadow: '0 1px 3px rgba(0,0,0,.06)' };
const sectionHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  font: "700 14px/1 'Be Vietnam Pro',sans-serif",
  color: '#1b2225',
  paddingBottom: 11,
  borderBottom: '1px solid #f1f3f3',
};

export function BonusDetailScreen() {
  const { isBonusDetail, nav } = useDriverApp();
  if (!isBonusDetail) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f4f6f6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', height: 112, background: 'linear-gradient(180deg,#8fe2ea,#d9f4f7)', position: 'relative', zIndex: 0 }}>
        <button
          onClick={nav.demand}
          style={{
            position: 'absolute',
            left: 12,
            top: 54,
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 0,
            background: 'rgba(255,255,255,.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 3,
          }}
          aria-label="Quay lại"
        >
          <BackChevronIcon />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 20px', marginTop: -24, position: 'relative', zIndex: 1 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 15px 15px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ font: "700 17px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225', textAlign: 'center', marginBottom: 14 }}>Thưởng nóng Food</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 13px/1.4 'Be Vietnam Pro',sans-serif", color: '#3f484c', marginBottom: 8 }}>
            <ClockIcon />
            <span>Thời gian:</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#1b2225' }}>16:00 - 17:00 20/04/2026</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 13px/1.4 'Be Vietnam Pro',sans-serif", color: '#3f484c', marginBottom: 14 }}>
            <CalendarIcon />
            <span>Nhận thưởng:</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#1b2225' }}>28/04/2026</span>
          </div>
          <button
            style={{
              width: '100%',
              height: 42,
              borderRadius: 22,
              border: '1.4px solid #9fe0e7',
              background: '#f4fdfe',
              font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
              color: '#0aa7b4',
              cursor: 'pointer',
            }}
          >
            Xem khu vực áp dụng
          </button>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <CategoryVehicleIcon />
            <span style={{ font: "600 14px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225', flex: 1 }}>Food</span>
            <ChevronRightIcon />
          </div>
          <ProgressRow />
          <ProgressBar />
        </div>

        <div style={cardStyle}>
          <div style={sectionHeadStyle}>
            <GiftIcon />
            Phần thưởng
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11, font: "400 13.5px/1 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>
            <span>Tổng thưởng đạt được</span>
            <span style={{ fontWeight: 700, color: '#1b2225' }}>6.000đ</span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionHeadStyle}>
            <ClockIcon size={16} color="#1b2225" />
            Quá trình tham gia
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #f1f3f3' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: "600 13.5px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>
              <CheckCircleFilledIcon />
              1 chuyến
            </span>
            <span style={{ font: "600 13.5px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>3.000đ</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11, font: "400 13.5px/1 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>
            <span>Số chuyến hiện tại</span>
            <span style={{ fontWeight: 700, color: '#1b2225' }}>2 chuyến</span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionHeadStyle}>
            <DocumentIcon />
            Mô tả
          </div>
          <p style={{ margin: '11px 0 0', font: "400 12.5px/1.6 'Be Vietnam Pro',sans-serif", color: '#5a6266' }}>
            Trong thời gian diễn ra chương trình, tài xế sẽ được tính thưởng nóng cho các đơn hàng có điểm đón nằm trong khu vực có thưởng và phát sinh trong khung
            thời gian có thưởng theo cấu hình của chương trình. Các đơn hàng đáp ứng đúng điều kiện về khu vực điểm đón và thời gian áp dụng sẽ được ghi nhận để tính
            thưởng. Khoản thưởng sẽ được tổng hợp và chi trả định kỳ vào mỗi thứ 3 hằng tuần theo chu kỳ trả thưởng thông thường của hệ thống.
          </p>
        </div>
      </div>
      <div style={{ background: '#f4f6f6' }}>
        <HomeIndicator height={24} />
      </div>
    </div>
  );
}
