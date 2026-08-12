import { useEffect, useRef } from 'react';

/**
 * Shared transient-notice bar (spec 2.6, `NoticeTransient.tsx`).
 *
 * Why a standalone component instead of inlining a `<div>` per error branch inside
 * `DemandBanner.tsx`: every error branch in the AD-17 table that shows a message
 * ("Chiến dịch đã đủ tài xế.", "Lời mời đã hết hạn.", the retry prompt, …) needs the
 * exact same shell — one message at a time, auto-dismiss, `aria-live="polite"` so a
 * screen reader announces it without stealing focus, never `alert()`/`confirm()`
 * (those block the main thread and cannot be dismissed programmatically, which would
 * break the "at most one notice, new replaces old" rule). Centralising the shell here
 * means the state machine in `DemandBanner.tsx` only ever holds *what* to say, not
 * *how* to render it — swapping `notice` state to a new message automatically replaces
 * the previous bar because React keys this by the same DOM node, no manual stacking
 * logic needed on the caller side.
 *
 * Auto-dismiss timer keys off `message` (not a mount-once effect): a brand-new message
 * arriving while a previous one is still showing must restart the ~4s window, not
 * inherit whatever time was left on the old one. The one exception is the retry
 * variant (`retry` prop present) — a "Không kết nối được máy chủ. Thử lại?" prompt
 * must stay until the driver acts, per spec Boundaries.
 *
 * Rejected alternative: a global toast/notification stack (e.g. one `<Notice>` per
 * error, queued). The spec explicitly bans stacking ("tối đa một thông báo, thông báo
 * mới thay chỗ cũ") — a queue would contradict that by design.
 */

const AUTO_DISMISS_MS = 4000;

export interface NoticeTransientRetry {
  /** Nhãn nút hành động, ví dụ "Thử lại". */
  label: string;
  onRetry: () => void;
}

interface NoticeTransientProps {
  message: string;
  onDismiss: () => void;
  /** Có mặt thì bar không tự đóng sau 4s — chỉ đóng khi bấm thử lại hoặc nút đóng. */
  retry?: NoticeTransientRetry;
  /** Khoảng cách tới đáy màn hình — caller truyền theo layout của chính nó (vd `bannerBottom`). */
  bottom?: string | number;
}

export function NoticeTransient({ message, onDismiss, retry, bottom = 112 }: NoticeTransientProps) {
  // Ref hoá onDismiss để effect dưới không phải liệt kê nó trong dependency — nếu
  // không, một `onDismiss` mới mỗi render (closure trong component cha) sẽ reset lại
  // timer liên tục dù `message` không đổi.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (retry) return; // biến thử-lại: không tự đóng, xem doc-comment đầu file.
    const id = window.setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [message, retry]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        boxSizing: 'border-box',
        zIndex: 40,
        background: '#FFFFFF', // token colors.surface-base
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 8px 10px 14px',
        animation: 'fadeIn .2s ease-out',
      }}
    >
      <div
        style={{
          flex: 1,
          font: "500 13px/1.4 'Be Vietnam Pro',sans-serif",
          color: '#1A1A1A', // token colors.ink-primary
        }}
      >
        {message}
      </div>
      {retry && (
        <button
          onClick={retry.onRetry}
          aria-label={retry.label}
          style={{
            minWidth: 44,
            minHeight: 44,
            padding: '0 10px',
            border: 0,
            background: 'transparent',
            color: '#00A99D', // token colors.brand-teal (notice-transient action-color)
            font: "700 13.5px/1 'Be Vietnam Pro',sans-serif",
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          {retry.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        style={{
          width: 44,
          height: 44,
          border: 0,
          background: 'transparent',
          color: '#B0B0B0', // token colors.ink-disabled
          cursor: 'pointer',
          flex: 'none',
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
