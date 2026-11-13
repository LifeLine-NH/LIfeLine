// Four segment ring (one per verifier) with an indigo dot.
export function LogoMark({ size = 28, ring = "#15171C", dot = "#3442D9" }: { size?: number; ring?: string; dot?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="10" fill="none" stroke={ring} strokeWidth="4" strokeDasharray="13.2 2.5" transform="rotate(-86 14 14)" />
      <circle cx="14" cy="14" r="3" fill={dot} />
    </svg>
  );
}
