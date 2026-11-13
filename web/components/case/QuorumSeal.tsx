import type { StatusTone } from "@/lib/format";
import type { Verdict } from "@/lib/types";

const LIGHT = { Yes: "#0A7A55", No: "#BE321A", Abstain: "#8C909C", wait: "#E3E1D9" };
const DARK = { Yes: "#3FD69B", No: "#FF7A5C", Abstain: "#7D8292", wait: "#2C313C" };
const TONE_LIGHT: Record<StatusTone, string> = {
  progress: "#0B6F86",
  funded: "#3442D9",
  delivered: "#0A7A55",
  review: "#94570A",
  rejected: "#BE321A",
  expired: "#5B6070",
};
const TONE_DARK: Record<StatusTone, string> = {
  progress: "#7FD3E6",
  funded: "#8C96FF",
  delivered: "#3FD69B",
  review: "#F2B24C",
  rejected: "#FF7A5C",
  expired: "#A9ADB9",
};
const NAMES = ["Geo", "Fact", "Severity", "Red team"];
const LETTERS = ["G", "F", "S", "R"];
const WORDS: Record<Verdict, string> = { Yes: "yes", No: "no", Abstain: "abstained" };

export function arcGeometry(i: number) {
  const mid = ((-90 + i * 90 + 45) * Math.PI) / 180;
  return { rot: -90 + i * 90 + 3, lx: (60 + 58.5 * Math.cos(mid)).toFixed(1), ly: (60 + 58.5 * Math.sin(mid)).toFixed(1) };
}

// Four arcs clockwise from the top: Geo, Fact, Severity, Red team. Grey means not voted yet.
export function QuorumSeal({
  verdicts,
  word,
  tone,
  sub,
  size = 260,
  dark = false,
  animate = true,
}: {
  verdicts: (Verdict | null)[];
  word: string;
  tone: StatusTone;
  sub?: string;
  size?: number;
  dark?: boolean;
  animate?: boolean;
}) {
  const C = dark ? DARK : LIGHT;
  const hair = dark ? "#2C313C" : "#E3E1D9";
  const aria = `${word}. ${NAMES.map((n, i) => `${n} ${verdicts[i] ? WORDS[verdicts[i]!] : "hasn't voted"}`).join(", ")}.`;

  return (
    <div className="seal" role="img" aria-label={aria} style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1 / 1" }}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r="57" fill="none" stroke={hair} strokeWidth="0.8" />
        <circle cx="60" cy="60" r="35" fill={dark ? "#171A21" : "#FFFFFF"} stroke={hair} strokeWidth="0.8" />
        {LETTERS.map((letter, i) => {
          const g = arcGeometry(i);
          const v = verdicts[i];
          return (
            <g key={letter}>
              <circle
                className={animate ? "seal-seg" : undefined}
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke={v ? C[v] : C.wait}
                strokeWidth="10"
                strokeDasharray="67.4 300"
                transform={`rotate(${g.rot} 60 60)`}
                style={animate ? { animationDelay: `${(i * 0.14).toFixed(2)}s` } : undefined}
              />
              <text x={g.lx} y={g.ly} textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="700" fill={dark ? "#A9ADB9" : "#62677A"} fontFamily="Inter, sans-serif">
                {letter}
              </text>
            </g>
          );
        })}
        <line x1="60" y1="1" x2="60" y2="9" stroke={hair} strokeWidth="0.8" />
      </svg>
      <div className={animate ? "seal-core" : undefined} style={{ position: "relative", textAlign: "center", maxWidth: Math.round(size * 0.56) }}>
        <div className="seal-word" style={{ fontSize: Math.max(13, Math.round(size * (word.length > 9 ? 0.085 : 0.105))), color: (dark ? TONE_DARK : TONE_LIGHT)[tone] }}>
          {word}
        </div>
        {sub && (
          <div className="seal-sub" style={{ fontSize: Math.max(10, Math.round(size * 0.042)), color: dark ? "#A9ADB9" : "#62677A" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
