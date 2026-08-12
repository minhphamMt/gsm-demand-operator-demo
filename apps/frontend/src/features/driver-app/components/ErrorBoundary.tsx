import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Bắt lỗi render và hiện nó ra màn hình.
 *
 * Không có lớp này thì một lỗi bất kỳ trong lúc render sẽ khiến React 19 gỡ nguyên
 * root, để lại trang trắng không manh mối — người dùng phải mở DevTools mới biết
 * chuyện gì xảy ra, mà lúc demo thì không ai làm vậy.
 *
 * Phải là class component: React chưa có API hook nào tương đương
 * componentDidCatch / getDerivedStateFromError.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Vẫn log ra console: component stack ở đó đầy đủ hơn cái hiện trên màn hình.
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fff',
          padding: '32px 24px',
          boxSizing: 'border-box',
          font: "400 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace",
          color: '#1b2225',
        }}
      >
        <div style={{ font: "700 18px/1.35 'Be Vietnam Pro',sans-serif", color: '#c1362b', marginBottom: 6 }}>
          Ứng dụng gặp lỗi khi render
        </div>
        <div style={{ font: "400 13px/1.5 'Be Vietnam Pro',sans-serif", color: '#5a6266', marginBottom: 18 }}>
          Chụp lại toàn bộ khối dưới đây khi báo lỗi.
        </div>

        <div
          style={{
            background: '#fdeced',
            border: '1px solid #f6c9c5',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <strong>{error.name}:</strong> {error.message}
        </div>

        {error.stack && (
          <details open style={{ marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', font: "600 13px/1 'Be Vietnam Pro',sans-serif", marginBottom: 8 }}>
              Stack
            </summary>
            <pre style={{ margin: 0, overflowX: 'auto', background: '#f6f8f8', padding: 12, borderRadius: 8 }}>
              {error.stack}
            </pre>
          </details>
        )}

        {componentStack && (
          <details>
            <summary style={{ cursor: 'pointer', font: "600 13px/1 'Be Vietnam Pro',sans-serif", marginBottom: 8 }}>
              Component stack
            </summary>
            <pre style={{ margin: 0, overflowX: 'auto', background: '#f6f8f8', padding: 12, borderRadius: 8 }}>
              {componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
