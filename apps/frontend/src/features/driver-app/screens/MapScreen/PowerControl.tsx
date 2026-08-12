import { PowerIcon } from '../../components/icons';
import { useDriverApp } from '../../state/DriverAppContext';
import { useDriverState } from '../../data/useDriverState';

/**
 * Trước đây là hai component tách biệt (`PowerToggle` khi online, `OfflineCta` khi
 * offline) chỉ mount/unmount theo `isOnline` -- chuyển trạng thái là một cú nhảy khung
 * hình, không animate được vì DOM node bị thay hẳn. Gộp lại thành MỘT `<button>` sống
 * xuyên suốt hai trạng thái, chỉ đổi style, để CSS transition có thể morph pill giữa
 * màn hình -> hình tròn góc trái (và ngược lại).
 */
export function PowerControl() {
  const { powerBottom } = useDriverApp();
  const { isOnline, isLoading, isToggling, setOnline } = useDriverState();

  // Chờ biết chắc rồi hãy vẽ -- hiện nút "Mở nhận chuyến" trong lúc còn đang tải là
  // nói với tài xế rằng họ đang ngoại tuyến khi chưa hỏi server xong.
  if (isLoading) return null;

  const background = isOnline ? '#12b8c6' : '#15191b';
  const hoverBackground = isOnline ? '#0fa2ae' : '#000';

  return (
    <button
      onClick={() => setOnline(!isOnline)}
      disabled={isToggling}
      aria-label="Chuyển trạng thái trực tuyến"
      style={{
        position: 'absolute',
        left: isOnline ? '16px' : 'calc(50% - 89px)',
        bottom: powerBottom,
        width: isOnline ? 48 : 178,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background,
        border: 0,
        borderRadius: isOnline ? 24 : 26,
        boxShadow: isOnline ? '0 4px 14px rgba(18,184,198,.45)' : '0 6px 18px rgba(0,0,0,.28)',
        cursor: isToggling ? 'default' : 'pointer',
        opacity: isToggling ? 0.7 : 1,
        zIndex: 25,
        pointerEvents: 'auto',
        transition:
          'left .32s cubic-bezier(.4,0,.2,1), width .32s cubic-bezier(.4,0,.2,1), border-radius .32s cubic-bezier(.4,0,.2,1), background-color .25s ease, box-shadow .25s ease, opacity .2s ease',
      }}
      onMouseEnter={(e) => {
        if (!isToggling) e.currentTarget.style.background = hoverBackground;
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = background)}
    >
      <PowerIcon size={19} />
      <span
        style={{
          font: "600 15px/1 'Be Vietnam Pro',sans-serif",
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          maxWidth: isOnline ? 0 : 140,
          opacity: isOnline ? 0 : 1,
          marginLeft: isOnline ? 0 : 9,
          transition: 'max-width .28s ease, opacity .16s ease, margin-left .28s ease',
        }}
      >
        {/* Text chỉ thấy được ở dạng pill (isOnline===false, maxWidth>0) -- điều đó chỉ xảy
            ra khi đang ổn định offline hoặc đang TẮT (optimistic update đã lật isOnline
            sang false trước khi network trả lời), nên không cần nhánh theo isOnline. */}
        {isToggling ? 'Đang tắt…' : 'Mở nhận chuyến'}
      </span>
    </button>
  );
}
