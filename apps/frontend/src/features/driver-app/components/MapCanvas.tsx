import type { CSSProperties } from 'react';

/** Static schematic city map used as a neutral placeholder — matches the design's `mapBase` symbol. */
export function MapDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="mapBase" viewBox="0 0 390 844">
          <rect width="390" height="844" fill="#f2f1ec" />
          <g fill="#e6e5df">
            <rect x="14" y="120" width="86" height="64" rx="3" />
            <rect x="112" y="112" width="70" height="52" rx="3" />
            <rect x="20" y="200" width="64" height="78" rx="3" />
            <rect x="98" y="182" width="92" height="58" rx="3" />
            <rect x="232" y="140" width="76" height="70" rx="3" />
            <rect x="320" y="128" width="58" height="96" rx="3" />
            <rect x="26" y="300" width="98" height="60" rx="3" />
            <rect x="140" y="268" width="60" height="88" rx="3" />
            <rect x="236" y="248" width="84" height="62" rx="3" />
            <rect x="332" y="252" width="46" height="74" rx="3" />
            <rect x="18" y="384" width="72" height="82" rx="3" />
            <rect x="104" y="392" width="96" height="56" rx="3" />
            <rect x="248" y="356" width="66" height="90" rx="3" />
            <rect x="328" y="372" width="52" height="60" rx="3" />
            <rect x="30" y="492" width="88" height="66" rx="3" />
            <rect x="136" y="478" width="62" height="80" rx="3" />
            <rect x="228" y="482" width="90" height="58" rx="3" />
            <rect x="334" y="470" width="44" height="88" rx="3" />
            <rect x="22" y="586" width="70" height="74" rx="3" />
            <rect x="110" y="596" width="88" height="54" rx="3" />
            <rect x="242" y="576" width="72" height="84" rx="3" />
            <rect x="330" y="600" width="50" height="62" rx="3" />
            <rect x="36" y="690" width="92" height="58" rx="3" />
            <rect x="150" y="682" width="58" height="74" rx="3" />
            <rect x="252" y="694" width="80" height="56" rx="3" />
          </g>
          <g fill="#d7e9cf">
            <rect x="96" y="252" width="34" height="40" rx="6" />
            <rect x="206" y="450" width="30" height="56" rx="6" />
            <rect x="150" y="620" width="44" height="30" rx="6" />
          </g>
          <path d="M-10 232 L400 196" stroke="#ffffff" strokeWidth="13" />
          <path d="M-10 460 L400 428" stroke="#ffffff" strokeWidth="11" />
          <path d="M-10 668 L400 640" stroke="#ffffff" strokeWidth="11" />
          <path d="M-10 372 L400 348" stroke="#ffffff" strokeWidth="8" />
          <path d="M-10 566 L400 540" stroke="#ffffff" strokeWidth="8" />
          <path d="M92 -10 L64 854" stroke="#ffffff" strokeWidth="10" />
          <path d="M212 -10 L196 854" stroke="#ffffff" strokeWidth="9" />
          <path d="M318 -10 L300 854" stroke="#ffffff" strokeWidth="9" />
          <path d="M262 -10 L316 854" stroke="#c9d9ef" strokeWidth="17" />
          <path d="M262 -10 L316 854" stroke="#b3c8e6" strokeWidth="1" />
          <path d="M-10 300 L400 268" stroke="#f7e7b4" strokeWidth="7" />
          <path d="M148 -10 L132 854" stroke="#f7e7b4" strokeWidth="6" />
        </symbol>
      </defs>
    </svg>
  );
}

export function MapBaseImage({ style }: { style?: CSSProperties }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <use href="#mapBase" />
    </svg>
  );
}
