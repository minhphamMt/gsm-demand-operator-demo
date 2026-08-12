import type { CSSProperties, ReactNode } from 'react';

interface IconButtonProps {
  onClick?: () => void;
  size?: number;
  style?: CSSProperties;
  children: ReactNode;
  ariaLabel?: string;
}

export function IconButton({ onClick, size = 44, style, children, ariaLabel }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        border: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flex: 'none',
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6f6')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
    >
      {children}
    </button>
  );
}
