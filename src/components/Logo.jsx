// Tanda A.I.DRIY: huruf "A" terbuka dengan titik cahaya di tengahnya.
export function LogoMark({ size = 40, color = 'var(--accent)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M9 40 L24 8 L39 40" stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="29" r="4.6" fill={color} />
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark">A.I.DRIY</span>;
}
